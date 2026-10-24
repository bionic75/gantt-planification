// @ts-check
// Planning : /api/schedule
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './schedule.controller.js';

const router = Router();

router.get('/schedule', requireAuth, h(ctrl.get));
router.post('/schedule', requireAuth, h(ctrl.save));
router.post('/schedule/save', requireAuth, h(ctrl.saveBatch));
router.post('/schedule/preview-reset-month', requireAuth, h(ctrl.previewResetMonth));
router.post('/schedule/reset-month', requireAuth, h(ctrl.resetMonth));
router.post('/schedule/cleanup-old-format', requireAdmin, h(ctrl.cleanupLegacyFormat));

export default router;
