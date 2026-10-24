// @ts-check
// Automatisations : configuration, journaux, rappels (n°1) et sauvegarde des plannings (n°2)
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './automations.controller.js';

const router = Router();

// Configuration et journaux
router.get('/automation/config/:id', requireAdmin, h(ctrl.getConfig));
router.post('/automation/config/:id', requireAdmin, h(ctrl.saveConfig));
router.get('/automation/logs/:id', requireAdmin, h(ctrl.listLogs));
router.delete('/automation/logs/:id', requireAdmin, h(ctrl.deleteLogs));
router.get('/automation/download/2/:logId', requireAdmin, h(ctrl.downloadBackup));

// N°1 : rappel de saisie des disponibilités
router.get('/automation/test/1', requireAdmin, h(ctrl.testReminder));
router.post('/automation/send-reminder', requireAdmin, h(ctrl.sendReminder));

// N°2 : sauvegarde du planning
router.get('/automation/available-months', requireAdmin, h(ctrl.availableMonths));
router.post('/automation/preview/2', requireAdmin, h(ctrl.previewBackup));
router.post('/automation/send/2', requireAdmin, h(ctrl.sendBackup));

// Diagnostic et nettoyage des clés de planification
router.get('/automation/diagnose-months', requireAdmin, h(ctrl.diagnoseMonths));
router.post('/automation/cleanup-dates-preview', requireAdmin, h(ctrl.cleanupPreview));
router.post('/automation/cleanup-dates-execute', requireAdmin, h(ctrl.cleanupExecute));

export default router;
