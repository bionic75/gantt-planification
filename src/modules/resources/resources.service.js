// @ts-check
// Accès aux données : ressources, historique des taux MAD, particularités, affectations SAMU
import { prisma } from '../../db/prisma.js';
import { flag, idParam, optional, toFloat, toInt } from '../../db/values.js';
import { badRequest, notFound } from '../../lib/http-error.js';
import { isEmail, parseEmailLines } from '../../lib/email.js';

export const today = () => new Date().toISOString().split('T')[0];
const OPEN_END = '9999-12-31';

/** Chaîne obligatoire : une valeur absente est refusée par la base (comme l'ancien SQL) */
const required = (/** @type {unknown} */ v) => (v === null || v === undefined ? /** @type {any} */ (null) : String(v));

// ---------- Ressources ----------

/**
 * Comptes experts rattachés à des ressources, par ressource (jointure « ressource ← comptes experts »)
 * @param {number[]} resourceIds
 */
async function expertsByResource(resourceIds) {
    const experts = await prisma.user.findMany({
        where: { is_expert: 1, resource_id: { in: resourceIds } },
        orderBy: { id: 'asc' }
    });
    /** @type {Map<number, typeof experts>} */
    const map = new Map();
    for (const u of experts) {
        const id = /** @type {number} */ (u.resource_id);
        map.set(id, [...(map.get(id) || []), u]);
    }
    return map;
}

/** Ressources avec l'email du compte expert, qui prime sur celui de la ressource (une ligne par compte expert) */
export async function listResources() {
    const resources = await prisma.resource.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }] });
    const experts = await expertsByResource(resources.map(r => r.id));
    return resources.flatMap(r =>
        (experts.get(r.id) || [null]).map(u => ({
            ...r,
            user_email: u ? u.email : null,
            user_id: u ? u.id : null,
            email: (u && u.email) || r.email
        }))
    );
}

/** Ressources rattachées à un établissement (carte des experts) */
export async function listExpertsMap() {
    const resources = await prisma.resource.findMany({
        where: { AND: [{ es_rattachement: { not: null } }, { es_rattachement: { not: '' } }] },
        select: { id: true, nom: true, prenom: true, trigramme: true, es_rattachement: true, samu: true },
        orderBy: { id: 'asc' }
    });
    const experts = await expertsByResource(resources.map(r => r.id));
    return resources.flatMap(r =>
        (experts.get(r.id) || [null]).map(u => ({ ...r, profile_photo: u ? u.profile_photo : null }))
    );
}

/**
 * @param {Record<string, any>} data
 * @param {number} createdBy
 */
export async function createResource(data, createdBy) {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } =
        data;
    const { astreinte_volontaire, astreinte_date_activation, is_mad_volante, date_fin_mad, jours_max_mad } = data;
    const { astreinte_ho, astreinte_apd } = data;

    if (!nom || !prenom || !trigramme || !samu) throw badRequest('Champs obligatoires manquants');
    if (!is_mad_volante && !taux) throw badRequest('Champs obligatoires manquants');
    if (is_mad_volante && (!date_fin_mad || !jours_max_mad)) {
        throw badRequest('Date de fin et jours max obligatoires pour une MAD volante');
    }
    checkEmail(email);
    const tauxValue = is_mad_volante ? 0 : parseFloat(taux);
    if (!Number.isFinite(tauxValue)) throw badRequest('Taux invalide');

    const { id } = await prisma.resource.create({
        data: {
            nom: String(nom),
            prenom: String(prenom),
            trigramme: String(trigramme),
            email: optional(email),
            telephone: optional(telephone),
            taux: tauxValue,
            samu: String(samu),
            date_debut: optional(date_debut),
            date_fin: optional(date_fin),
            es_rattachement: optional(es_rattachement),
            fonction: optional(fonction),
            astreinte_volontaire: flag(astreinte_volontaire),
            astreinte_ho: flag(astreinte_ho),
            astreinte_apd: flag(astreinte_apd),
            astreinte_date_activation: optional(astreinte_date_activation),
            is_mad_volante: flag(is_mad_volante),
            date_fin_mad: optional(date_fin_mad),
            jours_max_mad: toInt(jours_max_mad)
        }
    });

    // Période initiale de l'historique MAD (une erreur ici n'annule pas la création)
    await prisma.resourceMadHistory
        .create({
            data: {
                resource_id: id,
                taux: toFloat(taux),
                date_debut: optional(date_debut) || today(),
                date_fin: null,
                created_by: createdBy
            }
        })
        .catch(err => console.error('Erreur création historique MAD:', err));

    return id;
}

