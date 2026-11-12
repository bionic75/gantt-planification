// @ts-check
// Comptes rendus d'activité (CRA) : /api/cra, /api/automation/cra
import { Router } from 'express';
import { requireAdmin, requireAdminOrRh, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './cra.controller.js';

const router = Router();

// Listes et référentiels (avant /cra/:id)
router.get('/cra/my-list', requireAuth, h(ctrl.myList));
router.get('/cra/admin/list', requireAdminOrRh, h(ctrl.adminList));
router.get('/cra/admin/archives', requireAdminOrRh, h(ctrl.archives));
router.get('/cra/admin/deleted', requireAdmin, h(ctrl.deletedList));
router.get('/cra/experts-astreinte', requireAdmin, h(ctrl.astreinteExperts));
router.get('/cra/all-experts-full', requireAdmin, h(ctrl.allExpertsFull));
router.get('/cra/all-experts', requireAdminOrRh, h(ctrl.allExperts));
router.post('/cra/rh-recipients', requireAdmin, h(ctrl.saveRhRecipients));

// Création
router.post('/cra/launch', requireAdmin, h(ctrl.launch));
router.get('/cra/find-or-create', requireAuth, h(ctrl.findOrCreate));

// PDF signé sauvegardé (avant /cra/:id)
router.get('/cra/pdf-saved/:filename', requireAuth, h(ctrl.pdfSaved));

// Consultation et saisie
router.get('/cra/:id', requireAuth, h(ctrl.detail));
router.get('/cra/:id/pdf', requireAuth, h(ctrl.pdf));
router.get('/cra/:id/collect', requireAuth, h(ctrl.collectLines));
router.post('/cra/:id/propagate', requireAuth, h(ctrl.propagate));
router.post('/cra/:id/astreintes', requireAuth, h(ctrl.saveLines));

// Archivage et corbeille
router.post('/cra/:id/archive', requireAdmin, h(ctrl.archive));
router.post('/cra/:id/unarchive', requireAdmin, h(ctrl.unarchive));
router.post('/cra/:id/soft-delete', requireAdmin, h(ctrl.softDelete));
router.post('/cra/:id/restore-deleted', requireAdmin, h(ctrl.restoreDeleted));
router.delete('/cra/:id/purge', requireAdmin, h(ctrl.purge));

// Circuit de validation
router.post('/cra/:id/submit', requireAuth, h(ctrl.submit));
router.post('/cra/:id/rien-a-declarer', requireAuth, h(ctrl.declareNothing));
router.post('/cra/:id/recall', requireAuth, h(ctrl.recall));
router.post('/cra/:id/visa/:niveau', requireAdmin, h(ctrl.visa));
router.post('/cra/:id/refuser/:niveau', requireAdmin, h(ctrl.refuse));
router.post('/cra/:id/admin-correction', requireAdmin, h(ctrl.adminCorrection));
router.post('/cra/:id/return-to-expert', requireAdmin, h(ctrl.returnToExpert));

// Diffusion
router.get('/cra/:id/diffusion-recipients', requireAdmin, h(ctrl.diffusionRecipients));
router.post('/cra/:id/prepare-pdf', requireAdminOrRh, h(ctrl.preparePdf));
router.post('/cra/:id/diffuser', requireAdmin, h(ctrl.diffuse));
router.get('/cra/:id/diffusion-log', requireAuth, h(ctrl.diffusionLog));
router.post('/cra/:id/diffusion-resend-all', requireAdmin, h(ctrl.resendAll));
router.post('/cra/:id/diffusion-resend/:logId', requireAdmin, h(ctrl.resendOne));

// Automatisation n°4 (test)
router.post('/automation/cra/trigger', requireAdmin, h(ctrl.triggerAutomation));

export default router;
