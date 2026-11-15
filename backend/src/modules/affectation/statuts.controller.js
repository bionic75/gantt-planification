// @ts-check
import * as svc from './statuts.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

export const list = async (/** @type {Request} */ _req, /** @type {Response} */ res) =>
    res.json({ statuses: await svc.listStatuses(), palette: svc.PALETTE_STATUTS });
export const map = async (/** @type {Request} */ _req, /** @type {Response} */ res) =>
    res.json(await svc.deploymentMap());
export const create = async (/** @type {Request} */ req, /** @type {Response} */ res) =>
    res.json(await svc.createStatus(req.body || {}));
export const update = async (/** @type {Request} */ req, /** @type {Response} */ res) =>
    res.json(await svc.updateStatus(req.params.id, req.body || {}));
export const remove = async (/** @type {Request} */ req, /** @type {Response} */ res) => {
    await svc.deleteStatus(req.params.id);
    res.json({ success: true });
};
export const reorder = async (/** @type {Request} */ req, /** @type {Response} */ res) =>
    res.json({ statuses: await svc.reorderStatuses((req.body || {}).ids) });
export const setSamuStatus = async (/** @type {Request} */ req, /** @type {Response} */ res) => {
    await svc.setSamuStatus(req.params.locationId, req.body || {});
    res.json({ success: true });
};
export const removeSamu = async (/** @type {Request} */ req, /** @type {Response} */ res) => {
    await svc.removeSamu(req.params.locationId);
    res.json({ success: true });
};
export const importMes = async (/** @type {Request} */ _req, /** @type {Response} */ res) =>
    res.json({ imported: await svc.importMisesEnService() });
