import { badRequest, forbidden } from '../../lib/http-error.ts';
import { logUserAction } from '../../services/action-log.ts';
import { notifierAffectations } from '../notifications/notifications.service.ts';
import * as service from './schedule.service.ts';

import type { Request, Response } from 'express';

/** L'expert ne peut modifier que la ligne de sa propre ressource */
const isOtherResource = (req: Request, resourceId: unknown) =>
    req.session.activeProfile === 'expert' && parseInt(String(resourceId)) !== req.session.resourceId;

/** Profil « utilisateur » : consultation du planning seulement */
export function rejectReadOnlyProfile(req: Request, res: Response, next: import('express').NextFunction) {
    if (req.session.activeProfile === 'user') {
        return res.status(403).json({ error: 'Profil utilisateur : planning en lecture seule' });
    }
    next();
}

export async function get(req: Request, res: Response) {
    res.json(await service.getSchedule());
}

/** Nom de l'auteur d'une modification (notifications des experts) */
const auteurDe = (req: Request) => ({
    userId: req.session.userId as number,
    name: `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`
});

/**
 * Affectations posées par un tiers : les experts concernés sont notifiés (après la réponse). Localisation : celle
 * enregistrée pour la demi-journée.
 * @param cells cellules enregistrées
 */
async function notifierExperts(cells: Array<{ key: string; value: unknown }>, req: Request) {
    const affectations = cells.filter(({ key, value }) => service.parseKey(key).type === 'activity' && value !== null);
    if (!affectations.length) return;
    const lieux = await service.localisationsDe(affectations.map(({ key }) => key));
    await notifierAffectations(
        affectations.map(({ key, value }) => {
            const { resourceId, dateKey } = service.parseKey(key);
            return {
                resourceId: Number(resourceId),
                dateKey,
                activity: value,
                location: lieux.get(`${resourceId}_${dateKey}`) ?? null
            };
        }),
        auteurDe(req)
    );
}

/**
 * Enregistre des cellules { clé: valeur }. Les cellules d'une autre ressource sont ignorées pour un expert.
 */
export async function save(req: Request, res: Response) {
    const data = req.body;
    const entries = data && typeof data === 'object' ? Object.entries(data) : [];
    if (entries.length === 0) return res.json({ success: true, saved: 0 });

    const profile = req.session.activeProfile;
    const allowed = entries.filter(([key]) => !isOtherResource(req, service.parseKey(key).resourceId));
    // Une modification faite par l'expert sur sa ligne ne lui est pas notifiée
    await Promise.all(
        allowed.map(([key, value]) => service.upsertCellWithNotification(key, value, profile !== 'expert'))
    );

    logUserAction(req, 'Sauvegarde planning', { modificationsCount: entries.length, profile });
    // Historique : « saved » compte toutes les cellules reçues, y compris celles ignorées
    res.json({ success: true, saved: entries.length });

    if (profile !== 'expert') {
        void notifierExperts(
            allowed.map(([key, value]) => ({ key, value })),
            req
        );
    }
}

/**
 * Enregistrement groupé (format { updates: [{ key, value }] } ou { clé: valeur }) ; une valeur null supprime la cellule
 * (cellule vidée dans la grille)
 */
export async function saveBatch(req: Request, res: Response) {
    let updates: Array<{ key: string; value: unknown }> =
        req.body.updates || Object.entries(req.body).map(([key, value]) => ({ key, value }));
    if (!updates || updates.length === 0) return res.json({ success: true, saved: 0 });

    updates = updates.filter(({ key }) => !isOtherResource(req, service.parseKey(key).resourceId));
    const deletions = updates.filter(({ value }) => value === null).map(({ key }) => key);
    // Seules les cellules modifiées sont écrites et journalisées (l'ancien écran envoyait le planning complet)
    const changed = await service.changedCells(updates.filter(({ value }) => value !== null));
    await service.saveCells(changed);
    const deleted = await service.deleteCells(deletions);

    logUserAction(req, 'Sauvegarde planning rapide', {
        modificationsCount: changed.length + deleted,
        profile: req.session.activeProfile
    });
    // « saved » : cellules reçues (réponse inchangée)
    res.json({ success: true, saved: updates.length });

    service.logActivityChanges(changed, req.session.userId as number, req.session.activeProfile);
    // Seules les cellules modifiées donnent lieu à une notification (le navigateur envoie le planning complet)
    void notifierExperts(changed, req);
}

/** Paramètres d'une remise à zéro mensuelle (month : 0 = janvier) */
function monthParams(req: Request) {
    const { resourceId, year, month } = req.body;
    if (!resourceId || year === undefined || month === undefined) throw badRequest('Paramètres manquants');
    if (isOtherResource(req, resourceId)) throw forbidden('Non autorisé');
    return { resourceId, year, month };
}

export async function previewResetMonth(req: Request, res: Response) {
    const { resourceId, year, month } = monthParams(req);
    const entries = await service.previewMonth(resourceId, year, month);
    res.json({ success: true, count: entries.length, entries });
}

export async function resetMonth(req: Request, res: Response) {
    const { resourceId, year, month } = monthParams(req);
    const { deleted, pattern } = await service.resetMonth(resourceId, year, month);
    logUserAction(req, `RAZ planning mois ${month + 1}/${year}`, { resourceId, pattern, lignesSupprimees: deleted });
    res.json({ success: true, deleted });
}

export async function cleanupLegacyFormat(req: Request, res: Response) {
    const deleted = await service.deleteLegacyFormat();
    console.log(`✅ ${deleted} anciennes entrées supprimées`);
    res.json({ success: true, deleted });
}
