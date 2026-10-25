// @ts-check
// Astreintes et HNO : saisie, planning d'astreinte, disponibilités, génération
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './astreintes.controller.js';

const router = Router();

// Saisie des astreintes / HNO
router.get('/astreintes-hno/lock-check', requireAuth, h(ctrl.lockCheck));
router.get('/mes-astreintes', requireAuth, h(ctrl.mine));
router.get('/all-astreintes-planning', requireAuth, h(ctrl.forPlanning));
router.get('/astreintes', requireAuth, h(ctrl.listAll));
router.get('/experts-list', requireAuth, h(ctrl.experts));
router.post('/astreintes', requireAuth, h(ctrl.create));
router.put('/astreintes/:id', requireAuth, h(ctrl.update));
router.delete('/astreintes/:id', requireAuth, h(ctrl.remove));
// Saisie mensuelle directe, sans CRA (avant /astreintes-hno/:id)
router.get('/astreintes-hno/direct', requireAuth, h(ctrl.listMonth));
router.post('/astreintes-hno/direct', requireAuth, h(ctrl.replaceMonth));
router.delete('/astreintes-hno/:id', requireAuth, h(ctrl.removeEntry));

// Planning d'astreinte : volontaires, disponibilités, indisponibilités, génération
router.get('/astreinte/volontaires', requireAdmin, h(ctrl.volontaires));
router.post('/astreinte/volontaire/:id', requireAdmin, h(ctrl.setVolontaire));
router.get('/astreinte/indispos', requireAdmin, h(ctrl.indisponibilites));
router.get('/astreinte/dispos/:expertId/:mois', requireAuth, h(ctrl.disponibilites));
router.post('/astreinte/dispos/:expertId/:mois', requireAuth, h(ctrl.saveDisponibilites));
router.post('/astreinte/indispo', requireAdmin, h(ctrl.addIndisponibilite));
router.delete('/astreinte/indispo/:id', requireAdmin, h(ctrl.removeIndisponibilite));
router.post('/astreinte/generate', requireAdmin, h(ctrl.generate));
router.put('/astreinte/slot/:id', requireAdmin, h(ctrl.setSlot));
router.get('/astreinte/planning/:mois', requireAdmin, h(ctrl.monthPlanning));

export default router;
