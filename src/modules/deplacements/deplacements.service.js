// @ts-check
// Déplacements des AMOA / CED et bons de commande (BDC) : unités d'œuvre (UO) commandées et consommées
import { prisma } from '../../db/prisma.js';
import { idParam, toInt } from '../../db/values.js';
import { badRequest, forbidden, notFound } from '../../lib/http-error.js';

/** @typedef {{ userId: number, isAdmin: boolean }} Viewer */

/** Comptes par identifiant */
async function usersById(/** @type {Array<number | null>} */ ids) {
    const users = await prisma.user.findMany({
        where: { id: { in: /** @type {number[]} */ ([...new Set(ids.filter(id => id != null))]) } },
        select: { id: true, nom: true, prenom: true }
    });
    return new Map(users.map(u => [u.id, u]));
}

async function bonsById(/** @type {Array<number | null>} */ ids) {
    const bons = await prisma.bonCommande.findMany({
        where: { id: { in: /** @type {number[]} */ ([...new Set(ids.filter(id => id != null))]) } }
    });
    return new Map(bons.map(b => [b.id, b]));
}

/** UO consommées par bon de commande */
async function consumedUo() {
    const sums = await prisma.deplacement.groupBy({
        by: ['bon_commande_id'],
        where: { bon_commande_id: { not: null } },
        _sum: { nb_uo: true }
    });
    return new Map(sums.map(s => [s.bon_commande_id, s._sum.nb_uo || 0]));
}

/** Nombre d'UO d'un déplacement : jours entre les deux dates, inclus */
const countUo = (/** @type {string} */ debut, /** @type {string} */ fin) =>
    Math.ceil(Math.abs(new Date(fin).getTime() - new Date(debut).getTime()) / (1000 * 60 * 60 * 24)) + 1;

const byDateDesc = { orderBy: [{ date_debut: /** @type {const} */ ('desc') }, { id: /** @type {const} */ ('asc') }] };

// ---------- Bons de commande ----------

export async function listBons() {
    const bons = await prisma.bonCommande.findMany(byDateDesc);
    const users = await usersById(bons.map(b => b.created_by));
    return bons.map(b => {
        const u = b.created_by != null ? users.get(b.created_by) : undefined;
        return { ...b, creator_nom: u?.nom ?? null, creator_prenom: u?.prenom ?? null };
    });
}

/** Création ; le numéro de BDC (intitulé) est unique, casse ASCII ignorée */
export async function createBon(/** @type {any} */ body, /** @type {number} */ userId) {
    const { intitule, titulaire, date_debut, date_fin, nb_uo } = body;
    if (!intitule || !titulaire || !date_debut || !date_fin || !nb_uo) throw badRequest('Tous les champs sont requis');
    const lower = (/** @type {string} */ s) => s.replace(/[A-Z]/g, c => c.toLowerCase());
    const existing = await prisma.bonCommande.findMany({ select: { intitule: true } });
    if (existing.some(b => lower(b.intitule) === lower(String(intitule))))
        throw badRequest('Ce numéro de CBDC existe déjà');
    const bon = await prisma.bonCommande.create({
        data: {
            intitule: String(intitule),
            titulaire: String(titulaire).toUpperCase(),
            date_debut: String(date_debut),
            date_fin: String(date_fin),
            nb_uo: /** @type {number} */ (toInt(nb_uo)),
            created_by: userId
        }
    });
    return bon.id;
}

/** Modification (le bon redevient actif) ; sans effet sur un bon inexistant */
export async function updateBon(/** @type {unknown} */ id, /** @type {any} */ body) {
    const { intitule, titulaire, date_debut, date_fin, nb_uo, solde } = body;
    if (!(await prisma.bonCommande.findUnique({ where: { id: idParam(id) }, select: { id: true } }))) return;
    if (intitule == null || date_debut == null || date_fin == null || nb_uo == null) {
        throw badRequest('Tous les champs sont requis');
    }
    await prisma.bonCommande.updateMany({
        where: { id: idParam(id) },
        data: {
            intitule: String(intitule),
            titulaire: titulaire ? String(titulaire).toUpperCase() : null,
            date_debut: String(date_debut),
            date_fin: String(date_fin),
            nb_uo: /** @type {number} */ (toInt(nb_uo)),
            actif: 1,
            solde: solde ? 1 : 0
        }
    });
}

