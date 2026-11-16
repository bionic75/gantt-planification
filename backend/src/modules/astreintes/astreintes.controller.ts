import { toInt } from '../../db/values.ts';
import { badRequest, forbidden } from '../../lib/http-error.ts';
import { formatDateFR } from '../../lib/utils.ts';
import { checkCraLock } from '../cra/cra.service.ts';
import { sendTeamsNotificationFromServer } from '../notifications/notifications.service.ts';
import * as service from './astreintes.service.ts';

import type { Request, Response } from 'express';

const userId = (req: Request) => req.session.userId as number;
const isAdmin = (req: Request) => req.session.activeProfile === 'admin';
const viewer = (req: Request) => ({ userId: userId(req), isAdmin: isAdmin(req) });

/** Paramètres « utilisateur + mois » : administrateur, ou l'utilisateur lui-même */
function monthParams(req: Request, source: any) {
    const { user_id, mois, annee } = source;
    if (!user_id || !mois || !annee) throw badRequest('Paramètres manquants');
    if (!isAdmin(req) && String(req.session.userId) !== String(user_id)) throw forbidden('Accès refusé');
    return { user_id, mois, annee };
}

function requireAdminProfile(req: Request) {
    if (!isAdmin(req)) throw forbidden('Accès réservé aux administrateurs');
}

// ---------- Astreintes / HNO ----------

/** Verrouillage de la saisie par un CRA soumis */
export async function lockCheck(req: Request, res: Response) {
    const { user_id, mois, annee } = monthParams(req, req.query);
    res.json(await checkCraLock(user_id, mois, annee));
}

export async function mine(req: Request, res: Response) {
    res.json(await service.listForUser(userId(req)));
}

export async function forPlanning(req: Request, res: Response) {
    res.json(await service.listForPlanning());
}

export async function listAll(req: Request, res: Response) {
    requireAdminProfile(req);
    res.json(await service.listAll());
}

export async function experts(req: Request, res: Response) {
    requireAdminProfile(req);
    res.json(await service.listExperts());
}

/** Création : pour soi, ou pour un expert par un administrateur ; notification Teams */
export async function create(req: Request, res: Response) {
    const target = isAdmin(req) ? toInt(req.body.user_id) || userId(req) : userId(req);
    const id = await service.createLine(req.body, target);
    const { type, date_debut, date_fin, heure_debut, heure_fin } = req.body;
    sendTeamsNotificationFromServer('astreinte', {
        expert: `${req.session.prenom} ${req.session.nom}`,
        type,
        date: `${formatDateFR(date_debut)}${date_fin !== date_debut ? ' au ' + formatDateFR(date_fin) : ''}`,
        heureDebut: heure_debut,
        heureFin: heure_fin
    });
    res.json({ id, message: 'Astreinte/HNO créée' });
}

export async function update(req: Request, res: Response) {
    await service.updateLine(req.params.id, req.body, viewer(req));
    res.json({ message: 'Astreinte/HNO modifiée' });
}

export async function remove(req: Request, res: Response) {
    await service.deleteLine(req.params.id, viewer(req), {
        notFound: 'Astreinte non trouvée',
        forbidden: 'Non autorisé'
    });
    res.json({ message: 'Astreinte/HNO supprimée' });
}

/** Suppression depuis la saisie mensuelle */
export async function removeEntry(req: Request, res: Response) {
    await service.deleteLine(req.params.id, viewer(req), { notFound: 'Entrée introuvable', forbidden: 'Accès refusé' });
    res.json({ success: true });
}

/** Saisie directe d'un mois, sans CRA */
export async function listMonth(req: Request, res: Response) {
    const { user_id, mois, annee } = monthParams(req, req.query);
    res.json(await service.listMonth(user_id, mois, annee));
}

export async function replaceMonth(req: Request, res: Response) {
    const { user_id, mois, annee } = monthParams(req, req.body);
    const inserted = await service.replaceMonth(user_id, mois, annee, req.body.lignes);
    res.json({ success: true, inserted });
}

// ---------- Planning d'astreinte ----------

export async function volontaires(req: Request, res: Response) {
    res.json(await service.listVolontaires());
}

export async function setVolontaire(req: Request, res: Response) {
    await service.setVolontaire(req.params.id, !!req.body.volontaire);
    res.json({ success: true });
}

export async function disponibilites(req: Request, res: Response) {
    res.json(await service.listDisponibilites(req.params.expertId, req.params.mois));
}

export async function saveDisponibilites(req: Request, res: Response) {
    const count = await service.saveDisponibilites(req.params.expertId, req.params.mois, req.body.disponibilites);
    res.json({ success: true, count });
}

export async function indisponibilites(req: Request, res: Response) {
    res.json(await service.listIndisponibilites());
}

export async function addIndisponibilite(req: Request, res: Response) {
    res.json({ success: true, id: await service.saveIndisponibilite(req.body) });
}

export async function removeIndisponibilite(req: Request, res: Response) {
    await service.deleteIndisponibilite(req.params.id);
    res.json({ success: true });
}

export async function generate(req: Request, res: Response) {
    res.json(await service.generate(req.body.year, req.body.month));
}

export async function setSlot(req: Request, res: Response) {
    await service.setSlotResource(req.params.id, req.body.resource_id);
    res.json({ success: true });
}

export async function monthPlanning(req: Request, res: Response) {
    res.json(await service.getMonthPlanning(req.params.mois));
}
