// @ts-check
// API publique par clé (événements) et gestion des clés
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { idParam } from '../../db/values.js';
import { badRequest } from '../../lib/http-error.js';

/** Nouvelle clé : seule son empreinte est conservée, la clé n'est montrée qu'une fois */
export async function createApiKey(/** @type {unknown} */ label, /** @type {number} */ createdBy) {
    if (!label) throw badRequest('Libellé requis');
    const key = 'ans_' + crypto.randomBytes(24).toString('hex');
    const prefix = key.substring(0, 12) + '...';
    const row = await prisma.apiKey.create({
        data: {
            label: String(label),
            key_hash: crypto.createHash('sha256').update(key).digest('hex'),
            key_prefix: prefix,
            created_by: createdBy
        }
    });
    return { id: row.id, key, prefix, label };
}

export async function listApiKeys() {
    const keys = await prisma.apiKey.findMany({ orderBy: [{ created_at: 'desc' }, { id: 'asc' }] });
    const users = await prisma.user.findMany({
        where: { id: { in: keys.map(k => k.created_by).filter(id => id != null) } },
        select: { id: true, nom: true, prenom: true }
    });
    const byId = new Map(users.map(u => [u.id, u]));
    return keys.map(k => {
        const u = k.created_by != null ? byId.get(k.created_by) : undefined;
        return {
            id: k.id,
            label: k.label,
            key_prefix: k.key_prefix,
            created_at: k.created_at,
            last_used_at: k.last_used_at,
            revoked: k.revoked,
            creator_nom: u?.nom ?? null,
            creator_prenom: u?.prenom ?? null
        };
    });
}

export async function revokeApiKey(/** @type {unknown} */ id) {
    await prisma.apiKey.updateMany({ where: { id: idParam(id) }, data: { revoked: 1 } });
}

const PERIOD_LABELS = /** @type {Record<string, string>} */ ({
    AM: 'Matin',
    PM: 'Après-midi',
    FULL: 'Journée entière'
});

/**
 * Événements publiés : période (chevauchement), lieu, type et participants
 * @param {{ from?: unknown, to?: unknown }} query
 */
export async function listPublicEvents({ from, to }) {
    const events = await prisma.customEvent.findMany({
        where: {
            AND: [from ? { end_date: { gte: String(from) } } : {}, to ? { start_date: { lte: String(to) } } : {}]
        },
        orderBy: [{ start_date: 'asc' }, { end_date: 'asc' }, { id: 'asc' }]
    });
    const ids = (/** @type {(e: any) => number | null} */ f) => events.map(f).filter(v => v != null);
    const [locations, types, participations] = await Promise.all([
        prisma.location.findMany({ where: { id: { in: ids(e => e.location_id) } } }),
        prisma.eventType.findMany({ where: { id: { in: ids(e => e.type_id) } } }),
        prisma.customEventParticipant.findMany({ where: { event_id: { in: events.map(e => e.id) } } })
    ]);
    const users = await prisma.user.findMany({
        where: { id: { in: participations.map(p => p.user_id) } },
        select: { id: true, nom: true, prenom: true, resource_id: true }
    });
    const resources = await prisma.resource.findMany({
        where: { id: { in: users.map(u => u.resource_id).filter(id => id != null) } },
        select: { id: true, trigramme: true }
    });
    const trigrammes = new Map(resources.map(r => [r.id, r.trigramme]));
    const userById = new Map(users.map(u => [u.id, u]));
    const locById = new Map(locations.map(l => [l.id, l]));
    const typeById = new Map(types.map(t => [t.id, t]));
    const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a === b ? 0 : a < b ? -1 : 1);

    return events.map(e => {
        const loc = e.location_id != null ? locById.get(e.location_id) : undefined;
        const type = e.type_id != null ? typeById.get(e.type_id) : undefined;
        const participants = participations
            .filter(p => p.event_id === e.id && userById.has(p.user_id))
            .map(p => /** @type {NonNullable<ReturnType<typeof userById.get>>} */ (userById.get(p.user_id)))
            .sort((a, b) => cmp(a.nom, b.nom) || cmp(a.prenom, b.prenom) || a.id - b.id)
            .map(u => ({
                nom: u.nom,
                prenom: u.prenom,
                trigramme: (u.resource_id != null && trigrammes.get(u.resource_id)) || null
            }));
        return {
            id: e.id,
            objet: e.label,
            start_date: e.start_date,
            end_date: e.end_date,
            grist: e.grist === 1 ? 1 : 0,
            lieu: loc ? loc.libelle_long : null,
            lieu_court: loc ? loc.libelle_court : null,
            detail_lieu: loc ? loc.adresse : null,
            type_long: type ? type.label_long : null,
            type_short: type ? type.label_short : null,
            type_icon: type ? type.icon : null,
            type_other: type ? type.is_other : null,
            horaire: (e.period != null && PERIOD_LABELS[e.period]) || e.period,
            participants
        };
    });
}
