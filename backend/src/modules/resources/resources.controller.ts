import { forbidden } from '../../lib/http-error.ts';
import { logUserAction } from '../../services/action-log.ts';
import * as service from './resources.service.ts';

import type { Request, Response } from 'express';

const userId = (req: Request) => req.session.userId as number;

// ---------- Ressources ----------

export async function list(req: Request, res: Response) {
    res.json(await service.listResources());
}

export async function expertsMap(req: Request, res: Response) {
    res.json(await service.listExpertsMap());
}

export async function create(req: Request, res: Response) {
    const id = await service.createResource(req.body, userId(req));
    const { nom, prenom, trigramme } = req.body;
    logUserAction(req, 'Création ressource', { resourceId: id, nom, prenom, trigramme });
    res.json({ id, success: true });
}

export async function update(req: Request, res: Response) {
    const { id } = req.params;
    await service.updateResource(id, req.body);
    const { nom, prenom, trigramme } = req.body;
    logUserAction(req, 'Modification ressource', { resourceId: id, nom, prenom, trigramme });
    res.json({ success: true });
}

export async function remove(req: Request, res: Response) {
    const { id } = req.params;
    await service.deleteResource(id);
    logUserAction(req, 'Suppression ressource', { resourceId: id });
    res.json({ success: true });
}

export async function toggle(req: Request, res: Response) {
    const actif = await service.toggleResource(req.params.id);
    res.json({ success: true, actif });
}

export async function setAstreinte(req: Request, res: Response) {
    await service.setAstreinteVolontaire(req.params.id, !!req.body.hasAccess, req.body.type || 'hno');
    res.json({ success: true });
}

// ---------- Affectations SAMU ----------

export async function listAllSamuAssignments(req: Request, res: Response) {
    res.json(await service.listAllSamuAssignments());
}

export async function listSamuAssignments(req: Request, res: Response) {
    res.json(await service.listSamuAssignments(req.params.id));
}

export async function replaceSamuAssignments(req: Request, res: Response) {
    const { id } = req.params;
    const { principal, secondaire } = req.body;
    await service.replaceSamuAssignments(id, principal, secondaire);
    logUserAction(req, 'Modification affectations SAMU', { resourceId: id, principal, secondaire });
    res.json({ success: true });
}

/** L'expert modifie les affectations SAMU de sa propre ressource */
export async function replaceMySamuAssignments(req: Request, res: Response) {
    const { resourceId, activeProfile } = req.session;
    // Comme l'écran (fenêtre « Mon profil ») : réservé au profil Expert
    if (activeProfile !== 'expert') throw forbidden('Réservé au profil Expert');
    if (!resourceId) throw forbidden('Aucune ressource associée à ce compte');
    const { principal, secondaire } = req.body;
    await service.replaceSamuAssignments(resourceId, principal, secondaire);
    logUserAction(req, 'Modification propres affectations SAMU', { resourceId, principal, secondaire });
    res.json({ success: true });
}

// ---------- Historique des taux MAD ----------

export async function listMadHistory(req: Request, res: Response) {
    res.json(await service.listMadHistory(req.params.id));
}

export async function addMadPeriod(req: Request, res: Response) {
    const { id } = req.params;
    const newId = await service.addMadPeriod(id, req.body, userId(req));
    const { taux, date_debut, date_fin } = req.body;
    logUserAction(req, 'Ajout taux MAD', { resourceId: id, taux, date_debut, date_fin });
    res.json({ success: true, id: newId });
}

export async function updateMadPeriod(req: Request, res: Response) {
    const { id, historyId } = req.params;
    await service.updateMadPeriod(id, historyId, req.body);
    const { taux, date_debut, date_fin } = req.body;
    logUserAction(req, 'Modification taux MAD', { resourceId: id, historyId, taux, date_debut, date_fin });
    res.json({ success: true });
}

export async function deleteMadPeriod(req: Request, res: Response) {
    const { id, historyId } = req.params;
    await service.deleteMadPeriod(id, historyId);
    logUserAction(req, 'Suppression taux MAD', { resourceId: id, historyId });
    res.json({ success: true });
}

export async function effectiveMadRate(req: Request, res: Response) {
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : service.today();
    res.json(await service.getEffectiveMadRate(req.params.id, date));
}

// ---------- Particularités MAD ----------

export async function listParticularites(req: Request, res: Response) {
    res.json(await service.listParticularites(req.params.id, req.params.historyId));
}

export async function addParticularite(req: Request, res: Response) {
    const { id, historyId } = req.params;
    const newId = await service.addParticularite(id, historyId, req.body, userId(req));
    const { taux, date_debut, date_fin } = req.body;
    logUserAction(req, 'Ajout particularité MAD', { resourceId: id, historyId, taux, date_debut, date_fin });
    res.json({ success: true, id: newId });
}

export async function updateParticularite(req: Request, res: Response) {
    const { id, historyId, particulariteId } = req.params;
    await service.updateParticularite(id, historyId, particulariteId, req.body);
    const { taux, date_debut, date_fin } = req.body;
    logUserAction(req, 'Modification particularité MAD', {
        resourceId: id,
        particulariteId,
        taux,
        date_debut,
        date_fin
    });
    res.json({ success: true });
}

export async function deleteParticularite(req: Request, res: Response) {
    const { id, particulariteId } = req.params;
    await service.deleteParticularite(id, particulariteId);
    logUserAction(req, 'Suppression particularité MAD', { resourceId: id, particulariteId });
    res.json({ success: true });
}
