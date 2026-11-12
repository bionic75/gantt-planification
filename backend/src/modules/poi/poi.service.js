// @ts-check
// Bonnes adresses autour des SAMU-SAS (hébergement, restaurant, bar) : lieux, notes et commentaires
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { badRequest, forbidden, notFound } from '../../lib/http-error.js';
import { poiClean, poiKm, poiMapResult, poiNominatim, poiRouteCache, poiRouteOne } from './poi.external.js';

export const POI_CATS = ['hebergement', 'restaurant', 'bar'];

export const poiName = (
    /** @type {string | null | undefined} */ prenom,
    /** @type {string | null | undefined} */ nom
) => `${prenom || ''} ${(nom || '').toUpperCase()}`.trim();

/** Minuscules ASCII : comparaisons insensibles à la casse comme LIKE / COLLATE NOCASE de SQLite */
const asciiLower = (/** @type {string} */ s) => s.replace(/[A-Z]/g, c => c.toLowerCase());

/** @typedef {{ userId: number, isAdmin: boolean }} Viewer */

/** Comptes par identifiant */
async function usersById(/** @type {Array<number | null>} */ ids) {
    const users = await prisma.user.findMany({
        where: { id: { in: /** @type {number[]} */ (ids.filter(id => id != null)) } },
        select: { id: true, nom: true, prenom: true }
    });
    return new Map(users.map(u => [u.id, u]));
}

/**
 * Lieux avec SAMU-SAS, créateur, notes et nombre de commentaires, du plus récent au plus ancien
 * @param {Viewer} viewer
 * @param {{ id?: number, location_id?: number, category?: string, created_by?: number, q?: string }} [filters]
 */
async function poiRows(viewer, filters = {}) {
    const { q, ...where } = filters;
    const pois = await prisma.poi.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] });
    const ids = pois.map(p => p.id);
    const [locations, users, ratings, comments] = await Promise.all([
        prisma.location.findMany({ where: { id: { in: [...new Set(pois.map(p => p.location_id))] } } }),
        usersById(pois.map(p => p.created_by)),
        prisma.poiRating.findMany({
            where: { poi_id: { in: ids } },
            select: { poi_id: true, user_id: true, rating: true }
        }),
        prisma.poiComment.groupBy({ by: ['poi_id'], where: { poi_id: { in: ids } }, _count: { _all: true } })
    ]);
    const locById = new Map(locations.map(l => [l.id, l]));
    const commentCount = new Map(comments.map(c => [c.poi_id, c._count._all]));
    const needle = q ? asciiLower(q) : null;
    const matches = (/** @type {Array<string | null | undefined>} */ fields) =>
        !needle || fields.some(f => f != null && asciiLower(f).includes(needle));

    const rows = [];
    for (const p of pois) {
        const l = locById.get(p.location_id);
        if (!l) continue; // lieu rattaché à un SAMU-SAS supprimé
        const u = p.created_by != null ? users.get(p.created_by) : undefined;
        if (!matches([p.name, p.address, p.comment, l.libelle_court, u?.nom, u?.prenom])) continue;
        const own = ratings.filter(r => r.poi_id === p.id);
        const avg = own.length ? own.reduce((s, r) => s + r.rating, 0) / own.length : null;
        rows.push({
            id: p.id,
            location_id: p.location_id,
            loc_court: l.libelle_court,
            loc_long: l.libelle_long,
            loc_lat: l.latitude,
            loc_lng: l.longitude,
            category: p.category,
            name: p.name,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            comment: p.comment,
            website: p.website,
            phone: p.phone,
            osm_ref: p.osm_ref,
            created_by: p.created_by,
            creator: poiName(u?.prenom, u?.nom) || 'Utilisateur supprimé',
            created_at: p.created_at,
            updated_at: p.updated_at,
            avg_rating: avg == null ? null : Math.round(avg * 10) / 10,
            n_ratings: own.length,
            n_comments: commentCount.get(p.id) || 0,
            my_rating: own.find(r => r.user_id === viewer.userId)?.rating ?? null,
            distance_km: poiKm(l.latitude, l.longitude, p.latitude, p.longitude),
            can_edit: viewer.isAdmin || p.created_by === viewer.userId
        });
    }
    return rows;
}

