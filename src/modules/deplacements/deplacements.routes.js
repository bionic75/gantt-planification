// @ts-check
// Déplacements et bons de commande
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './deplacements.controller.js';

const router = Router();

// Bons de commande
router.get('/bons-commande', requireAuth, h(ctrl.listBons));
router.post('/bons-commande', requireAuth, h(ctrl.createBon));
router.put('/bons-commande/:id', requireAuth, h(ctrl.updateBon));
router.delete('/bons-commande/:id', requireAuth, h(ctrl.deleteBon));
router.get('/reporting-deplacements', requireAuth, h(ctrl.bonsReport));

// Déplacements
router.get('/deplacements', requireAuth, h(ctrl.list));
router.get('/mes-deplacements', requireAuth, h(ctrl.mine));
router.post('/deplacements', requireAuth, h(ctrl.create));
// Avant /deplacements/:id
router.post('/deplacements/regularisation-technique', requireAdmin, h(ctrl.regularisationTechnique));
router.get('/deplacements/:id', requireAuth, h(ctrl.detail));
router.put('/deplacements/:id', requireAuth, h(ctrl.update));
router.delete('/deplacements/:id', requireAuth, h(ctrl.remove));
router.post('/deplacements/:id/regularisation', requireAuth, h(ctrl.regulariser));
router.post('/deplacements/:id/reaffecter', requireAuth, h(ctrl.reaffecter));

router.get('/liste-samu', requireAuth, h(ctrl.listSamu));

export default router;