/** Adresse e-mail de la ressource : vide ou syntaxe valide */
const checkEmail = (/** @type {unknown} */ email) => {
    if (typeof email === 'string' && email.trim() && !isEmail(email)) {
        throw badRequest(`Adresse e-mail invalide : ${email.trim()}`);
    }
};

/** Contacts RH : une adresse valide par ligne ; renvoie la liste normalisée (sans ligne vide ni doublon) ou null */
const checkContactsRh = (/** @type {unknown} */ text) => {
    const { valid, invalid } = parseEmailLines(text);
    if (invalid.length) throw badRequest(`Contacts RH : adresse(s) e-mail invalide(s) : ${invalid.join(', ')}`);
    return valid.length ? valid.join('\n') : null;
};

/**
 * @param {string | number} id
 * @param {Record<string, any>} data
 */
export async function updateResource(id, data) {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } =
        data;
    const {
        contacts_rh,
        astreinte_volontaire,
        astreinte_ho,
        astreinte_apd,
        astreinte_date_activation,
        is_mad_volante,
        date_fin_mad,
        jours_max_mad
    } = data;
    const resourceId = idParam(id);
    checkEmail(email);
    const contactsRh = checkContactsRh(contacts_rh);

    await prisma.resource.updateMany({
        where: { id: resourceId },
        data: {
            nom: required(nom),
            prenom: required(prenom),
            trigramme: required(trigramme),
            email: optional(email),
            telephone: optional(telephone),
            taux: is_mad_volante ? 0 : parseFloat(taux) || 0,
            samu: required(samu),
            date_debut: optional(date_debut),
            date_fin: optional(date_fin),
            es_rattachement: optional(es_rattachement),
            fonction: optional(fonction),
            contacts_rh: contactsRh,
            astreinte_volontaire: flag(astreinte_volontaire),
            astreinte_ho: flag(astreinte_ho),
            astreinte_apd: flag(astreinte_apd),
            astreinte_date_activation: optional(astreinte_date_activation),
            is_mad_volante: flag(is_mad_volante),
            date_fin_mad: optional(date_fin_mad),
            jours_max_mad: toInt(jours_max_mad)
        }
    });
    // Une ressource volontaire aux astreintes (HNO ou HO) doit avoir un compte expert
    if (astreinte_volontaire || astreinte_ho) {
        await prisma.user.updateMany({ where: { resource_id: resourceId }, data: { is_expert: 1 } }).catch(() => {});
    }
}

/** Supprime la ressource et ses données rattachées (historique MAD, affectations SAMU, planning) */
export async function deleteResource(/** @type {string | number} */ id) {
    const resource_id = idParam(id);
    await prisma.resource.deleteMany({ where: { id: resource_id } });
    await Promise.all([
        prisma.resourceMadParticularite.deleteMany({ where: { resource_id } }),
        prisma.resourceMadHistory.deleteMany({ where: { resource_id } }),
        prisma.resourceSamuAssignment.deleteMany({ where: { resource_id } })
    ]).catch(err => console.error('Erreur suppression données ressource:', err));
    await prisma.scheduleData
        .deleteMany({ where: { resource_id } })
        .catch(err => console.error('Erreur suppression schedule:', err));
}

