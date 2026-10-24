// @ts-check
// Journaux : connexions, actions, sessions actives, purge
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './logs.controller.js';

const router = Router();

router.get('/active-sessions', requireAuth, h(ctrl.activeSessions));
router.get('/reporting/connections', requireAdmin, h(ctrl.connectionsReport));
router.get('/logs/actions', requireAdmin, h(ctrl.userActions));
router.post('/logs/add-modification', requireAuth, h(ctrl.addModification));
router.get('/logs/planning-debug', requireAdmin, h(ctrl.planningDebug));
router.delete('/logs/raz', requireAdmin, h(ctrl.resetUserLogs));
router.delete('/logs/purge-all', requireAdmin, h(ctrl.purgeAll));

export default router;
