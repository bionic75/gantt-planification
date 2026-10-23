// Notifications : temps réel (SSE), notifications experts, emails d'affectation et invitations, Teams
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import crypto from 'crypto';
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { buildInvitationHTML, sseClients } from './notifications.service.js';
import { database } from '../../db/database.js';
import { activeSessions } from '../../state/sessions.js';
import { createEmailTransporter, emailConfig, sendEmail } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';
import { enqueueEmail, getReusableTransporter } from '../../services/email-queue.js';
import {
    ACTIVITY_LABELS,
    HALF_DAY_HOURS,
    buildICS,
    formatDateICS,
    generateICSUid,
    getCleanActivityLabel,
    getCleanOldActivityLabel,
    groupContiguousAssignments
} from '../../lib/ics.js';
import { env as appEnv } from '../../config/env.js';

const router = Router();

// ── SSE : connexion persistante pour les messages push ──────────────────────
router.get('/sse', requireAuth, (req, res) => {
    const userId = req.session.userId;

    // Empêcher express-session de tenter d'écrire Set-Cookie après flushHeaders
    // (les headers sont déjà envoyés sur une connexion SSE persistante)
    req.session.save = cb => {
        if (cb) cb(null);
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.set(userId, res);

    // Livrer les messages en attente pour cet utilisateur
    database.all(
        `SELECT * FROM pending_push_messages WHERE to_user_id = ? ORDER BY sent_at ASC`,
        [userId],
        (err, rows) => {
            if (err || !rows || rows.length === 0) return;
            rows.forEach(row => {
                const payload = JSON.stringify({
                    fromUserId: row.from_user_id,
                    fromName: row.from_name,
                    fromPhoto: row.from_photo,
                    message: row.message,
                    sentAt: row.sent_at
                });
                res.write(`event: push-message\ndata: ${payload}\n\n`);
            });
            database.run(`DELETE FROM pending_push_messages WHERE to_user_id = ?`, [userId]);
        }
    );

    // Heartbeat toutes les 25 s pour maintenir la connexion
    const heartbeat = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(heartbeat);
            return;
        }
        res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(userId);
    });
});

