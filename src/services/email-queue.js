// @ts-check
// File d'attente des emails (table email_queue) : les envois groupés sont traités en arrière-plan,
// avec nouvelles tentatives, sans bloquer les requêtes HTTP.
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { database, dbRun } from '../db/database.js';
import { createEmailTransporter, emailConfig } from '../lib/mailer.js';

const POLL_INTERVAL_MS = 1500;
/** Pause entre deux envois (évite de saturer le serveur SMTP) */
const INTER_SEND_DELAY_MS = 500;
/** Délai avant chaque nouvelle tentative : immédiat, 30 s, puis 2 min */
const RETRY_DELAYS_MS = [0, 30000, 120000];
const ANS_LOGO_PATH = fileURLToPath(new URL('../../public/logo-ans.webp', import.meta.url));

/** @type {import('nodemailer').Transporter | null} */
let cachedTransporter = null;
let cachedTransporterConfig = '';
let workerRunning = false;

/** Transporteur réutilisable, recréé uniquement si la configuration SMTP change */
export function getReusableTransporter() {
    const configKey = `${emailConfig.host}:${emailConfig.port}:${emailConfig.user}`;
    if (cachedTransporter && cachedTransporterConfig === configKey) return cachedTransporter;
    cachedTransporter = createEmailTransporter();
    cachedTransporterConfig = configKey;
    return cachedTransporter;
}

/** Oublie le transporteur en cache (après une erreur de connexion) */
export function resetReusableTransporter() {
    cachedTransporter = null;
    cachedTransporterConfig = '';
}

/** Identifiant d'un lot d'emails (suivi par /api/email-queue/status/:batchId) */
export const newBatchId = () => crypto.randomUUID() + '@planning-ans';

/**
 * Ajoute un email à la file ; renvoie son identifiant
 * @param {{ batchId: string, recipientEmail: string, recipientName?: string, ccEmails?: string, senderName?: string,
 *   senderEmail?: string, subject: string, htmlBody: string, icsContent?: string, icsMethod?: string, icsFilename?: string,
 *   pdfAttachment?: string, pdfFilename?: string, actionType?: string, resourceId?: number }} email
 */
