// @ts-check
import crypto from 'crypto';
import { badRequest } from '../../lib/http-error.js';
import { createEmailTransporter, emailConfig, sendEmail } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';
import { enqueueEmail, getReusableTransporter } from '../../services/email-queue.js';
import { activeSessions } from '../../state/sessions.js';
import { getExpertByResource, isEmailOfResource } from '../users/users.service.js';
import {
    assignmentRequestEmail,
    buildAssignmentEmails,
    pendingAssignmentEmail,
    TEAMS_TEST_HTML
} from './notifications.emails.js';
import * as service from './notifications.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const userId = (/** @type {Request} */ req) => /** @type {number} */ (req.session.userId);

// ---------- Messages instantanés (SSE) ----------

/** Connexion persistante : messages en attente livrés, puis messages en direct */
export async function sse(/** @type {Request} */ req, /** @type {Response} */ res) {
    const uid = userId(req);
    // Les en-têtes sont envoyés tout de suite : express-session ne doit plus écrire de cookie
    req.session.save = cb => {
        if (cb) cb(null);
        return req.session;
    };
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    service.sseClients.set(uid, res);

    const heartbeat = setInterval(() => {
        if (res.writableEnded) return clearInterval(heartbeat);
        res.write(': heartbeat\n\n');
    }, 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        service.sseClients.delete(uid);
    });

    try {
        for (const row of await service.takePendingMessages(uid)) {
            const payload = JSON.stringify({
                fromUserId: row.from_user_id,
                fromName: row.from_name,
                fromPhoto: row.from_photo,
                message: row.message,
                sentAt: row.sent_at
            });
            res.write(`event: push-message\ndata: ${payload}\n\n`);
        }
    } catch (err) {
        console.error('Erreur livraison messages en attente:', err);
    }
}

/** Message instantané : livré en direct, ou conservé jusqu'à la prochaine connexion du destinataire */
export async function pushMessage(/** @type {Request} */ req, /** @type {Response} */ res) {
    const fromUserId = userId(req);
    const { toUserId, message } = req.body;
    if (!toUserId || typeof message !== 'string' || !message.trim()) throw badRequest('Paramètres manquants');
    const fromSession = activeSessions.get(fromUserId);
    const fromName = fromSession?.fullName || fromSession?.username || `Utilisateur #${fromUserId}`;
    const fromPhoto = fromSession?.profilePhoto || null;
    const sentAt = new Date().toISOString();
    const text = message.trim();

    const target = service.sseClients.get(Number(toUserId));
    if (target && !target.writableEnded) {
        const payload = JSON.stringify({
            fromUserId,
            fromName,
            fromPhoto,
            fromProfile: fromSession?.profile || null,
            message: text,
            sentAt
        });
        target.write(`event: push-message\ndata: ${payload}\n\n`);
        return res.json({ ok: true });
    }
    try {
        await service.storePendingMessage({
            to_user_id: Number(toUserId),
            from_user_id: fromUserId,
            from_name: fromName,
            from_photo: fromPhoto,
            message: text,
            sent_at: sentAt
        });
    } catch {
        return res.status(500).json({ error: 'Impossible de stocker le message' });
    }
    res.json({ ok: true, pending: true });
}

// ---------- Emails ----------

/**
 * Calendrier d'une ressource envoyé à l'utilisateur rattaché à cette ressource. Le destinataire est lu en base
 * (l'adresse éventuellement transmise est ignorée) : la route ne permet pas d'écrire à une adresse quelconque
 * depuis le compte SMTP de l'application.
 */
