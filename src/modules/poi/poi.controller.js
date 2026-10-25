// @ts-check
import { logUserAction } from '../../services/action-log.js';
import * as service from './poi.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const viewer = (/** @type {Request} */ req) => ({
    userId: /** @type {number} */ (req.session.userId),
    isAdmin: req.session.activeProfile === 'admin'
});

/** Recherche dans la base de référence : 502 si elle est indisponible */
export async function searchPlaces(/** @type {Request} */ req, /** @type {Response} */ res) {
    try {
        res.json(await service.searchPlaces(req.query.q, req.query.location_id));
    } catch (/** @type {any} */ e) {
        res.status(502).json({ error: e.message || 'Base de référence indisponible' });
    }
}

export async function meta(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.getMeta());
}

export async function list(/** @type {Request} */ req, /** @type {Response} */ res) {
    const v = viewer(req);
    res.json({ pois: await service.listPois(v, req.query), isAdmin: v.isAdmin, userId: v.userId });
}

export async function detail(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.getPoi(req.params.id, viewer(req)));
}

export async function route(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.getRoute(req.params.id));
}

export async function create(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id, name, category } = await service.createPoi(req.body || {}, viewer(req).userId);
    logUserAction(req, "TripAdVisor : ajout d'un lieu", { id, nom: name, categorie: category });
    res.json({ success: true, id });
}

export async function update(/** @type {Request} */ req, /** @type {Response} */ res) {
    const name = await service.updatePoi(req.params.id, req.body || {}, viewer(req));
    logUserAction(req, "TripAdVisor : modification d'un lieu", { id: Number(req.params.id), nom: name });
    res.json({ success: true });
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    const name = await service.deletePoi(req.params.id, viewer(req));
    logUserAction(req, "TripAdVisor : suppression d'un lieu", { id: Number(req.params.id), nom: name });
    res.json({ success: true });
}

export async function rate(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.ratePoi(req.params.id, (req.body || {}).rating, viewer(req).userId);
    res.json({ success: true });
}

export async function deleteRating(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.deleteRating(req.params.id, req.query.user_id, viewer(req));
    res.json({ success: true });
}

export async function addComment(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, id: await service.addComment(req.params.id, (req.body || {}).text, viewer(req).userId) });
}

export async function updateComment(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.updateComment(req.params.cid, (req.body || {}).text, viewer(req));
    res.json({ success: true });
}

export async function deleteComment(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.deleteComment(req.params.cid, viewer(req));
    res.json({ success: true });
}
