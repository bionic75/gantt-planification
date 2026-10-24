// @ts-check
import { badRequest, forbidden } from '../../lib/http-error.js';
import { logUserAction } from '../../services/action-log.js';
import * as service from './schedule.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

/** L'expert ne peut modifier que la ligne de sa propre ressource */
const isOtherResource = (/** @type {Request} */ req, /** @type {unknown} */ resourceId) =>
    req.session.activeProfile === 'expert' && parseInt(String(resourceId)) !== req.session.resourceId;

/** Profil « utilisateur » : consultation du planning seulement */
export function rejectReadOnlyProfile(
    /** @type {Request} */ req,
    /** @type {Response} */ res,
    /** @type {import('express').NextFunction} */ next
) {
    if (req.session.activeProfile === 'user') {
        return res.status(403).json({ error: 'Profil utilisateur : planning en lecture seule' });
    }
    next();
}

export async function get(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.getSchedule());
}

/**
 * Enregistre des cellules { clé: valeur }. Les cellules d'une autre ressource sont ignorées pour un expert.
 */
export async function save(/** @type {Request} */ req, /** @type {Response} */ res) {
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
}

/** Enregistrement groupé (format { updates: [{ key, value }] } ou { clé: valeur }) */
export async function saveBatch(/** @type {Request} */ req, /** @type {Response} */ res) {
    /** @type {Array<{ key: string, value: unknown }>} */
    let updates = req.body.updates || Object.entries(req.body).map(([key, value]) => ({ key, value }));
    if (!updates || updates.length === 0) return res.json({ success: true, saved: 0 });

    updates = updates.filter(({ key }) => !isOtherResource(req, service.parseKey(key).resourceId));
    await service.saveCells(updates);

    logUserAction(req, 'Sauvegarde planning rapide', {
        modificationsCount: updates.length,
        profile: req.session.activeProfile
    });
    res.json({ success: true, saved: updates.length });

    service.logActivityChanges(updates, /** @type {number} */ (req.session.userId), req.session.activeProfile);
}

/** Paramètres d'une remise à zéro mensuelle (month : 0 = janvier) */
function monthParams(/** @type {Request} */ req) {
    const { resourceId, year, month } = req.body;
    if (!resourceId || year === undefined || month === undefined) throw badRequest('Paramètres manquants');
    if (isOtherResource(req, resourceId)) throw forbidden('Non autorisé');
    return { resourceId, year, month };
}

export async function previewResetMonth(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { resourceId, year, month } = monthParams(req);
    const entries = await service.previewMonth(resourceId, year, month);
    res.json({ success: true, count: entries.length, entries });
}

export async function resetMonth(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { resourceId, year, month } = monthParams(req);
    const { deleted, pattern } = await service.resetMonth(resourceId, year, month);
    logUserAction(req, `RAZ planning mois ${month + 1}/${year}`, { resourceId, pattern, lignesSupprimees: deleted });
    res.json({ success: true, deleted });
}

export async function cleanupLegacyFormat(/** @type {Request} */ req, /** @type {Response} */ res) {
    const deleted = await service.deleteLegacyFormat();
    console.log(`✅ ${deleted} anciennes entrées supprimées`);
    res.json({ success: true, deleted });
}