/** Recherche de lieux dans la base de référence, les plus proches du SAMU-SAS d'abord */
export async function searchPlaces(/** @type {unknown} */ query, /** @type {unknown} */ locationId) {
    const q = poiClean(query, 120);
    if (q.length < 3) return { places: [] };
    const loc =
        Number(locationId) > 0
            ? await prisma.location.findUnique({
                  where: { id: idParam(locationId) },
                  select: { latitude: true, longitude: true, libelle_court: true }
              })
            : null;
    /** @type {Record<string, string>} */
    const params = { q, countrycodes: 'fr' };
    if (loc && loc.latitude != null && loc.longitude != null) {
        params.viewbox = `${loc.longitude - 0.35},${loc.latitude + 0.25},${loc.longitude + 0.35},${loc.latitude - 0.25}`;
    }
    const raw = await poiNominatim(params);
    const places = raw
        .map((/** @type {any} */ r) => poiMapResult(r, loc && loc.latitude, loc && loc.longitude))
        .filter((/** @type {any} */ x) => x.name && !isNaN(x.latitude));
    // Catégorie connue d'abord, puis distance au SAMU-SAS
    places.sort(
        (/** @type {any} */ a, /** @type {any} */ b) =>
            (a.category ? 0 : 1) - (b.category ? 0 : 1) ||
            (a.distance_km == null ? 1e9 : a.distance_km) - (b.distance_km == null ? 1e9 : b.distance_km)
    );
    return { places: places.slice(0, 8), reference: 'OpenStreetMap (Nominatim)' };
}

/** SAMU-SAS (avec nombre de lieux), créateurs, catégories, nombre de lieux par SAMU-SAS et catégorie */
export async function getMeta() {
    const [locations, counts, creatorIds] = await Promise.all([
        prisma.location.findMany({
            select: {
                id: true,
                libelle_court: true,
                libelle_long: true,
                adresse: true,
                latitude: true,
                longitude: true
            }
        }),
        prisma.poi.groupBy({ by: ['location_id', 'category'], _count: { _all: true } }),
        prisma.poi.findMany({
            where: { created_by: { not: null } },
            select: { created_by: true },
            distinct: ['created_by']
        })
    ]);
    /** @type {Record<number, Record<string, number>>} */
    const byLocation = {};
    const nPoi = new Map();
    for (const c of counts) {
        (byLocation[c.location_id] ??= {})[c.category] = c._count._all;
        nPoi.set(c.location_id, (nPoi.get(c.location_id) || 0) + c._count._all);
    }
    locations.sort((a, b) => {
        const x = asciiLower(a.libelle_court);
        const y = asciiLower(b.libelle_court);
        return x === y ? a.id - b.id : x < y ? -1 : 1;
    });
    const creators = [...(await usersById(creatorIds.map(c => c.created_by))).values()].sort((a, b) =>
        a.nom === b.nom ? (a.prenom === b.prenom ? a.id - b.id : a.prenom < b.prenom ? -1 : 1) : a.nom < b.nom ? -1 : 1
    );
    return {
        locations: locations.map(l => ({ ...l, n_poi: nPoi.get(l.id) || 0 })),
        creators: creators.map(c => ({ id: c.id, name: poiName(c.prenom, c.nom) })),
        categories: POI_CATS,
        counts: byLocation
    };
}

/**
 * Lieux filtrés (SAMU-SAS, catégorie, créateur, texte)
 * @param {Viewer} viewer
 * @param {Record<string, unknown>} query
 */
export function listPois(viewer, query) {
    /** @type {{ location_id?: number, category?: string, created_by?: number, q?: string }} */
    const filters = {};
    if (Number(query.location_id) > 0) filters.location_id = idParam(query.location_id);
    if (POI_CATS.includes(String(query.category || ''))) filters.category = String(query.category);
    if (Number(query.creator) > 0) filters.created_by = idParam(query.creator);
    const q = poiClean(query.q, 80);
    if (q) filters.q = q;
    return poiRows(viewer, filters);
}

/** Lieu avec ses commentaires et ses notes */
export async function getPoi(/** @type {unknown} */ id, /** @type {Viewer} */ viewer) {
    const poiId = idParam(id);
    const [poi] = await poiRows(viewer, { id: poiId });
    if (!poi) throw notFound('Lieu introuvable');
    const [comments, ratings] = await Promise.all([
        prisma.poiComment.findMany({ where: { poi_id: poiId }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }] }),
        prisma.poiRating.findMany({ where: { poi_id: poiId }, orderBy: [{ updated_at: 'desc' }, { id: 'asc' }] })
    ]);
    const users = await usersById([...comments, ...ratings].map(x => x.user_id));
    const author = (/** @type {number} */ userId) => {
        const u = users.get(userId);
        return poiName(u?.prenom, u?.nom) || 'Utilisateur supprimé';
    };
    const canEdit = (/** @type {number} */ userId) => viewer.isAdmin || userId === viewer.userId;
    return {
        poi,
        comments: comments.map(c => ({
            id: c.id,
            user_id: c.user_id,
            author: author(c.user_id),
            text: c.text,
            created_at: c.created_at,
            updated_at: c.updated_at,
            can_edit: canEdit(c.user_id)
        })),
        ratings: ratings.map(r => ({
            user_id: r.user_id,
            author: author(r.user_id),
            rating: r.rating,
            created_at: r.created_at,
            updated_at: r.updated_at,
            can_edit: canEdit(r.user_id)
        }))
    };
}

