// Notifications : messages temps réel (SSE), notifications des experts, suivi des envois groupés, notifications Teams
import { prisma } from '../../db/prisma.ts';
import { idParam, sqlTimestamp } from '../../db/values.ts';
import { createEmailTransporter, emailConfig } from '../../lib/mailer.ts';
import { getJsonSetting } from '../../services/settings.ts';
import { teamsCardHtml, teamsMessage } from './notifications.emails.ts';
import { isLoggedActivity, LOGGED_ACTIVITIES } from '../schedule/schedule.service.ts';

/** Connexions SSE ouvertes : userId → réponse */
export const sseClients: Map<number, import('express').Response> = new Map();

// ---------- Messages instantanés ----------

/** Messages en attente d'un utilisateur, retirés de la file */
export async function takePendingMessages(userId: number) {
    const rows = await prisma.pendingPushMessage.findMany({
        where: { to_user_id: userId },
        orderBy: [{ sent_at: 'asc' }, { id: 'asc' }]
    });
    if (rows.length) await prisma.pendingPushMessage.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
    return rows;
}

/** Message conservé pour un destinataire non connecté */
export async function storePendingMessage(data: {
    to_user_id: number;
    from_user_id: number;
    from_name: string;
    from_photo: string | null;
    message: string;
    sent_at: string;
}) {
    await prisma.pendingPushMessage.create({ data });
}

// ---------- Suivi d'un envoi groupé ----------

/** Avancement d'un lot d'emails de la file d'attente */
export async function batchStatus(batchId: string) {
    const [groups, failures] = await Promise.all([
        prisma.emailQueue.groupBy({ by: ['status'], where: { batch_id: batchId }, _count: { _all: true } }),
        prisma.emailQueue.findMany({
            where: { batch_id: batchId, status: 'failed' },
            select: { recipient_name: true, recipient_email: true, error_message: true, action_type: true },
            orderBy: { id: 'asc' }
        })
    ]);
    const count = (status: string) => groups.find(g => g.status === status)?._count._all || 0;
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
export async function appendToConnectionLog(logId: number, text: string) {
    const row = await prisma.connectionLog.findUnique({ where: { id: logId }, select: { modifications: true } });
    if (row?.modifications == null) return;
    await prisma.connectionLog.update({ where: { id: logId }, data: { modifications: row.modifications + text } });
}

// ---------- Experts destinataires ----------

/** Experts (ressources actives) avec l'email de leur compte : une ligne par compte, ou une sans compte */
export async function listActiveExperts(resourceIds: unknown[]) {
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

export function countUnread(userId: number) {
    return prisma.expertNotification.count({ where: { expert_id: userId, is_read: 0 } });
}

/** Notifications non lues, avec la localisation actuelle de la demi-journée dans la planification */
export async function listUnread(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { resource_id: true } });
    if (!user) return [];
    const notifications = await prisma.expertNotification.findMany({
        where: { expert_id: userId, is_read: 0 },
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }]
    });
    const keyOf = (n: { date: string; period: string }) => `${n.date}_${n.period === 'Matin' ? 'AM' : 'PM'}`;
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

export async function markAllRead(userId: number) {
    await prisma.expertNotification.updateMany({ where: { expert_id: userId, is_read: 0 }, data: { is_read: 1 } });
}

/**
 * Notifications « Nouvelle affectation » des experts ; une notification non lue de la même demi-journée est remplacée
 * @param notifications [{ resourceId, date, period, activity, location }]
 * @param [exceptUserId] expert à ne pas notifier (auteur de la modification)
 */
export async function createBatch(notifications: any[], requesterName: string, exceptUserId: number | null = null) {
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
            if (exceptUserId !== null && user.id === exceptUserId) continue;
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

/**
 * Notifie les experts de leurs nouvelles affectations posées par un tiers (grille de planification, aide à
 * l'affectation) : une notification « Nouvelle affectation » par demi-journée dont l'activité est une affectation
 * (activités 3 à 8). Sans effet sur ses propres modifications. Les erreurs sont journalisées sans interrompre
 * l'enregistrement.
 */
export async function notifierAffectations(
    cells: Array<{ resourceId: number; dateKey: string; activity: unknown; location?: string | null }>,
    auteur: { userId: number; name: string }
) {
    try {
        const items = cells
            .filter(c => isLoggedActivity(c.activity) && /^\d{4}-\d{2}-\d{2}_(AM|PM)$/.test(c.dateKey))
            .map(c => {
                const [date, periode] = c.dateKey.split('_');
                return {
                    resourceId: c.resourceId,
                    date,
                    period: periode === 'AM' ? 'Matin' : 'Après-midi',
                    activity: LOGGED_ACTIVITIES[Number(c.activity) as keyof typeof LOGGED_ACTIVITIES],
                    location: c.location || '-'
                };
            });
        if (items.length) await createBatch(items, auteur.name, auteur.userId);
    } catch (err) {
        console.error('❌ Erreur notification des affectations:', err);
    }
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
function logTeams(name: string, email: string, target: string) {
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
 * @param type affectation | demande | astreinte | evenement
 */
async function sendTeams(
    type: string,
    data: any,
    { detailedRequest, fromAddress }: { detailedRequest: boolean; fromAddress: string }
): Promise<{ success: boolean; reason?: string }> {
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
export async function sendTeamsNotificationFromServer(type: string, data: any) {
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

export { logTeams };
