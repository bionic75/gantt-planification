// @ts-check
// Ressources : /api/resources, /api/resource-samu-assignments, /api/me/samu-assignments
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './resources.controller.js';

const router = Router();

router.get('/resources', requireAuth, h(ctrl.list));
router.post('/resources', requireAdmin, h(ctrl.create));
// Doit précéder /resources/:id/...
router.get('/resources/experts-map', requireAuth, h(ctrl.expertsMap));
router.put('/resources/:id', requireAdmin, h(ctrl.update));
router.delete('/resources/:id', requireAdmin, h(ctrl.remove));
router.post('/resources/:id/toggle', requireAdmin, h(ctrl.toggle));
router.post('/resources/:id/astreinte', requireAdmin, h(ctrl.setAstreinte));

// Affectations SAMU (expert principal / secondaire)
router.get('/resource-samu-assignments', requireAuth, h(ctrl.listAllSamuAssignments));
router.get('/resources/:id/samu-assignments', requireAuth, h(ctrl.listSamuAssignments));
router.put('/resources/:id/samu-assignments', requireAdmin, h(ctrl.replaceSamuAssignments));
router.put('/me/samu-assignments', requireAuth, h(ctrl.replaceMySamuAssignments));

// Historique des taux MAD
router.get('/resources/:id/mad-history', requireAuth, h(ctrl.listMadHistory));
router.post('/resources/:id/mad-history', requireAdmin, h(ctrl.addMadPeriod));
router.put('/resources/:id/mad-history/:historyId', requireAdmin, h(ctrl.updateMadPeriod));
router.delete('/resources/:id/mad-history/:historyId', requireAdmin, h(ctrl.deleteMadPeriod));
router.get('/resources/:id/effective-mad-rate', requireAuth, h(ctrl.effectiveMadRate));

// Particularités MAD
router.get('/resources/:id/mad-history/:historyId/particularites', requireAuth, h(ctrl.listParticularites));
router.post('/resources/:id/mad-history/:historyId/particularites', requireAdmin, h(ctrl.addParticularite));
router.put(
    '/resources/:id/mad-history/:historyId/particularites/:particulariteId',
    requireAdmin,
    h(ctrl.updateParticularite)
);
router.delete(
    '/resources/:id/mad-history/:historyId/particularites/:particulariteId',
    requireAdmin,
    h(ctrl.deleteParticularite)
);

export default router;
