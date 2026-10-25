// Calendrier : vacances scolaires et dates particulières (fichiers ICS), dates affichées sur le planning
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

describe('vacances scolaires', () => {
    it('saisie par zone', async () => {
        expect((await admin.get('/api/school-holidays')).data).toEqual({
            success: true,
            holidays: { zoneA: [], zoneB: [], zoneC: [] }
        });
        const holidays = { zoneA: [{ start: '2027-02-06', end: '2027-02-22' }], zoneB: [], zoneC: [] };
        expect((await admin.post('/api/school-holidays', { holidays })).data).toEqual({ success: true });
        expect((await admin.get('/api/school-holidays')).data.holidays).toEqual(holidays);
        expect((await admin.post('/api/school-holidays', {})).status).toBe(400);
    });

    it('fichiers importés : liste, périodes par zone, suppression', async () => {
        const r = await admin.post('/api/ics-files/school-holidays', {
            filename: 'vacances.ics',
            content: 'BEGIN:VCALENDAR',
            zoneA: [{ start: '2027-04-10', end: '2027-04-26', summary: 'Printemps A' }],
            zoneB: [{ start: '2027-02-13', end: '2027-03-01', summary: 'Hiver B' }],
            zoneC: []
        });
        expect(r.data).toEqual({ success: true, fileId: r.data.fileId });
        const files = (await admin.get('/api/ics-files/school-holidays')).data.files;
        expect(files).toContainEqual(
            expect.objectContaining({ id: r.data.fileId, filename: 'vacances.ics', periods_count: 2 })
        );
        const periods = (await admin.get('/api/ics-files/school-holidays/all-periods')).data.periods;
        expect(periods.zoneA).toContainEqual({ start: '2027-04-10', end: '2027-04-26', name: 'Printemps A' });
        expect(periods.zoneB).toContainEqual({ start: '2027-02-13', end: '2027-03-01', name: 'Hiver B' });

        await admin.delete(`/api/ics-files/school-holidays/${r.data.fileId}`);
        expect((await admin.get('/api/ics-files/school-holidays')).data.files.some(f => f.id === r.data.fileId)).toBe(
            false
        );
        expect((await admin.get('/api/ics-files/school-holidays/all-periods')).data.periods.zoneA).not.toContainEqual(
            expect.objectContaining({ name: 'Printemps A' })
        );
    });
});

describe('dates particulières', () => {
    it('import, configuration, affichage avec les événements personnalisés', async () => {
        expect((await admin.post('/api/ics-files/special-dates', { filename: 'x.ics', events: [{}] })).status).toBe(
            400
        );
        const config = { color: '#ff0000', label: 'Fériés' };
        const r = await admin.post('/api/ics-files/special-dates', {
            filename: 'feries.ics',
            content: 'BEGIN:VCALENDAR',
            config,
            events: [
                { start: '2027-05-01', summary: 'Fête du travail' },
                { start: '2027-05-08', end: '2027-05-09' },
                { summary: 'sans date' }
            ]
        });
        expect(r.data).toEqual({ success: true, fileId: r.data.fileId, count: 2 });
        const files = (await admin.get('/api/ics-files/special-dates')).data.files;
        expect(files.find(f => f.id === r.data.fileId)).toMatchObject({
            filename: 'feries.ics',
            config,
            dates_count: 2
        });
        await admin.put(`/api/ics-files/special-dates/${r.data.fileId}/config`, { config: { color: '#00ff00' } });

        const user = await createUser(admin);
        const types = (await admin.get('/api/event-types')).data.types;
        const typed = types.find(t => !t.is_other);
        const loc = await admin.post('/api/locations', {
            libelle_long: `Lieu cal ${Date.now()}`,
            libelle_court: 'cal'
        });
        const ev = await admin.post('/api/custom-events', {
            startDate: '2027-05-10',
            label: 'Formation',
            period: 'AM',
            type_id: typed.id,
            location_id: loc.data.id,
            participants: [user.id]
        });
        const other = await admin.post('/api/custom-events', { startDate: '2027-05-11', label: 'Divers' });

        const dates = (await server.client().get('/api/ics-files/special-dates/all')).status;
        expect(dates).toBe(401);
        const all = (await admin.get('/api/ics-files/special-dates/all')).data.dates;
        expect(all).toContainEqual({
            date: '2027-05-01',
            endDate: '2027-05-01',
            summary: 'Fête du travail',
            config: { color: '#00ff00' }
        });
        expect(all).toContainEqual(
            expect.objectContaining({ date: '2027-05-08', endDate: '2027-05-09', summary: 'Événement' })
        );
        const formation = all.find(d => d.config.eventId === ev.data.eventId);
        expect(formation).toMatchObject({
            date: '2027-05-10',
            summary: 'Formation',
            period: 'AM',
            config: {
                label: 'Formation',
                typeId: typed.id,
                typeLong: typed.label_long,
                shown: typed.label_short || typed.label_long,
                locationId: loc.data.id,
                locationLibelleCourt: 'CAL',
                participants: [`${user.prenom} ${user.nom.toUpperCase()}`]
            }
        });
        const divers = all.find(d => d.config.eventId === other.data.eventId);
        expect(divers.config).toMatchObject({ shown: 'Divers' });
        expect(divers.config).not.toHaveProperty('participants');

        await admin.delete(`/api/ics-files/special-dates/${r.data.fileId}`);
        expect(
            (await admin.get('/api/ics-files/special-dates/all')).data.dates.some(d => d.summary === 'Fête du travail')
        ).toBe(false);
    });
});
