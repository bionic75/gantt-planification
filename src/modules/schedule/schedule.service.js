// @ts-check
// Accès aux données du planning.
// Une cellule est identifiée par la clé « <resourceId>_<type>_<AAAA-MM-JJ>_<AM|PM> » ;
// type : available (disponibilité), activity (affectation) ou localisation.
import { prisma } from '../../db/prisma.js';
import { idParam } from '../../db/values.js';

/** Libellés des activités journalisées dans action_logs */
const LOGGED_ACTIVITIES = {
    3: '🚨 SAMU (Déploiement)',
    4: '🚨 SAMU (Dev. usages)',
    5: 'ANS (Déploiement)',
    6: 'ANS (Dev. usages)',
    7: 'Qualification',
    8: 'Autre mission'
};
const isLoggedActivity = (/** @type {unknown} */ v) => Object.hasOwn(LOGGED_ACTIVITIES, String(v));

/**
 * Découpe une clé de cellule
 * @param {string} key
 */
export function parseKey(key) {
    const parts = key.split('_');
    return { resourceId: parts[0], type: parts[1], dateKey: parts.slice(2).join('_') };
}

/**
 * Cellule à enregistrer, ou null si la clé ou la valeur est inutilisable (refusée par la base auparavant)
 * @param {string} key
 * @param {unknown} value
 */
function toCell(key, value) {
    const { resourceId, type, dateKey } = parseKey(key);
    const resource_id = Number(resourceId);
    if (!Number.isSafeInteger(resource_id) || type === undefined || value === null || value === undefined) return null;
    return { resource_id, type, date_key: dateKey, value: String(value) };
}

/** Planning complet, sous forme { clé: valeur } */
export async function getSchedule() {
    const rows = await prisma.scheduleData.findMany({
        select: { resource_id: true, type: true, date_key: true, value: true },
        orderBy: { id: 'asc' }
    });
    /** @type {Record<string, string>} */
    const data = {};
    for (const row of rows) data[`${row.resource_id}_${row.type}_${row.date_key}`] = row.value;
    return data;
}

/**
 * Enregistre une cellule. notification = '1' signale une modification faite par un tiers à l'expert concerné.
 * Les erreurs sont journalisées sans interrompre l'enregistrement des autres cellules.
 * @param {string} key
 * @param {unknown} value
 * @param {boolean} notifyExpert
 */
export async function upsertCellWithNotification(key, value, notifyExpert) {
    const cell = toCell(key, value);
    if (!cell) return console.error('Erreur insert schedule: cellule invalide', key);
    const notification = notifyExpert ? '1' : '0';
    const { resource_id, date_key, type } = cell;
    await prisma.scheduleData
        .upsert({
            where: { resource_id_date_key_type: { resource_id, date_key, type } },
            update: { value: cell.value, notification },
            create: { ...cell, notification }
        })
        .catch(err => console.error('Erreur insert schedule:', err));
}

/**
 * Enregistrement groupé dans une transaction (les cellules invalides sont ignorées)
 * @param {Array<{ key: string, value: unknown }>} updates
 */
export async function saveCells(updates) {
    const cells = updates.map(({ key, value }) => toCell(key, value)).filter(c => c !== null);
    await prisma.$transaction(
        cells.map(cell =>
            prisma.scheduleData.upsert({
                where: {
                    resource_id_date_key_type: {
                        resource_id: cell.resource_id,
                        date_key: cell.date_key,
                        type: cell.type
                    }
                },
                update: { value: cell.value },
                create: cell
            })
        )
    );
}

/**
 * Journalise les affectations à une activité suivie (journal « planning_modification »).
 * Exécuté après la réponse : n'impacte pas le temps d'enregistrement.
 * @param {Array<{ key: string, value: unknown }>} updates
 * @param {number} userId
 * @param {string | undefined} profile
 */
