// Reporting et exports : disponibilités, astreintes / HNO, carte des événements, exports CSV
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createResource, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const key = (resourceId, type, date, period) => `${resourceId}_${type}_${date}${period ? `_${period}` : ''}`;

describe('disponibilités et affectations', () => {
    it('demi-journées comptées par mois, anciennes clés sans demi-journée incluses', async () => {
        const res = await createResource(admin, { taux: 80 });
        await admin.post('/api/schedule', {
            [key(res.id, 'available', '2027-03-01', 'AM')]: '2',
            [key(res.id, 'available', '2027-03-01', 'PM')]: '2',
            [key(res.id, 'activity', '2027-03-01', 'AM')]: '5',
            [key(res.id, 'available', '2027-03-02', 'AM')]: '3',
            [key(res.id, 'available', '2027-04-05', 'PM')]: '2',
            [key(res.id, 'activity', '2027-04-05', 'PM')]: '8'
        });
        const r = await admin.post('/api/reporting/availability', {
            startMonth: 2,
            startYear: 2027,
            endMonth: 3,
            endYear: 2027,
            expertIds: [res.id]
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.months).toEqual([
            { year: 2027, month: 2 },
            { year: 2027, month: 3 }
        ]);
        expect(r.data.experts).toEqual([
            {
                id: res.id,
                name: `${res.prenom} ${res.nom}`,
                tauxMad: 80,
                avgWorkingDaysPerMonth: 22.5,
                monthlyStats: {
                    '2027-03': { workingDays: 23, available: 1, assigned: 0.5, leave: 0.5, rate: 50 },
                    '2027-04': { workingDays: 22, available: 0.5, assigned: 0.5, leave: 0, rate: 100 }
                }
            }
        ]);
        const diag = await admin.get(`/api/reporting/diagnose/${res.id}/2027/3`);
        expect(diag.data).toMatchObject({
            success: true,
            monthKey: '2027-03',
            totalRows: 4,
            summary: { availableSlots: 2, assignedSlots: 1, leaveSlots: 1, availableDays: 1 }
        });
        expect(diag.data.rawData[0]).toEqual({ date_key: '2027-03-01_AM', type: 'activity', value: '5' });
    });

    it('experts et période obligatoires', async () => {
        const body = { startMonth: 0, startYear: 2027, endMonth: 0, endYear: 2027 };
        expect((await admin.post('/api/reporting/availability', { ...body, expertIds: [] })).status).toBe(400);
        const res = await createResource(admin);
        const inverted = { ...body, startYear: 2028, expertIds: [res.id] };
        expect((await admin.post('/api/reporting/availability', inverted)).data.error).toBe('Période invalide');
    });
});

describe('astreintes / HNO', () => {
    it('jours par mois, une ligne à cheval sur deux mois comptée dans chacun', async () => {
        const { user, resource } = await createExpert(admin);
        const line = (type, date_debut, date_fin) => ({
            user_id: user.id,
            type,
            date_debut,
            date_fin,
            heure_debut: '18:00',
            heure_fin: '08:00',
            samu: 'SAMU 75',
            objet: 'x'
        });
        await admin.post('/api/astreintes', line('astreinte', '2027-05-30', '2027-06-02'));
        await admin.post('/api/astreintes', line('hno', '2027-06-10', '2027-06-10'));
        const orphan = await createResource(admin);
        const r = await admin.post('/api/reporting/hno-astreintes', {
            startMonth: 4,
            startYear: 2027,
            endMonth: 5,
            endYear: 2027,
            expertIds: [resource.id, orphan.id]
        });
        const byResource = Object.fromEntries(r.data.experts.map(e => [e.resource_id, e.monthlyData]));
        // Comportement historique : les dates des lignes sont lues en UTC, les bornes des mois en heure locale ;
        // à l'est de Greenwich, le premier jour du mois est compté deux fois (à corriger après la refonte)
        const juneDays = new Date(2027, 5, 1).getTimezoneOffset() < 0 ? 3 : 2;
        expect(byResource[resource.id]).toEqual({
            '2027-4': { hno: 0, astreintes: 2 },
            '2027-5': { hno: 1, astreintes: juneDays }
        });
        expect(byResource[orphan.id]).toEqual({
            '2027-4': { hno: 0, astreintes: 0 },
            '2027-5': { hno: 0, astreintes: 0 }
        });
    });
});

describe('exports CSV', () => {
    it('planning du mois : disponibilité / activité / lieu par demi-journée', async () => {
        const res = await createResource(admin, { nom: 'AAAEXPORT' });
        await admin.post('/api/schedule', {
            [key(res.id, 'available', '2027-02-03', 'AM')]: '2',
            [key(res.id, 'activity', '2027-02-03', 'AM')]: '3',
            [key(res.id, 'localisation', '2027-02-03', 'AM')]: 'SAMU 75',
            [key(res.id, 'available', '2027-02-03', 'PM')]: '1'
        });
        const r = await admin.get('/api/export/gantt?year=2027&month=1');
        expect(r.status).toBe(200);
        expect(r.headers.get('content-disposition')).toBe('attachment; filename="planning_Février_2027.csv"');
        const lines = r.data.split('\n');
        expect(lines[0]).toBe('Planning - Février 2027'); // BOM retiré par fetch().text()
        expect(lines[2].split(',').slice(0, 7)).toEqual([
            'Ressource',
            'Trigramme',
            'SAMU',
            'Lun 1 AM',
            'Lun 1 PM',
            'Mar 2 AM',
            'Mar 2 PM'
        ]);
        const row = lines.find(l => l.startsWith(`"AAAEXPORT ${res.prenom}"`));
        expect(row).toContain('"Dispo / SAMU Dép. / SAMU 75","Indispo / - / -"');
        expect((await admin.get('/api/export/gantt?year=2027')).status).toBe(400);
    });

    it('ressources', async () => {
        const res = await createResource(admin);
        const r = await admin.get('/api/export/resources');
        expect(r.headers.get('content-type')).toMatch(/text\/csv/);
        expect(r.data).toContain(`${res.id},"${res.nom}","${res.prenom}","${res.trigramme}"`);
    });
});

describe('carte des événements', () => {
    it('seuls les événements dont le lieu est géolocalisé', async () => {
        const loc = await admin.post('/api/locations', {
            libelle_long: `Lieu carte ${Date.now()}`,
            libelle_court: 'LC',
            latitude: 48.85,
            longitude: 2.35
        });
        const noCoords = await admin.post('/api/locations', {
            libelle_long: `Sans coord ${Date.now()}`,
            libelle_court: 'SC'
        });
        const { user } = await createExpert(admin);
        const located = await admin.post('/api/custom-events', {
            startDate: '2027-09-01',
            label: 'Carte',
            location_id: loc.data.id,
            participants: [user.id]
        });
        await admin.post('/api/custom-events', {
            startDate: '2027-09-02',
            label: 'Hors carte',
            location_id: noCoords.data.id
        });
        const r = await admin.get('/api/reporting/events-map?startDate=2027-08-01&endDate=2027-09-30');
        expect(r.data.events).toEqual([
            expect.objectContaining({
                id: located.data.eventId,
                label: 'Carte',
                latitude: 48.85,
                longitude: 2.35,
                libelle_court: 'LC',
                creator_prenom: 'Système',
                type_short: '',
                participants: [`${user.prenom} ${user.nom.toUpperCase()}`]
            })
        ]);
    });
});
