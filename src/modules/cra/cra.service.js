// @ts-check
// Comptes rendus d'activité (CRA) : données, listes et circuit de validation.
// Statuts : a_completer → soumis (expert) → vise_n1 → vise_n2 (administrateurs) → diffuse (RH).
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { badRequest, forbidden, HttpError, notFound } from '../../lib/http-error.js';

/** @typedef {Awaited<ReturnType<typeof prisma.cra.findUnique>> & {}} Cra */
/** @typedef {{ userId: number, name: string, email: string, ip?: string, userAgent?: string }} Signer */

export const LINE_TYPES = ['astreinte', 'hno', 'activite_courante'];

/** CRA non supprimés (corbeille) */
export const notDeleted = { OR: [{ deleted: null }, { deleted: 0 }] };
/** CRA non archivés */
const notArchived = { OR: [{ archived: null }, { archived: 0 }] };

// ---------- Outils ----------

/** « Prénom Nom » comme la concaténation SQL historique : null si l'un des deux manque */
export const joinNames = (/** @type {string | null | undefined} */ a, /** @type {string | null | undefined} */ b) =>
    a == null || b == null ? null : `${a} ${b}`;

/** Bornes du mois d'un CRA (« AAAA-MM-01 » et « AAAA-MM-31 », comparaisons de chaînes) */
export function monthBounds(/** @type {{ annee: number, mois: number }} */ cra) {
    const prefix = `${String(cra.annee).padStart(4, '0')}-${String(cra.mois).padStart(2, '0')}`;
    return { start: `${prefix}-01`, end: `${prefix}-31` };
}

/** Libellé du mois (« mars 2025 ») */
export const monthName = (/** @type {{ annee: number | string, mois: number | string }} */ cra) =>
    new Date(Number(cra.annee), Number(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
    });

/** Tri : clés successives, null en premier (ordre SQLite) */
function sortBy(/** @type {any[]} */ rows, /** @type {Array<[string, 'asc' | 'desc']>} */ keys) {
    return rows.sort((a, b) => {
        for (const [k, dir] of keys) {
            if (a[k] === b[k]) continue;
            const cmp = a[k] == null ? -1 : b[k] == null ? 1 : a[k] < b[k] ? -1 : 1;
            return dir === 'asc' ? cmp : -cmp;
        }
        return 0;
    });
}

/** Comptes (id → compte) */
async function usersById(/** @type {Array<number | null | undefined>} */ ids) {
    const unique = [...new Set(ids.filter(id => id != null))];
    const users = await prisma.user.findMany({ where: { id: { in: /** @type {number[]} */ (unique) } } });
    return new Map(users.map(u => [u.id, u]));
}

export async function getCraConfig() {
    const row = await prisma.setting.findUnique({ where: { key: 'automation_4_config' } });
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return null;
    }
}

/** La saisie des astreintes/HNO d'un mois est-elle verrouillée par un CRA soumis ou au-delà ? */
export async function checkCraLock(
    /** @type {unknown} */ userId,
    /** @type {unknown} */ mois,
    /** @type {unknown} */ annee
) {
    const cra = await prisma.cra.findFirst({
        where: { user_id: idParam(userId), mois: idParam(mois), annee: idParam(annee), ...notDeleted },
        select: { statut: true },
        orderBy: { id: 'asc' }
    });
    return { locked: !!cra && cra.statut !== 'a_completer', statut: cra ? cra.statut : null };
}

// ---------- Lecture ----------

export function getCra(/** @type {unknown} */ id) {
    return prisma.cra.findUnique({ where: { id: idParam(id) } });
}

/** CRA non supprimé */
export function getActiveCra(/** @type {unknown} */ id) {
    return prisma.cra.findFirst({ where: { id: idParam(id), ...notDeleted } });
}

export function getSignatures(/** @type {number} */ craId) {
    return prisma.craSignature.findMany({ where: { cra_id: craId }, orderBy: [{ rang: 'asc' }, { id: 'asc' }] });
}

