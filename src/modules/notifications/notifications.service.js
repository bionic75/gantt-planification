// @ts-check
// Notifications : messages temps réel (SSE), notifications des experts, affectations en attente,
// suivi des envois groupés, notifications Teams
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';
import { getJsonSetting } from '../../services/settings.js';
import { teamsCardHtml, teamsMessage } from './notifications.emails.js';

/** Connexions SSE ouvertes : userId → réponse */
/** @type {Map<number, import('express').Response>} */
export const sseClients = new Map();

// ---------- Messages instantanés ----------

/** Messages en attente d'un utilisateur, retirés de la file */
export async function takePendingMessages(/** @type {number} */ userId) {
    const rows = await prisma.pendingPushMessage.findMany({
        where: { to_user_id: userId },
        orderBy: [{ sent_at: 'asc' }, { id: 'asc' }]
    });
    if (rows.length) await prisma.pendingPushMessage.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
    return rows;
}

/** Message conservé pour un destinataire non connecté */
export async function storePendingMessage(
    /** @type {{ to_user_id: number, from_user_id: number, from_name: string, from_photo: string | null, message: string, sent_at: string }} */ data
) {
    await prisma.pendingPushMessage.create({ data });
}

// ---------- Suivi d'un envoi groupé ----------

/** Avancement d'un lot d'emails de la file d'attente */
export async function batchStatus(/** @type {string} */ batchId) {
    const [groups, failures] = await Promise.all([
        prisma.emailQueue.groupBy({ by: ['status'], where: { batch_id: batchId }, _count: { _all: true } }),
        prisma.emailQueue.findMany({
            where: { batch_id: batchId, status: 'failed' },
            select: { recipient_name: true, recipient_email: true, error_message: true, action_type: true },
            orderBy: { id: 'asc' }
        })
    ]);
    const count = (/** @type {string} */ status) => groups.find(g => g.status === status)?._count._all || 0;
    const total = groups.reduce((n, g) => n + g._count._all, 0);
    const sent = count('sent');
    const failed = count('failed');
    const completed = sent + failed;
    return {
        total,
        sent,
        pending: count('pending'),
        failed,
        isComplete: completed >= total,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        failures
    };
}

/** Ajoute une ligne au journal de la connexion en cours (journal vide : inchangé, comme en SQL) */
export async function appendToConnectionLog(/** @type {number} */ logId, /** @type {string} */ text) {
    const row = await prisma.connectionLog.findUnique({ where: { id: logId }, select: { modifications: true } });
    if (row?.modifications == null) return;
    await prisma.connectionLog.update({ where: { id: logId }, data: { modifications: row.modifications + text } });
}

// ---------- Affectations en attente de notification ----------

export async function addPendingNotification(
    /** @type {{ sessionId: unknown, resourceId: unknown, expertId: unknown, assignmentData: unknown }} */ body,
    /** @type {number} */ userId
) {
    const row = await prisma.pendingNotification.create({
        data: {
            session_id: /** @type {string} */ (body.sessionId == null ? null : String(body.sessionId)),
            resource_id: idParam(body.resourceId),
            expert_id: idParam(body.expertId),
            assignment_data: /** @type {string} */ (JSON.stringify(body.assignmentData) ?? null),
            created_by: userId
        }
    });
    return row.id;
}

/**
 * Affectations en attente d'une session, avec l'expert (compte et ressource) et, si demandé, l'auteur
 * (lignes sans compte, ressource ou auteur existant ignorées)
 */
export async function listPendingNotifications(/** @type {string} */ sessionId, { withCreator = false } = {}) {
    const rows = await prisma.pendingNotification.findMany({
        where: { session_id: sessionId },
        orderBy: { id: 'asc' }
    });
    const [users, resources] = await Promise.all([
        prisma.user.findMany({
            where: { id: { in: rows.flatMap(r => [r.expert_id, r.created_by]) } },
            select: { id: true, email: true, nom: true, prenom: true }
        }),
        prisma.resource.findMany({
            where: { id: { in: rows.map(r => r.resource_id) } },
            select: { id: true, nom: true, prenom: true }
        })
    ]);
    const userById = new Map(users.map(u => [u.id, u]));
    const resById = new Map(resources.map(r => [r.id, r]));
    return rows.flatMap(pn => {
        const u = userById.get(pn.expert_id);
        const r = resById.get(pn.resource_id);
        const creator = userById.get(pn.created_by);
        if (!u || !r || (withCreator && !creator)) return [];
        return [
            {
                ...pn,
                email: u.email,
                nom: u.nom,
                prenom: u.prenom,
                resource_nom: r.nom,
                resource_prenom: r.prenom,
                ...(withCreator && creator ? { creator_nom: creator.nom, creator_prenom: creator.prenom } : {})
            }
        ];
    });
}

