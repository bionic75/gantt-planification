// @ts-check
// Accès aux données du planning.
// Une cellule est identifiée par la clé « <resourceId>_<type>_<AAAA-MM-JJ>_<AM|PM> » ;
// type : available (disponibilité), activity (affectation) ou localisation.
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';

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

/** Planning complet, sous forme { clé: valeur } */
export async function getSchedule() {
    const rows = await dbAll('SELECT * FROM schedule_data');
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
    const { resourceId, type, dateKey } = parseKey(key);
    const notification = notifyExpert ? '1' : '0';
    await dbRun(
        `INSERT INTO schedule_data (resource_id, date_key, type, value, notification)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resource_id, date_key, type)
         DO UPDATE SET value = excluded.value, notification = ?`,
        [resourceId, dateKey, type, value, notification, notification]
    ).catch(err => console.error('Erreur insert schedule:', err));
}

/**
 * Enregistrement groupé dans une transaction
 * @param {Array<{ key: string, value: unknown }>} updates
 * @returns {Promise<void>}
 */
export function saveCells(updates) {
    return new Promise((resolve, reject) => {
        database.serialize(() => {
            database.run('BEGIN TRANSACTION');
            for (const { key, value } of updates) {
                const { resourceId, type, dateKey } = parseKey(key);
                database.run(
                    `INSERT INTO schedule_data (resource_id, date_key, type, value)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(resource_id, date_key, type)
                     DO UPDATE SET value = excluded.value`,
                    [resourceId, dateKey, type, value],
                    () => {}
                );
            }
            database.run('COMMIT', err => (err ? reject(err) : resolve()));
        });
    });
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
        const resource = await dbGet('SELECT nom, prenom FROM resources WHERE id = ?', [resId]);
        if (!resource) return;
        const [date, period] = dateKey.split('_');
        await dbRun('INSERT INTO action_logs (user_id, action_type, details) VALUES (?, ?, ?)', [
            userId,
            'planning_modification',
            JSON.stringify({
                resourceId: resId,
                resourceName: `${resource.prenom} ${resource.nom}`,
                date,
                period: period === 'AM' ? 'Matin' : 'Après-midi',
                activity:
                    LOGGED_ACTIVITIES[/** @type {keyof typeof LOGGED_ACTIVITIES} */ (Number(activity))] || activity,
                location,
                modifiedBy: profile
            })
        ]);
    };
    const cellValue = (/** @type {number} */ resId, /** @type {string} */ dateKey, /** @type {string} */ type) =>
        dbGet('SELECT value FROM schedule_data WHERE resource_id = ? AND date_key = ? AND type = ?', [
            resId,
            dateKey,
            type
        ]);

    for (const { key, value } of updates) {
        const { resourceId, type, dateKey } = parseKey(key);
        const resId = parseInt(resourceId);
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

/** Motif LIKE des clés d'un mois (month : 0 = janvier) */
const monthPattern = (/** @type {unknown} */ year, /** @type {any} */ month) =>
    `${year}-${String(month + 1).padStart(2, '0')}-%`;

/**
 * Données d'une ressource pour un mois, regroupées par demi-journée, sans les entrées incohérentes
 * @param {unknown} resourceId
 * @param {unknown} year
 * @param {unknown} month
 */
export async function previewMonth(resourceId, year, month) {
    const rows = await dbAll(
        'SELECT * FROM schedule_data WHERE resource_id = ? AND date_key LIKE ? ORDER BY date_key',
        [resourceId, monthPattern(year, month)]
    );

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
    const pattern = monthPattern(year, month);
    const { changes } = await dbRun('DELETE FROM schedule_data WHERE resource_id = ? AND date_key LIKE ?', [
        resourceId,
        pattern
    ]);
    return { deleted: changes, pattern };
}

/** Supprime les entrées de l'ancien format (clés sans demi-journée AM/PM) */
export async function deleteLegacyFormat() {
    const { changes } = await dbRun(
        `DELETE FROM schedule_data WHERE date_key NOT LIKE '%_AM' AND date_key NOT LIKE '%_PM'`
    );
    return changes;
}
