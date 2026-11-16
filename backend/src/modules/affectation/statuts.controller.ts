import * as svc from './statuts.service.ts';

import type { Request, Response } from 'express';

export const list = async (_req: Request, res: Response) =>
    res.json({ statuses: await svc.listStatuses(), palette: svc.PALETTE_STATUTS, patterns: svc.MOTIFS_STATUTS });
export const map = async (_req: Request, res: Response) => res.json(await svc.deploymentMap());
export const create = async (req: Request, res: Response) => res.json(await svc.createStatus(req.body || {}));
export const update = async (req: Request, res: Response) =>
    res.json(await svc.updateStatus(req.params.id, req.body || {}));
export const remove = async (req: Request, res: Response) => {
    await svc.deleteStatus(req.params.id);
    res.json({ success: true });
};
export const reorder = async (req: Request, res: Response) =>
    res.json({ statuses: await svc.reorderStatuses((req.body || {}).ids) });
export const setSamuStatus = async (req: Request, res: Response) => {
    await svc.setSamuStatus(req.params.locationId, req.body || {});
    res.json({ success: true });
};
export const removeSamu = async (req: Request, res: Response) => {
    await svc.removeSamu(req.params.locationId);
    res.json({ success: true });
};
export const importMes = async (_req: Request, res: Response) =>
    res.json({ imported: await svc.importMisesEnService() });
