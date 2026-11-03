// @ts-check
// Événements : recherche de doublons (certains ou probables) et fusion (on ne conserve qu'une occurrence)
import { prisma } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/http-error.js';
import { getJsonSetting, setSetting } from '../../services/settings.js';

/** Liens explicites déploiement / activité / événement de l'Aide à l'affectation (voir affectation.service.js) */
const AFF_EVLINK_KEY = 'aff_event_links';

/** Minuscules sans accents ni ponctuation, espaces réduits */
export const normalizeLabel = (/** @type {string | null | undefined} */ s) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const bigrams = (/** @type {string} */ s) => {
    const t = s.replace(/ /g, '');
    /** @type {Map<string, number>} */
    const m = new Map();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) || 0) + 1);
    return m;
};

/** Ressemblance de deux libellés normalisés, de 0 à 1 (coefficient de Dice sur les bigrammes ; inclusion = 1) */
export function labelSimilarity(/** @type {string} */ a, /** @type {string} */ b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const short = a.length <= b.length ? a : b;
    const long = a.length <= b.length ? b : a;
    if (short.length >= 5 && long.includes(short)) return 1;
    // Tous les mots du libellé le plus court figurent dans l'autre (au moins deux mots) : libellés voisins
    const tokens = (/** @type {string} */ s) => new Set(s.split(' ').filter(Boolean));
    const ta = tokens(short);
    const tb = tokens(long);
    const included = ta.size >= 2 && [...ta].every(w => tb.has(w));
    const x = bigrams(a);
    const y = bigrams(b);
    let common = 0;
    for (const [k, n] of x) common += Math.min(n, y.get(k) || 0);
    const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
    const dice = total ? (2 * common) / total : 0;
    return included ? Math.max(dice, 0.9) : dice;
}

const SIMILAR = 0.8;
/** Libellés « voisins » : suffisant quand le type et le lieu sont identiques et que les dates se recoupent */
const NEIGHBOUR = 0.6;

/**
 * Niveau de ressemblance de deux événements : « certain » (même type, même lieu, mêmes dates et période, même libellé),
 * « probable » (même lieu et dates qui se recoupent, avec un libellé très proche ou voisin à type identique, ou même type et
 * mêmes dates), sinon null
 * @param {{ type_id: number | null, location_id: number | null, start_date: string, end_date: string, period: string | null, norm: string }} a
 * @param {typeof a} b
 * @returns {{ niveau: 'certain' | 'probable', raison: string } | null}
 */
export function compareEvents(a, b) {
    if ((a.location_id ?? null) !== (b.location_id ?? null)) return null;
    const sameDates = a.start_date === b.start_date && a.end_date === b.end_date;
    const overlap = a.start_date <= b.end_date && b.start_date <= a.end_date;
    if (!overlap) return null;
    const samePeriod = (a.period || 'FULL') === (b.period || 'FULL');
    const sameType = (a.type_id ?? null) === (b.type_id ?? null);
    const sim = labelSimilarity(a.norm, b.norm);
    if (sameType && sameDates && samePeriod && a.norm === b.norm)
        return { niveau: 'certain', raison: 'même type, même lieu, mêmes dates, même libellé' };
    // Sans lieu, seuls les libellés identiques comptent (deux événements « à distance » sans rapport sont fréquents)
    if (a.location_id == null && a.norm !== b.norm) return null;
    if (sameType && sameDates && samePeriod && sim >= SIMILAR)
        return { niveau: 'probable', raison: 'même type, même lieu, mêmes dates, libellés proches' };
    if (sameType && sameDates && samePeriod)
        return { niveau: 'probable', raison: 'même type, même lieu, mêmes dates (libellés différents)' };
    if (sim >= SIMILAR && (sameType || sim === 1))
        return { niveau: 'probable', raison: 'même lieu, dates qui se recoupent, libellés proches' };
    if (sameType && sim >= NEIGHBOUR)
        return { niveau: 'probable', raison: 'même type, même lieu, dates qui se recoupent, libellés voisins' };
    return null;
}

/**
 * Groupes de doublons : { id, niveau: 'certain' | 'probable', raison, events: [...] }. Un groupe est « certain » quand tous
 * ses événements sont reliés par des ressemblances certaines.
 */
