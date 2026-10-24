// @ts-check
// API publique par clé (événements) et gestion des clés
import { Router } from 'express';
import { requireAdmin, requireApiKey } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as service from './public-api.service.js';

const router = Router();

// Gestion des clés (administrateurs)
router.post(
    '/admin/api-keys',
    requireAdmin,
    h(async (req, res) => {
        res.json({
            success: true,
            ...(await service.createApiKey(req.body.label, /** @type {number} */ (req.session.userId)))
        });
    })
);
router.get(
    '/admin/api-keys',
    requireAdmin,
    h(async (req, res) => {
        res.json(await service.listApiKeys());
    })
);
router.delete(
    '/admin/api-keys/:id',
    requireAdmin,
    h(async (req, res) => {
        await service.revokeApiKey(req.params.id);
        res.json({ success: true });
    })
);

// API publique : événements
router.get(
    '/public/events',
    requireApiKey,
    h(async (req, res) => {
        const events = await service.listPublicEvents(req.query);
        res.json({ events, count: events.length });
    })
);

export default router;