export function logActivityChanges(updates, userId, profile) {
    const log = async (
        /** @type {number} */ resId,
        /** @type {string} */ dateKey,
        /** @type {unknown} */ activity,
        /** @type {unknown} */ location
    ) => {
        const resource = await prisma.resource.findUnique({
            where: { id: resId },
            select: { nom: true, prenom: true }
        });
        if (!resource) return;
        const [date, period] = dateKey.split('_');
        await prisma.actionLog.create({
            data: {
                user_id: userId,
                action_type: 'planning_modification',
                details: JSON.stringify({
                    resourceId: resId,
                    resourceName: `${resource.prenom} ${resource.nom}`,
                    date,
                    period: period === 'AM' ? 'Matin' : 'Après-midi',
                    activity:
                        LOGGED_ACTIVITIES[/** @type {keyof typeof LOGGED_ACTIVITIES} */ (Number(activity))] || activity,
                    location,
                    modifiedBy: profile
                })
            }
        });
    };
    const cellValue = (/** @type {number} */ resource_id, /** @type {string} */ date_key, /** @type {string} */ type) =>
        prisma.scheduleData.findUnique({
            where: { resource_id_date_key_type: { resource_id, date_key, type } },
            select: { value: true }
        });

    for (const { key, value } of updates) {
        const { resourceId, type, dateKey } = parseKey(key);
        const resId = parseInt(resourceId);
        if (!Number.isSafeInteger(resId)) continue;
        let task = null;
        if (type === 'activity' && isLoggedActivity(value)) {
            task = cellValue(resId, dateKey, 'localisation').then(loc => log(resId, dateKey, value, loc?.value || '-'));
        } else if (type === 'localisation') {
            task = cellValue(resId, dateKey, 'activity').then(act =>
                act && isLoggedActivity(act.value) ? log(resId, dateKey, act.value, value) : undefined
            );
        }
        task?.catch(err => console.error('❌ Erreur log planning:', err));
    }
}

/** Préfixe des clés d'un mois (month : 0 = janvier) */
const monthPrefix = (/** @type {unknown} */ year, /** @type {any} */ month) =>
    `${year}-${String(month + 1).padStart(2, '0')}-`;

/**
 * Données d'une ressource pour un mois, regroupées par demi-journée, sans les entrées incohérentes
 * @param {unknown} resourceId
 * @param {unknown} year
 * @param {unknown} month
 */
export async function previewMonth(resourceId, year, month) {
    const rows = await prisma.scheduleData.findMany({
        where: { resource_id: idParam(resourceId), date_key: { startsWith: monthPrefix(year, month) } },
        orderBy: [{ date_key: 'asc' }, { id: 'asc' }]
    });

    /** @type {Record<string, Record<string, string>>} */
    const grouped = {};
    for (const row of rows) {
        grouped[row.date_key] ??= {
            date_key: row.date_key,
            available: '-',
            activity: '-',
            localisation: '-',
            author: '-'
        };
        grouped[row.date_key][row.type] = row.value;
    }

    const isSet = (/** @type {string | undefined} */ v) => !!v && v !== '-';
    return Object.values(grouped)
        .filter(e => {
            // Disponibilité sans affectation (ou l'inverse) : données incomplètes
            if (isSet(e.available) !== isSet(e.activity)) return false;
            // « En attente d'affectation » sans localisation
            if (e.activity === '2' && !isSet(e.localisation)) return false;
            // Localisation seule
            return !(e.activity === '-' && e.available === '-');
        })
        .sort((a, b) => a.date_key.localeCompare(b.date_key));
}

/** Supprime toutes les données d'une ressource pour un mois ; renvoie le nombre de lignes supprimées */
export async function resetMonth(
    /** @type {unknown} */ resourceId,
    /** @type {unknown} */ year,
    /** @type {unknown} */ month
) {
    const prefix = monthPrefix(year, month);
    const { count } = await prisma.scheduleData.deleteMany({
        where: { resource_id: idParam(resourceId), date_key: { startsWith: prefix } }
    });
    return { deleted: count, pattern: `${prefix}%` };
}

/** Supprime les entrées de l'ancien format (clés sans demi-journée AM/PM) */
export async function deleteLegacyFormat() {
    const { count } = await prisma.scheduleData.deleteMany({
        where: { NOT: [{ date_key: { endsWith: 'AM' } }, { date_key: { endsWith: 'PM' } }] }
    });
    return count;
}