/** Suppression : les déplacements du bon sont désaffectés ; renvoie leur nombre */
export async function deleteBon(/** @type {unknown} */ id) {
    const bonId = idParam(id);
    const [{ count }] = await prisma.$transaction([
        prisma.deplacement.updateMany({ where: { bon_commande_id: bonId }, data: { bon_commande_id: null } }),
        prisma.bonCommande.deleteMany({ where: { id: bonId } })
    ]);
    return count;
}

/** Suivi des bons : UO commandées et consommées, bon cible d'une régularisation */
export async function bonsReport() {
    const [bons, consumed] = await Promise.all([prisma.bonCommande.findMany(byDateDesc), consumedUo()]);
    const targets = await bonsById(bons.map(b => b.regularisation_cible_bdc_id));
    return bons.map(b => ({
        id: b.id,
        intitule: b.intitule,
        titulaire: b.titulaire,
        date_debut: b.date_debut,
        date_fin: b.date_fin,
        uo_commandees: b.nb_uo,
        actif: b.actif,
        solde: b.solde,
        regularisation_cible_bdc_id: b.regularisation_cible_bdc_id,
        uo_consommees: consumed.get(b.id) || 0,
        regularisation_cible_intitule:
            (b.regularisation_cible_bdc_id != null && targets.get(b.regularisation_cible_bdc_id)?.intitule) || null
    }));
}

// ---------- Déplacements ----------

/**
 * Déplacements avec bon de commande, AMOA / CED et créateur
 * @param {any} where
 */
async function deplacementsWithRefs(where) {
    const rows = await prisma.deplacement.findMany({ where, ...byDateDesc });
    const [users, bons] = await Promise.all([
        usersById(rows.flatMap(d => [d.user_id, d.amoa_ced_id])),
        bonsById(rows.map(d => d.bon_commande_id))
    ]);
    return rows.map(d => ({
        d,
        user: users.get(d.user_id),
        amoa: d.amoa_ced_id != null ? users.get(d.amoa_ced_id) : undefined,
        bc: d.bon_commande_id != null ? bons.get(d.bon_commande_id) : undefined
    }));
}

/** Tous les déplacements (reporting), éventuellement d'un bon de commande */
export async function listDeplacements(/** @type {unknown} */ bonCommandeId) {
    const rows = await deplacementsWithRefs(bonCommandeId ? { bon_commande_id: idParam(bonCommandeId) } : {});
    return rows.map(({ d, user, amoa, bc }) => ({
        ...d,
        user_nom: user?.nom ?? null,
        user_prenom: user?.prenom ?? null,
        bon_commande_intitule: bc?.intitule ?? null,
        bon_commande_titulaire: bc?.titulaire ?? null,
        amoa_ced_nom: amoa?.nom ?? null,
        amoa_ced_prenom: amoa?.prenom ?? null
    }));
}

/** Déplacements saisis par l'utilisateur (tous pour un administrateur) */
export async function listMine(/** @type {Viewer} */ viewer) {
    const rows = await deplacementsWithRefs(viewer.isAdmin ? {} : { user_id: viewer.userId });
    return rows.map(({ d, user, amoa, bc }) => ({
        ...d,
        bon_commande_intitule: bc?.intitule ?? null,
        bon_commande_titulaire: bc?.titulaire ?? null,
        bc_uo_commandees: bc?.nb_uo ?? null,
        amoa_ced_nom: amoa?.nom ?? null,
        amoa_ced_prenom: amoa?.prenom ?? null,
        creator_nom: user?.nom ?? null,
        creator_prenom: user?.prenom ?? null
    }));
}

export async function getDeplacement(/** @type {unknown} */ id) {
    const d = await prisma.deplacement.findUnique({ where: { id: idParam(id) } });
    if (!d) throw notFound('Déplacement non trouvé');
    const bc =
        d.bon_commande_id != null ? await prisma.bonCommande.findUnique({ where: { id: d.bon_commande_id } }) : null;
    return { ...d, bon_commande_intitule: bc?.intitule ?? null, bon_commande_titulaire: bc?.titulaire ?? null };
}

/** Champs saisis d'un déplacement : UO calculées d'après les dates */
function deplacementData(/** @type {any} */ b) {
    const { amoa_ced_id, date_debut, date_fin, samu, ville, commentaire } = b;
    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville) throw badRequest('Tous les champs sont requis');
    return {
        amoa_ced_id: toInt(amoa_ced_id),
        date_debut: String(date_debut),
        date_fin: String(date_fin),
        samu: String(samu),
        ville: String(ville).toUpperCase(),
        nb_uo: countUo(date_debut, date_fin),
        commentaire: commentaire ? String(commentaire).trim() : null
    };
}