export async function enqueueEmail(email) {
    const { batchId, recipientEmail, recipientName, ccEmails, senderName, senderEmail, subject, htmlBody } = email;
    const { icsContent, icsMethod, icsFilename, pdfAttachment, pdfFilename, actionType, resourceId } = email;
    const { lastID } = await dbRun(
        `INSERT INTO email_queue (batch_id, recipient_email, recipient_name, cc_emails, sender_name, sender_email, subject, html_body, ics_content, ics_method, ics_filename, pdf_attachment, pdf_filename, action_type, resource_id, next_retry_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
            batchId,
            recipientEmail,
            recipientName,
            ccEmails || null,
            senderName,
            senderEmail,
            subject,
            htmlBody,
            icsContent || null,
            icsMethod || null,
            icsFilename || null,
            pdfAttachment || null,
            pdfFilename || null,
            actionType || 'new',
            resourceId || null
        ]
    );
    return lastID;
}

/**
 * Prend le prochain email à envoyer et le marque « processing » (verrou relâché avant l'envoi SMTP)
 * @returns {Promise<any>}
 */
function takeNextEmail() {
    return new Promise((resolve, reject) => {
        database.serialize(() => {
            database.get(
                `SELECT * FROM email_queue
                 WHERE status = 'pending' AND next_retry_at <= datetime('now') AND attempts < max_attempts
                 ORDER BY created_at ASC LIMIT 1`,
                [],
                (err, /** @type {any} */ row) => {
                    if (err) return reject(err);
                    if (!row) return resolve(null);
                    database.run(
                        `UPDATE email_queue SET status = 'processing' WHERE id = ? AND status = 'pending'`,
                        [row.id],
                        err2 => (err2 ? reject(err2) : resolve(row))
                    );
                }
            );
        });
    });
}

/** @param {any} email */
function buildMailOptions(email) {
    /** @type {import('nodemailer').SendMailOptions} */
    const options = {
        from: `"${email.sender_name} (Planning SI-SAMU)" <${emailConfig.user}>`,
        to: email.recipient_email,
        subject: email.subject,
        html: email.html_body
    };
    if (email.cc_emails) options.cc = email.cc_emails;
    if (email.ics_content) {
        options.icalEvent = {
            filename: email.ics_filename || 'invitation.ics',
            method: email.ics_method || 'REQUEST',
            content: email.ics_content
        };
    }
    const attachments = [];
    // Logo ANS inline (CID) des emails de diffusion des CRA
    if (email.action_type === 'cra_diffusion') {
        attachments.push({
            filename: 'logo-ans.webp',
            path: ANS_LOGO_PATH,
            cid: 'ans-logo',
            contentType: 'image/webp'
        });
    }
    if (email.pdf_attachment) {
        attachments.push({
            filename: email.pdf_filename || 'CRA.pdf',
            content: Buffer.from(email.pdf_attachment, 'base64'),
            contentType: 'application/pdf'
        });
    }
    if (attachments.length > 0) options.attachments = attachments;
    return options;
}

/** @param {any} email @param {string} errorMsg */
async function recordFailure(email, errorMsg) {
    if (email.attempts + 1 >= email.max_attempts) {
        await dbRun(
            `UPDATE email_queue SET status = 'failed', error_message = ?, attempts = attempts + 1, processed_at = datetime('now') WHERE id = ?`,
            [errorMsg, email.id]
        );
        console.log(`💀 Queue: abandonné après ${email.max_attempts} tentatives`);
    } else {
        const delaySec = Math.floor(RETRY_DELAYS_MS[Math.min(email.attempts + 1, RETRY_DELAYS_MS.length - 1)] / 1000);
        await dbRun(
            `UPDATE email_queue SET status = 'pending', error_message = ?, attempts = attempts + 1, next_retry_at = datetime('now', '+${delaySec} seconds') WHERE id = ?`,
            [errorMsg, email.id]
        );
        console.log(`🔄 Queue: retry planifié (tentative ${email.attempts + 2}/${email.max_attempts})`);
    }
}

/** Envoie tous les emails disponibles (un seul traitement à la fois) */
export async function processEmailQueue() {
    if (workerRunning) return;
    workerRunning = true;
    try {
        const transporter = getReusableTransporter();
        if (!transporter) return;

        let processed = 0;
        for (let email = await takeNextEmail(); email; email = await takeNextEmail()) {
            try {
                await transporter.sendMail(buildMailOptions(email));
                await dbRun(
                    `UPDATE email_queue SET status = 'sent', processed_at = datetime('now'), attempts = attempts + 1 WHERE id = ?`,
                    [email.id]
                );
                processed++;
                console.log(
                    `✅ Queue [${processed}]: envoyé à ${email.recipient_email} (${email.action_type}) [batch:${String(email.batch_id).substring(0, 8)}]`
                );
            } catch (/** @type {any} */ sendError) {
                const errorMsg = sendError.message || 'Erreur inconnue';
                console.error(`❌ Queue: échec envoi à ${email.recipient_email}: ${errorMsg}`);
                if (/ECONNREFUSED|ETIMEDOUT|ESOCKET/.test(errorMsg)) resetReusableTransporter();
                await recordFailure(email, errorMsg);
            }
            await new Promise(r => setTimeout(r, INTER_SEND_DELAY_MS));
        }
        if (processed > 0) console.log(`📧 Queue: ${processed} email(s) traités dans ce cycle`);
    } catch (error) {
        console.error('❌ Queue worker error:', error);
    } finally {
        workerRunning = false;
    }
}

/** Démarre le traitement périodique de la file */
export function startEmailQueueWorker() {
    setInterval(processEmailQueue, POLL_INTERVAL_MS);
}
