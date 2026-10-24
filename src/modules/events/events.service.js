// @ts-check
// Événements personnalisés : types (couleurs, type « Autre »), événements, participants internes et externes
import { prisma } from '../../db/prisma.js';
import { containsInsensitive, flag, idParam, toInt } from '../../db/values.js';
import { badRequest, forbidden, notFound } from '../../lib/http-error.js';

// Chaque type : libellé long, libellé court (affiché sur le planning et la carte), icône et gabarit de couleurs (fond / texte / bordure).
// « Autre(s) » (is_other = 1) est le type de repli : ni modifiable ni supprimable.
export const EVT_TYPE_SEED = [
    {
        code: 'formation',
        long: 'Formations utilisateurs',
        icon: 'graduation',
        bg: '#ffea00',
        text: '#0008ff',
        border: '#000000'
    },
    { code: 'mes', long: 'Mise en service', icon: 'power', bg: '#ffea00', text: '#d20906', border: '#000000' },
    { code: 'mep', long: 'Mise en production', icon: 'flag', bg: '#00695c', text: '#ffffff', border: '#004d40' },
    {
        code: 'apd',
        long: 'Accompagnement post démarrage',
        icon: 'lifebuoy',
        bg: '#ffea00',
        text: '#c2059a',
        border: '#000000'
    },
    { code: 'visite', long: 'Visite terrain', icon: 'pin', bg: '#0011ff', text: '#ffffff', border: '#000000' },
    {
        code: 'visiteMetier',
        long: 'Visite métier',
        icon: 'briefcase',
        bg: '#7b1fa2',
        text: '#ffffff',
        border: '#4a0072'
    },
    { code: 'congres', long: 'Congrès', icon: 'presentation', bg: '#dff0d8', text: '#427645', border: '#000000' },
    {
        code: 'vftSite',
        long: 'VFT sur site',
        icon: 'clipboardCheck',
        bg: '#2e7d32',
        text: '#ffffff',
        border: '#1b5e20'
    },
    {
        code: 'verifPrereq',
        long: 'Vérification des prérequis',
        icon: 'listChecks',
        bg: '#546e7a',
        text: '#ffffff',
        border: '#263238'
    },
    { code: 'visiteOb', long: 'Visite OB', icon: 'building', bg: '#e65100', text: '#ffffff', border: '#bf360c' },
    { code: 'visitePostMes', long: 'Visite post MES', icon: 'eye', bg: '#0277bd', text: '#ffffff', border: '#01579b' },
    {
        code: 'reunionLancement',
        long: 'Réunion de lancement stratégique',
        icon: 'rocket',
        bg: '#1565c0',
        text: '#ffffff',
        border: '#0d47a1'
    },
    { code: 'autre', long: 'Autre(s)', icon: 'tag', bg: '#ffeb3b', text: '#000000', border: '#000000', other: 1 }
];

// Alimente la liste des types : liste complète si la table est vide, « Autre(s) » toujours présent, « Mise en production » ajouté une fois aux anciennes bases.
// Rappelée après une restauration de dump (un dump ancien, sans types, vide la table).
/** Types d'événements par défaut : tous sur une base neuve, sinon seulement le type « Autre(s) » s'il manque */
export async function evtSeedTypes() {
    const typeData = (/** @type {any} */ t, /** @type {number} */ sortOrder) => ({
        code: t.code,
        label_long: t.long,
        label_short: '',
        icon: t.icon,
        bg_color: t.bg,
        text_color: t.text,
        border_color: t.border,
        is_other: t.other ? 1 : 0,
        sort_order: sortOrder
    });
    try {
        const seed = (await prisma.eventType.count()) === 0 ? EVT_TYPE_SEED : EVT_TYPE_SEED.filter(t => t.other);
        for (const [i, t] of seed.entries()) {
            // séquentiel : identifiants dans l'ordre de la liste
            await prisma.eventType.upsert({ where: { code: t.code }, update: {}, create: typeData(t, (i + 1) * 10) });
        }
        // Type « Mise en production » ajouté après la première version : une seule fois
        if (!(await prisma.setting.findUnique({ where: { key: 'evt_type_mep_seeded' } }))) {
            if (!(await prisma.eventType.findUnique({ where: { code: 'mep' } }))) {
                const mes = await prisma.eventType.findUnique({ where: { code: 'mes' } });
                const t = EVT_TYPE_SEED.find(x => x.code === 'mep');
                await prisma.eventType.create({
                    data: typeData({ ...t, other: false }, ((mes && mes.sort_order) || 20) + 5)
                });
            }
            await prisma.setting.upsert({
                where: { key: 'evt_type_mep_seeded' },
                update: { value: '1' },
                create: { key: 'evt_type_mep_seeded', value: '1' }
            });
        }
    } catch (/** @type {any} */ x) {
        console.error('Erreur initialisation event_types:', x.message);
    }
}

