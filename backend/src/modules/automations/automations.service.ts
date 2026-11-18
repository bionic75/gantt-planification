// Automatisations : configuration et journaux, rappel de saisie des disponibilités (n°1),
// sauvegarde du planning par email (n°2), diagnostic et nettoyage des clés de planification
import { prisma } from '../../db/prisma.ts';
import { idParam, sqlTimestamp } from '../../db/values.ts';
import { csvCell } from '../../lib/csv.ts';
import { badRequest, notFound } from '../../lib/http-error.ts';
import { getJsonSetting, setSetting } from '../../services/settings.ts';

export const MONTH_NAMES = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];
const pad = (n: unknown) => String(n).padStart(2, '0');

// ---------- Configuration et journaux ----------

export async function getConfig(id: string) {
    return (await getJsonSetting(`automation_${id}_config`)) || {};
}

export async function saveConfig(id: string, config: unknown) {
    if (config === undefined) throw badRequest('Configuration requise');
    await setSetting(`automation_${id}_config`, JSON.stringify(config));
}

/** 100 derniers envois d'une automatisation */
export async function listLogs(automationId: unknown) {
    const rows = await prisma.automationLog.findMany({
        where: { automation_id: idParam(automationId) },
        select: {
            id: true,
            automation_id: true,
            expert_id: true,
            expert_name: true,
            expert_email: true,
            target_month: true,
            sent_at: true,
            recipients_list: true,
            filename: true
        },
        orderBy: [{ sent_at: 'desc' }, { id: 'desc' }],
        take: 100
    });
    return rows.map(row => ({
        ...row,
        file_id: row.id,
        recipients_count: row.recipients_list ? JSON.parse(row.recipients_list).length : 0
    }));
}

/** Fichier joint à un envoi de la sauvegarde (n°2) */
export async function getBackupFile(logId: unknown) {
    const row = await prisma.automationLog.findFirst({
        where: { id: idParam(logId), automation_id: 2 },
        select: { filename: true, file_content: true }
    });
    if (!row || !row.file_content) throw notFound('Fichier non trouvé');
    return { filename: row.filename || 'Expert_Planning_Sauvegarde.csv', content: row.file_content };
}

export async function deleteLogs(automationId: unknown) {
    await prisma.automationLog.deleteMany({ where: { automation_id: idParam(automationId) } });
}

/** @param data */
export function addLog(data: {
    automation_id: number;
    expert_id?: number | null;
    expert_name?: string;
    expert_email?: string;
    target_month?: string;
    recipients_list?: string;
    file_content?: string;
    filename?: string;
}) {
    return prisma.automationLog.create({ data: { ...data, sent_at: sqlTimestamp() } });
}

// ---------- N°1 : rappel de saisie des disponibilités ----------

/** Mois suivant (cible du rappel) */
export function nextMonthTarget(now: Date = new Date()) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const year = next.getFullYear();
    const month = next.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
        year,
        month,
        label: `${MONTH_NAMES[month]} ${year}`,
        first: `${year}-${pad(month + 1)}-01`,
        last: `${year}-${pad(month + 1)}-${pad(lastDay)}`
    };
}

/**
 * Experts actifs (compte et ressource) dont la mise à disposition couvre le mois cible
 * et qui n'y ont saisi aucune disponibilité
 */
export async function expertsWithoutAvailability(target: ReturnType<typeof nextMonthTarget>) {
    const users = await prisma.user.findMany({
        where: { is_expert: 1, actif: 1, email: { not: '' }, resource_id: { not: null } },
        select: { id: true, nom: true, prenom: true, email: true, resource_id: true },
        orderBy: { id: 'asc' }
    });
    const resources = await prisma.resource.findMany({
        where: {
            id: { in: users.map(u => u.resource_id as number) },
            actif: 1,
            AND: [
                { OR: [{ date_debut: null }, { date_debut: { lte: target.last } }] },
                { OR: [{ date_fin: null }, { date_fin: { gte: target.first } }] }
            ]
        },
        select: { id: true }
    });
    const covered = new Set(resources.map(r => r.id));
    const experts = users.filter(u => covered.has(u.resource_id as number));
    const available = await prisma.scheduleData.findMany({
        where: {
            resource_id: { in: [...covered] },
            date_key: { startsWith: `${target.year}-${pad(target.month + 1)}-` },
            type: 'available',
            value: '2'
        },
        select: { resource_id: true },
        distinct: ['resource_id']
    });
    const withAvailability = new Set(available.map(a => a.resource_id));
    console.log(`🔍 ${experts.length} expert(s) actif(s) avec MAD couvrant ${target.label}`);
    return experts.filter(e => !withAvailability.has(e.resource_id as number));
}