/** Lignes d'astreinte/HNO commençant dans le mois du CRA (document signé, PDF) */
export function getMonthLines(/** @type {{ user_id: number, annee: number, mois: number }} */ cra) {
    const { start, end } = monthBounds(cra);
    return prisma.astreinteHno.findMany({
        where: { user_id: cra.user_id, date_debut: { gte: start, lte: end } },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
}

/**
 * Listes « Mes CRA » selon le profil : admin (tous les CRA actifs), RH (CRA diffusés), expert (les siens)
 * @param {string | undefined} profile
 * @param {number} userId
 */
export async function listForProfile(profile, userId) {
    const isAdmin = profile === 'admin';
    const isRh = profile === 'rh';
    const where =
        isAdmin || isRh
            ? { AND: [notArchived, notDeleted], ...(isRh ? { statut: 'diffuse' } : {}) }
            : { user_id: userId };
    const cras = await prisma.cra.findMany({ where, orderBy: [{ annee: 'desc' }, { mois: 'desc' }, { id: 'asc' }] });
    const users = await usersById(cras.flatMap(c => [c.user_id, c.vise_n1_by, c.vise_n2_by]));
    return cras.map(c => {
        const u1 = c.vise_n1_by != null ? users.get(c.vise_n1_by) : undefined;
        const u2 = c.vise_n2_by != null ? users.get(c.vise_n2_by) : undefined;
        const visas = { vise_n1_nom: joinNames(u1?.nom, u1?.prenom), vise_n2_nom: joinNames(u2?.nom, u2?.prenom) };
        if (!isAdmin && !isRh) return { ...c, ...visas };
        const u = users.get(c.user_id);
        return { ...c, expert_nom: joinNames(u?.prenom, u?.nom), ...visas };
    });
}

/**
 * Liste d'administration (CRA archivés exclus, ou uniquement eux) avec le nombre de lignes du mois
 * @param {{ user_id?: unknown, statut?: unknown, mois?: unknown, annee?: unknown }} filters
 * @param {{ archived?: boolean }} [options]
 */
export async function adminList({ user_id, statut, mois, annee }, { archived = false } = {}) {
    /** @type {any[]} */
    const and = archived ? [{ archived: 1 }, notDeleted] : [notArchived];
    if (user_id) and.push({ user_id: idParam(user_id) });
    if (statut && !archived) {
        const statuts = String(statut)
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        and.push({ statut: { in: statuts } });
    }
    if (mois) and.push({ mois: idParam(mois) });
    if (annee) and.push({ annee: idParam(annee) });

    const cras = await prisma.cra.findMany({ where: { AND: and } });
    const users = await usersById(cras.flatMap(c => [c.user_id, c.vise_n1_by, c.vise_n2_by]));
    const lines = await prisma.astreinteHno.findMany({
        where: { user_id: { in: [...new Set(cras.map(c => c.user_id))] } },
        select: { user_id: true, date_debut: true, date_fin: true }
    });
    const rows = cras.map(c => {
        const { start, end } = monthBounds(c);
        const u = users.get(c.user_id);
        const u1 = c.vise_n1_by != null ? users.get(c.vise_n1_by) : undefined;
        const u2 = c.vise_n2_by != null ? users.get(c.vise_n2_by) : undefined;
        return {
            ...c,
            expert_nom: joinNames(u?.prenom, u?.nom),
            vise_n1_nom: joinNames(u1?.prenom, u1?.nom),
            vise_n2_nom: joinNames(u2?.prenom, u2?.nom),
            nb_lignes: lines.filter(l => l.user_id === c.user_id && l.date_debut <= end && l.date_fin >= start).length,
            _nom: u ? u.nom : null
        };
    });
    return sortBy(rows, [
        ['annee', 'desc'],
        ['mois', 'desc'],
        ['_nom', 'asc'],
        ['id', 'asc']
    ]).map(({ _nom, ...row }) => row);
}

/** CRA dans la corbeille */
export async function listDeleted() {
    const cras = await prisma.cra.findMany({ where: { deleted: 1 } });
    const users = await usersById(cras.map(c => c.user_id));
    const rows = cras.map(c => {
        const u = users.get(c.user_id);
        return { ...c, expert_nom: joinNames(u?.prenom, u?.nom), _nom: u ? u.nom : null };
    });
    return sortBy(rows, [
        ['annee', 'desc'],
        ['mois', 'desc'],
        ['_nom', 'asc'],
        ['id', 'asc']
    ]).map(({ _nom, ...row }) => row);
}

/** CRA détaillé : expert, visas, lignes d'astreinte/HNO du mois (bornées au mois) et signatures */
export async function getDetail(/** @type {unknown} */ id) {
    const cra = await getCra(id);
    if (!cra) return null;
    const users = await usersById([cra.user_id, cra.vise_n1_by, cra.vise_n2_by]);
    const u = users.get(cra.user_id);
    const u1 = cra.vise_n1_by != null ? users.get(cra.vise_n1_by) : undefined;
    const u2 = cra.vise_n2_by != null ? users.get(cra.vise_n2_by) : undefined;
    const resourceId = u ? u.resource_id : null;
    const resource =
        resourceId != null
            ? await prisma.resource.findUnique({
                  where: { id: resourceId },
                  select: { es_rattachement: true, samu: true }
              })
            : null;

    const { start, end } = monthBounds(cra);
    // Lignes qui chevauchent le mois, ramenées à la portion comprise dans le mois
    const lines = await prisma.astreinteHno.findMany({
        where: { user_id: cra.user_id, date_debut: { lte: end }, date_fin: { gte: start } },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
    return {
        ...cra,
        expert_nom: joinNames(u?.nom, u?.prenom),
        // Ressource du compte de l'expert (prime sur celle enregistrée sur le CRA)
        resource_id: resourceId,
        es_rattachement: resource ? resource.es_rattachement : null,
        expert_samu: resource ? resource.samu : null,
        vise_n1_nom: joinNames(u1?.nom, u1?.prenom),
        vise_n2_nom: joinNames(u2?.nom, u2?.prenom),
        astreintes_hno: lines.map(l => ({
            ...l,
            date_debut: l.date_debut < start ? start : l.date_debut,
            date_fin: l.date_fin > end ? end : l.date_fin
        })),
        signatures: await getSignatures(cra.id)
    };
}

/** Experts volontaires aux astreintes (une ligne par compte expert rattaché) */
export async function listAstreinteExperts() {
    const resources = await prisma.resource.findMany({
        where: { astreinte_volontaire: 1, actif: 1 },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
    const experts = await prisma.user.findMany({
        where: { is_expert: 1, resource_id: { in: resources.map(r => r.id) } },
        orderBy: { id: 'asc' }
    });
    return resources.flatMap(r => {
        const linked = experts.filter(u => u.resource_id === r.id);
        return (linked.length ? linked : [null]).map(u => ({
            resource_id: r.id,
            nom: r.nom,
            prenom: r.prenom,
            samu: r.samu,
            es_rattachement: r.es_rattachement,
            email: r.email,
            user_id: u ? u.id : null
        }));
    });
}

/**
 * Comptes rattachés à une ressource volontaire aux astreintes
 * @param {{ activeOnly: boolean, fallbackToResourceName: boolean }} options
 *   activeOnly : ressources actives uniquement ; fallbackToResourceName : nom de la ressource si celui du compte est vide
 */
export async function listCraExperts({ activeOnly, fallbackToResourceName }) {
    const resources = await prisma.resource.findMany({
        where: { astreinte_volontaire: 1, ...(activeOnly ? { actif: 1 } : {}) },
        select: { id: true, nom: true, prenom: true }
    });
    const byId = new Map(resources.map(r => [r.id, r]));
    const users = await prisma.user.findMany({
        where: { resource_id: { in: resources.map(r => r.id) } },
        select: { id: true, nom: true, prenom: true, resource_id: true }
    });
    const rows = users.map(u => {
        const r = byId.get(/** @type {number} */ (u.resource_id));
        return {
            user_id: u.id,
            nom: fallbackToResourceName ? u.nom || r?.nom : u.nom,
            prenom: fallbackToResourceName ? u.prenom || r?.prenom : u.prenom
        };
    });
    return sortBy(rows, [
        ['nom', 'asc'],
        ['prenom', 'asc'],
        ['user_id', 'asc']
    ]);
}

// ---------- Création ----------

/**
 * CRA du mois pour un compte expert : existant (hors corbeille) ou créé
 * @returns {Promise<{ id: number, statut: string, created: boolean }>}
 */
export async function findOrCreate(
    /** @type {unknown} */ userId,
    /** @type {unknown} */ mois,
    /** @type {unknown} */ annee
) {
    const where = { user_id: idParam(userId), mois: idParam(mois), annee: idParam(annee) };
    const existing = await prisma.cra.findFirst({ where: { ...where, ...notDeleted }, orderBy: { id: 'asc' } });
    if (existing) return { id: existing.id, statut: existing.statut, created: false };

    const user = await prisma.user.findUnique({
        where: { id: where.user_id },
        select: { id: true, resource_id: true }
    });
    const resource =
        user?.resource_id != null
            ? await prisma.resource.findUnique({ where: { id: user.resource_id }, select: { id: true } })
            : null;
    if (!user || !resource) throw notFound('Utilisateur introuvable');
    const cra = await prisma.cra.create({
        data: {
            user_id: user.id,
            resource_id: resource.id,
            mois: where.mois,
            annee: where.annee,
            statut: 'a_completer'
        }
    });
    return { id: cra.id, statut: 'a_completer', created: true };
}

/**
 * Compte expert avec sa ressource (lancement manuel d'un CRA)
 * @returns {Promise<{ user_id: number, resource_id: number, is_mad_volante: number | null } | null>}
 */
export async function findExpertWithResource(/** @type {unknown} */ userId) {
    const user = await prisma.user.findFirst({ where: { id: idParam(userId), is_expert: 1 } });
    if (!user || user.resource_id == null) return null;
    const resource = await prisma.resource.findUnique({ where: { id: user.resource_id } });
    if (!resource) return null;
    return { user_id: user.id, resource_id: resource.id, is_mad_volante: resource.is_mad_volante };
}

/** Création d'un CRA « à compléter » ; refusée s'il en existe déjà un (hors corbeille) pour le mois */
export async function createForMonth(
    /** @type {{ user_id: number, resource_id: number }} */ expert,
    /** @type {unknown} */ mois,
    /** @type {unknown} */ annee
) {
    const month = { mois: idParam(mois), annee: idParam(annee) };
    const existing = await prisma.cra.findFirst({ where: { user_id: expert.user_id, ...month, ...notDeleted } });
    if (existing) {
        const label = existing.statut === 'diffuse' ? 'signé' : 'en cours de traitement';
        throw new HttpError(409, `Un CRA ${label} existe déjà pour cet expert sur cette période.`);
    }
    return prisma.cra.create({
        data: { user_id: expert.user_id, resource_id: expert.resource_id, ...month, statut: 'a_completer' }
    });
}

/** Destinataires RH par ressource : { resourceId: [emails] } (remplace la liste de chaque ressource citée) */
export async function saveRhRecipients(/** @type {Record<string, unknown>} */ recipients) {
    for (const [resourceId, emails] of Object.entries(recipients)) {
        const resource_id = idParam(resourceId);
        await prisma.craRhRecipient.deleteMany({ where: { resource_id } });
        const seen = new Set();
        for (const email of /** @type {unknown[]} */ (emails)) {
            if (typeof email !== 'string' || !email.includes('@')) continue;
            const value = email.trim();
            if (seen.has(value)) continue;
            seen.add(value);
            await prisma.craRhRecipient.create({ data: { resource_id, email: value } });
        }
    }
}

// ---------- Archivage et corbeille ----------

export async function setArchived(/** @type {unknown} */ id, /** @type {boolean} */ archived) {
    await prisma.cra.updateMany({ where: { id: idParam(id) }, data: { archived: archived ? 1 : 0 } });
}

/** Mise à la corbeille (statut et archivage conservés pour la restauration) */
export async function softDelete(/** @type {unknown} */ id) {
    const cra = await getActiveCra(id);
    if (!cra) throw notFound('CRA introuvable');
    await prisma.cra.update({
        where: { id: cra.id },
        data: { deleted: 1, pre_delete_statut: cra.statut, pre_delete_archived: cra.archived }
    });
}

export async function restoreDeleted(/** @type {unknown} */ id) {
    const cra = await prisma.cra.findFirst({ where: { id: idParam(id), deleted: 1 } });
    if (!cra) throw notFound('CRA supprimé introuvable');
    await prisma.cra.update({
        where: { id: cra.id },
        data: {
            deleted: 0,
            statut: cra.pre_delete_statut || 'a_completer',
            archived: cra.pre_delete_archived || 0,
            pre_delete_statut: null,
            pre_delete_archived: null
        }
    });
}

/** Suppression définitive d'un CRA de la corbeille */
export async function purge(/** @type {unknown} */ id) {
    const { count } = await prisma.cra.deleteMany({ where: { id: idParam(id), deleted: 1 } });
    if (count === 0) throw notFound('CRA non trouvé ou non supprimé');
}

// ---------- Saisie ----------

/**
 * Remplace les lignes d'astreinte/HNO qui chevauchent le mois du CRA
 * @param {Cra} cra
 * @param {unknown} lignes
 */
export async function replaceLines(cra, lignes) {
    const list = Array.isArray(lignes) ? lignes : [];
    if (list.some(l => !LINE_TYPES.includes(l?.type)))
        throw badRequest(`Type de ligne invalide (${LINE_TYPES.join(', ')})`);
    const { start, end } = monthBounds(cra);
    await prisma.$transaction([
        prisma.astreinteHno.deleteMany({
            where: { user_id: cra.user_id, date_debut: { lte: end }, date_fin: { gte: start } }
        }),
        prisma.astreinteHno.createMany({
            data: list.map(l => ({
                user_id: cra.user_id,
                type: l.type,
                date_debut: /** @type {string} */ (l.date_debut ?? null),
                date_fin: /** @type {string} */ (l.date_fin ?? null),
                heure_debut: l.heure_debut || null,
                heure_fin: l.heure_fin || null,
                samu: l.samu || null,
                objet: /** @type {string} */ (l.objet ?? null)
            }))
        })
    ]);
    return list.length;
}

// ---------- Circuit de validation ----------

/** @param {number} craId @param {number} rang @param {Signer} signer @param {string} signedAt */
function signature(craId, rang, signer, signedAt) {
    return prisma.craSignature.create({
        data: {
            cra_id: craId,
            rang,
            signer_user_id: signer.userId,
            signer_name: signer.name,
            signer_email: signer.email || '',
            signed_at: signedAt,
            ip_address: signer.ip ?? null,
            user_agent: signer.userAgent || '',
            token_used: 1
        }
    });
}

/** Soumission par l'expert (signature de rang 1) */
export async function submit(
    /** @type {unknown} */ id,
    /** @type {Signer} */ expert,
    /** @type {unknown} */ commentaire
) {
    const cra = await prisma.cra.findFirst({ where: { id: idParam(id), user_id: expert.userId } });
    if (!cra) throw notFound('CRA introuvable');
    if (cra.statut !== 'a_completer') throw badRequest('CRA déjà soumis');
    const now = new Date().toISOString();
    await prisma.cra.update({
        where: { id: cra.id },
        data: {
            statut: 'soumis',
            submitted_at: now,
            commentaire_expert: commentaire ? String(commentaire) : null,
            modifie_admin_at: null,
            modifie_admin_nom: null
        }
    });
    await signature(cra.id, 1, expert, now);
    return cra;
}

/** « Rien à déclarer » : soumission directe par l'expert d'un CRA à compléter */
export async function declareNothing(/** @type {unknown} */ id, /** @type {Signer} */ expert) {
    const now = new Date().toISOString();
    const { count } = await prisma.cra.updateMany({
        where: { id: idParam(id), user_id: expert.userId, statut: 'a_completer' },
        data: {
            rien_a_declarer: 1,
            statut: 'soumis',
            submitted_at: now,
            modifie_admin_at: null,
            modifie_admin_nom: null
        }
    });
    if (!count) throw forbidden("Seul l'expert concerné peut déclarer « rien à déclarer » sur un CRA à compléter.");
    await signature(idParam(id), 1, expert, now);
}

/** Rappel par l'expert d'un CRA soumis, avant tout visa */
export async function recall(/** @type {unknown} */ id, /** @type {number} */ userId) {
    const cra = await getCra(id);
    if (!cra) throw notFound('CRA introuvable');
    if (cra.user_id !== userId) throw forbidden('Non autorisé');
    if (cra.statut !== 'soumis') throw badRequest('Le CRA ne peut être rappelé que si son statut est "soumis"');
    await prisma.$transaction([
        prisma.cra.update({
            where: { id: cra.id },
            data: { statut: 'a_completer', submitted_at: null, refuse_at: sqlTimestamp() }
        }),
        prisma.craSignature.deleteMany({ where: { cra_id: cra.id, rang: 1 } })
    ]);
    return cra;
}

const VISA = {
    n1: { expected: 'soumis', next: 'vise_n1', rang: 2 },
    n2: { expected: 'vise_n1', next: 'vise_n2', rang: 3 }
};
/** Niveau de visa ; tout autre niveau est traité comme le visa N2 (comportement historique) */
const visaLevel = (/** @type {string} */ niveau) => (niveau === 'n1' ? VISA.n1 : VISA.n2);

/** Visa N1 ou N2 par un administrateur ; renvoie le CRA avant visa */
export async function visa(/** @type {unknown} */ id, /** @type {string} */ niveau, /** @type {Signer} */ admin) {
    const cra = await getCra(id);
    if (!cra) throw notFound('CRA introuvable');
    const level = visaLevel(niveau);
    if (cra.statut !== level.expected) throw badRequest(`Statut incorrect (${cra.statut})`);
    const now = new Date().toISOString();
    await prisma.cra.update({
        where: { id: cra.id },
        data:
            level === VISA.n1
                ? { statut: level.next, vise_n1_at: now, vise_n1_by: admin.userId }
                : { statut: level.next, vise_n2_at: now, vise_n2_by: admin.userId }
    });
    await signature(cra.id, level.rang, admin, now);
    return cra;
}

/** Refus par un viseur : retour à compléter, visas et signatures effacés ; renvoie le CRA avant refus */
export async function refuse(
    /** @type {unknown} */ id,
    /** @type {string} */ niveau,
    /** @type {number} */ adminId,
    /** @type {string} */ commentaire
) {
    const cra = await getCra(id);
    if (!cra) throw notFound('CRA introuvable');
    const level = visaLevel(niveau);
    if (cra.statut !== level.expected) throw badRequest(`Statut incorrect (${cra.statut})`);
    await prisma.$transaction([
        prisma.cra.update({
            where: { id: cra.id },
            data: {
                statut: 'a_completer',
                submitted_at: null,
                commentaire_refus: commentaire,
                refuse_at: new Date().toISOString(),
                refuse_by: adminId,
                vise_n1_at: null,
                vise_n1_by: null,
                vise_n2_at: null,
                vise_n2_by: null
            }
        }),
        prisma.craSignature.deleteMany({ where: { cra_id: cra.id } })
    ]);
    return cra;
}

/** Correction par un administrateur : retour à compléter, visas, refus et signatures effacés */
export async function adminCorrection(/** @type {unknown} */ id) {
    const cra = await getActiveCra(id);
    if (!cra) throw notFound('CRA introuvable');
    if (cra.statut === 'vise_n2' || cra.statut === 'diffuse') {
        throw badRequest('Modification impossible : les 3 visas ont été obtenus ou le CRA a déjà été diffusé.');
    }
    await prisma.$transaction([
        prisma.cra.update({
            where: { id: cra.id },
            data: {
                statut: 'a_completer',
                submitted_at: null,
                vise_n1_at: null,
                vise_n1_by: null,
                vise_n2_at: null,
                vise_n2_by: null,
                refuse_at: null,
                commentaire_refus: null
            }
        }),
        prisma.craSignature.deleteMany({ where: { cra_id: cra.id } })
    ]);
}

/**
 * CRA modifié ou renvoyé par un administrateur : retour chez l'expert (visas remis à zéro, marquage).
 * L'administrateur ne soumet jamais à la place de l'expert.
 * @returns {Promise<boolean>} true si l'expert doit être prévenu (pas déjà prévenu dans les 30 dernières minutes)
 */
export async function markAdminModified(
    /** @type {Cra} */ cra,
    /** @type {string} */ adminNom,
    /** @type {boolean} */ force
) {
    const recent = !force && cra.modifie_admin_at && Date.now() - Date.parse(cra.modifie_admin_at) < 30 * 60 * 1000;
    await prisma.$transaction([
        prisma.cra.update({
            where: { id: cra.id },
            data: {
                modifie_admin_at: new Date().toISOString(),
                modifie_admin_nom: adminNom,
                submitted_at: null,
                vise_n1_at: null,
                vise_n1_by: null,
                vise_n2_at: null,
                vise_n2_by: null
            }
        }),
        prisma.craSignature.deleteMany({ where: { cra_id: cra.id } })
    ]);
    return !recent;
}

/** Coordonnées d'un compte (notifications) */
export function getUserContact(/** @type {number} */ userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { prenom: true, nom: true, email: true } });
}

// ---------- Documents et diffusion ----------

/**
 * CRA avec l'expert (« Prénom Nom ») et la ressource de son compte, pour les documents et la diffusion
 * @param {any} where
 */
export async function getCraWithExpert(where) {
    const cra = await prisma.cra.findFirst({ where, orderBy: { id: 'asc' } });
    if (!cra) return null;
    const user = await prisma.user.findUnique({ where: { id: cra.user_id } });
    const resource =
        user?.resource_id != null ? await prisma.resource.findUnique({ where: { id: user.resource_id } }) : null;
    return {
        ...cra,
        expert_nom: joinNames(user?.prenom, user?.nom),
        expert_nom_seul: user ? user.nom : null,
        expert_prenom: user ? user.prenom : null,
        expert_email: user ? user.email : null,
        /** Ressource du compte de l'expert */
        user_resource_id: resource ? resource.id : null,
        es_rattachement: resource ? resource.es_rattachement : null,
        contacts_rh: resource ? resource.contacts_rh : null
    };
}

/** Établissement de rattachement d'une ressource */
export async function getEsRattachement(/** @type {number | null} */ resourceId) {
    if (resourceId == null) return null;
    const r = await prisma.resource.findUnique({ where: { id: resourceId }, select: { es_rattachement: true } });
    return r ? r.es_rattachement : null;
}

export function setPdfFilename(/** @type {number} */ craId, /** @type {string} */ pdfFilename) {
    return prisma.cra.update({ where: { id: craId }, data: { pdf_filename: pdfFilename } });
}

/** Destinataires RH enregistrés pour une ressource */
export function listRhRecipients(/** @type {number} */ resourceId) {
    return prisma.craRhRecipient.findMany({
        where: { resource_id: resourceId },
        select: { email: true, nom: true },
        orderBy: { id: 'asc' }
    });
}

/**
 * Journal de diffusion avec l'état d'envoi de chaque lot d'emails
 * (statut le plus avancé du lot, dernier message d'erreur et date de traitement)
 */
export async function getDiffusionLog(/** @type {unknown} */ craId) {
    const logs = await prisma.craDiffusionLog.findMany({
        where: { cra_id: idParam(craId) },
        orderBy: [{ sent_at: 'asc' }, { id: 'asc' }]
    });
    const batchIds = [...new Set(logs.map(l => l.email_batch_id).filter(b => b != null))];
    const emails = await prisma.emailQueue.findMany({
        where: { batch_id: { in: /** @type {string[]} */ (batchIds) } },
        select: { batch_id: true, status: true, error_message: true, processed_at: true }
    });
    const max = (/** @type {any} */ a, /** @type {any} */ b) => (a == null ? b : b == null ? a : a > b ? a : b);
    /** @type {Map<string, { status: any, error_message: any, processed_at: any }>} */
    const byBatch = new Map();
    for (const e of emails) {
        const agg = byBatch.get(e.batch_id) || { status: null, error_message: null, processed_at: null };
        byBatch.set(e.batch_id, {
            status: max(agg.status, e.status),
            error_message: max(agg.error_message, e.error_message),
            processed_at: max(agg.processed_at, e.processed_at)
        });
    }
    return logs.map(l => {
        const eq = (l.email_batch_id != null && byBatch.get(l.email_batch_id)) || null;
        return {
            id: l.id,
            recipient_email: l.recipient_email,
            recipient_name: l.recipient_name,
            recipient_type: l.recipient_type,
            sent_at: l.sent_at,
            email_batch_id: l.email_batch_id,
            email_status: eq ? eq.status : null,
            error_message: eq ? eq.error_message : null,
            processed_at: eq ? eq.processed_at : null
        };
    });
}

export function getDiffusionLogEntry(/** @type {unknown} */ logId) {
    return prisma.craDiffusionLog.findUnique({ where: { id: idParam(logId) } });
}

/** Destinataires (hors expert) des diffusions précédentes, sans doublon, dans l'ordre d'envoi */
export async function listPreviousRhRecipients(/** @type {number} */ craId) {
    const logs = await prisma.craDiffusionLog.findMany({
        where: { cra_id: craId, OR: [{ recipient_type: null }, { recipient_type: { not: 'expert' } }] },
        select: { recipient_email: true, recipient_name: true },
        orderBy: { id: 'asc' }
    });
    const seen = new Set();
    return logs.filter(l => {
        const key = JSON.stringify([l.recipient_email, l.recipient_name]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Nouvel envoi d'une entrée du journal de diffusion */
export function markLogResent(/** @type {number} */ logId, /** @type {string} */ batchId) {
    return prisma.craDiffusionLog.update({
        where: { id: logId },
        data: { email_batch_id: batchId, sent_at: sqlTimestamp() }
    });
}

/**
 * Diffusion effectuée : journal (RH ES, DRH ANS, expert), statut et PDF diffusé
 * @param {number} craId
 * @param {{ diffusedAt: string, pdfFilename: string, entries: Array<{ email: string, nom: string, type: string, batchId: string }> }} diffusion
 */
export async function markDiffused(craId, { diffusedAt, pdfFilename, entries }) {
    await prisma.$transaction([
        prisma.craDiffusionLog.createMany({
            data: entries.map(e => ({
                cra_id: craId,
                recipient_email: e.email,
                recipient_name: e.nom,
                recipient_type: e.type,
                sent_at: diffusedAt,
                email_batch_id: e.batchId
            }))
        }),
        prisma.cra.update({
            where: { id: craId },
            data: { statut: 'diffuse', diffuse_at: diffusedAt, pdf_filename: pdfFilename }
        })
    ]);
}

// ---------- Automatisation n°4 (CRA mensuels) ----------

/**
 * Comptes experts des ressources actives volontaires aux astreintes
 * @param {number | null} [userId] limite à un compte
 */
export async function listAutomationExperts(userId = null) {
    const resources = await prisma.resource.findMany({
        where: { astreinte_volontaire: 1, actif: 1 },
        orderBy: { id: 'asc' }
    });
    const users = await prisma.user.findMany({
        where: { is_expert: 1, resource_id: { in: resources.map(r => r.id) }, ...(userId ? { id: userId } : {}) },
        orderBy: { id: 'asc' }
    });
    return resources.flatMap(r =>
        users
            .filter(u => u.resource_id === r.id)
            .map(u => ({
                resource_id: r.id,
                nom: r.nom,
                prenom: r.prenom,
                samu: r.samu,
                user_id: u.id,
                email: u.email
            }))
    );
}

/** CRA du mois de l'expert, créé « à compléter » s'il n'existe pas (y compris dans la corbeille) */
export function ensureMonthlyCra(
    /** @type {{ user_id: number, resource_id: number }} */ expert,
    /** @type {number} */ mois,
    /** @type {number} */ annee
) {
    return prisma.cra.upsert({
        where: { user_id_mois_annee: { user_id: expert.user_id, mois, annee } },
        create: { user_id: expert.user_id, resource_id: expert.resource_id, mois, annee, statut: 'a_completer' },
        update: {},
        select: { id: true, statut: true }
    });
}

export const countByStatut = (/** @type {string} */ statut) => prisma.cra.count({ where: { statut } });