export const EVT_HEX = /^#[0-9a-fA-F]{6}$/;

/** Minuscules ASCII, comme lower() de SQLite */
const asciiLower = (/** @type {string} */ s) => s.replace(/[A-Z]/g, c => c.toLowerCase());

/** Configuration JSON d'un événement (objet vide si absente ou invalide) */
function parseConfig(/** @type {string | null} */ config) {
    try {
        return JSON.parse(config || '{}') || {};
    } catch {
        return {};
    }
}

/** Couleurs d'un type appliquées à une configuration d'événement */
function withTypeColors(
    /** @type {Record<string, unknown>} */ cfg,
    /** @type {{ bg_color: string, text_color: string, border_color: string }} */ t
) {
    return { ...cfg, bgColor: t.bg_color, textColor: t.text_color, borderColor: t.border_color };
}

// ---------- Types d'événements ----------

export function evtOtherType() {
    return prisma.eventType.findFirst({ where: { is_other: 1 }, orderBy: { id: 'asc' } });
}

/**
 * Type retenu pour un événement (création / changement de type) : repli sur « Autre(s) » ;
 * les couleurs de l'événement suivent celles du type
 * @param {unknown} typeId
 * @param {unknown} config
 */
export async function evtResolveType(typeId, config) {
    let t = Number(typeId) > 0 ? await prisma.eventType.findUnique({ where: { id: idParam(typeId) } }) : null;
    if (!t) t = await evtOtherType();
    const cfg = Object.assign({}, config || {});
    return { typeId: t ? t.id : null, config: t ? withTypeColors(cfg, t) : cfg, type: t };
}

/** Modification : sans type fourni (ancien client), l'événement garde son type actuel */
async function evtResolveForUpdate(
    /** @type {number} */ eventId,
    /** @type {unknown} */ typeId,
    /** @type {unknown} */ config
) {
    if (typeId === undefined || typeId === null || typeId === '') {
        const cur = await prisma.customEvent.findUnique({ where: { id: eventId }, select: { type_id: true } });
        return { typeId: (cur && cur.type_id) || null, config };
    }
    return evtResolveType(typeId, config);
}

/** Applique les couleurs d'un type à la configuration de tous les événements qui l'utilisent */
async function evtSyncColors(/** @type {number} */ typeId) {
    const t = await prisma.eventType.findUnique({ where: { id: typeId } });
    if (!t) return 0;
    const rows = await prisma.customEvent.findMany({ where: { type_id: typeId }, select: { id: true, config: true } });
    await prisma.$transaction(
        rows.map(r =>
            prisma.customEvent.update({
                where: { id: r.id },
                data: { config: JSON.stringify(withTypeColors(parseConfig(r.config), t)) }
            })
        )
    );
    return rows.length;
}

/** Champs d'un type saisis par l'administrateur, validés */
function evtTypeBody(/** @type {any} */ b) {
    const long = String(b.label_long || '')
        .trim()
        .slice(0, 120);
    const short = String(b.label_short || '')
        .trim()
        .slice(0, 40);
    if (!long) throw badRequest('Le libellé long est obligatoire');
    const icon = /^[A-Za-z0-9_]{1,40}$/.test(String(b.icon || '')) ? String(b.icon) : 'tag';
    const c = (/** @type {string} */ k) => (EVT_HEX.test(String(b[k] || '')) ? String(b[k]).toLowerCase() : null);
    const bg = c('bg_color');
    const tx = c('text_color');
    const bd = c('border_color');
    if (!bg || !tx || !bd) throw badRequest('Couleurs invalides (fond, texte et bordure attendus)');
    return { label_long: long, label_short: short, icon, bg_color: bg, text_color: tx, border_color: bd };
}

