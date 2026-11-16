import * as service from './locations.service.ts';

import type { Request, Response } from 'express';

export async function list(req: Request, res: Response) {
    res.json({ locations: await service.listLocations() });
}

export async function create(req: Request, res: Response) {
    res.json({ success: true, id: await service.createLocation(req.body) });
}

export async function update(req: Request, res: Response) {
    await service.updateLocation(req.params.id, req.body);
    res.json({ success: true });
}

export async function usage(req: Request, res: Response) {
    res.json(await service.locationUsage(req.params.id));
}

export async function remove(req: Request, res: Response) {
    await service.deleteLocation(req.params.id);
    res.json({ success: true });
}

export async function importCsv(req: Request, res: Response) {
    const { inserted, conflicts } = await service.importLocations(req.body.rows);
    res.json({ success: true, inserted, conflicts });
}

export async function resolveImport(req: Request, res: Response) {
    res.json({ success: true, updated: await service.resolveImportConflicts(req.body.resolutions) });
}