export async function findDuplicateGroups() {
    const events = await prisma.customEvent.findMany({ orderBy: [{ start_date: 'asc' }, { id: 'asc' }] });
    const ids = events.map(e => e.id);
    const [types, locations, users, parts, externals] = await Promise.all([
        prisma.eventType.findMany({ select: { id: true, label_long: true, label_short: true, icon: true } }),
        prisma.location.findMany({ select: { id: true, libelle_court: true } }),
        prisma.user.findMany({ select: { id: true, nom: true, prenom: true } }),
        prisma.customEventParticipant.findMany({
            where: { event_id: { in: ids } },
            select: { event_id: true, user_id: true }
        }),
        prisma.customEventExternalParticipant.findMany({
            where: { event_id: { in: ids } },
            select: { event_id: true, nom: true, prenom: true }
        })
    ]);
    const typeById = new Map(types.map(t => [t.id, t]));
    const locById = new Map(locations.map(l => [l.id, l.libelle_court]));
    const userById = new Map(users.map(u => [u.id, `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim()]));
    const rows = events.map(e => ({
        ...e,
        end_date: e.end_date || e.start_date,
        norm: normalizeLabel(e.label)
    }));
    // Comparaison deux à deux dans chaque lieu (les dates triées permettent de s'arrêter tôt)
    /** @type {Map<number, number>} */
    const parent = new Map();
    const find = (/** @type {number} */ x) => {
        while ((parent.get(x) ?? x) !== x) x = /** @type {number} */ (parent.get(x));
        return x;
    };
    const union = (/** @type {number} */ a, /** @type {number} */ b) => parent.set(find(a), find(b));
    /** @type {Map<number, number>} */
    const certainParent = new Map();
    const cfind = (/** @type {number} */ x) => {
        while ((certainParent.get(x) ?? x) !== x) x = /** @type {number} */ (certainParent.get(x));
        return x;
    };
    /** @type {Map<number, string>} */
    const raisons = new Map();
    /** @type {Map<string, typeof rows>} */
    const byLoc = new Map();
    for (const r of rows) {
        const k = String(r.location_id ?? 'none');
        byLoc.set(k, [...(byLoc.get(k) || []), r]);
    }
    /** Événements reliés à au moins un autre */
    const linked = new Set();
    for (const list of byLoc.values()) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i];
                const b = list[j];
                if (b.start_date > a.end_date) break; // triés par début : plus aucun recoupement possible pour a
                const c = compareEvents(a, b);
                if (!c) continue;
                union(a.id, b.id);
                linked.add(a.id).add(b.id);
                if (c.niveau === 'certain') certainParent.set(cfind(a.id), cfind(b.id));
                if (!raisons.has(a.id) || c.niveau === 'certain') raisons.set(a.id, c.raison);
            }
        }
    }
    /** @type {Map<number, number[]>} */
    const groups = new Map();
    for (const r of rows) {
        if (!linked.has(r.id)) continue;
        const root = find(r.id);
        groups.set(root, [...(groups.get(root) || []), r.id]);
    }
    const byId = new Map(rows.map(r => [r.id, r]));
    const partsOf = (/** @type {number} */ id) => [
        ...parts.filter(p => p.event_id === id).map(p => userById.get(p.user_id) || `#${p.user_id}`),
        ...externals
            .filter(p => p.event_id === id)
            .map(p => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() + ' (externe)')
    ];
    return [...groups.values()]
        .filter(g => g.length > 1)
        .map(g => {
            const certain = new Set(g.map(cfind)).size === 1;
            const members = g
                .map(id => /** @type {NonNullable<ReturnType<typeof byId.get>>} */ (byId.get(id)))
                .sort((a, b) => a.id - b.id);
            const first = members[0];
            return {
                id: first.id,
                niveau: /** @type {'certain' | 'probable'} */ (certain ? 'certain' : 'probable'),
                raison: certain
                    ? 'même type, même lieu, mêmes dates, même libellé'
                    : raisons.get(first.id) || 'événements proches (même lieu, dates et libellés voisins)',
                events: members.map(e => ({
                    id: e.id,
                    label: e.label,
                    start_date: e.start_date,
                    end_date: e.end_date,
                    period: e.period || 'FULL',
                    type_id: e.type_id,
                    type_label: e.type_id ? (typeById.get(e.type_id)?.label_long ?? null) : null,
                    location_id: e.location_id,
                    location_label: e.location_id ? (locById.get(e.location_id) ?? null) : null,
                    participants: partsOf(e.id),
                    created_at: e.created_at
                }))
            };
        })
        .sort((a, b) => (a.niveau === b.niveau ? a.id - b.id : a.niveau === 'certain' ? -1 : 1));
}

/**
 * Fusion : l'événement conservé reçoit les participants (internes et externes) des autres, qui sont supprimés ; les liens de
 * l'Aide à l'affectation vers un événement supprimé pointent vers l'événement conservé. La planification des participants
 * n'est pas touchée (ils restent participants de l'événement conservé).
 * @param {unknown} keepId
 * @param {unknown} removeIds
 */
export async function mergeEvents(keepId, removeIds) {
    const keep = Number(keepId);
    const remove = [...new Set((Array.isArray(removeIds) ? removeIds : []).map(Number))].filter(n => n !== keep);
    if (!Number.isInteger(keep) || keep <= 0) throw badRequest('Événement à conserver invalide');
    if (!remove.length || remove.some(n => !Number.isInteger(n) || n <= 0))
        throw badRequest('Aucun événement à fusionner');
    const found = await prisma.customEvent.findMany({ where: { id: { in: [keep, ...remove] } }, select: { id: true } });
    if (found.length !== remove.length + 1) throw notFound('Événement introuvable');

    const current = await prisma.customEventParticipant.findMany({
        where: { event_id: keep },
        select: { user_id: true }
    });
    const have = new Set(current.map(p => p.user_id));
    const incoming = await prisma.customEventParticipant.findMany({
        where: { event_id: { in: remove } },
        select: { user_id: true },
        orderBy: { id: 'asc' }
    });
    const toAdd = [...new Set(incoming.map(p => p.user_id))].filter(u => !have.has(u));
    const externalKeep = await prisma.customEventExternalParticipant.findMany({ where: { event_id: keep } });
    const key = (/** @type {{ nom: string | null, prenom: string | null, email: string | null }} */ p) =>
        (p.email || `${p.prenom || ''} ${p.nom || ''}`).trim().toLowerCase();
    const haveExt = new Set(externalKeep.map(key));
    const externalIn = await prisma.customEventExternalParticipant.findMany({
        where: { event_id: { in: remove } },
        orderBy: { id: 'asc' }
    });
    /** @type {typeof externalIn} */
    const extToAdd = [];
    for (const p of externalIn) {
        if (!key(p) || haveExt.has(key(p))) continue;
        haveExt.add(key(p));
        extToAdd.push(p);
    }
    await prisma.$transaction([
        prisma.customEventParticipant.createMany({ data: toAdd.map(user_id => ({ event_id: keep, user_id })) }),
        prisma.customEventExternalParticipant.createMany({
            data: extToAdd.map(p => ({ event_id: keep, nom: p.nom, prenom: p.prenom, email: p.email }))
        }),
        prisma.customEventParticipant.deleteMany({ where: { event_id: { in: remove } } }),
        prisma.customEventExternalParticipant.deleteMany({ where: { event_id: { in: remove } } }),
        prisma.customEvent.deleteMany({ where: { id: { in: remove } } })
    ]);
    // Liens de l'Aide à l'affectation : { déploiement: { activité: événement } }
    const links = await getJsonSetting(AFF_EVLINK_KEY);
    let relinked = 0;
    if (links && typeof links === 'object') {
        for (const stages of Object.values(/** @type {Record<string, Record<string, number>>} */ (links))) {
            for (const [stage, id] of Object.entries(stages)) {
                if (remove.includes(Number(id))) {
                    stages[stage] = keep;
                    relinked++;
                }
            }
        }
        if (relinked) await setSetting(AFF_EVLINK_KEY, JSON.stringify(links));
    }
    return { kept: keep, removed: remove, participantsAdded: toAdd.length + extToAdd.length, relinked };
}