/** Un type (autre que excludeId) porte-t-il déjà ce libellé long (casse ASCII ignorée) ? */
async function labelTaken(/** @type {string} */ label, /** @type {number | null} */ excludeId = null) {
    const types = await prisma.eventType.findMany({ select: { id: true, label_long: true } });
    return types.some(t => t.id !== excludeId && asciiLower(t.label_long) === asciiLower(label));
}

/** Types avec le nombre d'événements de chacun ; « Autre(s) » en dernier */
export async function listTypes() {
    const [types, counts] = await Promise.all([
        prisma.eventType.findMany({
            orderBy: [{ is_other: 'asc' }, { sort_order: 'asc' }, { label_long: 'asc' }, { id: 'asc' }]
        }),
        prisma.customEvent.groupBy({ by: ['type_id'], _count: { _all: true } })
    ]);
    const byType = new Map(counts.map(c => [c.type_id, c._count._all]));
    return types.map(t => ({ ...t, events_count: byType.get(t.id) || 0 }));
}

export async function createType(/** @type {unknown} */ body) {
    const v = evtTypeBody(body || {});
    if (await labelTaken(v.label_long)) throw badRequest('Un type porte déjà ce libellé long');
    const max = await prisma.eventType.aggregate({ where: { is_other: 0 }, _max: { sort_order: true } });
    const t = await prisma.eventType.create({
        data: { ...v, is_other: 0, sort_order: (max._max.sort_order || 0) + 10 }
    });
    return { id: t.id, label: v.label_long };
}

/** @returns {Promise<{ label: string, events: number }>} */
export async function updateType(/** @type {unknown} */ id, /** @type {unknown} */ body) {
    const t = await prisma.eventType.findUnique({ where: { id: idParam(id) } });
    if (!t) throw notFound('Type introuvable');
    if (t.is_other) throw forbidden("Le type « Autre(s) » n'est pas modifiable");
    const v = evtTypeBody(body || {});
    if (await labelTaken(v.label_long, t.id)) throw badRequest('Un autre type porte déjà ce libellé long');
    await prisma.eventType.update({ where: { id: t.id }, data: v });
    return { label: v.label_long, events: await evtSyncColors(t.id) };
}

/** Suppression : les événements associés basculent sur « Autre(s) » */
export async function deleteType(/** @type {unknown} */ id) {
    const t = await prisma.eventType.findUnique({ where: { id: idParam(id) } });
    if (!t) throw notFound('Type introuvable');
    if (t.is_other) throw forbidden("Le type « Autre(s) » n'est pas supprimable");
    const other = await evtOtherType();
    if (!other) throw new Error('Type « Autre(s) » introuvable');
    const { count: moved } = await prisma.customEvent.updateMany({
        where: { type_id: t.id },
        data: { type_id: other.id }
    });
    await evtSyncColors(other.id);
    await prisma.eventType.delete({ where: { id: t.id } });
    return { label: t.label_long, moved };
}

// ---------- Participants ----------

