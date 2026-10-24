// @ts-check
// Administration : configuration email, version, paramètres, accès aux onglets, thèmes, aide
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './admin.controller.js';

const router = Router();

// Configuration email
router.get('/email-config', requireAdmin, h(ctrl.getEmailConfig));
router.post('/email-config', requireAdmin, h(ctrl.saveEmailConfig));
router.post('/email-config/test', requireAdmin, h(ctrl.testEmailConfig));

// Version (publiques en lecture)
router.post('/system/version', requireAdmin, h(ctrl.setSystemVersion));
router.get('/system/version', h(ctrl.getSystemVersion));
router.get('/version', h(ctrl.getAppVersion));

// Paramètres (POST : alias utilisé par l'interface)
router.get('/settings', requireAuth, h(ctrl.listSettings));
router.put('/settings', requireAuth, requireAdmin, h(ctrl.saveSetting));
router.post('/settings', requireAuth, requireAdmin, h(ctrl.saveSetting));

// Accès aux onglets par profil
router.get('/tab-access', requireAuth, h(ctrl.getTabAccess));
router.put('/tab-access', requireAdmin, h(ctrl.saveTabAccess));

// Thème d'affichage (public en lecture)
router.get('/theme', h(ctrl.getTheme));
router.put('/theme', requireAdmin, h(ctrl.saveTheme));

// Aide personnalisée
router.post('/help/upload', requireAdmin, h(ctrl.uploadHelp));
router.delete('/help/upload', requireAdmin, h(ctrl.deleteHelp));
router.get('/help/info', requireAdmin, h(ctrl.helpInfo));

export default router;
