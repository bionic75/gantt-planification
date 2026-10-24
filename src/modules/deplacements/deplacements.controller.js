// @ts-check
import { badRequest, forbidden } from '../../lib/http-error.js';
import * as service from './deplacements.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const viewer = (/** @type {Request} */ req) => ({
    userId: /** @type {number} */ (req.session.userId),
    isAdmin: req.session.activeProfile === 'admin'
});

// ---------- Bons de commande ----------

export async function listBons(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listBons());
}

export async function createBon(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ id: await service.createBon(req.body, viewer(req).userId), message: 'Bon de commande créé' });
}

export async function updateBon(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.updateBon(req.params.id, req.body);
    res.json({ message: 'Bon de commande modifié' });
}

/** Suppression : les déplacements du bon sont désaffectés */
export async function deleteBon(/** @type {Request} */ req, /** @type {Response} */ res) {
    const n = await service.deleteBon(req.params.id);
    if (n === 0) return res.json({ message: 'Bon de commande supprimé' });
    console.log(`✅ BC ${req.params.id} supprimé, ${n} déplacement(s) désaffecté(s)`);
    res.json({ message: 'Bon de commande supprimé', deplacements_desaffectes: n });
}

export async function bonsReport(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.bonsReport());
}

// ---------- Déplacements ----------

export async function list(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listDeplacements(req.query.bon_commande_id));
}

export async function mine(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listMine(viewer(req)));
}

export async function detail(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.getDeplacement(req.params.id));
}

export async function create(/** @type {Request} */ req, /** @type {Response} */ res) {
    const created = await service.createDeplacement(req.body, viewer(req).userId);
    const message = created.a_regulariser
        ? '⚠️ Déplacement créé - À RÉGULARISER (bon de commande en surconsommation)'
        : 'Déplacement créé';
    res.json({ ...created, message });
}

export async function update(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.updateDeplacement(req.params.id, req.body, viewer(req));
    res.json({ message: 'Déplacement modifié' });
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.deleteDeplacement(req.params.id, viewer(req));
    res.json({ message: 'Déplacement supprimé' });
}

/** Transfert vers un autre bon de commande (auteur ou administrateur) */
export async function regulariser(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id } = req.params;
    const { ancien_bon_commande_id, nouveau_bon_commande_id } = req.body;
    const nbUo = await service.regulariser(id, req.body, viewer(req));
    console.log(
        `✅ Régularisation effectuée: Déplacement ${id} transféré du BC ${ancien_bon_commande_id} vers BC ${nouveau_bon_commande_id} (${nbUo} UO)`
    );
    res.json({
        message: 'Régularisation effectuée avec succès',
        details: { deplacement_id: id, ancien_bon_commande_id, nouveau_bon_commande_id, nb_uo_transferees: nbUo }
    });
}

/** Réaffectation simple vers un autre bon de commande (administrateurs) */
export async function reaffecter(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id } = req.params;
    if (!req.body.nouveau_bon_commande_id) throw badRequest('Le nouveau bon de commande est requis');
    if (!viewer(req).isAdmin) throw forbidden('Seul un administrateur peut effectuer cette opération');
    const r = await service.reaffecter(id, req.body.nouveau_bon_commande_id);
    console.log(
        `✅ Réaffectation effectuée: Déplacement ${id} transféré de BC ${r.ancien} vers BC ${r.nouveau} (${r.nb_uo} UO)`
    );
    res.json({
        message: 'Réaffectation effectuée avec succès',
        details: {
            deplacement_id: id,
            ancien_bon_commande: r.ancien,
            nouveau_bon_commande: r.nouveau,
            nb_uo_transferees: r.nb_uo
        }
    });
}

export async function regularisationTechnique(/** @type {Request} */ req, /** @type {Response} */ res) {
    const r = await service.regularisationTechnique(req.body, viewer(req).userId);
    const { nb_uo } = req.body;
    console.log(`✅ Régularisation technique créée: BDC ${r.source} → ${r.cible}, ${nb_uo} UO, déplacement #${r.id}`);
    res.json({
        success: true,
        deplacement_id: r.id,
        source_intitule: r.source,
        cible_intitule: r.cible,
        nb_uo,
        date_debut: r.date_debut,
        date_fin: r.date_fin
    });
}

export async function listSamu(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listSamu());
}
