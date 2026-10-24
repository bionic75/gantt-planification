// @ts-check
// Événements personnalisés et types d'événements
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './events.controller.js';

const router = Router();

// Types d'événements
router.get('/event-types', requireAuth, h(ctrl.listTypes));
router.post('/event-types', requireAdmin, h(ctrl.createType));
// Reprise des données (avant /event-types/:id)
router.get('/event-types/events', requireAdmin, h(ctrl.listForReprise));
router.put('/event-types/events/bulk', requireAdmin, h(ctrl.bulkUpdate));
router.put('/event-types/:id', requireAdmin, h(ctrl.updateType));
router.delete('/event-types/:id', requireAdmin, h(ctrl.deleteType));

// Événements : administration
router.get('/custom-events/search', requireAuth, h(ctrl.search));
router.get('/custom-events', requireAdmin, h(ctrl.adminList));
router.post('/custom-events', requireAdmin, h(ctrl.adminCreate));
router.put('/custom-events/:id', requireAdmin, h(ctrl.adminUpdate));
router.delete('/custom-events/:id', requireAdmin, h(ctrl.remove));

// Événements : planification et application mobile
router.get('/mobile-events', requireAuth, h(ctrl.mobileList));
router.get('/my-custom-events', requireAuth, h(ctrl.myList));
router.post('/my-custom-events', requireAuth, h(ctrl.create));
router.post('/my-custom-events/:id/join', requireAuth, h(ctrl.join));
router.put('/my-custom-events/:id', requireAuth, h(ctrl.update));
// Suppression réservée aux administrateurs
router.delete('/my-custom-events/:id', requireAdmin, h(ctrl.remove));

export default router;
