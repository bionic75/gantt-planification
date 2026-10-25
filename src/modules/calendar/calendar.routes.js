// @ts-check
// Calendrier : vacances scolaires et dates particulières (fichiers ICS)
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as service from './calendar.service.js';

const router = Router();

// Vacances scolaires saisies
router.post(
    '/school-holidays',
    requireAdmin,
    h(async (req, res) => {
        const { holidays } = req.body;
        if (!holidays) return res.status(400).json({ success: false, error: 'Données manquantes' });
        await service.saveSchoolHolidays(holidays);
        console.log('📅 Congés scolaires sauvegardés');
        res.json({ success: true });
    })
);
router.get(
    '/school-holidays',
    requireAuth,
    h(async (req, res) => {
        res.json({ success: true, holidays: await service.getSchoolHolidays() });
    })
);

// Fichiers de vacances scolaires
router.get(
    '/ics-files/school-holidays',
    requireAdmin,
    h(async (req, res) => {
        res.json({ files: await service.listSchoolFiles() });
    })
);
router.post(
    '/ics-files/school-holidays',
    requireAdmin,
    h(async (req, res) => {
        res.json({ success: true, fileId: await service.importSchoolFile(req.body) });
    })
);
router.get(
    '/ics-files/school-holidays/all-periods',
    requireAuth,
    h(async (req, res) => {
        res.json({ periods: await service.allSchoolPeriods() });
    })
);
router.delete(
    '/ics-files/school-holidays/:id',
    requireAdmin,
    h(async (req, res) => {
        await service.deleteSchoolFile(req.params.id);
        res.json({ success: true });
    })
);

// Fichiers de dates particulières
router.get(
    '/ics-files/special-dates',
    requireAdmin,
    h(async (req, res) => {
        res.json({ files: await service.listSpecialFiles() });
    })
);
router.post(
    '/ics-files/special-dates',
    requireAdmin,
    h(async (req, res) => {
        res.json({ success: true, ...(await service.importSpecialFile(req.body)) });
    })
);
// Dates particulières du planning : fichiers ICS et événements personnalisés (avant /:id)
router.get(
    '/ics-files/special-dates/all',
    requireAuth,
    h(async (req, res) => {
        res.json({ dates: await service.allSpecialDates() });
    })
);
router.put(
    '/ics-files/special-dates/:id/config',
    requireAdmin,
    h(async (req, res) => {
        await service.updateSpecialConfig(req.params.id, req.body.config);
        res.json({ success: true });
    })
);
router.delete(
    '/ics-files/special-dates/:id',
    requireAdmin,
    h(async (req, res) => {
        await service.deleteSpecialFile(req.params.id);
        res.json({ success: true });
    })
);

export default router;
