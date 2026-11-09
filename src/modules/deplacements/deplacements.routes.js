// @ts-check
// Déplacements et bons de commande : réservés aux comptes autorisés sur l'application « Suivi des déplacements »,
// comme l'écran (menu Applications)
import { Router } from 'express';
import { requireAdmin, requireDeplacementsAccess } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './deplacements.controller.js';

const router = Router();
const acces = requireDeplacementsAccess;

// Bons de commande
router.get('/bons-commande', acces, h(ctrl.listBons));
router.post('/bons-commande', acces, h(ctrl.createBon));
router.put('/bons-commande/:id', acces, h(ctrl.updateBon));
router.delete('/bons-commande/:id', acces, h(ctrl.deleteBon));
router.get('/reporting-deplacements', acces, h(ctrl.bonsReport));

// Déplacements
router.get('/deplacements', acces, h(ctrl.list));
router.get('/mes-deplacements', acces, h(ctrl.mine));
router.post('/deplacements', acces, h(ctrl.create));
// Avant /deplacements/:id
router.post('/deplacements/regularisation-technique', acces, requireAdmin, h(ctrl.regularisationTechnique));
router.get('/deplacements/:id', acces, h(ctrl.detail));
router.put('/deplacements/:id', acces, h(ctrl.update));
router.delete('/deplacements/:id', acces, h(ctrl.remove));
router.post('/deplacements/:id/regularisation', acces, h(ctrl.regulariser));
router.post('/deplacements/:id/reaffecter', acces, h(ctrl.reaffecter));

router.get('/liste-samu', acces, h(ctrl.listSamu));

export default router;
