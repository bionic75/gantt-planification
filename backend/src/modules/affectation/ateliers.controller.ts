import { prisma } from '../../db/prisma.ts';
import { badRequest } from '../../lib/http-error.ts';
import { logUserAction } from '../../services/action-log.ts';
import * as svc from './ateliers.service.ts';

import type { Request, Response } from 'express';

const author = (req: Request) => ({
    userId: req.session.userId as number,
    name: `${req.session.prenom || ''} ${req.session.nom || ''}`.trim() || req.session.username || 'Utilisateur'
});

export async function meta(_req: Request, res: Response) {
    res.json(await svc.meta());
}

export async function simulate(req: Request, res: Response) {
    res.json(await svc.simulate(req.body));
}

export async function list(_req: Request, res: Response) {
    res.json({ retroplannings: await svc.list() });
}

export async function save(req: Request, res: Response) {
    const r = await svc.save(req.body, author(req));
    logUserAction(req, r.created ? 'Ateliers métier : rétroplanning créé' : 'Ateliers métier : rétroplanning modifié', {
        samu: r.samu_name
    });
    res.json({ success: true, ...r });
}

export async function remove(req: Request, res: Response) {
    const samu = await svc.remove(req.params.id);
    logUserAction(req, 'Ateliers métier : rétroplanning supprimé', { samu });
    res.json({ success: true });
}

export async function send(req: Request, res: Response) {
    try {
        const r = await svc.send(req.params.id, req.body || {});
        logUserAction(req, 'Ateliers métier : rétroplanning diffusé par e-mail', {
            samu: r.samu_name,
            destinataires: r.sent
        });
        res.json({ success: true, ...r });
    } catch (e: any) {
        if (e.status) throw e;
        throw badRequest(`Envoi impossible : ${e.message}`);
    }
}

export async function invite(req: Request, res: Response) {
    const user = req.session.userId
        ? await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } })
        : null;
    try {
        const r = await svc.sendInvitation(req.params.id, req.params.ligne, req.body || {}, {
            name: author(req).name,
            email: user ? user.email : null
        });
        logUserAction(req, 'Ateliers métier : invitation à un atelier envoyée', {
            samu: r.samu_name,
            atelier: r.jalon,
            destinataires: r.sent
        });
        res.json({ success: true, ...r });
    } catch (e: any) {
        if (e.status) throw e;
        throw badRequest(`Envoi impossible : ${e.message}`);
    }
}
