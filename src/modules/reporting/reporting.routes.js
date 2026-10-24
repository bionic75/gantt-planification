// @ts-check
// Reporting et exports : disponibilités, astreintes/HNO, carte des événements, exports
import { Router } from 'express';
import { requireAuth, requireReportingAccess } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import { logUserAction } from '../../services/action-log.js';
import * as service from './reporting.service.js';

const router = Router();

router.post(
    '/reporting/availability',
    requireReportingAccess,
    h(async (req, res) => {
        const { startMonth, startYear, endMonth, endYear, expertIds, includeLeave } = req.body;
        console.log('📊 Génération rapport:', {
            startMonth,
            startYear,
            endMonth,
            endYear,
            expertIds: expertIds?.length,
            includeLeave
        });
        res.json({ success: true, ...(await service.availabilityReport(req.body)) });
    })
);

// Diagnostic : données brutes d'un expert sur un mois
router.get(
    '/reporting/diagnose/:expertId/:year/:month',
    requireReportingAccess,
    h(async (req, res) => {
        const { expertId, year, month } = req.params;
        res.json({ success: true, ...(await service.diagnose(expertId, year, month)) });
    })
);

// Exports CSV
router.get(
    '/export/resources',
    requireAuth,
    h(async (req, res) => {
        const { csv, count } = await service.resourcesCsv();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=resources_${timestamp}.csv`);
        logUserAction(req, 'Export ressources Excel', { count });
        res.send(csv);
    })
);

router.get(
    '/export/gantt',
    requireAuth,
    h(async (req, res) => {
        const { year, month, filename } = req.query;
        const { csv, monthName, count } = await service.ganttCsv(year, month);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename || `planning_${monthName}_${year}.csv`}"`
        );
        logUserAction(req, 'Export planning CSV', { year, month: monthName, resources: count });
        res.send(csv);
    })
);

router.post(
    '/reporting/hno-astreintes',
    requireAuth,
    h(async (req, res) => {
        res.json(await service.hnoAstreintesReport(req.body));
    })
);

// Carte des événements géolocalisés
router.get(
    '/reporting/events-map',
    requireAuth,
    h(async (req, res) => {
        res.json({ events: await service.eventsMap(req.query) });
    })
);

export default router;
