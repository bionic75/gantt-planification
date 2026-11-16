// Accès aux données du planning.
// Une cellule est identifiée par la clé « <resourceId>_<type>_<AAAA-MM-JJ>_<AM|PM> » ;
// type : available (disponibilité), activity (affectation) ou localisation.
import { prisma } from '../../db/prisma.ts';
import { idParam } from '../../db/values.ts';

/** Libellés des activités journalisées dans action_logs */
export const LOGGED_ACTIVITIES = {
    3: '🚨 SAMU (Déploiement)',
    4: '🚨 SAMU (Dev. usages)',
    5: 'ANS (Déploiement)',
    6: 'ANS (Dev. usages)',
    7: 'Qualification',
    8: 'Autre mission'
};
export const isLoggedActivity = (v: unknown) => Object.hasOwn(LOGGED_ACTIVITIES, String(v));

/**
 * Découpe une clé de cellule
 */
export function parseKey(key: string) {
    const parts = key.split('_');
    return { resourceId: parts[0], type: parts[1], dateKey: parts.slice(2).join('_') };
}

/**
 * Cellule à enregistrer, ou null si la clé ou la valeur est inutilisable (refusée par la base auparavant)
 */
function toCell(key: string, value: unknown) {
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
    const data: Record<string, string> = {};
    for (const row of rows) data[`${row.resource_id}_${row.type}_${row.date_key}`] = row.value;
    return data;
}

/**
 * Enregistre une cellule. notification = '1' signale une modification faite par un tiers à l'expert concerné.
 * Les erreurs sont journalisées sans interrompre l'enregistrement des autres cellules.
 */