export async function deletePendingNotifications(/** @type {string} */ sessionId) {
    return (await prisma.pendingNotification.deleteMany({ where: { session_id: sessionId } })).count;
}

/** Experts (ressources actives) avec l'email de leur compte : une ligne par compte, ou une sans compte */
export async function listActiveExperts(/** @type {unknown[]} */ resourceIds) {
    const resources = await prisma.resource.findMany({
        where: { id: { in: resourceIds.map(idParam) }, actif: 1 },
        select: { id: true, nom: true, prenom: true },
        orderBy: { id: 'asc' }
    });
    const users = await prisma.user.findMany({
        where: { resource_id: { in: resources.map(r => r.id) } },
        select: { resource_id: true, email: true },
        orderBy: { id: 'asc' }
    });
    return resources.flatMap(r => {
        const emails = users.filter(u => u.resource_id === r.id).map(u => u.email);
        return (emails.length ? emails : [null]).map(email => ({ ...r, email }));
    });
}

// ---------- Notifications des experts ----------

export function countUnread(/** @type {number} */ userId) {
    return prisma.expertNotification.count({ where: { expert_id: userId, is_read: 0 } });
}

/** Notifications non lues, avec la localisation actuelle de la demi-journée dans la planification */
export async function listUnread(/** @type {number} */ userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { resource_id: true } });
    if (!user) return [];
    const notifications = await prisma.expertNotification.findMany({
        where: { expert_id: userId, is_read: 0 },
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }]
    });
    const keyOf = (/** @type {{ date: string, period: string }} */ n) =>
        `${n.date}_${n.period === 'Matin' ? 'AM' : 'PM'}`;
    const cells =
        user.resource_id != null && notifications.length
            ? await prisma.scheduleData.findMany({
                  where: {
                      resource_id: user.resource_id,
                      type: 'localisation',
                      date_key: { in: notifications.map(keyOf) }
                  },
                  select: { date_key: true, value: true }
              })
            : [];
    const loc = new Map(cells.map(c => [c.date_key, c.value]));
    return notifications.map(n => ({
        id: n.id,
        expert_id: n.expert_id,
        date: n.date,
        period: n.period,
        activity_name: n.activity_name,
        requester_name: n.requester_name,
        action_type: n.action_type,
        created_at: n.created_at,
        is_read: n.is_read,
        localisation: loc.get(keyOf(n)) ?? null
    }));
}

export async function markAllRead(/** @type {number} */ userId) {
    await prisma.expertNotification.updateMany({ where: { expert_id: userId, is_read: 0 }, data: { is_read: 1 } });
}

/**
 * Notifications « Nouvelle affectation » des experts ; une notification non lue de la même demi-journée est remplacée
 * @param {any[]} notifications [{ resourceId, date, period, activity, location }]
 * @param {string} requesterName
 */
export async function createBatch(notifications, requesterName) {
    let created = 0;
    let errors = 0;
    for (const { resourceId, date, period, activity, location } of notifications) {
        try {
            const user = await prisma.user.findFirst({
                where: { resource_id: idParam(resourceId), is_expert: 1 },
                select: { id: true },
                orderBy: { id: 'asc' }
            });
            if (!user) {
                console.log(`⚠️ Pas d'utilisateur expert trouvé pour resource_id ${resourceId}`);
                continue;
            }
            const activityName = location && location !== '-' ? `${activity} (${location})` : activity;
            const data = {
                activity_name: activityName,
                requester_name: requesterName,
                action_type: 'Nouvelle affectation'
            };
            const existing = await prisma.expertNotification.findFirst({
                where: { expert_id: user.id, date, period, is_read: 0 },
                select: { id: true },
                orderBy: { id: 'asc' }
            });
            if (existing) {
                await prisma.expertNotification.update({
                    where: { id: existing.id },
                    data: { ...data, created_at: sqlTimestamp() }
                });
                console.log(`🔄 Notification mise à jour pour expert_id ${user.id}, date ${date} ${period}`);
            } else {
                await prisma.expertNotification.create({ data: { ...data, expert_id: user.id, date, period } });
                console.log(`✅ Notification créée pour expert_id ${user.id}, date ${date} ${period}`);
            }
            created++;
        } catch (error) {
            console.error(`❌ Erreur création notification pour resource ${resourceId}:`, error);
            errors++;
        }
    }
    return { created, errors };
}