/** Rappel déjà envoyé ce mois-ci à l'expert pour le mois cible ? */
export async function reminderAlreadySent(expertId: number, targetMonth: string, now: Date) {
    const startOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const n = await prisma.automationLog.count({
        where: { automation_id: 1, expert_id: expertId, target_month: targetMonth, sent_at: { gte: startOfMonth } }
    });
    return n > 0;
}

/** Email de l'utilisateur en copie des rappels (configuration n°1) */
export async function reminderCopyEmail(config: any) {
    if (!config?.copyUserId) return null;
    const user = await prisma.user.findUnique({ where: { id: idParam(config.copyUserId) }, select: { email: true } });
    return user ? user.email : null;
}

// ---------- N°2 : sauvegarde du planning ----------

const ACTIVE_WITH_EMAIL = { actif: 1, email: { not: '' } };
const GROUPS = [
    ['groupAdmin', { is_admin: 1 }, 'Admin'],
    ['groupUser', { is_user: 1 }, 'Utilisateur'],
    ['groupExpert', { is_expert: 1 }, 'Expert']
] as const;

/**
 * Destinataires : groupes (comptes actifs avec email) et comptes choisis, chacun une seule fois
 * @param options { groupAdmin, groupUser, groupExpert, recipients }
 */
export async function resolveRecipients(
    options: any
): Promise<{ emails: string[]; people: Array<{ name: string; kind: string }> }> {
    const seen = new Set();
    const emails: string[] = [];
    const people: Array<{ name: string; kind: string }> = [];
    const add = (users: Array<{ id: number; nom: string; prenom: string; email: string }>, kind: string) => {
        for (const u of users) {
            if (seen.has(u.id)) continue;
            seen.add(u.id);
            if (!emails.includes(u.email)) emails.push(u.email);
            people.push({ name: `${u.prenom} ${u.nom}`, kind });
        }
    };
    const select = { id: true, nom: true, prenom: true, email: true };
    for (const [flag, where, kind] of GROUPS) {
        if (!options[flag]) continue;
        add(
            await prisma.user.findMany({ where: { ...where, ...ACTIVE_WITH_EMAIL }, select, orderBy: { id: 'asc' } }),
            kind
        );
    }
    if (Array.isArray(options.recipients) && options.recipients.length > 0) {
        const ids = options.recipients.map(idParam);
        add(
            await prisma.user.findMany({
                where: { id: { in: ids }, email: { not: '' } },
                select,
                orderBy: { id: 'asc' }
            }),
            'Individuel'
        );
    }
    return { emails, people };
}

/** Ressources incluses : toutes, ou celles choisies */
export function resourcesFor(all: boolean, list: unknown) {
    const orderBy = [{ nom: 'asc' as const }, { prenom: 'asc' as const }, { id: 'asc' as const }];
    if (all) return prisma.resource.findMany({ orderBy });
    if (Array.isArray(list) && list.length > 0) {
        return prisma.resource.findMany({ where: { id: { in: list.map(idParam) } }, orderBy });
    }
    return Promise.resolve([]);
}

/** Mois « AAAA-MM » (ou ancien format « AAAA-M- ») → { year, month 1-12 } ; null si invalide */
export function parseMonth(monthStr: string) {
    const parts = String(monthStr).replace(/-$/, '').split('-');
    if (parts.length < 2) return null;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
    return { year, month, yearText: parts[0] };
}

/** Clés de planification renseignées (disponibilité ou activité différente de 1) */
const NOT_EMPTY = {
    OR: [
        { type: 'available', value: { not: '1' } },
        { type: 'activity', value: { not: '1' } }
    ]
};

/** Mois (7 premiers caractères des clés) contenant des données non vides */
async function rawMonthsWithData() {
    const keys = await prisma.scheduleData.findMany({
        where: NOT_EMPTY,
        select: { date_key: true },
        distinct: ['date_key']
    });
    return [...new Set(keys.map(k => k.date_key.slice(0, 7)))];
}

/** Mois normalisés contenant des données, dans l'ordre chronologique */
export async function availableMonths() {
    const months = [
        ...new Set(
            (await rawMonthsWithData())
                .map(parseMonth)
                .filter(m => m !== null)
                .map(m => `${m.year}-${pad(m.month)}`)
        )
    ].sort();
    return months.map(value => {
        const [year, month] = value.split('-');
        return { value, label: `${MONTH_NAMES[parseInt(month) - 1]} ${year}` };
    });
}

