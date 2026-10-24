// @ts-check
import * as service from './locations.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

export async function list(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ locations: await service.listLocations() });
}

export async function create(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, id: await service.createLocation(req.body) });
}

export async function update(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.updateLocation(req.params.id, req.body);
    res.json({ success: true });
}

export async function usage(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.locationUsage(req.params.id));
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.deleteLocation(req.params.id);
    res.json({ success: true });
}

export async function importCsv(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { inserted, conflicts } = await service.importLocations(req.body.rows);
    res.json({ success: true, inserted, conflicts });
}

export async function resolveImport(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, updated: await service.resolveImportConflicts(req.body.resolutions) });
}
