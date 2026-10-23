// Planning (clés "<resourceId>_<type>_<date>_<AM|PM>")
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createResource, createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const schedule = async () => (await admin.get('/api/schedule')).data;
const key = (resourceId, type, date, period = 'AM') => `${resourceId}_${type}_${date}_${period}`;

describe('POST /api/schedule', () => {
    it("l'admin modifie n'importe quelle ressource", async () => {
        const res = await createResource(admin);
        const data = {
            [key(res.id, 'available', '2025-06-02')]: '2',
            [key(res.id, 'activity', '2025-06-02')]: '5',
            [key(res.id, 'localisation', '2025-06-02')]: 'PSC'
        };
        const r = await admin.post('/api/schedule', data);
        expect(r.data).toEqual({ success: true, saved: 3 });
        expect(await schedule()).toMatchObject(data);
    });

    it('une nouvelle valeur remplace la précédente', async () => {
        const res = await createResource(admin);
        await admin.post('/api/schedule', { [key(res.id, 'activity', '2025-06-03')]: '5' });
        await admin.post('/api/schedule', { [key(res.id, 'activity', '2025-06-03')]: '7' });
        expect((await schedule())[key(res.id, 'activity', '2025-06-03')]).toBe('7');
    });

    it("l'expert ne modifie que sa propre ressource (les autres clés sont ignorées)", async () => {
        const { user, resource } = await createExpert(admin);
        const other = await createResource(admin);
        const expert = await loginAs(server, user, 'expert');
        const r = await expert.post('/api/schedule', {
            [key(resource.id, 'available', '2025-06-04')]: '2',
            [key(other.id, 'available', '2025-06-04')]: '2'
        });
        expect(r.data.success).toBe(true);
        const data = await schedule();
        expect(data[key(resource.id, 'available', '2025-06-04')]).toBe('2');
        expect(data).not.toHaveProperty(key(other.id, 'available', '2025-06-04'));
    });

    it("le profil utilisateur ne modifie pas la disponibilité (mais modifie l'activité)", async () => {
        // Comportement actuel documenté : le README annonce un profil en lecture seule (à corriger en phase 4)
        const res = await createResource(admin);
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        await client.post('/api/schedule', {
            [key(res.id, 'available', '2025-06-05')]: '2',
            [key(res.id, 'activity', '2025-06-05')]: '5'
        });
        const data = await schedule();
        expect(data).not.toHaveProperty(key(res.id, 'available', '2025-06-05'));
        expect(data[key(res.id, 'activity', '2025-06-05')]).toBe('5');
    });
});

describe('POST /api/schedule/save', () => {
    it('accepte le format { updates: [...] }', async () => {
        const res = await createResource(admin);
        const r = await admin.post('/api/schedule/save', {
            updates: [{ key: key(res.id, 'activity', '2025-07-01', 'PM'), value: '6' }]
        });
        expect(r.data).toEqual({ success: true, saved: 1 });
        expect((await schedule())[key(res.id, 'activity', '2025-07-01', 'PM')]).toBe('6');
    });

    it("filtre les ressources d'un autre expert", async () => {
        const { user, resource } = await createExpert(admin);
        const other = await createResource(admin);
        const expert = await loginAs(server, user, 'expert');
        const r = await expert.post('/api/schedule/save', {
            [key(resource.id, 'activity', '2025-07-02')]: '3',
            [key(other.id, 'activity', '2025-07-02')]: '3'
        });
        expect(r.data).toEqual({ success: true, saved: 1 });
        expect(await schedule()).not.toHaveProperty(key(other.id, 'activity', '2025-07-02'));
    });
});

describe('remise à zéro mensuelle', () => {
    it('aperçu puis suppression du mois (month : 0 = janvier)', async () => {
        const res = await createResource(admin);
        await admin.post('/api/schedule', {
            [key(res.id, 'available', '2025-09-10')]: '2',
            [key(res.id, 'activity', '2025-09-10')]: '5',
            [key(res.id, 'activity', '2025-10-01')]: '5'
        });
        const preview = await admin.post('/api/schedule/preview-reset-month', {
            resourceId: res.id,
            year: 2025,
            month: 8
        });
        expect(preview.data).toMatchObject({ success: true, count: 1 });
        expect(preview.data.entries[0]).toMatchObject({ date_key: '2025-09-10_AM', available: '2', activity: '5' });

        const reset = await admin.post('/api/schedule/reset-month', { resourceId: res.id, year: 2025, month: 8 });
        expect(reset.data).toEqual({ success: true, deleted: 2 });
        const data = await schedule();
        expect(data).not.toHaveProperty(key(res.id, 'activity', '2025-09-10'));
        expect(data[key(res.id, 'activity', '2025-10-01')]).toBe('5');
    });

    it('paramètres obligatoires', async () => {
        expect((await admin.post('/api/schedule/reset-month', { year: 2025, month: 1 })).status).toBe(400);
    });

    it('refusée à un expert sur une autre ressource', async () => {
        const { user } = await createExpert(admin);
        const other = await createResource(admin);
        const expert = await loginAs(server, user, 'expert');
        const r = await expert.post('/api/schedule/reset-month', { resourceId: other.id, year: 2025, month: 1 });
        expect(r.status).toBe(403);
    });
});