/** Mois normalisés distincts contenant des données (sans tri) */
export async function monthsWithDataCount() {
    return new Set(
        (await rawMonthsWithData())
            .map(parseMonth)
            .filter(m => m !== null)
            .map(m => `${m.year}-${pad(m.month)}`)
    ).size;
}

/** Mois tels que saisis par la tâche planifiée : liste brute (« AAAA-MM » ou ancien format) */
export async function rawMonthsList() {
    return (await rawMonthsWithData()).filter(m => m && m.length >= 7);
}

/** Cellules des mois choisis (clés « AAAA-MM-… » et anciennes clés « AAAA-M-… »), ou toutes */
export function scheduleForMonths(months: Array<{ year: number; month: number }> | null) {
    const prefixes = months
        ? months.flatMap(m => {
              const withZero = `${m.year}-${pad(m.month)}-`;
              const withoutZero = `${m.year}-${m.month}-`;
              return withZero === withoutZero ? [withZero] : [withZero, withoutZero];
          })
        : null;
    return prisma.scheduleData.findMany({
        where: prefixes ? { OR: prefixes.map(p => ({ date_key: { startsWith: p } })) } : {},
        orderBy: [{ resource_id: 'asc' }, { date_key: 'asc' }, { id: 'asc' }]
    });
}

/** Cellules par ressource puis par clé : { resourceId: { dateKey: { type: valeur } } } */
export function byResource(rows: Array<{ resource_id: number; date_key: string; type: string; value: string }>) {
    const out: Record<number, Record<string, Record<string, string>>> = {};
    for (const r of rows) ((out[r.resource_id] ??= {})[r.date_key] ??= {})[r.type] = r.value;
    return out;
}

const AVAIL_LABELS = { 1: 'Indisponible', 2: 'Disponible', 3: 'Congés' } as Record<string, string>;
const ACT_LABELS = {
    1: 'Indisponible',
    2: 'En attente',
    3: 'SAMU Déploiement',
    4: 'SAMU Dev',
    5: 'ANS Déploiement',
    6: 'ANS Dev',
    7: 'Qualification',
    8: 'Divers'
} as Record<string, string>;
export const CSV_HEADER = '﻿Expert,Date,Période,Disponibilité,Affectation,Localisation\n';

/** Ligne CSV d'une demi-journée ; null si elle est vide et à exclure */
export function csvLine(
    resource: { prenom: string; nom: string },
    date: string,
    period: string,
    data: Record<string, string>,
    excludeEmpty: boolean
) {
    const avail = data.available || '1';
    const act = data.activity || '1';
    if (excludeEmpty && avail === '1' && act === '1') return null;
    const loc = data.localisation || '-';
    const cells = [
        `${resource.prenom} ${resource.nom}`,
        date,
        period,
        AVAIL_LABELS[avail] || avail,
        ACT_LABELS[act] || act,
        loc
    ];
    return `${cells.map(csvCell).join(',')}\n`;
}

/** Horodatage du nom de fichier de sauvegarde (AAAA-MM-JJ_HH-MM) */
export const fileTimestamp = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;

/** Noms des destinataires (journal) : groupes choisis et comptes individuels */
export async function recipientLogNames(config: any) {
    const names = [];
    if (config.groupAdmin) names.push('Groupe Administrateurs');
    if (config.groupUser) names.push('Groupe Utilisateurs');
    if (config.groupExpert) names.push('Groupe Experts');
    if (Array.isArray(config.recipients) && config.recipients.length > 0) {
        const users = await prisma.user.findMany({
            where: { id: { in: config.recipients.map(idParam) } },
            select: { nom: true, prenom: true },
            orderBy: { id: 'asc' }
        });
        names.push(...users.map(u => `${u.prenom} ${u.nom}`));
    }
    return names;
}

// ---------- Diagnostic et nettoyage des clés de planification ----------

