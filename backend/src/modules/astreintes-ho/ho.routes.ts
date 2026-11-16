// Astreintes HO : planning demi-journée par demi-journée, automatisations n°5 et n°6
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.ts';
import { asyncHandler as h } from '../../middlewares/error-handler.ts';
import * as ctrl from './ho.controller.ts';

const router = Router();

router.get('/astreintes-ho', requireAuth, h(ctrl.getMonth));
router.post('/astreintes-ho/save', requireAuth, h(ctrl.save));
router.get('/astreintes-ho/info', requireAdmin, h(ctrl.info));
router.post('/astreintes-ho/automation/:n/send', requireAdmin, h(ctrl.sendNow));

export default router;