/** Bascule actif / inactif ; renvoie le nouvel état */
export async function toggleResource(/** @type {string | number} */ id) {
    const resource = await prisma.resource.findUnique({
        where: { id: idParam(id) },
        select: { id: true, actif: true }
    });
    if (!resource) throw notFound('Ressource non trouvée');
    const actif = resource.actif === 1 ? 0 : 1;
    await prisma.resource.update({ where: { id: resource.id }, data: { actif } });
    return actif;
}

/** Types d'astreinte déclarables par une ressource : colonne de la table resources */
const ASTREINTE_COLUMNS = /** @type {const} */ ({
    hno: 'astreinte_volontaire',
    ho: 'astreinte_ho',
    apd: 'astreinte_apd'
});

/**
 * Déclaration d'une ressource pour un type d'astreinte : HO (heures ouvrées), HNO (heures non ouvrées) ou APD
 * (accompagnement post démarrage). HNO et HO impliquent le profil expert pour les comptes rattachés.
 * @param {string | number} id
 * @param {boolean} enabled
 * @param {string} [type] 'hno' (défaut), 'ho' ou 'apd'
 */
export async function setAstreinteVolontaire(id, enabled, type = 'hno') {
    const column = ASTREINTE_COLUMNS[/** @type {keyof typeof ASTREINTE_COLUMNS} */ (type)];
    if (!column) throw badRequest("Type d'astreinte inconnu (ho, hno ou apd)");
    const resourceId = idParam(id);
    await prisma.resource.updateMany({ where: { id: resourceId }, data: { [column]: flag(enabled) } });
    if (enabled && type !== 'apd') {
        await prisma.user.updateMany({ where: { resource_id: resourceId }, data: { is_expert: 1 } }).catch(() => {});
    }
}

// ---------- Affectations SAMU (principal / secondaire) ----------

const SAMU_ASSIGNMENT_FIELDS = { id: true, resource_id: true, samu: true, role: true };

export function listAllSamuAssignments() {
    return prisma.resourceSamuAssignment.findMany({
        select: SAMU_ASSIGNMENT_FIELDS,
        orderBy: [{ samu: 'asc' }, { id: 'asc' }]
    });
}

export function listSamuAssignments(/** @type {string | number} */ resourceId) {
    return prisma.resourceSamuAssignment.findMany({
        where: { resource_id: idParam(resourceId) },
        select: SAMU_ASSIGNMENT_FIELDS,
        orderBy: [{ samu: 'asc' }, { id: 'asc' }]
    });
}

/**
 * Remplace toutes les affectations SAMU d'une ressource. Un SAMU cité deux fois n'est retenu qu'une fois
 * (première occurrence, principal avant secondaire).
 * @param {string | number} resourceId
 * @param {unknown} principal
 * @param {unknown} secondaire
 */
export async function replaceSamuAssignments(resourceId, principal, secondaire) {
    const resource_id = idParam(resourceId);
    /** @type {Map<string, string>} */
    const bySamu = new Map();
    for (const [list, role] of /** @type {const} */ ([
        [principal, 'principal'],
        [secondaire, 'secondaire']
    ])) {
        for (const samu of Array.isArray(list) ? list : []) {
            const name = typeof samu === 'string' ? samu.trim() : '';
            if (name && !bySamu.has(name)) bySamu.set(name, role);
        }
    }
    await prisma.$transaction([
        prisma.resourceSamuAssignment.deleteMany({ where: { resource_id } }),
        prisma.resourceSamuAssignment.createMany({
            data: [...bySamu].map(([samu, role]) => ({ resource_id, samu, role }))
        })
    ]);
}

// ---------- Historique des taux MAD ----------