export async function upsertCellWithNotification(key: string, value: unknown, notifyExpert: boolean) {
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
 * Cellules dont la valeur diffère de celle enregistrée (ou nouvelles) ; cellules invalides écartées.
 * Le navigateur envoie le planning complet à chaque enregistrement : seules ces cellules sont à écrire et à journaliser.
 */
export async function changedCells(updates: Array<{ key: string; value: unknown }>) {
    const valid = updates.filter(({ key, value }) => toCell(key, value) !== null);
    const resourceIds = [...new Set(valid.map(({ key }) => Number(parseKey(key).resourceId)))];
    const stored: Map<string, string> = new Map();
    for (const ids of chunks(resourceIds)) {
        const rows = await prisma.scheduleData.findMany({
            where: { resource_id: { in: ids } },
            select: { resource_id: true, type: true, date_key: true, value: true }
        });
        for (const r of rows) stored.set(`${r.resource_id}_${r.type}_${r.date_key}`, r.value);
    }
    return valid.filter(({ key, value }) => {
        const cell = toCell(key, value) as NonNullable<ReturnType<typeof toCell>>;
        return stored.get(`${cell.resource_id}_${cell.type}_${cell.date_key}`) !== cell.value;
    });
}

/**
 * Enregistrement groupé dans une transaction (les cellules invalides sont ignorées)
 */
export async function saveCells(updates: Array<{ key: string; value: unknown }>) {
    const cells = updates.map(({ key, value }) => toCell(key, value)).filter(c => c !== null);
    if (cells.length === 0) return;
    // Transaction interactive, cellules écrites une à une : durée proportionnelle au nombre de cellules et mémoire
    // bornée. (Un tableau de requêtes passé à $transaction coûte un temps quadratique : 60 000 cellules prenaient
    // plusieurs minutes et pouvaient épuiser la mémoire du serveur.)
    await prisma.$transaction(
        async tx => {
            for (const cell of cells) {
                await tx.scheduleData.upsert({
                    where: {
                        resource_id_date_key_type: {
                            resource_id: cell.resource_id,
                            date_key: cell.date_key,
                            type: cell.type
                        }
                    },
                    update: { value: cell.value },
                    create: cell
                });
            }
        },
        // Délais par défaut (5 s) insuffisants pour un planning entier (environ 20 s pour 150 000 cellules)
        { maxWait: 30000, timeout: 10 * 60 * 1000 }
    );
}

/**
 * Supprime des cellules (clés invalides ignorées) : cellule vidée dans la grille (localisation effacée…)
 * @returns cellules supprimées
 */
export async function deleteCells(keys: string[]): Promise<number> {
    const cells = keys
        .map(key => toCell(key, ''))
        .filter(c => c !== null)
        .map(({ resource_id, type, date_key }) => ({ resource_id, type, date_key }));
    if (cells.length === 0) return 0;
    let deleted = 0;
    await prisma.$transaction(async tx => {
        for (const where of cells) deleted += (await tx.scheduleData.deleteMany({ where })).count;
    });
    return deleted;
}

/**
 * Journalise les affectations à une activité suivie (journal « planning_modification »).
 * Exécuté après la réponse : n'impacte pas le temps d'enregistrement.
 */
export function logActivityChanges(
    updates: Array<{ key: string; value: unknown }>,
    userId: number,
    profile: string | undefined
) {
    writeActivityLogs(updates, userId, profile).catch(err => console.error('❌ Erreur log planning:', err));
}

/**
 * Localisations enregistrées des demi-journées désignées par des clés de cellule
 * @returns « <ressource>_<AAAA-MM-JJ>_<AM|PM> » → localisation
 */
export async function localisationsDe(keys: string[]): Promise<Map<string, string>> {
    const parsed = keys.map(parseKey).filter(k => Number.isSafeInteger(Number(k.resourceId)));
    const lieux: Map<string, string> = new Map();
    for (const lot of chunks([...new Set(parsed.map(k => Number(k.resourceId)))])) {
        const rows = await prisma.scheduleData.findMany({
            where: { resource_id: { in: lot }, type: 'localisation' },
            select: { resource_id: true, date_key: true, value: true }
        });
        for (const r of rows) lieux.set(`${r.resource_id}_${r.date_key}`, r.value);
    }
    return lieux;
}

/** Lignes envoyées par requête (limite du nombre de paramètres SQL, SQLite notamment) */
const CHUNK = 500;
const chunks = (list: any[]) =>
    Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Une seule lecture des cellules et ressources concernées, puis écriture groupée du journal. Le planning complet
 * est envoyé à chaque enregistrement : une requête par cellule dépasserait la limite de paramètres de la base
 * (Prisma regroupe les findUnique simultanés en une seule requête).
 */
async function writeActivityLogs(
    updates: Array<{ key: string; value: unknown }>,
    userId: number,
    profile: string | undefined
) {
    const candidates: Array<{ resId: number; dateKey: string; type: string; value: unknown }> = [];
    for (const { key, value } of updates) {
        const { resourceId, type, dateKey } = parseKey(key);
        const resId = parseInt(resourceId);
        if (!Number.isSafeInteger(resId)) continue;
        if ((type === 'activity' && isLoggedActivity(value)) || type === 'localisation') {
            candidates.push({ resId, dateKey, type, value });
        }
    }
    if (candidates.length === 0) return;

    // Cellule associée (localisation d'une affectation, affectation d'une localisation) et nom des ressources
    const resourceIds = [...new Set(candidates.map(c => c.resId))];
    const cells: Map<string, string> = new Map();
    const resources: Map<number, { nom: string; prenom: string }> = new Map();
    for (const ids of chunks(resourceIds)) {
        const rows = await prisma.scheduleData.findMany({
            where: { resource_id: { in: ids }, type: { in: ['activity', 'localisation'] } },
            select: { resource_id: true, date_key: true, type: true, value: true }
        });
        for (const r of rows) cells.set(`${r.resource_id}_${r.type}_${r.date_key}`, r.value);
        const res = await prisma.resource.findMany({
            where: { id: { in: ids } },
            select: { id: true, nom: true, prenom: true }
        });
        for (const r of res) resources.set(r.id, r);
    }

    const entries = [];
    for (const { resId, dateKey, type, value } of candidates) {
        let activity;
        let location;
        if (type === 'activity') {
            activity = value;
            location = cells.get(`${resId}_localisation_${dateKey}`) || '-';
        } else {
            activity = cells.get(`${resId}_activity_${dateKey}`);
            if (activity === undefined || !isLoggedActivity(activity)) continue;
            location = value;
        }
        const resource = resources.get(resId);
        if (!resource) continue;
        const [date, period] = dateKey.split('_');
        entries.push({
            user_id: userId,
            action_type: 'planning_modification',
            details: JSON.stringify({
                resourceId: resId,
                resourceName: `${resource.prenom} ${resource.nom}`,
                date,
                period: period === 'AM' ? 'Matin' : 'Après-midi',
                activity: LOGGED_ACTIVITIES[Number(activity) as keyof typeof LOGGED_ACTIVITIES] || activity,
                location,
                modifiedBy: profile
            })
        });
    }
    for (const data of chunks(entries)) await prisma.actionLog.createMany({ data });
}

/** Préfixe des clés d'un mois (month : 0 = janvier) */
const monthPrefix = (year: unknown, month: any) => `${year}-${String(month + 1).padStart(2, '0')}-`;

/**
 * Données d'une ressource pour un mois, regroupées par demi-journée, sans les entrées incohérentes
 */
export async function previewMonth(resourceId: unknown, year: unknown, month: unknown) {
    const rows = await prisma.scheduleData.findMany({
        where: { resource_id: idParam(resourceId), date_key: { startsWith: monthPrefix(year, month) } },
        orderBy: [{ date_key: 'asc' }, { id: 'asc' }]
    });

    const grouped: Record<string, Record<string, string>> = {};
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

    const isSet = (v: string | undefined) => !!v && v !== '-';
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
export async function resetMonth(resourceId: unknown, year: unknown, month: unknown) {
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
