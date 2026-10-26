// @ts-check
// Aide à l'affectation opérationnelle (déploiements des SAMU) : /api/affectation
import { Router } from 'express';
import { requireAdmin, requireAffectationAccess } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './affectation.controller.js';
import * as asana from './asana.controller.js';
import * as ateliers from './ateliers.controller.js';
import * as exp from './export.controller.js';

const router = Router();

// Configuration, référentiels
router.get('/affectation/config', requireAffectationAccess, h(ctrl.config));
router.put('/affectation/colors', requireAdmin, h(ctrl.saveColors));
router.get('/affectation/users', requireAdmin, h(ctrl.users));
router.get('/affectation/resources', requireAffectationAccess, h(ctrl.resources));

// Déploiements
router.get('/affectation/projects', requireAffectationAccess, h(ctrl.listProjects));
router.post('/affectation/projects', requireAdmin, h(ctrl.createProject));
router.put('/affectation/projects/:id', requireAdmin, h(ctrl.updateProject));
router.delete('/affectation/projects/:id', requireAdmin, h(ctrl.deleteProject));
router.get('/affectation/projects/:id/history', requireAffectationAccess, h(ctrl.history));

// Ressources affectées et disponibilités
router.put('/affectation/projects/:id/assignments/:stage', requireAffectationAccess, h(ctrl.setAssignments));
router.post('/affectation/projects/:id/assignments/:stage/release', requireAdmin, h(ctrl.release));
router.get('/affectation/projects/:id/availability/:stage', requireAffectationAccess, h(ctrl.availability));

// Activités et événements
router.get('/affectation/stage-event-types', requireAffectationAccess, h(ctrl.stageEventTypes));
router.put('/affectation/stage-event-types', requireAdmin, h(ctrl.saveStageEventTypes));
router.get('/affectation/events', requireAffectationAccess, h(ctrl.events));
router.get('/affectation/projects/:id/events-candidates', requireAdmin, h(ctrl.eventCandidates));
router.put('/affectation/projects/:id/event-link', requireAdmin, h(ctrl.setEventLink));
router.post('/affectation/projects/:id/event-create', requireAdmin, h(ctrl.createEvent));
router.post('/affectation/sync-from-events', requireAffectationAccess, h(ctrl.syncFromEvents));
router.get('/affectation/projects/:id/sync/:stage', requireAffectationAccess, h(ctrl.syncPreview));
router.post('/affectation/projects/:id/sync/:stage', requireAdmin, h(ctrl.syncApply));

// À chaque création, modification ou suppression d'événement, les affectations des déploiements suivent
router.use(['/my-custom-events', '/custom-events'], ctrl.eventsHook);

// Planification des ateliers métier : rétroplanning automatisé par SAMU
router.get('/affectation/ateliers/meta', requireAffectationAccess, h(ateliers.meta));
router.post('/affectation/ateliers/simulate', requireAffectationAccess, h(ateliers.simulate));
router.get('/affectation/ateliers', requireAffectationAccess, h(ateliers.list));
router.put('/affectation/ateliers', requireAdmin, h(ateliers.save));
router.delete('/affectation/ateliers/:id', requireAdmin, h(ateliers.remove));
router.post('/affectation/ateliers/:id/send', requireAdmin, h(ateliers.send));

// Import depuis Asana
router.post('/affectation/import/asana-csv', requireAdmin, h(asana.csvPreview));
router.post('/affectation/import/asana-csv/apply', requireAdmin, h(asana.csvApply));
router.get('/affectation/asana/teams', requireAdmin, h(asana.teams));
router.get('/affectation/asana/config', requireAdmin, h(asana.getConfig));
router.put('/affectation/asana/config', requireAdmin, h(asana.saveConfig));
router.delete('/affectation/asana/token', requireAdmin, h(asana.deleteToken));
router.post('/affectation/asana/test', requireAdmin, h(asana.test));
router.get('/affectation/asana/projects', requireAdmin, h(asana.projects));
router.put('/affectation/asana/links', requireAdmin, h(asana.setLink));
router.post('/affectation/asana/preview', requireAdmin, h(asana.preview));
router.post('/affectation/asana/apply', requireAdmin, h(asana.apply));
router.post('/affectation/asana/refresh-all', requireAdmin, h(asana.refreshAll));
router.post('/affectation/projects/:id/asana-refresh', requireAdmin, h(asana.refreshOne));
router.get('/affectation/projects/:id/asana-tasks', requireAdmin, h(asana.tasks));
router.put('/affectation/projects/:id/asana-overrides', requireAdmin, h(asana.saveOverrides));

// Exports et modèle PowerPoint
router.get('/affectation/template', requireAffectationAccess, h(exp.getTemplate));
router.get('/affectation/template/preview', requireAffectationAccess, h(exp.templatePreview));
router.put('/affectation/template', requireAdmin, h(exp.saveTemplate));
router.delete('/affectation/template', requireAdmin, h(exp.deleteTemplate));
router.get('/affectation/export-config', requireAffectationAccess, h(exp.getNameConfig));
router.put('/affectation/export-config', requireAdmin, h(exp.saveNameConfig));
router.post('/affectation/export/pdf', requireAffectationAccess, h(exp.exportPdf));
router.post('/affectation/export/pptx', requireAffectationAccess, h(exp.exportPptx));

export default router;
