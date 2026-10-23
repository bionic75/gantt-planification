// @ts-check
// Routeur /api : un sous-routeur par domaine fonctionnel.
import { Router } from 'express';
import adminRoutes from './modules/admin/admin.routes.js';
import affectationRoutes from './modules/affectation/affectation.routes.js';
import astreintesRoutes from './modules/astreintes/astreintes.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import automationsRoutes from './modules/automations/automations.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import craRoutes from './modules/cra/cra.routes.js';
import deplacementsRoutes from './modules/deplacements/deplacements.routes.js';
import eventsRoutes from './modules/events/events.routes.js';
import locationsRoutes from './modules/locations/locations.routes.js';
import logsRoutes from './modules/logs/logs.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import poiRoutes from './modules/poi/poi.routes.js';
import publicApiRoutes from './modules/public-api/public-api.routes.js';
import reportingRoutes from './modules/reporting/reporting.routes.js';
import resourcesRoutes from './modules/resources/resources.routes.js';
import scheduleRoutes from './modules/schedule/schedule.routes.js';
import usersRoutes from './modules/users/users.routes.js';

const api = Router();

api.use(authRoutes);
api.use(usersRoutes);
api.use(resourcesRoutes);
api.use(scheduleRoutes);
// Avant les événements : intercepte les modifications d'événements liés aux déploiements
api.use(affectationRoutes);
api.use(adminRoutes);
api.use(logsRoutes);
api.use(notificationsRoutes);
api.use(calendarRoutes);
api.use(automationsRoutes);
api.use(reportingRoutes);
api.use(eventsRoutes);
api.use(poiRoutes);
api.use(deplacementsRoutes);
api.use(astreintesRoutes);
api.use(craRoutes);
api.use(locationsRoutes);
api.use(publicApiRoutes);

export default api;