/** Nom affiché d'un participant (reprise des données) */
const displayName = (/** @type {{ prenom: string | null, nom: string | null }} */ p) =>
    `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();

/** Comptes par identifiant */
async function usersById(/** @type {number[]} */ ids) {
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(users.map(u => [u.id, u]));
}

/**
 * Participants internes (comptes existants) par événement, triés par nom puis prénom
 * @template T
 * @param {number[]} eventIds
 * @param {(u: Awaited<ReturnType<typeof prisma.user.findMany>>[number], eventId: number) => T} pick
 * @returns {Promise<Map<number, T[]>>}
 */
async function participantsByEvent(eventIds, pick) {
    const rows = await prisma.customEventParticipant.findMany({ where: { event_id: { in: eventIds } } });
    const users = await usersById(rows.map(r => r.user_id));
    const sorted = rows
        .filter(r => users.has(r.user_id))
        .map(r => ({ r, u: /** @type {NonNullable<ReturnType<typeof users.get>>} */ (users.get(r.user_id)) }))
        .sort((a, b) => cmp(a.u.nom, b.u.nom) || cmp(a.u.prenom, b.u.prenom) || a.u.id - b.u.id);
    /** @type {Map<number, T[]>} */
    const byEvent = new Map();
    for (const { r, u } of sorted) {
        const list = byEvent.get(r.event_id) || [];
        list.push(pick(u, r.event_id));
        byEvent.set(r.event_id, list);
    }
    return byEvent;
}

/** Comparaison de chaînes (null en premier, ordre binaire comme SQLite) */
function cmp(/** @type {string | null} */ a, /** @type {string | null} */ b) {
    if (a === b) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    return a < b ? -1 : 1;
}

/** Participants externes par événement, triés par nom puis prénom */
async function externalParticipantsByEvent(/** @type {number[]} */ eventIds) {
    if (!eventIds.length) return new Map();
    const rows = await prisma.customEventExternalParticipant.findMany({ where: { event_id: { in: eventIds } } });
    rows.sort((a, b) => cmp(a.nom, b.nom) || cmp(a.prenom, b.prenom) || a.id - b.id);
    /** @type {Map<number, Array<{ external: true, ext_id: number, nom: string | null, prenom: string | null, email: string | null }>>} */
    const byEvent = new Map();
    for (const r of rows) {
        const list = byEvent.get(r.event_id) || [];
        list.push({ external: true, ext_id: r.id, nom: r.nom, prenom: r.prenom, email: r.email });
        byEvent.set(r.event_id, list);
    }
    return byEvent;
}

/** Ajout de participants internes (doublons ignorés) */
async function addParticipants(/** @type {number} */ eventId, /** @type {unknown[]} */ userIds) {
    for (const value of userIds) {
        const user_id = toInt(value);
        if (user_id == null) {
            console.error(`❌ Erreur ajout participant ${value}: identifiant invalide`);
            continue;
        }
        await prisma.customEventParticipant.upsert({
            where: { event_id_user_id: { event_id: eventId, user_id } },
            create: { event_id: eventId, user_id },
            update: {}
        });
    }
}

/** Remplacement des participants externes (lignes sans nom ni email ignorées) */
async function saveExternalParticipants(/** @type {number} */ eventId, /** @type {unknown} */ externalParticipants) {
    const list = Array.isArray(externalParticipants) ? externalParticipants.filter(ep => ep.nom || ep.email) : [];
    await prisma.$transaction([
        prisma.customEventExternalParticipant.deleteMany({ where: { event_id: eventId } }),
        prisma.customEventExternalParticipant.createMany({
            data: list.map(ep => ({
                event_id: eventId,
                nom: ep.nom || null,
                prenom: ep.prenom || null,
                email: ep.email || null
            }))
        })
    ]);
}

// ---------- Lecture des événements ----------

/** Lieux, types et créateurs des événements */
async function eventRefs(/** @type {Awaited<ReturnType<typeof prisma.customEvent.findMany>>} */ events) {
    const ids = (/** @type {(e: any) => number | null} */ f) => [...new Set(events.map(f).filter(v => v != null))];
    const [locations, types, creators] = await Promise.all([
        prisma.location.findMany({ where: { id: { in: ids(e => e.location_id) } } }),
        prisma.eventType.findMany({ where: { id: { in: ids(e => e.type_id) } } }),
        usersById(ids(e => e.created_by))
    ]);
    const resources = await prisma.resource.findMany({
        where: { id: { in: [...creators.values()].map(u => u.resource_id).filter(v => v != null) } },
        select: { id: true, trigramme: true }
    });
    const trigrammes = new Map(resources.map(r => [r.id, r.trigramme]));
    const locById = new Map(locations.map(l => [l.id, l]));
    const typeById = new Map(types.map(t => [t.id, t]));
    return {
        location: (/** @type {any} */ e) => (e.location_id != null && locById.get(e.location_id)) || null,
        type: (/** @type {any} */ e) => (e.type_id != null && typeById.get(e.type_id)) || null,
        creator: (/** @type {any} */ e) => (e.created_by != null && creators.get(e.created_by)) || null,
        trigramme: (/** @type {any} */ u) =>
            u && u.resource_id != null ? (trigrammes.get(u.resource_id) ?? null) : null
    };
}

const typeFields = (/** @type {any} */ t) => ({
    type_long: t ? t.label_long : null,
    type_short: t ? t.label_short : null,
    type_icon: t ? t.icon : null,
    type_other: t ? t.is_other : null
});

const participantWithPhoto = (/** @type {any} */ u) => ({
    user_id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    profile_photo: u.profile_photo
});

/** Tous les événements, du plus ancien au plus récent */
const allEvents = () => prisma.customEvent.findMany({ orderBy: [{ start_date: 'asc' }, { id: 'asc' }] });

/**
 * Recherche : période (chevauchement), libellé, participants (tous requis)
 * @param {{ startDate?: unknown, endDate?: unknown, label?: unknown, participantIds?: unknown }} query
 */
export async function search({ startDate, endDate, label, participantIds }) {
    /** @type {any[]} */
    const and = [];
    if (startDate) and.push({ end_date: { gte: String(startDate) } });
    if (endDate) and.push({ start_date: { lte: String(endDate) } });
    if (typeof label === 'string' && label.trim()) and.push({ label: containsInsensitive(label.trim()) });
    const events = await prisma.customEvent.findMany({
        where: { AND: and },
        orderBy: [{ start_date: 'desc' }, { id: 'asc' }]
    });
    const refs = await eventRefs(events);
    const participants = await participantsByEvent(
        events.map(e => e.id),
        (u, eventId) => ({ event_id: eventId, user_id: u.id, nom: u.nom, prenom: u.prenom, email: u.email })
    );
    let rows = events.map(e => {
        const creator = refs.creator(e);
        const loc = refs.location(e);
        return {
            ...e,
            creator_nom: creator ? creator.nom : null,
            creator_prenom: creator ? creator.prenom : null,
            location_libelle_long: loc ? loc.libelle_long : null,
            location_libelle_court: loc ? loc.libelle_court : null,
            location_adresse: loc ? loc.adresse : null,
            participants: participants.get(e.id) || []
        };
    });
    if (rows.length > 0 && typeof participantIds === 'string' && participantIds) {
        const ids = participantIds.split(',').map(Number).filter(Boolean);
        if (ids.length > 0) rows = rows.filter(e => ids.every(id => e.participants.some(p => p.user_id === id)));
    }
    return rows;
}

/** Administration : tous les événements avec créateur, type et participants */
export async function adminList() {
    const events = await allEvents();
    const ids = events.map(e => e.id);
    const [refs, participants, externals] = await Promise.all([
        eventRefs(events),
        participantsByEvent(ids, participantWithPhoto),
        externalParticipantsByEvent(ids)
    ]);
    return events.map(e => {
        const creator = refs.creator(e);
        return {
            ...e,
            creator_nom: creator ? creator.nom : null,
            creator_prenom: creator ? creator.prenom : null,
            creator_trigramme: refs.trigramme(creator),
            ...typeFields(refs.type(e)),
            participants: participants.get(e.id) || [],
            external_participants: externals.get(e.id) || []
        };
    });
}

/** Application mobile : tous les événements avec lieu, type et participants */
export async function mobileList() {
    const events = await allEvents();
    const [refs, participants] = await Promise.all([
        eventRefs(events),
        participantsByEvent(
            events.map(e => e.id),
            u => ({ user_id: u.id, nom: u.nom, prenom: u.prenom })
        )
    ]);
    return events.map(e => {
        const loc = refs.location(e);
        const type = refs.type(e);
        return {
            ...e,
            location_libelle_court: loc ? loc.libelle_court : null,
            ...typeFields(type),
            type_code: type ? type.code : null,
            participants: participants.get(e.id) || []
        };
    });
}

/**
 * Tous les événements, vus par un utilisateur (is_creator : créateur ou administrateur)
 * @param {number} userId
 * @param {boolean} isAdmin
 */
export async function listForUser(userId, isAdmin) {
    const events = await allEvents();
    const ids = events.map(e => e.id);
    const [refs, participants, externals] = await Promise.all([
        eventRefs(events),
        participantsByEvent(ids, participantWithPhoto),
        externalParticipantsByEvent(ids)
    ]);
    return events.map(e => {
        const creator = refs.creator(e);
        const loc = refs.location(e);
        return {
            ...e,
            creator_nom: creator ? creator.nom : null,
            creator_prenom: creator ? creator.prenom : null,
            creator_trigramme: refs.trigramme(creator),
            location_libelle_long: loc ? loc.libelle_long : null,
            location_libelle_court: loc ? loc.libelle_court : null,
            ...typeFields(refs.type(e)),
            can_edit: 1,
            is_creator: e.created_by === userId || isAdmin ? 1 : 0,
            participants: participants.get(e.id) || [],
            external_participants: externals.get(e.id) || []
        };
    });
}

/** Reprise des données : tous les événements (seuls le type et le libellé sont modifiables) */
export async function listForReprise() {
    const events = await allEvents();
    const refs = await eventRefs(events);
    const participants = await participantsByEvent(
        events.map(e => e.id),
        u => displayName(u)
    );
    const externals = await prisma.customEventExternalParticipant.findMany({ orderBy: { id: 'asc' } });
    for (const p of externals) {
        const list = participants.get(p.event_id) || [];
        list.push(displayName(p) || p.email || 'Externe');
        participants.set(p.event_id, list);
    }
    return events.map(e => {
        const loc = refs.location(e);
        const creator = refs.creator(e);
        return {
            id: e.id,
            label: e.label,
            start_date: e.start_date,
            end_date: e.end_date,
            period: e.period,
            type_id: e.type_id,
            grist: e.grist,
            location_court: loc ? loc.libelle_court : null,
            location_long: loc ? loc.libelle_long : null,
            creator_nom: creator ? creator.nom : null,
            creator_prenom: creator ? creator.prenom : null,
            participants: participants.get(e.id) || []
        };
    });
}

/**
 * Reprise des données : modification du type et / ou du libellé de plusieurs événements
 * @returns {Promise<number>} nombre d'événements modifiés
 */
export async function bulkUpdate(/** @type {unknown} */ updates) {
    const list = Array.isArray(updates) ? updates.slice(0, 5000) : [];
    let n = 0;
    for (const u of list) {
        const id = Number(u.id);
        const ev = id > 0 ? await prisma.customEvent.findUnique({ where: { id: idParam(id) } }) : null;
        if (!ev) continue;
        const label = u.label === undefined ? ev.label : String(u.label).trim();
        if (!label) continue;
        let cfg = parseConfig(ev.config);
        let typeId = ev.type_id;
        if (u.type_id !== undefined) {
            const r = await evtResolveType(u.type_id, cfg);
            typeId = r.typeId;
            cfg = r.config;
        }
        if (label === ev.label && typeId === ev.type_id) continue;
        await prisma.customEvent.update({
            where: { id: ev.id },
            data: { label, type_id: typeId, config: JSON.stringify(cfg) }
        });
        n++;
    }
    return n;
}

// ---------- Création, modification, suppression ----------

/** Demi-journée retenue : uniquement pour un événement d'un seul jour */
const finalPeriod = (/** @type {any} */ b) =>
    b.period && b.startDate === (b.endDate || b.startDate) ? b.period : 'FULL';

/**
 * Création d'un événement avec ses participants
 * @param {any} body
 * @param {number} createdBy
 * @param {{ withResourceRequest: boolean }} options champs de l'interface de planification (mobilisation, Grist)
 */
export async function createEvent(body, createdBy, { withResourceRequest }) {
    const { startDate, endDate, label, config, participants, external_participants, location_id, type_id } = body;
    if (!startDate || !label) throw badRequest('Date de début et libellé requis');
    const period = finalPeriod(body);
    const ty = await evtResolveType(type_id, config);
    const event = await prisma.customEvent.create({
        data: {
            label: String(label),
            start_date: String(startDate),
            end_date: String(endDate || startDate),
            config: JSON.stringify(ty.config),
            created_by: createdBy,
            period,
            location_id: toInt(location_id) || null,
            type_id: ty.typeId,
            ...(withResourceRequest
                ? {
                      needs_resources: flag(body.needs_resources),
                      resources_count: toInt(body.resources_count) || 1,
                      grist: flag(body.grist)
                  }
                : {})
        }
    });
    if (Array.isArray(participants)) await addParticipants(event.id, participants);
    await saveExternalParticipants(event.id, external_participants || []);
    return { id: event.id, period };
}

/**
 * Modification d'un événement ; les participants internes sont remplacés s'ils sont fournis
 * @param {unknown} id
 * @param {any} body
 * @param {{ allowCreator: boolean }} options l'administrateur peut changer le créateur
 */
export async function updateEvent(id, body, { allowCreator }) {
    const eventId = idParam(id);
    const {
        startDate,
        endDate,
        label,
        config,
        createdBy,
        participants,
        external_participants,
        location_id,
        grist,
        type_id
    } = body;
    // Événement inexistant : rien à modifier (pas de participants orphelins)
    if (!(await prisma.customEvent.findUnique({ where: { id: eventId }, select: { id: true } }))) return;
    if (label == null || startDate == null) throw badRequest('Date de début et libellé requis');
    const ty = await evtResolveForUpdate(eventId, type_id, config);
    await prisma.customEvent.update({
        where: { id: eventId },
        data: {
            label: String(label),
            start_date: String(startDate),
            end_date: String(endDate || startDate),
            config: JSON.stringify(ty.config),
            ...(allowCreator && createdBy !== undefined ? { created_by: toInt(createdBy) } : {}),
            period: finalPeriod(body),
            location_id: toInt(location_id) || null,
            grist: flag(grist),
            type_id: ty.typeId
        }
    });
    if (participants !== undefined) {
        await prisma.customEventParticipant.deleteMany({ where: { event_id: eventId } });
        if (Array.isArray(participants)) await addParticipants(eventId, participants);
    }
    await saveExternalParticipants(eventId, external_participants || []);
}

/** Suppression d'un événement et de ses participants */
export async function deleteEvent(/** @type {unknown} */ id) {
    const eventId = idParam(id);
    await prisma.$transaction([
        prisma.customEventParticipant.deleteMany({ where: { event_id: eventId } }),
        prisma.customEventExternalParticipant.deleteMany({ where: { event_id: eventId } }),
        prisma.customEvent.deleteMany({ where: { id: eventId } })
    ]);
}

/**
 * Inscription comme participant ; pour un expert, la planification est mise à jour :
 * disponibilité ANS (2) et activité « Divers » (8) sur les demi-journées encore libres
 * @param {unknown} id
 * @param {{ userId: number, resourceId: number | null | undefined, isExpert: boolean }} participant
 */
export async function joinEvent(id, { userId, resourceId, isExpert }) {
    const event = await prisma.customEvent.findUnique({ where: { id: idParam(id) } });
    if (!event) throw notFound('Événement introuvable');
    await addParticipants(event.id, [userId]);

    const planningUpdates = [];
    if (isExpert && resourceId) {
        const start = new Date(event.start_date);
        const end = new Date(event.end_date || event.start_date);
        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(d.toISOString().split('T')[0]);
        const periods = event.period === 'AM' ? ['AM'] : event.period === 'PM' ? ['PM'] : ['AM', 'PM'];
        const setCell = (/** @type {string} */ date_key, /** @type {string} */ type, /** @type {string} */ value) =>
            prisma.scheduleData.upsert({
                where: { resource_id_date_key_type: { resource_id: resourceId, date_key, type } },
                create: { resource_id: resourceId, date_key, type, value, notification: '0' },
                update: { value }
            });

        for (const dateStr of dates) {
            for (const period of periods) {
                const dateKey = `${dateStr}_${period}`;
                const cells = await prisma.scheduleData.findMany({
                    where: { resource_id: resourceId, date_key: dateKey, type: { in: ['available', 'activity'] } },
                    select: { type: true, value: true }
                });
                const availVal = cells.find(c => c.type === 'available')?.value || '1';
                const actVal = cells.find(c => c.type === 'activity')?.value || '1';
                const newAvail = availVal === '1' ? '2' : availVal;
                const newAct = actVal === '1' ? '8' : actVal;
                if (newAvail !== availVal || newAct !== actVal) {
                    await setCell(dateKey, 'available', newAvail);
                    await setCell(dateKey, 'activity', newAct);
                    planningUpdates.push({ dateStr, period, newAvail, newAct });
                }
            }
        }
    }
    return { event, planningUpdates };
}

// ---------- Notifications ----------

/** Libellé de lieu et coordonnées du créateur d'un événement */
export async function notificationContext(/** @type {unknown} */ locationId, /** @type {number} */ createdBy) {
    const loc = locationId
        ? await prisma.location.findUnique({
              where: { id: idParam(locationId) },
              select: { libelle_long: true, libelle_court: true }
          })
        : null;
    const creator = await prisma.user.findUnique({
        where: { id: createdBy },
        select: { nom: true, prenom: true, email: true }
    });
    return { locLabel: loc?.libelle_long || loc?.libelle_court || '', creator };
}

/** Comptes actifs ayant un email, parmi des identifiants */
export function activeUsersWithEmail(/** @type {unknown[]} */ ids) {
    const userIds = ids.map(toInt).filter(v => v != null);
    return prisma.user.findMany({
        where: { id: { in: /** @type {number[]} */ (userIds) }, actif: 1, email: { not: '' } },
        select: { id: true, nom: true, prenom: true, email: true },
        orderBy: { id: 'asc' }
    });
}
