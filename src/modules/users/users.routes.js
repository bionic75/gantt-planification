// @ts-check
// Utilisateurs : /api/users, /api/user, /api/profile, /api/app-access
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './users.controller.js';

const router = Router();

router.get('/users', requireAdmin, h(ctrl.list));
router.post('/users', requireAdmin, h(ctrl.create));
router.get('/users/public', requireAuth, h(ctrl.listPublic));
router.get('/users/amoa-ced', requireAuth, h(ctrl.listAmoaCed));
router.get('/users/search', requireAdmin, h(ctrl.search));
router.post('/users/change-password', requireAuth, h(ctrl.changePassword));
router.put('/users/:id', requireAdmin, h(ctrl.update));
router.delete('/users/:id', requireAdmin, h(ctrl.remove));
router.post('/users/:id/toggle', requireAdmin, h(ctrl.toggle));
router.post('/users/:id/force-logout', requireAdmin, h(ctrl.forceLogout));
router.post('/users/:id/reset-password', requireAdmin, h(ctrl.resetPassword));
router.post('/users/:id/reporting-access', requireAdmin, h(ctrl.setReportingAccess));
router.post('/users/:id/rh-access', requireAdmin, h(ctrl.setRhAccess));
router.post('/users/:id/astreinte-access', requireAdmin, h(ctrl.setAstreinteAccess));
router.post('/users/:id/amoa-ced', requireAdmin, h(ctrl.setAmoaCed));
router.put('/users/:id/default-tab', requireAuth, h(ctrl.setDefaultTab));
router.get('/user/email-by-resource/:resourceId', requireAuth, h(ctrl.emailByResource));

// Compte de l'utilisateur connecté
router.get('/profile/photo', requireAuth, h(ctrl.getProfilePhoto));
router.post('/profile/photo', requireAuth, h(ctrl.setProfilePhoto));
router.post('/profile/change-password', requireAuth, h(ctrl.changeProfilePassword));

// Accès aux applications
router.get('/app-access', requireAdmin, h(ctrl.listAppAccess));
router.post('/app-access/:app/users', requireAdmin, h(ctrl.grantAppAccess));
router.delete('/app-access/:app/users/:userId', requireAdmin, h(ctrl.revokeAppAccess));

export default router;
