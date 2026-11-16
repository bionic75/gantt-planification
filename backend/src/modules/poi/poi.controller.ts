import { logUserAction } from '../../services/action-log.ts';
import * as service from './poi.service.ts';

import type { Request, Response } from 'express';

const viewer = (req: Request) => ({
    userId: req.session.userId as number,
    isAdmin: req.session.activeProfile === 'admin'
});

/** Recherche dans la base de référence : 502 si elle est indisponible */
export async function searchPlaces(req: Request, res: Response) {
    try {
        res.json(await service.searchPlaces(req.query.q, req.query.location_id));
    } catch (e: any) {
        res.status(502).json({ error: e.message || 'Base de référence indisponible' });
    }
}

export async function meta(req: Request, res: Response) {
    res.json(await service.getMeta());
}

export async function list(req: Request, res: Response) {
    const v = viewer(req);
    res.json({ pois: await service.listPois(v, req.query), isAdmin: v.isAdmin, userId: v.userId });
}

export async function detail(req: Request, res: Response) {
    res.json(await service.getPoi(req.params.id, viewer(req)));
}

export async function route(req: Request, res: Response) {
    res.json(await service.getRoute(req.params.id));
}

export async function create(req: Request, res: Response) {
    const { id, name, category } = await service.createPoi(req.body || {}, viewer(req).userId);
    logUserAction(req, "TripAdVisor : ajout d'un lieu", { id, nom: name, categorie: category });
    res.json({ success: true, id });
}

export async function update(req: Request, res: Response) {
    const name = await service.updatePoi(req.params.id, req.body || {}, viewer(req));
    logUserAction(req, "TripAdVisor : modification d'un lieu", { id: Number(req.params.id), nom: name });
    res.json({ success: true });
}

export async function remove(req: Request, res: Response) {
    const name = await service.deletePoi(req.params.id, viewer(req));
    logUserAction(req, "TripAdVisor : suppression d'un lieu", { id: Number(req.params.id), nom: name });
    res.json({ success: true });
}

export async function rate(req: Request, res: Response) {
    await service.ratePoi(req.params.id, (req.body || {}).rating, viewer(req).userId);
    res.json({ success: true });
}

export async function deleteRating(req: Request, res: Response) {
    await service.deleteRating(req.params.id, req.query.user_id, viewer(req));
    res.json({ success: true });
}

export async function addComment(req: Request, res: Response) {
    res.json({ success: true, id: await service.addComment(req.params.id, (req.body || {}).text, viewer(req).userId) });
}

export async function updateComment(req: Request, res: Response) {
    await service.updateComment(req.params.cid, (req.body || {}).text, viewer(req));
    res.json({ success: true });
}

export async function deleteComment(req: Request, res: Response) {
    await service.deleteComment(req.params.cid, viewer(req));
    res.json({ success: true });
}
