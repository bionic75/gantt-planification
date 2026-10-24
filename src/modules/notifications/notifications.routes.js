// @ts-check
// Notifications : temps réel (SSE), notifications experts, emails d'affectation et invitations, Teams
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './notifications.controller.js';

const router = Router();

// Messages instantanés
router.get('/sse', requireAuth, h(ctrl.sse));
router.post('/push-message', requireAuth, h(ctrl.pushMessage));

// Emails
router.post('/send-calendar-email', requireAuth, h(ctrl.sendCalendarEmail));
router.get('/email-queue/status/:batchId', requireAuth, h(ctrl.emailBatchStatus));
router.post('/send-assignment-emails', requireAuth, h(ctrl.sendAssignmentEmails));
router.post('/request-assignment', requireAuth, h(ctrl.requestAssignment));

// Affectations en attente de notification
router.post('/pending-notifications', requireAuth, h(ctrl.addPending));
router.get('/pending-notifications/:sessionId', requireAuth, h(ctrl.listPending));
router.delete('/pending-notifications/:sessionId', requireAuth, h(ctrl.deletePending));
router.post('/send-assignment-notifications', requireAuth, h(ctrl.sendPendingNotifications));

// Notifications des experts
router.get('/notifications/count', requireAuth, h(ctrl.unreadCount));
router.get('/notifications/list', requireAuth, h(ctrl.unreadList));
router.post('/notifications/mark-read', requireAuth, h(ctrl.markRead));
router.post('/notifications/create-batch', requireAuth, h(ctrl.createBatch));
router.post('/notifications/clear-all', requireAdmin, h(ctrl.clearAll));

// Teams
router.post('/teams/test', requireAdmin, h(ctrl.teamsTest));
router.post('/teams/notify', requireAuth, h(ctrl.teamsNotify));

export default router;