export async function sendCalendarEmail(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { resourceId, html, subject } = req.body;
    if (!resourceId || !html || !subject) {
        return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    }
    if (!emailConfig.user) return res.status(400).json({ success: false, error: 'Configuration email non définie' });
    const email = (await getExpertByResource(resourceId))?.email;
    if (!email) {
        return res
            .status(400)
            .json({ success: false, error: 'Aucun utilisateur avec email associé à cette ressource' });
    }
    try {
        await sendEmail(email, subject, html);
    } catch (/** @type {any} */ error) {
        console.error('Erreur envoi calendrier par email:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
    logUserAction(req, 'Envoi calendrier par email', { resourceId, destinataire: email });
    res.json({ success: true, message: 'Calendrier envoyé par email avec succès' });
}

export async function emailBatchStatus(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { batchId } = req.params;
    res.json({ success: true, batchId, ...(await service.batchStatus(batchId)) });
}

/** Invitations Outlook des affectations, mises en file d'envoi */
export async function sendAssignmentEmails(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { assignments, senderName, senderEmail: clientSenderEmail } = req.body;
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucune affectation à envoyer' });
    }
    if (!emailConfig.user || !emailConfig.password || !getReusableTransporter()) {
        return res.status(500).json({ success: false, error: 'Configuration email non disponible' });
    }
    const requesterName = senderName || `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    const senderEmailAddr = clientSenderEmail || emailConfig.user;

    // Destinataires limités aux utilisateurs rattachés à la ressource concernée (pas d'adresse quelconque)
    const allowed = [];
    for (const item of assignments) {
        if (await isEmailOfResource(item?.resourceId, item?.email)) allowed.push(item);
        else console.warn(`⛔ send-assignment-emails : destinataire refusé pour la ressource ${item?.resourceId}`);
    }
    const emails = buildAssignmentEmails(allowed, requesterName, senderEmailAddr);
    if (emails.length === 0) return res.json({ success: false, error: 'Aucun email à envoyer (experts sans email ?)' });

    const batchId = crypto.randomUUID();
    let enqueued = 0;
    for (const mail of emails) {
        try {
            await enqueueEmail({
                batchId,
                recipientEmail: mail.to,
                recipientName: mail.attendeeName,
                senderName: requesterName,
                senderEmail: senderEmailAddr,
                subject: mail.subject,
                htmlBody: mail.html,
                icsContent: mail.icsContent,
                icsMethod: mail.icsMethod,
                icsFilename: mail.icsFilename,
                actionType: mail.type
            });
            enqueued++;
        } catch (/** @type {any} */ enqErr) {
            console.error(`❌ Erreur enqueue pour ${mail.to}:`, enqErr.message);
        }
    }
    console.log(`📧 send-assignment-emails: ${enqueued}/${emails.length} email(s) en file (batchId=${batchId})`);

    if (req.session.logId) {
        const recipients = assignments
            .map(a => a.email)
            .filter(e => e)
            .join(', ');
        await service.appendToConnectionLog(
            req.session.logId,
            `${new Date().toLocaleString('fr-FR')}: Invitations Outlook en file (${enqueued} emails) pour: ${recipients}\n`
        );
    }
    res.json({ success: true, batchId, enqueued, message: `${enqueued} invitation(s) ajoutée(s) à la file d'envoi` });
}

// ---------- Affectations en attente de notification ----------

export async function addPending(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, id: await service.addPendingNotification(req.body, userId(req)) });
}

export async function listPending(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listPendingNotifications(req.params.sessionId));
}

export async function deletePending(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, deleted: await service.deletePendingNotifications(req.params.sessionId) });
}

/** Envoi des emails des affectations en attente d'une session, puis suppression */
export async function sendPendingNotifications(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { sessionId } = req.body;
    const notifications = await service.listPendingNotifications(String(sessionId), { withCreator: true });
    const results = [];
    for (const notif of notifications) {
        const expert = `${notif.prenom} ${notif.nom}`;
        const html = pendingAssignmentEmail(/** @type {any} */ (notif), JSON.parse(notif.assignment_data));
        try {
            await sendEmail(notif.email, 'Nouvelle affectation', html);
            results.push({ success: true, expert });
        } catch (/** @type {any} */ error) {
            results.push({ success: false, expert, error: error.message });
        }
    }
    await service.deletePendingNotifications(String(sessionId));
    logUserAction(req, 'Envoi notifications affectations', { sessionId, count: notifications.length, results });
    res.json({ success: true, results });
}