/**
 * Création ; marquée « à régulariser » si le bon de commande est en surconsommation
 * @returns {Promise<{ id: number, nb_uo: number, bon_commande_id: unknown, a_regulariser?: boolean }>}
 */
export async function createDeplacement(/** @type {any} */ body, /** @type {number} */ userId) {
    const data = deplacementData(body);
    const bcId = body.bon_commande_id || null;
    if (!bcId) {
        const d = await prisma.deplacement.create({
            data: { ...data, user_id: userId, bon_commande_id: null, a_regulariser: 0 }
        });
        return { id: d.id, nb_uo: data.nb_uo, bon_commande_id: bcId };
    }
    const bc = await prisma.bonCommande.findUnique({ where: { id: idParam(bcId) } });
    if (!bc) throw notFound('Bon de commande introuvable');
    // Comportement historique conservé : le contrôle lit un champ « uo_commandees » absent du bon de commande
    // (le nombre d'UO commandées est nb_uo), le déplacement n'est donc jamais marqué « à régulariser »
    const uoCommandees = /** @type {any} */ (bc).uo_commandees;
    const consumed = (await consumedUo()).get(bc.id) || 0;
    const enSurconsommation = consumed + data.nb_uo > uoCommandees;
    const d = await prisma.deplacement.create({
        data: { ...data, user_id: userId, bon_commande_id: bc.id, a_regulariser: enSurconsommation ? 1 : 0 }
    });
    return { id: d.id, nb_uo: data.nb_uo, bon_commande_id: bcId, a_regulariser: enSurconsommation };
}

/** Déplacement modifiable par son auteur ou un administrateur */
async function ownDeplacement(/** @type {unknown} */ id, /** @type {Viewer} */ viewer) {
    const d = await prisma.deplacement.findUnique({ where: { id: idParam(id) } });
    if (!d) throw notFound('Déplacement non trouvé');
    if (d.user_id !== viewer.userId && !viewer.isAdmin) throw forbidden('Non autorisé');
    return d;
}

export async function updateDeplacement(
    /** @type {unknown} */ id,
    /** @type {any} */ body,
    /** @type {Viewer} */ viewer
) {
    const data = deplacementData(body);
    const d = await ownDeplacement(id, viewer);
    await prisma.deplacement.update({
        where: { id: d.id },
        data: { ...data, bon_commande_id: toInt(body.bon_commande_id) || null }
    });
}

export async function deleteDeplacement(/** @type {unknown} */ id, /** @type {Viewer} */ viewer) {
    const d = await ownDeplacement(id, viewer);
    await prisma.deplacement.delete({ where: { id: d.id } });
}

/** Régularisation : transfert vers un autre bon de commande non soldé couvrant les dates du déplacement */
export async function regulariser(/** @type {unknown} */ id, /** @type {any} */ body, /** @type {Viewer} */ viewer) {
    const { ancien_bon_commande_id, nouveau_bon_commande_id } = body;
    if (!ancien_bon_commande_id || !nouveau_bon_commande_id) throw badRequest('Les deux bons de commande sont requis');
    if (ancien_bon_commande_id === nouveau_bon_commande_id) {
        throw badRequest('Les deux bons de commande doivent être différents');
    }
    const d = await ownDeplacement(id, viewer);
    const bc = await prisma.bonCommande.findFirst({
        where: { id: idParam(nouveau_bon_commande_id), OR: [{ solde: null }, { solde: 0 }] }
    });
    if (!bc) throw notFound('Nouveau bon de commande non trouvé ou soldé');
    if (d.date_debut < bc.date_debut || d.date_fin > bc.date_fin) {
        throw badRequest(
            `Les dates du déplacement (${d.date_debut} - ${d.date_fin}) ne sont pas dans la période du nouveau bon de commande (${bc.date_debut} - ${bc.date_fin})`
        );
    }
    // Comportement historique conservé : « uo_commandees » est absent du bon de commande, le calcul des UO
    // disponibles donne NaN et ne bloque donc jamais le transfert
    const uoDisponibles = /** @type {any} */ (bc).uo_commandees - ((await consumedUo()).get(bc.id) || 0);
    if (uoDisponibles < d.nb_uo) {
        throw badRequest(
            `Le nouveau bon de commande n'a pas assez d'UO disponibles (${uoDisponibles} disponibles, ${d.nb_uo} nécessaires)`
        );
    }
    await prisma.deplacement.update({ where: { id: d.id }, data: { bon_commande_id: bc.id, a_regulariser: 0 } });
    return d.nb_uo;
}

