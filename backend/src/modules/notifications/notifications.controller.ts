import crypto from 'crypto';
import { badRequest, forbidden } from '../../lib/http-error.ts';
import { createEmailTransporter, emailConfig, sendEmail } from '../../lib/mailer.ts';
import { logUserAction } from '../../services/action-log.ts';
import { enqueueEmail, getReusableTransporter } from '../../services/email-queue.ts';
import { activeSessions } from '../../state/sessions.ts';
import { getExpertByResource, isEmailOfResource } from '../users/users.service.ts';
import { assignmentRequestEmail, buildAssignmentEmails, TEAMS_TEST_HTML } from './notifications.emails.ts';
import * as service from './notifications.service.ts';
import { calendrierDeLaRessource } from './resource-calendar.ts';

import type { Request, Response } from 'express';

const userId = (req: Request) => req.session.userId as number;

// ---------- Messages instantanés (SSE) ----------

/** Connexion persistante : messages en attente livrés, puis messages en direct */
export async function sse(req: Request, res: Response) {
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
export async function pushMessage(req: Request, res: Response) {
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
/** Ressource et mois (0 à 11) d'un calendrier ; null si incomplets ou invalides */
function moisDuCalendrier(p: Record<string, unknown>) {
    const resourceId = Number(p.resourceId);
    const annee = Number(p.year);
    const mois = Number(p.month);
    const valide =
        Number.isSafeInteger(resourceId) &&
        resourceId > 0 &&
        Number.isInteger(annee) &&
        annee >= 2000 &&
        annee <= 2100 &&
        Number.isInteger(mois) &&
        mois >= 0 &&
        mois <= 11;
    return valide ? { resourceId, annee, mois } : null;
}

/** Calendrier d'une ressource pour un mois : aperçu avant impression */
export async function resourceCalendar(req: Request, res: Response) {
    const m = moisDuCalendrier({ ...req.query, resourceId: req.params.resourceId });
    if (!m) return res.status(400).json({ error: 'Paramètres manquants' });
    const calendrier = await calendrierDeLaRessource(m.resourceId, m.annee, m.mois);
    if (!calendrier) return res.status(404).json({ error: 'Ressource introuvable' });
    res.json({ titre: calendrier.titre, contenu: calendrier.contenu });
}

/** Calendrier d'une ressource envoyé à l'expert rattaché : contenu et objet construits par le serveur */
export async function sendCalendarEmail(req: Request, res: Response) {
    const m = moisDuCalendrier(req.body || {});
    if (!m) {
        return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    }
    const { resourceId } = m;
    if (!emailConfig.user) return res.status(400).json({ success: false, error: 'Configuration email non définie' });
    const email = (await getExpertByResource(resourceId))?.email;
    if (!email) {
        return res
            .status(400)
            .json({ success: false, error: 'Aucun utilisateur avec email associé à cette ressource' });
    }
    const calendrier = await calendrierDeLaRessource(resourceId, m.annee, m.mois);
    if (!calendrier) return res.status(404).json({ success: false, error: 'Ressource introuvable' });
    try {
        await sendEmail(email, calendrier.titre, calendrier.document);
    } catch (error: any) {
        console.error('Erreur envoi calendrier par email:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
    logUserAction(req, 'Envoi calendrier par email', { resourceId, destinataire: email });
    res.json({ success: true, message: 'Calendrier envoyé par email avec succès' });
}

export async function emailBatchStatus(req: Request, res: Response) {
    const { batchId } = req.params;
    res.json({ success: true, batchId, ...(await service.batchStatus(batchId)) });
}

/** Invitations Outlook des affectations, mises en file d'envoi */
export async function sendAssignmentEmails(req: Request, res: Response) {
    // Même règle que l'interface : bouton des invitations masqué pour le profil RH
    if (req.session.activeProfile === 'rh') throw forbidden('Invitations non autorisées pour ce profil');
    const { assignments } = req.body;
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucune affectation à envoyer' });
    }
    if (!emailConfig.user || !emailConfig.password || !getReusableTransporter()) {
        return res.status(500).json({ success: false, error: 'Configuration email non disponible' });
    }
    // Expéditeur : le compte connecté (nom affiché, organisateur des invitations), jamais une valeur de la requête
    const requesterName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    const senderEmailAddr = (req.session.email as string | undefined) || (emailConfig.user as string);

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
        } catch (enqErr: any) {
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

/** Demande d'affectation par email aux experts choisis (réponse immédiate, envoi en arrière-plan) */
export async function requestAssignment(req: Request, res: Response) {
    // Même règle que l'interface : demande d'affectation réservée aux profils administrateur et utilisateur
    if (req.session.activeProfile !== 'admin' && req.session.activeProfile !== 'user') {
        throw forbidden("Demande d'affectation non autorisée pour ce profil");
    }
    const { expertIds, subject, startDate, startPeriod, endDate, endPeriod, message } = req.body;
    // Expéditeur et adresse de réponse : le compte connecté, jamais une valeur de la requête
    const fromName = `${req.session.prenom || ''} ${req.session.nom || ''}`.trim();
    const fromEmail = req.session.email;
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

    const formatDate = (dateStr: string) =>
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
                to: expert.email as string,
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
            .catch((err: any) => console.error(`❌ Erreur email ${expert.email}:`, err.message));
    }
}

// ---------- Notifications des experts ----------

export async function unreadCount(req: Request, res: Response) {
    res.json({ count: await service.countUnread(userId(req)) });
}

export async function unreadList(req: Request, res: Response) {
    res.json({ notifications: await service.listUnread(userId(req)) });
}

export async function markRead(req: Request, res: Response) {
    await service.markAllRead(userId(req));
    res.json({ success: true });
}

export async function clearAll(req: Request, res: Response) {
    res.json({ success: true, message: 'Toutes les notifications ont été supprimées', ...(await service.clearAll()) });
}

// ---------- Teams ----------

/** Test du canal Teams (adresse email du canal) */
export async function teamsTest(req: Request, res: Response) {
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
    } catch (error: any) {
        console.error('Erreur envoi test Teams:', error);
        return res.status(500).json({ error: error.message });
    }
    service.logTeams('TEST', teamsEmail, 'Test de connexion');
    console.log('📢 Test Teams envoyé à:', teamsEmail);
    res.json({ success: true });
}