/** Trajets du lieu au SAMU-SAS (marche, voiture, transports en commun), en cache une heure */
export async function getRoute(/** @type {unknown} */ id) {
    const poi = await prisma.poi.findUnique({ where: { id: idParam(id) } });
    const loc = poi ? await prisma.location.findUnique({ where: { id: poi.location_id } }) : null;
    if (!poi || !loc) throw notFound('Lieu introuvable');
    if (loc.latitude == null || loc.longitude == null) throw badRequest("Ce SAMU-SAS n'est pas géolocalisé");
    const a = [poi.latitude, poi.longitude];
    const b = [loc.latitude, loc.longitude];
    const out = { samu: loc.libelle_court, from: a, to: b };
    const key = `${a}|${b}|${new Date().toISOString().slice(0, 13)}`;
    if (poiRouteCache.has(key)) return { ...out, ...poiRouteCache.get(key) };
    /** @type {Record<string, any>} */
    const modes = {};
    await Promise.all(
        ['walk', 'car', 'transit'].map(async m => {
            try {
                modes[m] = await poiRouteOne(m, a, b);
            } catch (/** @type {any} */ e) {
                modes[m] = { error: e.message };
            }
        })
    );
    if (Object.values(modes).some(m => !m.error)) {
        poiRouteCache.set(key, { modes });
        if (poiRouteCache.size > 200) poiRouteCache.delete(poiRouteCache.keys().next().value);
    }
    return { ...out, modes };
}

/** Champs d'un lieu validés ; sans coordonnées, l'adresse (ou le nom) est géolocalisée */
async function poiBody(/** @type {any} */ b) {
    const category = POI_CATS.includes(b.category) ? b.category : null;
    if (!category) throw badRequest('Choisissez une typologie (hébergement, restaurant ou bar)');
    const name = poiClean(b.name, 120);
    if (name.length < 2) throw badRequest('Le nom du lieu est obligatoire');
    const location_id = Number(b.location_id);
    if (!(location_id > 0) || !(await prisma.location.findUnique({ where: { id: idParam(location_id) } }))) {
        throw badRequest('Choisissez le SAMU-SAS auquel rattacher ce lieu');
    }
    const address = poiClean(b.address, 250);
    /** @type {number | null} */
    let lat = Number(b.latitude);
    /** @type {number | null} */
    let lng = Number(b.longitude);
    if (!(isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng))) {
        lat = lng = null;
        // Adresse saisie sans suggestion : géolocalisation par la base de référence
        try {
            const r = (await poiNominatim({ q: address || name, countrycodes: 'fr', limit: '1' }))[0];
            if (r) {
                lat = Number(r.lat);
                lng = Number(r.lon);
            }
        } catch {
            /* géolocalisation indisponible */
        }
        if (lat == null) {
            throw badRequest(
                "Adresse introuvable : choisissez une suggestion de la liste ou précisez l'adresse pour pouvoir placer le lieu sur la carte"
            );
        }
    }
    return {
        location_id: idParam(location_id),
        category,
        name,
        address,
        latitude: lat,
        longitude: lng,
        comment: poiClean(b.comment, 2000),
        website: poiClean(b.website, 250),
        phone: poiClean(b.phone, 40),
        osm_ref: poiClean(b.osm_ref, 20)
    };
}

/** Création (avec la note de l'auteur, facultative) */
export async function createPoi(/** @type {any} */ body, /** @type {number} */ userId) {
    const data = await poiBody(body);
    const poi = await prisma.poi.create({ data: { ...data, created_by: userId } });
    const rt = Number(body.rating);
    if (rt >= 1 && rt <= 5) await setRating(poi.id, userId, Math.round(rt));
    return { id: poi.id, name: data.name, category: data.category };
}