/** Réaffectation vers un autre bon de commande, sans contrôle des UO, tracée dans le commentaire */
export async function reaffecter(/** @type {unknown} */ id, /** @type {unknown} */ nouveauBonId) {
    if (!nouveauBonId) throw badRequest('Le nouveau bon de commande est requis');
    const d = await prisma.deplacement.findUnique({ where: { id: idParam(id) } });
    if (!d) throw notFound('Déplacement non trouvé');
    const bc = await prisma.bonCommande.findUnique({ where: { id: idParam(nouveauBonId) } });
    if (!bc) throw notFound('Nouveau bon de commande non trouvé');
    const ancien =
        d.bon_commande_id != null ? await prisma.bonCommande.findUnique({ where: { id: d.bon_commande_id } }) : null;
    const ancienRef = ancien?.intitule || 'N/A';
    const trace = `Réaffectation du BDC n° ${ancienRef} vers le BDC n° ${bc.intitule}`;
    // Le commentaire existant est conservé après la trace, sauf s'il s'agit déjà d'une trace de réaffectation
    const commentaire =
        d.commentaire && d.commentaire.trim() && !d.commentaire.startsWith('Réaffectation du BDC')
            ? `${trace} | ${d.commentaire}`
            : trace;
    await prisma.deplacement.update({
        where: { id: d.id },
        data: { bon_commande_id: bc.id, a_regulariser: 0, commentaire }
    });
    return { ancien: ancienRef, nouveau: bc.intitule, nb_uo: d.nb_uo };
}

/**
 * Régularisation technique : ligne de déplacement sur le BDC cible absorbant la surconsommation du BDC source
 * (au nom du premier administrateur), BDC source marqué comme régularisé
 */
export async function regularisationTechnique(/** @type {any} */ body, /** @type {number} */ userId) {
    const { source_bdc_id, cible_bdc_id, nb_uo, date_debut, commentaire } = body;
    if (!source_bdc_id || !cible_bdc_id || !nb_uo || !date_debut) {
        throw badRequest('Champs manquants : source_bdc_id, cible_bdc_id, nb_uo, date_debut requis');
    }
    const [source, cible] = await Promise.all([
        prisma.bonCommande.findUnique({ where: { id: idParam(source_bdc_id) } }),
        prisma.bonCommande.findUnique({ where: { id: idParam(cible_bdc_id) } })
    ]);
    if (!source) throw notFound('BDC source introuvable');
    if (!cible) throw notFound('BDC cible introuvable');
    const adminUser = await prisma.user.findFirst({
        where: { is_admin: 1 },
        select: { id: true, resource_id: true },
        orderBy: { id: 'asc' }
    });
    // Date de fin : date de début + nb_uo - 1 jours
    const endDate = new Date(date_debut + 'T00:00:00');
    endDate.setDate(endDate.getDate() + parseInt(nb_uo) - 1);
    const dateFin = endDate.toISOString().split('T')[0];
    const d = await prisma.$transaction(async tx => {
        const created = await tx.deplacement.create({
            data: {
                user_id: adminUser ? adminUser.id : userId,
                amoa_ced_id: adminUser ? adminUser.resource_id : null,
                date_debut: String(date_debut),
                date_fin: dateFin,
                samu: '',
                ville: '',
                bon_commande_id: cible.id,
                nb_uo: /** @type {number} */ (toInt(nb_uo)),
                a_regulariser: 0,
                commentaire:
                    commentaire || `Régularisation du bon de commande ${source.intitule} qui était en surconsommation`,
                regularisation_source_bdc_id: source.id
            }
        });
        await tx.bonCommande.update({ where: { id: source.id }, data: { regularisation_cible_bdc_id: cible.id } });
        return created;
    });
    return { id: d.id, source: source.intitule, cible: cible.intitule, date_debut, date_fin: dateFin };
}

/** SAMU des ressources (liste de choix) */
export async function listSamu() {
    const rows = await prisma.resource.findMany({
        where: { samu: { not: '' } },
        select: { samu: true },
        distinct: ['samu'],
        orderBy: { samu: 'asc' }
    });
    return rows.map(r => r.samu);
}