/** Statistiques par mois (7 premiers caractères de la clé), exemples et clés mal formées */
export async function diagnoseMonths() {
    const rows = await prisma.scheduleData.findMany({ orderBy: { id: 'asc' } });
    const months: Map<
        string,
        { total: number; available: number; activity: number; values: Set<string>; samples: string[] }
    > = new Map();
    for (const r of rows) {
        const key = r.date_key.slice(0, 7);
        const m = months.get(key) || { total: 0, available: 0, activity: 0, values: new Set(), samples: [] };
        m.total++;
        const notEmpty = r.value !== '1' && (r.type === 'available' || r.type === 'activity');
        if (notEmpty && r.type === 'available') m.available++;
        if (notEmpty && r.type === 'activity') m.activity++;
        m.values.add(`${r.type}=${r.value}`);
        if (notEmpty && m.samples.length < 5)
            m.samples.push(`${r.date_key}: ${r.type}=${r.value} (res:${r.resource_id})`);
        months.set(key, m);
    }
    const result = [...months.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([raw, m]) => {
            const parsed = parseMonth(raw);
            return {
                raw,
                label: parsed ? `${MONTH_NAMES[parsed.month - 1]} ${parsed.yearText}` : raw,
                totalRows: m.total,
                availableNot1: m.available,
                activityNot1: m.activity,
                uniqueValues: [...m.values].join(','),
                samples: m.samples.join(', ')
            };
        });
    // Clés ne commençant pas par « ????-??-?? »
    const seen = new Set();
    const orphanData = [];
    for (const r of rows) {
        if (/^.{4}-.{2}-.{2}/.test(r.date_key)) continue;
        const k = JSON.stringify([r.date_key, r.type, r.value]);
        if (seen.has(k)) continue;
        seen.add(k);
        orphanData.push({ date_key: r.date_key, type: r.type, value: r.value });
        if (orphanData.length >= 20) break;
    }
    return { months: result, orphanData };
}

/** Clé normalisée (« AAAA-MM-JJ_AM ») d'une ancienne clé sans zéros ; null si non reconnue */
function normalizedKey(oldKey: string) {
    const match = oldKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:_([AP]M))?$/);
    if (!match) return null;
    const [, year, month, day, period] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}_${period || 'AM'}`;
}

/** Clés au mois sur un chiffre (« AAAA-M-… ») */
const isShortMonthKey = (k: string) => /^[0-9]{4}-[0-9]-/.test(k);

/** Aperçu du nettoyage : clés au mois 0 à supprimer, clés à normaliser (avec conflits) */
export async function cleanupPreview() {
    const toDelete = await prisma.scheduleData.findMany({
        where: { date_key: { contains: '-0-' } },
        select: { date_key: true, type: true, value: true, resource_id: true },
        orderBy: [{ date_key: 'asc' }, { id: 'asc' }]
    });
    const counts = await prisma.scheduleData.groupBy({ by: ['date_key'], _count: { _all: true } });
    const countOf = new Map(counts.map(c => [c.date_key, c._count._all]));
    const badDates = counts
        .filter(c => isShortMonthKey(c.date_key) && !c.date_key.includes('-0-'))
        .sort((a, b) => (a.date_key < b.date_key ? -1 : 1));
    const toNormalize = [];
    let conflictCount = 0;
    for (const row of badDates) {
        const newKey = normalizedKey(row.date_key);
        if (!newKey) continue;
        const existingCount = countOf.get(newKey) || 0;
        const hasConflict = existingCount > 0;
        if (hasConflict) conflictCount++;
        toNormalize.push({ oldKey: row.date_key, newKey, rowCount: row._count._all, hasConflict, existingCount });
    }
    return { toDelete, toNormalize, conflictCount };
}

/** Nettoyage : suppression des clés au mois 0, normalisation (ou suppression si la clé normalisée existe) */
export async function cleanupExecute() {
    const { count: deleted } = await prisma.scheduleData.deleteMany({ where: { date_key: { contains: '-0-' } } });
    console.log(`🗑️ Supprimé ${deleted} lignes avec mois=0`);
    const keys = await prisma.scheduleData.findMany({ select: { date_key: true }, distinct: ['date_key'] });
    let normalized = 0;
    let duplicatesRemoved = 0;
    for (const { date_key: oldKey } of keys.filter(k => isShortMonthKey(k.date_key))) {
        const newKey = normalizedKey(oldKey);
        if (!newKey) continue;
        if ((await prisma.scheduleData.count({ where: { date_key: newKey } })) === 0) {
            await prisma.scheduleData.updateMany({ where: { date_key: oldKey }, data: { date_key: newKey } });
            normalized++;
            console.log(`✏️ Renommé: ${oldKey} → ${newKey}`);
        } else {
            const { count } = await prisma.scheduleData.deleteMany({ where: { date_key: oldKey } });
            duplicatesRemoved += count;
            console.log(`🗑️ Doublon supprimé: ${oldKey} (${count} lignes)`);
        }
    }
    return { deleted, normalized, duplicatesRemoved };
}