/** Lieu modifiable par son créateur ou un administrateur */
async function ownPoi(/** @type {unknown} */ id, /** @type {Viewer} */ viewer, /** @type {string} */ action) {
    const poi = await prisma.poi.findUnique({ where: { id: idParam(id) } });
    if (!poi) throw notFound('Lieu introuvable');
    if (!viewer.isAdmin && poi.created_by !== viewer.userId) {
        throw forbidden(`Seul le créateur du lieu ou un administrateur peut le ${action}`);
    }
    return poi;
}

export async function updatePoi(/** @type {unknown} */ id, /** @type {any} */ body, /** @type {Viewer} */ viewer) {
    const poi = await ownPoi(id, viewer, 'modifier');
    const data = await poiBody(body);
    await prisma.poi.update({ where: { id: poi.id }, data: { ...data, updated_at: sqlTimestamp() } });
    return data.name;
}

/** Suppression du lieu, de ses notes et de ses commentaires */
export async function deletePoi(/** @type {unknown} */ id, /** @type {Viewer} */ viewer) {
    const poi = await ownPoi(id, viewer, 'supprimer');
    await prisma.$transaction([
        prisma.poiComment.deleteMany({ where: { poi_id: poi.id } }),
        prisma.poiRating.deleteMany({ where: { poi_id: poi.id } }),
        prisma.poi.delete({ where: { id: poi.id } })
    ]);
    return poi.name;
}

// ---------- Notes ----------

function setRating(/** @type {number} */ poiId, /** @type {number} */ userId, /** @type {number} */ rating) {
    return prisma.poiRating.upsert({
        where: { poi_id_user_id: { poi_id: poiId, user_id: userId } },
        create: { poi_id: poiId, user_id: userId, rating },
        update: { rating, updated_at: sqlTimestamp() }
    });
}

/** Note de l'utilisateur (1 à 5) */
export async function ratePoi(/** @type {unknown} */ id, /** @type {unknown} */ rating, /** @type {number} */ userId) {
    const rt = Math.round(Number(rating));
    if (!(rt >= 1 && rt <= 5)) throw badRequest('La note doit être comprise entre 1 et 5');
    const poi = await prisma.poi.findUnique({ where: { id: idParam(id) }, select: { id: true } });
    if (!poi) throw notFound('Lieu introuvable');
    await setRating(poi.id, userId, rt);
}

/** Retrait d'une note : la sienne, ou celle d'un autre utilisateur pour un administrateur */
export async function deleteRating(
    /** @type {unknown} */ id,
    /** @type {unknown} */ targetUserId,
    /** @type {Viewer} */ viewer
) {
    const userId = viewer.isAdmin && Number(targetUserId) > 0 ? idParam(targetUserId) : viewer.userId;
    await prisma.poiRating.deleteMany({ where: { poi_id: idParam(id), user_id: userId } });
}

// ---------- Commentaires ----------

export async function addComment(/** @type {unknown} */ id, /** @type {unknown} */ text, /** @type {number} */ userId) {
    const clean = poiClean(text, 2000);
    if (clean.length < 1) throw badRequest('Le commentaire est vide');
    const poi = await prisma.poi.findUnique({ where: { id: idParam(id) }, select: { id: true } });
    if (!poi) throw notFound('Lieu introuvable');
    return (await prisma.poiComment.create({ data: { poi_id: poi.id, user_id: userId, text: clean } })).id;
}

/** Commentaire modifiable par son auteur ou un administrateur */
async function ownComment(/** @type {unknown} */ id, /** @type {Viewer} */ viewer, /** @type {string} */ action) {
    const comment = await prisma.poiComment.findUnique({ where: { id: idParam(id) } });
    if (!comment) throw notFound('Commentaire introuvable');
    if (!viewer.isAdmin && comment.user_id !== viewer.userId) {
        throw forbidden(`Seul l'auteur du commentaire ou un administrateur peut le ${action}`);
    }
    return comment;
}

export async function updateComment(
    /** @type {unknown} */ id,
    /** @type {unknown} */ text,
    /** @type {Viewer} */ viewer
) {
    const comment = await ownComment(id, viewer, 'modifier');
    const clean = poiClean(text, 2000);
    if (!clean) throw badRequest('Le commentaire est vide');
    await prisma.poiComment.update({ where: { id: comment.id }, data: { text: clean, updated_at: sqlTimestamp() } });
}

export async function deleteComment(/** @type {unknown} */ id, /** @type {Viewer} */ viewer) {
    const comment = await ownComment(id, viewer, 'supprimer');
    await prisma.poiComment.delete({ where: { id: comment.id } });
}
