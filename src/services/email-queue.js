// @ts-check
// File d'attente des emails (table email_queue) : les envois groupés sont traités en arrière-plan,
// avec nouvelles tentatives, sans bloquer les requêtes HTTP.
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { prisma } from '../db/prisma.js';
import { sqlTimestamp, toInt } from '../db/values.js';
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
    const { id } = await prisma.emailQueue.create({
        data: {
            batch_id: batchId,
            recipient_email: recipientEmail,
            // Colonnes obligatoires : une valeur absente est refusée, comme auparavant
            recipient_name: /** @type {string} */ (recipientName ?? null),
            cc_emails: ccEmails || null,
            sender_name: /** @type {string} */ (senderName ?? null),
            sender_email: /** @type {string} */ (senderEmail ?? null),
            subject,
            html_body: htmlBody,
            ics_content: icsContent || null,
            ics_method: icsMethod || null,
            ics_filename: icsFilename || null,
            pdf_attachment: pdfAttachment || null,
            pdf_filename: pdfFilename || null,
            action_type: actionType || 'new',
            resource_id: toInt(resourceId),
            next_retry_at: sqlTimestamp()
        }
    });
    return id;
}

/**
 * Prend le prochain email à envoyer et le marque « processing » (un seul traitement par email,
 * même si deux cycles se chevauchent)
 * @returns {Promise<any>}
 */
async function takeNextEmail() {
    for (;;) {
        const email = await prisma.emailQueue.findFirst({
            where: {
                status: 'pending',
                next_retry_at: { lte: sqlTimestamp() },
                attempts: { lt: prisma.emailQueue.fields.max_attempts }
            },
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }]
        });
        if (!email) return null;
        const { count } = await prisma.emailQueue.updateMany({
            where: { id: email.id, status: 'pending' },
            data: { status: 'processing' }
        });
        if (count === 1) return email;
    }
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
        await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
                status: 'failed',
                error_message: errorMsg,
                attempts: { increment: 1 },
                processed_at: sqlTimestamp()
            }
        });
        console.log(`💀 Queue: abandonné après ${email.max_attempts} tentatives`);
    } else {
        const delayMs = RETRY_DELAYS_MS[Math.min(email.attempts + 1, RETRY_DELAYS_MS.length - 1)];
        await prisma.emailQueue.update({
            where: { id: email.id },
            data: {
                status: 'pending',
                error_message: errorMsg,
                attempts: { increment: 1 },
                next_retry_at: sqlTimestamp(new Date(Date.now() + delayMs))
            }
        });
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
                await prisma.emailQueue.update({
                    where: { id: email.id },
                    data: { status: 'sent', processed_at: sqlTimestamp(), attempts: { increment: 1 } }
                });
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

/** Supprime les emails envoyés ou abandonnés depuis plus de 7 jours */
export async function purgeProcessedEmails() {
    // created_at est au format « AAAA-MM-JJ HH:MM:SS » (UTC) : comparaison de chaînes
    const cutoff = sqlTimestamp(new Date(Date.now() - 7 * 24 * 3600 * 1000));
    const { count } = await prisma.emailQueue.deleteMany({
        where: { status: { in: ['sent', 'failed'] }, created_at: { lt: cutoff } }
    });
    if (count) console.log(`📧 Queue: ${count} ancien(s) email(s) traité(s) supprimé(s)`);
}

/** Démarre le traitement périodique de la file */
export function startEmailQueueWorker() {
    purgeProcessedEmails().catch(err => console.error('Erreur purge email_queue:', err));
    setInterval(processEmailQueue, POLL_INTERVAL_MS);
}
