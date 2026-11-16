// @ts-check
// Localisations (SAMU-SAS et autres lieux)
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.ts';
import { asyncHandler as h } from '../../middlewares/error-handler.ts';
import * as ctrl from './locations.controller.js';

const router = Router();

router.get('/locations', requireAuth, h(ctrl.list));
router.post('/locations', requireAuth, h(ctrl.create));
router.post('/locations/import', requireAdmin, h(ctrl.importCsv));
router.post('/locations/import/resolve', requireAdmin, h(ctrl.resolveImport));
router.put('/locations/:id', requireAdmin, h(ctrl.update));
router.get('/locations/:id/usage', requireAdmin, h(ctrl.usage));
router.delete('/locations/:id', requireAdmin, h(ctrl.remove));

export default router;
