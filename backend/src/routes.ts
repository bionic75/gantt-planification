// Routeur /api : un sous-routeur par domaine fonctionnel.
import { Router } from 'express';
import adminRoutes from './modules/admin/admin.routes.ts';
import affectationRoutes from './modules/affectation/affectation.routes.ts';
import astreintesHoRoutes from './modules/astreintes-ho/ho.routes.ts';
import astreintesRoutes from './modules/astreintes/astreintes.routes.ts';
import authRoutes from './modules/auth/auth.routes.ts';
import automationsRoutes from './modules/automations/automations.routes.ts';
import calendarRoutes from './modules/calendar/calendar.routes.ts';
import craRoutes from './modules/cra/cra.routes.ts';
import deplacementsRoutes from './modules/deplacements/deplacements.routes.ts';
import eventsRoutes from './modules/events/events.routes.ts';
import locationsRoutes from './modules/locations/locations.routes.ts';
import logsRoutes from './modules/logs/logs.routes.ts';
import notificationsRoutes from './modules/notifications/notifications.routes.ts';
import poiRoutes from './modules/poi/poi.routes.ts';
import publicApiRoutes from './modules/public-api/public-api.routes.ts';
import reportingRoutes from './modules/reporting/reporting.routes.ts';
import resourcesRoutes from './modules/resources/resources.routes.ts';
import scheduleRoutes from './modules/schedule/schedule.routes.ts';
import usersRoutes from './modules/users/users.routes.ts';

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
api.use(astreintesHoRoutes);
api.use(craRoutes);
api.use(locationsRoutes);
api.use(publicApiRoutes);

export default api;