export function listMadHistory(/** @type {string | number} */ resourceId) {
    return prisma.resourceMadHistory.findMany({
        where: { resource_id: idParam(resourceId) },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
}

/**
 * Refuse une période qui partage au moins un jour avec une autre (des périodes contiguës sont admises)
 * @param {Array<{ date_debut: string, date_fin: string | null }>} others
 * @param {string} start
 * @param {string | null | undefined} end
 */
function assertNoMadOverlap(others, start, end) {
    const thisEnd = end || OPEN_END;
    for (const other of others) {
        const overlapStart = start > other.date_debut ? start : other.date_debut;
        const otherEnd = other.date_fin || OPEN_END;
        const overlapEnd = thisEnd < otherEnd ? thisEnd : otherEnd;
        if (overlapStart <= overlapEnd) {
            throw badRequest(
                `Chevauchement de dates détecté avec la période ${other.date_debut} - ${other.date_fin || 'en cours'}`
            );
        }
    }
}

/** Le taux courant de la ressource suit la période MAD en cours */
async function syncCurrentRate(
    /** @type {number} */ resourceId,
    /** @type {number} */ taux,
    /** @type {string} */ start,
    /** @type {string | null | undefined} */ end
) {
    const now = today();
    if (start <= now && (!end || end >= now)) {
        await prisma.resource.updateMany({ where: { id: resourceId }, data: { taux } });
    }
}

/**
 * @param {string | number} resourceId
 * @param {{ taux?: unknown, date_debut?: string, date_fin?: string }} data
 * @param {number} createdBy
 */
export async function addMadPeriod(resourceId, { taux, date_debut, date_fin }, createdBy) {
    if (taux === undefined || !date_debut) throw badRequest('Taux et date de début requis');
    const resource_id = idParam(resourceId);
    const start = String(date_debut);
    const end = optional(date_fin);

    assertNoMadOverlap(await listMadHistory(resource_id), start, end);
    const { id } = await prisma.resourceMadHistory.create({
        data: { resource_id, taux: toFloat(taux), date_debut: start, date_fin: end, created_by: createdBy }
    });
    await syncCurrentRate(resource_id, toFloat(taux), start, end);
    return id;
}

/**
 * @param {string | number} resourceId
 * @param {string | number} historyId
 * @param {{ taux?: unknown, date_debut: string, date_fin?: string }} data
 */
export async function updateMadPeriod(resourceId, historyId, { taux, date_debut, date_fin }) {
    const resource_id = idParam(resourceId);
    const id = idParam(historyId);
    const start = required(date_debut);
    const end = optional(date_fin);

    const others = await prisma.resourceMadHistory.findMany({ where: { resource_id, id: { not: id } } });
    assertNoMadOverlap(others, start, end);
    await prisma.resourceMadHistory.updateMany({
        where: { id, resource_id },
        data: { taux: taux === undefined ? /** @type {any} */ (null) : toFloat(taux), date_debut: start, date_fin: end }
    });
    await syncCurrentRate(resource_id, toFloat(taux), start, end);
}

/** Supprime une période MAD et ses particularités ; la dernière période ne peut pas être supprimée */
export async function deleteMadPeriod(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ historyId
) {
    const resource_id = idParam(resourceId);
    const id = idParam(historyId);
    if ((await prisma.resourceMadHistory.count({ where: { resource_id } })) <= 1) {
        throw badRequest('Impossible de supprimer le dernier taux MAD');
    }
    await prisma.resourceMadParticularite.deleteMany({ where: { mad_history_id: id } });
    await prisma.resourceMadHistory.deleteMany({ where: { id, resource_id } });
}

// ---------- Particularités MAD (taux temporaire à l'intérieur d'une période) ----------

export function listParticularites(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ historyId
) {
    return prisma.resourceMadParticularite.findMany({
        where: { resource_id: idParam(resourceId), mad_history_id: idParam(historyId) },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
}

/** Particularités de la même période qui chevauchent [start, end] */
function findParticulariteOverlaps(
    /** @type {number} */ resource_id,
    /** @type {number} */ mad_history_id,
    /** @type {string} */ start,
    /** @type {string} */ end,
    excludeId = /** @type {number | null} */ (null)
) {
    return prisma.resourceMadParticularite.findMany({
        where: {
            resource_id,
            mad_history_id,
            ...(excludeId !== null ? { id: { not: excludeId } } : {}),
            OR: [
                { date_debut: { lte: start }, date_fin: { gte: start } },
                { date_debut: { lte: end }, date_fin: { gte: end } },
                { date_debut: { gte: start, lte: end } }
            ]
        }
    });
}

/**
 * @param {string | number} resourceId
 * @param {string | number} historyId
 * @param {{ taux?: unknown, date_debut?: string, date_fin?: string, motif?: string }} data
 * @param {number} createdBy
 */
export async function addParticularite(resourceId, historyId, { taux, date_debut, date_fin, motif }, createdBy) {
    if (taux === undefined || !date_debut || !date_fin) {
        throw badRequest('Taux, date de début et date de fin requis');
    }
    const resource_id = idParam(resourceId);
    const mad_history_id = idParam(historyId);
    const start = String(date_debut);
    const end = String(date_fin);

    const parent = await prisma.resourceMadHistory.findFirst({ where: { id: mad_history_id, resource_id } });
    if (!parent) throw notFound('Période MAD non trouvée');
    if (start < parent.date_debut || (parent.date_fin && end > parent.date_fin)) {
        throw badRequest('Les dates doivent être dans la période MAD parente');
    }
    if ((await findParticulariteOverlaps(resource_id, mad_history_id, start, end)).length > 0) {
        throw badRequest('Chevauchement de dates détecté avec une particularité existante');
    }

    const { id } = await prisma.resourceMadParticularite.create({
        data: {
            resource_id,
            mad_history_id,
            taux: toFloat(taux),
            date_debut: start,
            date_fin: end,
            motif: optional(motif),
            created_by: createdBy
        }
    });
    return id;
}

/**
 * @param {string | number} resourceId
 * @param {string | number} historyId
 * @param {string | number} particulariteId
 * @param {{ taux?: unknown, date_debut: string, date_fin: string, motif?: string }} data
 */
export async function updateParticularite(
    resourceId,
    historyId,
    particulariteId,
    { taux, date_debut, date_fin, motif }
) {
    const id = idParam(particulariteId);
    const start = required(date_debut);
    const end = required(date_fin);
    const overlaps = await findParticulariteOverlaps(idParam(resourceId), idParam(historyId), start, end, id);
    if (overlaps.length > 0) throw badRequest('Chevauchement de dates détecté');

    await prisma.resourceMadParticularite.updateMany({
        where: { id },
        data: {
            taux: taux === undefined ? /** @type {any} */ (null) : toFloat(taux),
            date_debut: start,
            date_fin: end,
            motif: optional(motif)
        }
    });
}

export async function deleteParticularite(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ particulariteId
) {
    await prisma.resourceMadParticularite.deleteMany({
        where: { id: idParam(particulariteId), resource_id: idParam(resourceId) }
    });
}

/**
 * Taux MAD applicable à une date : particularité, sinon période de l'historique, sinon taux de la ressource
 * @param {string | number} resourceId
 * @param {string} date AAAA-MM-JJ
 */
export async function getEffectiveMadRate(resourceId, date) {
    const resource_id = idParam(resourceId);
    const particularite = await prisma.resourceMadParticularite.findFirst({
        where: { resource_id, date_debut: { lte: date }, date_fin: { gte: date } },
        orderBy: { id: 'asc' }
    });
    if (particularite) return { taux: particularite.taux, source: 'particularite', particularite };

    const history = await prisma.resourceMadHistory.findFirst({
        where: { resource_id, date_debut: { lte: date }, OR: [{ date_fin: null }, { date_fin: { gte: date } }] },
        orderBy: { id: 'asc' }
    });
    if (history) return { taux: history.taux, source: 'history', history };

    const resource = await prisma.resource.findUnique({ where: { id: resource_id }, select: { taux: true } });
    return { taux: resource ? resource.taux : 0, source: 'resource' };
}