// ── POST /api/push-message ───────────────────────────────────────────────────
router.post('/push-message', requireAuth, (req, res) => {
    const fromUserId = req.session.userId;
    const { toUserId, message } = req.body;

    if (!toUserId || !message || !message.trim()) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const fromSession = activeSessions.get(fromUserId);
    const fromName = fromSession?.fullName || fromSession?.username || `Utilisateur #${fromUserId}`;
    const fromPhoto = fromSession?.profilePhoto || null;
    const sentAt = new Date().toISOString();

    const payload = JSON.stringify({
        fromUserId,
        fromName,
        fromPhoto,
        fromProfile: fromSession?.profile || null,
        message: message.trim(),
        sentAt
    });

    const targetRes = sseClients.get(Number(toUserId));
    if (targetRes && !targetRes.writableEnded) {
        // Livraison immédiate via SSE
        targetRes.write(`event: push-message\ndata: ${payload}\n\n`);
        return res.json({ ok: true });
    }

    // Destinataire pas connecté en SSE → stocker le message pour livraison différée
    database.run(
        `INSERT INTO pending_push_messages (to_user_id, from_user_id, from_name, from_photo, message, sent_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [Number(toUserId), fromUserId, fromName, fromPhoto, message.trim(), sentAt],
        err => {
            if (err) return res.status(500).json({ error: 'Impossible de stocker le message' });
            res.json({ ok: true, pending: true });
        }
    );
});

// Envoi du calendrier par email
router.post('/send-calendar-email', requireAuth, async (req, res) => {
    const { resourceId, email, html, subject } = req.body;

    if (!email || !html || !subject) {
        return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    }

    if (!emailConfig.user) {
        return res.status(400).json({ success: false, error: 'Configuration email non définie' });
    }

    try {
        await sendEmail(email, subject, html);

        logUserAction(req, 'Envoi calendrier par email', {
            resourceId,
            destinataire: email
        });

        res.json({ success: true, message: 'Calendrier envoyé par email avec succès' });
    } catch (error) {
        console.error('Erreur envoi calendrier par email:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint: statut d'un batch d'emails
router.get('/email-queue/status/:batchId', requireAuth, async (req, res) => {
    const { batchId } = req.params;

    try {
        const stats = await new Promise((resolve, reject) => {
            database.get(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
                 FROM email_queue WHERE batch_id = ?`,
                [batchId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Récupérer les détails des emails échoués
        const failures = await new Promise((resolve, reject) => {
            database.all(
                `SELECT recipient_name, recipient_email, error_message, action_type 
                 FROM email_queue WHERE batch_id = ? AND status = 'failed'`,
                [batchId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        const completed = (stats.sent || 0) + (stats.failed || 0);
        const isComplete = completed >= stats.total;

        res.json({
            success: true,
            batchId,
            total: stats.total || 0,
            sent: stats.sent || 0,
            pending: stats.pending || 0,
            failed: stats.failed || 0,
            isComplete,
            progress: stats.total > 0 ? Math.round((completed / stats.total) * 100) : 0,
            failures
        });
    } catch (error) {
        console.error('Erreur statut queue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/send-assignment-emails', requireAuth, async (req, res) => {
    try {
        const { assignments, senderName, senderEmail: clientSenderEmail } = req.body;

        if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucune affectation à envoyer' });
        }
        if (!emailConfig.user || !emailConfig.password) {
            return res.status(500).json({ success: false, error: 'Configuration email non disponible' });
        }

        const requesterName = senderName || `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
        const senderEmailAddr = clientSenderEmail || emailConfig.user;
        const sessionLogId = req.session?.logId;

        const transporter = getReusableTransporter();
        if (!transporter) {
            return res.status(500).json({ success: false, error: 'Configuration email non disponible' });
        }

        // Préparer tous les emails en mémoire
        const emailsToSend = [];
        for (const item of assignments) {
            const { email, expertNom, expertPrenom, expertName, assignments: expertAssignments } = item;
            const attendeeName =
                expertPrenom && expertNom
                    ? `${expertPrenom} ${expertNom}`
                    : expertName || expertPrenom || expertNom || 'Expert';
            if (!email) continue;

            const newAssigns = expertAssignments.filter(a => a.actionType === 'new' || !a.actionType);
            const modifiedAssigns = expertAssignments.filter(a => a.actionType === 'modified');
            const deletedAssigns = expertAssignments.filter(a => a.actionType === 'deleted');

            for (const group of groupContiguousAssignments(newAssigns)) {
                try {
                    const firstSlot = group.slots[0],
                        lastSlot = group.slots[group.slots.length - 1];
                    const startH = HALF_DAY_HOURS[firstSlot.period],
                        endH = HALF_DAY_HOURS[lastSlot.period];
                    const cleanLabel =
                        ACTIVITY_LABELS[group.activityCode] ||
                        getCleanActivityLabel({ activityCode: group.activityCode, activity: group.activity });
                    const summary = `Domaines des Urgences - Affectation – ${cleanLabel} – ${requesterName}`;
                    const location = group.location && group.location !== '-' ? group.location : '';
                    const slotsDesc = group.slots
                        .map(s => {
                            const [y, m, d] = s.date.split('-');
                            return `${d}/${m}/${y} (${s.period === 'AM' ? 'Matin 8h-12h' : 'Apres-midi 14h-18h'})`;
                        })
                        .join('\\n');
                    emailsToSend.push({
                        type: 'new',
                        to: email,
                        attendeeName,
                        subject: summary,
                        html: buildInvitationHTML(attendeeName, requesterName, group, 'new'),
                        icsContent: buildICS({
                            uid: generateICSUid(),
                            summary,
                            description: `Affectation: ${cleanLabel}\\nLocalisation: ${location || 'Non precisee'}\\nDemandeur: ${requesterName}\\n\\nCreneaux:\\n${slotsDesc}`,
                            location,
                            dtstart: formatDateICS(firstSlot.date, startH.start, 0),
                            dtend: formatDateICS(lastSlot.date, endH.end, 0),
                            organizer: senderEmailAddr,
                            organizerName: requesterName,
                            attendee: email,
                            attendeeName,
                            method: 'REQUEST'
                        }),
                        icsMethod: 'REQUEST',
                        icsFilename: 'invitation.ics'
                    });
                } catch (e) {
                    console.error('Erreur préparation NEW:', e.message);
                }
            }

            for (const a of modifiedAssigns) {
                try {
                    const hours = HALF_DAY_HOURS[a.period];
                    const oldLabel = getCleanOldActivityLabel(a);
                    const oldLoc = a.oldLocation && a.oldLocation !== '-' ? a.oldLocation : '';
                    const cancelSummary = `Domaines des Urgences - Affectation – ${oldLabel} – ${requesterName}`;
                    emailsToSend.push({
                        type: 'cancel_modify',
                        to: email,
                        attendeeName,
                        subject: `Annule: ${cancelSummary}`,
                        html: buildInvitationHTML(
                            attendeeName,
                            requesterName,
                            { activity: oldLabel, location: oldLoc, slots: [a] },
                            'cancelled'
                        ),
                        icsContent: buildICS({
                            uid: generateICSUid(),
                            summary: cancelSummary,
                            description: `Annulation: cette affectation a ete modifiee par ${requesterName}.`,
                            location: oldLoc,
                            dtstart: formatDateICS(a.date, hours.start, 0),
                            dtend: formatDateICS(a.date, hours.end, 0),
                            organizer: senderEmailAddr,
                            organizerName: requesterName,
                            attendee: email,
                            attendeeName,
                            sequence: 1,
                            method: 'CANCEL'
                        }),
                        icsMethod: 'CANCEL',
                        icsFilename: 'annulation.ics'
                    });
                    const newLabel = ACTIVITY_LABELS[a.activityCode] || getCleanActivityLabel(a);
                    const newLoc = a.location && a.location !== '-' ? a.location : '';
                    const newSummary = `Domaines des Urgences - Affectation – ${newLabel} – ${requesterName}`;
                    emailsToSend.push({
                        type: 'modified',
                        to: email,
                        attendeeName,
                        subject: newSummary,
                        html: buildInvitationHTML(
                            attendeeName,
                            requesterName,
                            { activity: newLabel, location: newLoc, slots: [a] },
                            'modified'
                        ),
                        icsContent: buildICS({
                            uid: generateICSUid(),
                            summary: newSummary,
                            description: `Nouvelle affectation: ${newLabel}\\nLocalisation: ${newLoc || 'Non precisee'}\\nDemandeur: ${requesterName}`,
                            location: newLoc,
                            dtstart: formatDateICS(a.date, hours.start, 0),
                            dtend: formatDateICS(a.date, hours.end, 0),
                            organizer: senderEmailAddr,
                            organizerName: requesterName,
                            attendee: email,
                            attendeeName,
                            method: 'REQUEST'
                        }),
                        icsMethod: 'REQUEST',
                        icsFilename: 'invitation.ics'
                    });
                } catch (e) {
                    console.error('Erreur préparation MODIFIED:', e.message);
                }
            }

            for (const a of deletedAssigns) {
                try {
                    const hours = HALF_DAY_HOURS[a.period];
                    const delLabel = getCleanOldActivityLabel(a);
                    const loc =
                        a.oldLocation && a.oldLocation !== '-'
                            ? a.oldLocation
                            : a.location && a.location !== '-'
                              ? a.location
                              : '';
                    const cancelSummary = `Domaines des Urgences - Affectation – ${delLabel} – ${requesterName}`;
                    emailsToSend.push({
                        type: 'deleted',
                        to: email,
                        attendeeName,
                        subject: `Annule: ${cancelSummary}`,
                        html: buildInvitationHTML(
                            attendeeName,
                            requesterName,
                            { activity: delLabel, location: loc, slots: [a] },
                            'cancelled'
                        ),
                        icsContent: buildICS({
                            uid: generateICSUid(),
                            summary: cancelSummary,
                            description: `Cette affectation a ete supprimee par ${requesterName}.`,
                            location: loc,
                            dtstart: formatDateICS(a.date, hours.start, 0),
                            dtend: formatDateICS(a.date, hours.end, 0),
                            organizer: senderEmailAddr,
                            organizerName: requesterName,
                            attendee: email,
                            attendeeName,
                            sequence: 1,
                            method: 'CANCEL'
                        }),
                        icsMethod: 'CANCEL',
                        icsFilename: 'annulation.ics'
                    });
                } catch (e) {
                    console.error('Erreur préparation DELETED:', e.message);
                }
            }
        }

        if (emailsToSend.length === 0) {
            return res.json({ success: false, error: 'Aucun email à envoyer (experts sans email ?)' });
        }

        // Enqueue dans email_queue — réponse immédiate, worker traite en fond
        const batchId = crypto.randomUUID();
        let enqueued = 0;
        for (const mail of emailsToSend) {
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
            } catch (enqErr) {
                console.error(`❌ Erreur enqueue pour ${mail.to}:`, enqErr.message);
            }
        }

        console.log(
            `📧 send-assignment-emails: ${enqueued}/${emailsToSend.length} email(s) en file (batchId=${batchId})`
        );

        if (sessionLogId) {
            const allEmails = assignments
                .map(a => a.email)
                .filter(e => e)
                .join(', ');
            database.run(`UPDATE connection_logs SET modifications = modifications || ? WHERE id = ?`, [
                `${new Date().toLocaleString('fr-FR')}: Invitations Outlook en file (${enqueued} emails) pour: ${allEmails}\n`,
                sessionLogId
            ]);
        }

        res.json({
            success: true,
            batchId,
            enqueued,
            message: `${enqueued} invitation(s) ajoutée(s) à la file d'envoi`
        });
    } catch (error) {
        console.error('❌ Erreur send-assignment-emails:', error);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/pending-notifications', requireAuth, (req, res) => {
    const { sessionId, resourceId, expertId, assignmentData } = req.body;

    database.run(
        `INSERT INTO pending_notifications (session_id, resource_id, expert_id, assignment_data, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, resourceId, expertId, JSON.stringify(assignmentData), req.session.userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

router.get('/pending-notifications/:sessionId', requireAuth, (req, res) => {
    const { sessionId } = req.params;

    database.all(
        `SELECT pn.*, u.email, u.nom, u.prenom, r.nom as resource_nom, r.prenom as resource_prenom
         FROM pending_notifications pn
         JOIN users u ON pn.expert_id = u.id
         JOIN resources r ON pn.resource_id = r.id
         WHERE pn.session_id = ?`,
        [sessionId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

router.delete('/pending-notifications/:sessionId', requireAuth, (req, res) => {
    const { sessionId } = req.params;

    database.run('DELETE FROM pending_notifications WHERE session_id = ?', [sessionId], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, deleted: this.changes });
    });
});

router.post('/send-assignment-notifications', requireAuth, async (req, res) => {
    const { sessionId } = req.body;

    try {
        const notifications = await new Promise((resolve, reject) => {
            database.all(
                `SELECT pn.*, u.email, u.nom, u.prenom, r.nom as resource_nom, r.prenom as resource_prenom,
                        creator.nom as creator_nom, creator.prenom as creator_prenom
                 FROM pending_notifications pn
                 JOIN users u ON pn.expert_id = u.id
                 JOIN resources r ON pn.resource_id = r.id
                 JOIN users creator ON pn.created_by = creator.id
                 WHERE pn.session_id = ?`,
                [sessionId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        const results = [];
        for (const notif of notifications) {
            const assignmentData = JSON.parse(notif.assignment_data);

            const emailBody = `
                <h2>Nouvelle affectation - Planification GANTT</h2>
                <p>Bonjour ${notif.prenom} ${notif.nom},</p>
                <p><strong>${notif.creator_prenom} ${notif.creator_nom}</strong> vous a affecté une nouvelle activité :</p>
                <ul>
                    <li><strong>Période :</strong> ${assignmentData.dates}</li>
                    <li><strong>Activité :</strong> ${assignmentData.activity}</li>
                    <li><strong>Localisation :</strong> ${assignmentData.location}</li>
                </ul>
                <p>Cordialement,<br>Le système de planification</p>
            `;

            try {
                await sendEmail(notif.email, 'Nouvelle affectation', emailBody);
                results.push({ success: true, expert: `${notif.prenom} ${notif.nom}` });
            } catch (error) {
                results.push({ success: false, expert: `${notif.prenom} ${notif.nom}`, error: error.message });
            }
        }

        // Supprimer les notifications envoyées
        database.run('DELETE FROM pending_notifications WHERE session_id = ?', [sessionId]);

        logUserAction(req, 'Envoi notifications affectations', {
            sessionId,
            count: notifications.length,
            results
        });

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/request-assignment', requireAuth, async (req, res) => {
    try {
        const { fromName, fromEmail, expertIds, subject, startDate, startPeriod, endDate, endPeriod, message } =
            req.body;

        if (!expertIds || expertIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucun expert sélectionné' });
        }
        if (!fromEmail) {
            return res.status(400).json({ success: false, error: "Email de l'expéditeur manquant" });
        }

        const placeholders = expertIds.map(() => '?').join(',');
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT r.id, r.nom, r.prenom, u.email
                FROM resources r
                LEFT JOIN users u ON u.resource_id = r.id
                WHERE r.id IN (${placeholders}) AND r.actif = 1`,
                expertIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        if (experts.length === 0) {
            return res.status(404).json({ success: false, error: 'Aucun expert trouvé' });
        }

        const expertsWithEmail = experts.filter(e => e.email && e.email.trim() !== '');
        if (expertsWithEmail.length === 0) {
            return res
                .status(400)
                .json({ success: false, error: "Aucun des experts sélectionnés n'a d'adresse email configurée." });
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(500).json({ success: false, error: 'Configuration email non disponible.' });
        }

        const formatDate = dateStr => {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        };
        const startDateFormatted = `${formatDate(startDate)} - ${startPeriod}`;
        const endDateFormatted = `${formatDate(endDate)} - ${endPeriod}`;

        // Réponse immédiate, envoi en arrière-plan
        res.json({
            success: true,
            message: `Demande envoyée à ${expertsWithEmail.length} expert(s)`,
            emails: expertsWithEmail.map(e => e.email)
        });

        process.nextTick(() => {
            expertsWithEmail.forEach(expert => {
                const personalizedMessage = message.replace(/\[Prénom de l'utilisateur\]/g, expert.prenom);
                const mailOptions = {
                    from: `"SI-SAMU Planning" <${emailConfig.user}>`,
                    replyTo: fromEmail,
                    to: expert.email,
                    subject: subject,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                <h2 style="color: #1D70B7; border-bottom: 2px solid #1D70B7; padding-bottom: 10px;">Demande d'affectation</h2>
                                <div style="margin: 20px 0; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                                    <p style="margin: 5px 0;"><strong>De:</strong> ${fromName} (${fromEmail})</p>
                                    <p style="margin: 5px 0;"><strong>Début:</strong> ${startDateFormatted}</p>
                                    <p style="margin: 5px 0;"><strong>Fin:</strong> ${endDateFormatted}</p>
                                </div>
                                <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 4px; line-height: 1.8;">
                                    ${personalizedMessage
                                        .split('\n')
                                        .map(line =>
                                            line.trim() === '' ? '<br>' : `<p style="margin: 0 0 10px 0;">${line}</p>`
                                        )
                                        .join('')}
                                </div>
                                <div style="text-align: center; margin: 25px 0;">
                                    <a href="mailto:${fromEmail}?subject=${encodeURIComponent('Re: ' + subject)}"
                                       style="display: inline-block; padding: 12px 30px; background-color: #27ae60; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                        📧 Répondre à ${fromName}
                                    </a>
                                </div>
                                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                                <p style="color: #7f8c8d; font-size: 12px; text-align: center; margin: 0;">Système SI-SAMU de planification des ressources</p>
                            </div>
                        </div>`
                };
                transporter
                    .sendMail(mailOptions)
                    .then(() => console.log(`✅ Email envoyé à ${expert.email}`))
                    .catch(err => console.error(`❌ Erreur email ${expert.email}:`, err.message));
            });
        });
    } catch (error) {
        console.error("❌ Erreur demande d'affectation:", error);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

// Récupérer le nombre de notifications non lues
router.get('/notifications/count', requireAuth, (req, res) => {
    if (!req.session.userId) {
        return res.json({ count: 0 });
    }

    database.get(
        `SELECT COUNT(*) as count FROM expert_notifications 
         WHERE expert_id = ? AND is_read = 0`,
        [req.session.userId],
        (err, row) => {
            if (err) {
                console.error('Erreur count notifications:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ count: row.count });
        }
    );
});

// Récupérer la liste des notifications
router.get('/notifications/list', requireAuth, (req, res) => {
    if (!req.session.userId) {
        return res.json({ notifications: [] });
    }

    // Récupérer d'abord les notifications et le resource_id de l'expert
    database.get(`SELECT resource_id FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.json({ notifications: [] });
        }

        const resourceId = user.resource_id;

        // Récupérer les notifications avec la localisation en temps réel
        database.all(
            `SELECT 
                    en.id,
                    en.expert_id,
                    en.date,
                    en.period,
                    en.activity_name,
                    en.requester_name,
                    en.action_type,
                    en.created_at,
                    en.is_read,
                    sd.value as localisation
                 FROM expert_notifications en
                 LEFT JOIN schedule_data sd ON sd.resource_id = ? 
                    AND sd.date_key = en.date || '_' || CASE WHEN en.period = 'Matin' THEN 'AM' ELSE 'PM' END
                    AND sd.type = 'localisation'
                 WHERE en.expert_id = ? AND en.is_read = 0
                 ORDER BY en.created_at DESC`,
            [resourceId, req.session.userId],
            (err, rows) => {
                if (err) {
                    console.error('Erreur list notifications:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ notifications: rows });
            }
        );
    });
});

// Marquer les notifications comme lues
router.post('/notifications/mark-read', requireAuth, (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: true });
    }

    database.run(
        `UPDATE expert_notifications 
         SET is_read = 1 
         WHERE expert_id = ? AND is_read = 0`,
        [req.session.userId],
        err => {
            if (err) {
                console.error('Erreur mark notifications read:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

// Créer les notifications en batch (appelé à la déconnexion après envoi des emails)
router.post('/notifications/create-batch', requireAuth, async (req, res) => {
    const { notifications } = req.body;

    if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
        return res.json({ success: true, created: 0 });
    }

    const requesterName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    let created = 0;
    let errors = 0;

    console.log(`📝 Création de ${notifications.length} notification(s) en batch par ${requesterName}`);

    for (const notif of notifications) {
        const { resourceId, date, period, activity, location } = notif;

        try {
            // Récupérer l'user_id de l'expert à partir de resource_id
            const user = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT id FROM users WHERE resource_id = ? AND is_expert = 1`,
                    [resourceId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!user) {
                console.log(`⚠️ Pas d'utilisateur expert trouvé pour resource_id ${resourceId}`);
                continue;
            }

            // Construire le nom de l'activité avec la localisation si présente
            let activityName = activity;
            if (location && location !== '-') {
                activityName = `${activity} (${location})`;
            }

            // Vérifier si une notification existe déjà pour cette demi-journée
            const existingNotif = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT id FROM expert_notifications 
                     WHERE expert_id = ? AND date = ? AND period = ? AND is_read = 0`,
                    [user.id, date, period],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (existingNotif) {
                // Une notification existe déjà pour cette demi-journée → UPDATE
                await new Promise((resolve, reject) => {
                    database.run(
                        `UPDATE expert_notifications 
                         SET activity_name = ?, requester_name = ?, action_type = ?, created_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [activityName, requesterName, 'Nouvelle affectation', existingNotif.id],
                        err => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`🔄 Notification mise à jour pour expert_id ${user.id}, date ${date} ${period}`);
            } else {
                // Pas de notification existante → INSERT
                await new Promise((resolve, reject) => {
                    database.run(
                        `INSERT INTO expert_notifications (expert_id, date, period, activity_name, requester_name, action_type)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [user.id, date, period, activityName, requesterName, 'Nouvelle affectation'],
                        err => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`✅ Notification créée pour expert_id ${user.id}, date ${date} ${period}`);
            }

            created++;
        } catch (error) {
            console.error(`❌ Erreur création notification pour resource ${resourceId}:`, error);
            errors++;
        }
    }

    console.log(`📊 Résultat batch: ${created} créée(s), ${errors} erreur(s)`);

    res.json({ success: true, created, errors });
});

// Supprimer toutes les notifications (pour nettoyer)
router.post('/notifications/clear-all', requireAdmin, (req, res) => {
    // D'abord, obtenir les statistiques par expert avant suppression
    database.all(
        `SELECT 
            en.expert_id,
            u.username,
            COUNT(*) as count
         FROM expert_notifications en
         LEFT JOIN users u ON en.expert_id = u.id
         GROUP BY en.expert_id, u.username
         ORDER BY u.username`,
        (err, stats) => {
            if (err) {
                console.error('Erreur récupération stats:', err);
                return res.status(500).json({ error: err.message });
            }

            // Calculer le total
            const totalNotifications = stats.reduce((sum, stat) => sum + stat.count, 0);

            // Maintenant supprimer toutes les notifications
            database.run(`DELETE FROM expert_notifications`, function (deleteErr) {
                if (deleteErr) {
                    console.error('Erreur clear notifications:', deleteErr);
                    return res.status(500).json({ error: deleteErr.message });
                }

                res.json({
                    success: true,
                    message: 'Toutes les notifications ont été supprimées',
                    totalDeleted: this.changes,
                    statsByExpert: stats
                });
            });
        }
    );
});

// Tester l'envoi vers Teams
router.post('/teams/test', requireAdmin, async (req, res) => {
    const { teamsEmail } = req.body;

    if (!teamsEmail) {
        return res.status(400).json({ error: 'Adresse email Teams requise' });
    }

    try {
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res
                .status(500)
                .json({ error: 'Configuration email non disponible. Veuillez configurer SMTP dans les paramètres.' });
        }

        const mailOptions = {
            from: `"Planning ANS" <${emailConfig.user || 'noreply@esante.gouv.fr'}>`,
            to: teamsEmail,
            subject: '🧪 Test de notification - Planning ANS',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">🧪 Test de notification</h2>
                        </div>
                        <div style="padding: 25px;">
                            <p style="font-size: 16px; color: #333;">
                                ✅ <strong>Félicitations !</strong>
                            </p>
                            <p style="color: #666;">
                                Si vous voyez ce message, la connexion entre l'application <strong>Planning ANS</strong> et votre canal Teams fonctionne correctement.
                            </p>
                            <p style="color: #666;">
                                Les notifications automatiques seront désormais envoyées ici selon la configuration choisie.
                            </p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        // Logger l'envoi
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at) VALUES (?, ?, ?, ?, datetime('now'))`,
            [3, 'TEST', teamsEmail, 'Test de connexion'],
            err => {
                if (err) console.error('Erreur log Teams test:', err);
            }
        );

        console.log('📢 Test Teams envoyé à:', teamsEmail);
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur envoi test Teams:', error);
        res.status(500).json({ error: error.message });
    }
});

// Envoyer une notification Teams
router.post('/teams/notify', requireAuth, async (req, res) => {
    const { type, data } = req.body;

    try {
        // Récupérer la configuration de l'automatisation 3
        const configRow = await new Promise((resolve, reject) => {
            database.get(`SELECT value FROM settings WHERE key = ?`, ['automation_3_config'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!configRow || !configRow.value) {
            return res.json({ success: false, reason: 'Configuration non trouvée' });
        }

        const config = JSON.parse(configRow.value);

        if (!config.enabled) {
            return res.json({ success: false, reason: 'Automatisation désactivée' });
        }

        if (!config.notifications || !config.notifications.includes(type)) {
            return res.json({ success: false, reason: 'Type de notification non activé' });
        }

        if (!config.teamsEmail) {
            return res.json({ success: false, reason: 'Email Teams non configuré' });
        }

        // Construire le message selon le type
        let subject = '';
        let content = '';
        let emoji = '';
        let color = '#3498db';

        switch (type) {
            case 'affectation':
                emoji = '📅';
                subject = `${emoji} Nouvelle affectation`;
                color = '#3498db';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Activité :</strong> ${data.activity || 'Non spécifiée'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    <p><strong>Période :</strong> ${data.period || 'Non spécifiée'}</p>
                    ${data.location ? `<p><strong>Localisation :</strong> ${data.location}</p>` : ''}
                `;
                break;

            case 'demande':
                emoji = '✉️';
                subject = `${emoji} Demande d'affectation`;
                color = '#27ae60';
                content = `
                    <p><strong>De :</strong> ${data.from || 'Non spécifié'}</p>
                    <p><strong>Objet :</strong> ${data.subject || 'Non spécifié'}</p>
                    ${data.experts ? `<p><strong>Expert(s) contacté(s) :</strong> ${data.experts}</p>` : ''}
                    ${data.startDate ? `<p><strong>Période demandée :</strong></p><p style="margin-left: 15px;">📅 Du ${data.startDate}<br>📅 Au ${data.endDate}</p>` : ''}
                    <p><strong>Message :</strong></p>
                    <div style="background: #ffffff; border: 1px solid #e0e0e0; padding: 12px; border-radius: 5px; margin-top: 5px; color: #333333; line-height: 1.6;">
                        ${(data.message || '').replace(/\n/g, '<br>')}
                    </div>
                `;
                break;

            case 'astreinte':
                emoji = '🔔';
                subject = `${emoji} Nouvelle astreinte/HNO`;
                color = '#9c27b0';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Type :</strong> ${data.type === 'hno' ? 'HNO (Heures Non Ouvrées)' : data.type === 'activite_courante' ? 'Activité courante' : 'Astreinte'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.heureDebut ? `<p><strong>Horaires :</strong> ${data.heureDebut} - ${data.heureFin}</p>` : ''}
                `;
                break;

            case 'evenement':
                emoji = '📆';
                subject = `${emoji} Nouvel événement`;
                color = '#ff9800';
                content = `
                    <p><strong>Événement :</strong> ${data.name || 'Non spécifié'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.createdBy ? `<p><strong>Créé par :</strong> ${data.createdBy}</p>` : ''}
                `;
                break;

            default:
                return res.json({ success: false, reason: 'Type de notification inconnu' });
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.json({ success: false, reason: 'Transporteur email non disponible' });
        }

        const mailOptions = {
            from: `"Planning ANS" <${appEnv.SMTP_USER || 'noreply@esante.gouv.fr'}>`,
            to: config.teamsEmail,
            subject: `${subject} - Planning ANS`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">${subject}</h2>
                        </div>
                        <div style="padding: 25px;">
                            ${content}
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        // Logger l'envoi
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at) VALUES (?, ?, ?, ?, datetime('now'))`,
            [3, type, config.teamsEmail, JSON.stringify(data)],
            err => {
                if (err) console.error('Erreur log Teams notify:', err);
            }
        );

        console.log(`📢 Notification Teams [${type}] envoyée`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur envoi notification Teams:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