/** Demande d'affectation par email aux experts choisis (réponse immédiate, envoi en arrière-plan) */
export async function requestAssignment(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { fromName, fromEmail, expertIds, subject, startDate, startPeriod, endDate, endPeriod, message } = req.body;
    if (!Array.isArray(expertIds) || expertIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucun expert sélectionné' });
    }
    if (!fromEmail) return res.status(400).json({ success: false, error: "Email de l'expéditeur manquant" });

    const experts = await service.listActiveExperts(expertIds);
    if (experts.length === 0) return res.status(404).json({ success: false, error: 'Aucun expert trouvé' });
    const withEmail = experts.filter(e => e.email && e.email.trim() !== '');
    if (withEmail.length === 0) {
        return res
            .status(400)
            .json({ success: false, error: "Aucun des experts sélectionnés n'a d'adresse email configurée." });
    }
    const transporter = createEmailTransporter();
    if (!transporter) return res.status(500).json({ success: false, error: 'Configuration email non disponible.' });

    const formatDate = (/** @type {string} */ dateStr) =>
        new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    const startDateFormatted = `${formatDate(startDate)} - ${startPeriod}`;
    const endDateFormatted = `${formatDate(endDate)} - ${endPeriod}`;

    res.json({
        success: true,
        message: `Demande envoyée à ${withEmail.length} expert(s)`,
        emails: withEmail.map(e => e.email)
    });

    for (const expert of withEmail) {
        const personalizedMessage = String(message ?? '').replace(/\[Prénom de l'utilisateur\]/g, expert.prenom);
        transporter
            .sendMail({
                from: `"SI-SAMU Planning" <${emailConfig.user}>`,
                replyTo: fromEmail,
                to: /** @type {string} */ (expert.email),
                subject,
                html: assignmentRequestEmail({
                    fromName,
                    fromEmail,
                    subject,
                    startDateFormatted,
                    endDateFormatted,
                    personalizedMessage
                })
            })
            .then(() => console.log(`✅ Email envoyé à ${expert.email}`))
            .catch((/** @type {any} */ err) => console.error(`❌ Erreur email ${expert.email}:`, err.message));
    }
}

// ---------- Notifications des experts ----------

export async function unreadCount(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ count: await service.countUnread(userId(req)) });
}

export async function unreadList(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ notifications: await service.listUnread(userId(req)) });
}

export async function markRead(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.markAllRead(userId(req));
    res.json({ success: true });
}

/** Création groupée (à la déconnexion, après l'envoi des invitations) */
export async function createBatch(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { notifications } = req.body;
    if (!Array.isArray(notifications) || notifications.length === 0) return res.json({ success: true, created: 0 });
    const requesterName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    console.log(`📝 Création de ${notifications.length} notification(s) en batch par ${requesterName}`);
    const { created, errors } = await service.createBatch(notifications, requesterName);
    console.log(`📊 Résultat batch: ${created} créée(s), ${errors} erreur(s)`);
    res.json({ success: true, created, errors });
}

export async function clearAll(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, message: 'Toutes les notifications ont été supprimées', ...(await service.clearAll()) });
}

// ---------- Teams ----------

/** Test du canal Teams (adresse email du canal) */
export async function teamsTest(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { teamsEmail } = req.body;
    if (!teamsEmail) throw badRequest('Adresse email Teams requise');
    const transporter = createEmailTransporter();
    if (!transporter) {
        return res
            .status(500)
            .json({ error: 'Configuration email non disponible. Veuillez configurer SMTP dans les paramètres.' });
    }
    try {
        await transporter.sendMail({
            from: `"Planning ANS" <${emailConfig.user || 'noreply@esante.gouv.fr'}>`,
            to: teamsEmail,
            subject: '🧪 Test de notification - Planning ANS',
            html: TEAMS_TEST_HTML
        });
    } catch (/** @type {any} */ error) {
        console.error('Erreur envoi test Teams:', error);
        return res.status(500).json({ error: error.message });
    }
    service.logTeams('TEST', teamsEmail, 'Test de connexion');
    console.log('📢 Test Teams envoyé à:', teamsEmail);
    res.json({ success: true });
}

export async function teamsNotify(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { type, data } = req.body;
    try {
        res.json(await service.notifyTeams(type, data));
    } catch (/** @type {any} */ error) {
        console.error('Erreur envoi notification Teams:', error);
        res.status(500).json({ error: error.message });
    }
}
