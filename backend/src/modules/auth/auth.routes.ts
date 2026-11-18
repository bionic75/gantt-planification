// Authentification : connexion, session, profils, mot de passe oublié, double authentification
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.ts';
import { asyncHandler as h } from '../../middlewares/error-handler.ts';
import { loginLimiters, passwordResetRequestLimiter, tokenCheckLimiter } from '../../middlewares/rate-limit.ts';
import * as ctrl from './auth.controller.ts';
import { requireMfaPending } from './mfa-pending.ts';

const router = Router();

// Routes publiques (nombre de tentatives limité)
router.post('/login', loginLimiters, h(ctrl.login));
router.post('/mobile-login', loginLimiters, h(ctrl.mobileLogin));
router.post('/logout', h(ctrl.logout));
router.post('/forgot-password', passwordResetRequestLimiter, h(ctrl.forgotPassword));
router.post('/reset-password/check', tokenCheckLimiter, h(ctrl.checkResetToken));
router.post('/reset-password', tokenCheckLimiter, h(ctrl.resetPassword));
router.get('/check-session', h(ctrl.checkSession));

router.post('/switch-profile', requireAuth, h(ctrl.switchProfile));

// Double authentification : administration
router.get('/mfa/config', requireAdmin, h(ctrl.getMfaConfig));
router.post('/mfa/config', requireAdmin, h(ctrl.saveMfaConfig));
router.post('/mfa/reset-totp/:userId', requireAdmin, h(ctrl.resetUserTotp));
router.post('/mfa/reset-all', requireAdmin, h(ctrl.resetAllMfa));

// Double authentification : vérification d'une connexion en attente
router.post('/mfa/send-code', requireMfaPending, h(ctrl.sendMfaCode));
router.post('/mfa/verify', tokenCheckLimiter, requireMfaPending, h(ctrl.verifyMfa));
// :userId conservé pour compatibilité, ignoré
router.get('/mfa/totp-status/:userId', requireMfaPending, h(ctrl.totpStatus));
// Méthode « au choix » : code email exigé avant l'enregistrement d'une application d'authentification
router.post('/mfa/totp-unlock', tokenCheckLimiter, requireMfaPending, h(ctrl.unlockTotp));
router.post('/mfa/totp-setup', requireMfaPending, h(ctrl.setupTotp));
router.post('/mfa/totp-confirm', tokenCheckLimiter, requireMfaPending, h(ctrl.confirmTotp));

export default router;