/** Suppression de toutes les notifications, avec le nombre supprimé par expert */
export async function clearAll() {
    const groups = await prisma.expertNotification.groupBy({ by: ['expert_id'], _count: { _all: true } });
    const users = await prisma.user.findMany({
        where: { id: { in: groups.map(g => g.expert_id) } },
        select: { id: true, username: true }
    });
    const username = new Map(users.map(u => [u.id, u.username]));
    const statsByExpert = groups
        .map(g => ({ expert_id: g.expert_id, username: username.get(g.expert_id) ?? null, count: g._count._all }))
        .sort((a, b) =>
            a.username === b.username
                ? a.expert_id - b.expert_id
                : a.username == null
                  ? -1
                  : b.username == null
                    ? 1
                    : a.username < b.username
                      ? -1
                      : 1
        );
    const { count } = await prisma.expertNotification.deleteMany();
    return { totalDeleted: count, statsByExpert };
}

// ---------- Teams ----------

/** Envoi d'une notification Teams : journal de l'automatisation n°3 */
function logTeams(/** @type {string} */ name, /** @type {string} */ email, /** @type {string} */ target) {
    prisma.automationLog
        .create({
            data: {
                automation_id: 3,
                expert_name: name,
                expert_email: email,
                target_month: target,
                sent_at: sqlTimestamp()
            }
        })
        .catch(err => console.error('Erreur log Teams notify:', err));
}

/**
 * Notification Teams (email vers l'adresse du canal) selon la configuration de l'automatisation n°3
 * @param {string} type affectation | demande | astreinte | evenement
 * @param {any} data
 * @param {{ detailedRequest: boolean, fromAddress: string }} options
 * @returns {Promise<{ success: boolean, reason?: string }>}
 */
async function sendTeams(type, data, { detailedRequest, fromAddress }) {
    const config = await getJsonSetting('automation_3_config');
    if (!config) return { success: false, reason: 'Configuration non trouvée' };
    if (!config.enabled) return { success: false, reason: 'Automatisation désactivée' };
    if (!config.notifications || !config.notifications.includes(type)) {
        return { success: false, reason: 'Type de notification non activé' };
    }
    if (!config.teamsEmail) return { success: false, reason: 'Email Teams non configuré' };
    const msg = teamsMessage(type, data, { detailedRequest });
    if (!msg) return { success: false, reason: 'Type de notification inconnu' };
    const transporter = createEmailTransporter();
    if (!transporter) return { success: false, reason: 'Transporteur email non disponible' };
    await transporter.sendMail({
        from: `"Planning ANS" <${fromAddress}>`,
        to: config.teamsEmail,
        subject: `${msg.subject} - Planning ANS`,
        html: teamsCardHtml(msg.subject, msg.color, msg.content)
    });
    logTeams(type, config.teamsEmail, JSON.stringify(data));
    return { success: true };
}

/** Notification Teams émise par le serveur (création d'événement, d'astreinte…) : erreurs journalisées */
export async function sendTeamsNotificationFromServer(/** @type {string} */ type, /** @type {any} */ data) {
    try {
        const r = await sendTeams(type, data, {
            detailedRequest: false,
            fromAddress: emailConfig.user || 'noreply@esante.gouv.fr'
        });
        if (r.success) console.log(`📢 Notification Teams [${type}] envoyée avec succès`);
        else console.log(`📢 Teams: ${r.reason}`);
    } catch (error) {
        console.error('📢 Erreur envoi notification Teams:', error);
    }
}

/** Notification Teams demandée par l'interface */
export async function notifyTeams(/** @type {string} */ type, /** @type {any} */ data) {
    const r = await sendTeams(type, data, {
        detailedRequest: true,
        fromAddress: env.SMTP_USER || 'noreply@esante.gouv.fr'
    });
    if (r.success) console.log(`📢 Notification Teams [${type}] envoyée`);
    return r;
}

export { logTeams };
