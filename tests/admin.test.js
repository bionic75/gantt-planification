// Administration : lieux, journaux, clés d'API et API publique, paramètres, accès aux onglets, thème, aide
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

let seq = 0;
const unique = prefix => `${prefix} ${Date.now().toString(36)}${++seq}`;

describe('lieux', () => {
    it('création en majuscules, unicité, modification, usage et suppression', async () => {
        const label = unique('Lieu');
        const r = await admin.post('/api/locations', {
            libelle_long: label,
            libelle_court: 'abc',
            adresse: '1 rue x',
            latitude: '48.5'
        });
        expect(r.data.success).toBe(true);
        const loc = (await admin.get('/api/locations')).data.locations.find(l => l.id === r.data.id);
        expect(loc).toMatchObject({
            libelle_long: label.toUpperCase(),
            libelle_court: 'ABC',
            adresse: '1 RUE X',
            latitude: 48.5,
            longitude: null
        });

        expect((await admin.post('/api/locations', { libelle_long: label, libelle_court: 'x' })).status).toBe(409);
        expect((await admin.post('/api/locations', { libelle_long: 'x' })).status).toBe(400);
        expect((await admin.put('/api/locations/999999', { libelle_long: 'x', libelle_court: 'y' })).status).toBe(404);
        await admin.put(`/api/locations/${r.data.id}`, { libelle_long: label, libelle_court: 'def' });
        expect((await admin.get('/api/locations')).data.locations.find(l => l.id === r.data.id).libelle_court).toBe(
            'DEF'
        );

        const ev = await admin.post('/api/custom-events', {
            startDate: '2027-01-05',
            label: 'Usage',
            location_id: r.data.id
        });
        const usage = (await admin.get(`/api/locations/${r.data.id}/usage`)).data;
        expect(usage).toEqual({
            count: 1,
            events: [{ id: ev.data.eventId, label: 'Usage', start_date: '2027-01-05', end_date: '2027-01-05' }]
        });
        await admin.delete(`/api/locations/${r.data.id}`);
        expect((await admin.get('/api/locations')).data.locations.some(l => l.id === r.data.id)).toBe(false);
    });

    it('import CSV : conflits signalés puis résolus', async () => {
        const existing = unique('Import');
        await admin.post('/api/locations', { libelle_long: existing, libelle_court: 'E' });
        const fresh = unique('Nouveau');
        const r = await admin.post('/api/locations/import', {
            rows: [
                { libelle_long: existing, libelle_court: 'E' },
                { libelle_long: fresh, libelle_court: 'n', latitude: '1.5', longitude: 'x' },
                { libelle_long: '', libelle_court: 'ignorée' }
            ]
        });
        expect(r.data).toMatchObject({ success: true, inserted: 1 });
        expect(r.data.conflicts).toHaveLength(1);
        expect(r.data.conflicts[0]).toMatchObject({
            identical: true,
            incoming: { libelle_long: existing.toUpperCase() }
        });
        const created = (await admin.get('/api/locations')).data.locations.find(
            l => l.libelle_long === fresh.toUpperCase()
        );
        expect(created).toMatchObject({ libelle_court: 'N', latitude: 1.5, longitude: null, adresse: null });

        const resolved = await admin.post('/api/locations/import/resolve', {
            resolutions: [
                { action: 'overwrite', libelle_long: existing.toUpperCase(), libelle_court: 'z', adresse: 'ici' },
                { action: 'skip', libelle_long: fresh.toUpperCase() }
            ]
        });
        expect(resolved.data).toEqual({ success: true, updated: 1 });
        const updated = (await admin.get('/api/locations')).data.locations.find(
            l => l.libelle_long === existing.toUpperCase()
        );
        expect(updated).toMatchObject({ libelle_court: 'Z', adresse: 'ICI' });
        expect((await admin.post('/api/locations/import', { rows: [] })).status).toBe(400);
    });
});

describe('journaux', () => {
    it('connexions par utilisateur, actions, sessions actives, remise à zéro', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        await loginAs(server, user, 'user');
        await client.post('/api/logs/add-modification', { modification: 'Test' });

        const today = new Date().toISOString().slice(0, 10);
        const report = await admin.get(
            `/api/reporting/connections?dateStart=${today}&dateEnd=${today}&userIds=${user.id}`
        );
        expect(report.data.rows).toEqual([
            expect.objectContaining({ username: user.username, profile: 'user', nb_connexions: 2 })
        ]);
        expect((await admin.get('/api/reporting/connections?dateStart=2000-01-01')).status).toBe(400);

        const active = (await client.get('/api/active-sessions')).data.activeUsers;
        expect(active.find(a => a.userId === user.id)).toMatchObject({ username: user.username, nom: user.nom });

        // Journal des actions : modifications du planning
        const res = await admin.post('/api/resources', {
            nom: 'LOG',
            prenom: 'x',
            trigramme: unique('T'),
            taux: 50,
            samu: 'SAMU 75'
        });
        await admin.post('/api/schedule/save', { [`${res.data.id}_activity_2027-01-04_AM`]: '5' });
        // Journal écrit après la réponse
        let actions = [];
        for (let i = 0; i < 40 && actions.length === 0; i++) {
            await new Promise(r => setTimeout(r, 100));
            actions = (await admin.get('/api/logs/actions?userId=1')).data.logs;
        }
        expect(actions[0]).toMatchObject({ user_id: 1, action_type: 'planning_modification' });
        expect((await admin.get('/api/logs/actions')).status).toBe(400);
        expect((await admin.get('/api/logs/planning-debug')).data).toHaveProperty('stats');

        const raz = await admin.delete('/api/logs/raz', { type: 'connexions', userId: user.id });
        expect(raz.data).toMatchObject({ success: true, deleted: 2 });
        expect((await admin.delete('/api/logs/raz', { type: 'autre', userId: user.id })).status).toBe(400);
        expect((await admin.delete('/api/logs/raz', { type: 'connexions', userId: 999999 })).status).toBe(404);
        expect((await admin.delete('/api/logs/purge-all', { table: 'users' })).status).toBe(400);
        expect((await client.get('/api/logs/actions?userId=1')).status).toBe(403);
    });
});

describe("clés d'API et API publique", () => {
    it('création, utilisation et révocation', async () => {
        const created = await admin.post('/api/admin/api-keys', { label: 'Partenaire' });
        expect(created.data).toMatchObject({ success: true, label: 'Partenaire' });
        expect(created.data.key).toMatch(/^ans_[0-9a-f]{48}$/);
        const listed = (await admin.get('/api/admin/api-keys')).data.find(k => k.id === created.data.id);
        expect(listed).toMatchObject({ key_prefix: created.data.prefix, revoked: 0, creator_prenom: 'Système' });
        expect(listed).not.toHaveProperty('key_hash');

        const user = await createUser(admin);
        const ev = await admin.post('/api/custom-events', {
            startDate: '2028-02-01',
            label: 'Publique',
            period: 'AM',
            participants: [user.id]
        });
        const pub = server.client();
        const r = await pub.get('/api/public/events?from=2028-01-01&to=2028-12-31', { 'X-API-Key': created.data.key });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.events.find(e => e.id === ev.data.eventId)).toMatchObject({
            objet: 'Publique',
            horaire: 'Matin',
            grist: 0,
            type_short: '',
            participants: [{ nom: user.nom, prenom: user.prenom, trigramme: null }]
        });
        expect(r.data.count).toBe(r.data.events.length);

        await admin.delete(`/api/admin/api-keys/${created.data.id}`);
        expect((await pub.get('/api/public/events', { 'X-API-Key': created.data.key })).status).toBe(401);
        expect((await admin.post('/api/admin/api-keys', {})).status).toBe(400);
    });
});

describe('paramètres et configuration', () => {
    it('paramètres, accès aux onglets, thème, version', async () => {
        const key = unique('param');
        expect((await admin.post('/api/settings', { key, value: 'x' })).data).toEqual({
            success: true,
            key,
            value: 'x'
        });
        await admin.put('/api/settings', { key, value: 'y' });
        expect((await admin.get('/api/settings')).data[key]).toBe('y');

        const tab = await admin.put('/api/tab-access', { config: { user: { cra: true }, admin: { admin: false } } });
        expect(tab.data.config.user.cra).toBe(true);
        expect(tab.data.config.admin.admin).toBe(true); // jamais retiré à l'administrateur
        expect((await admin.get('/api/tab-access')).data).toMatchObject({
            config: { user: { cra: true } },
            profiles: ['admin', 'user', 'rh', 'expert']
        });
        expect((await admin.put('/api/tab-access', {})).status).toBe(400);

        const theme = await admin.put('/api/theme', { mode: 'forced', forced: 'paques', intensity: 'bizarre' });
        expect(theme.data).toMatchObject({ mode: 'forced', forced: 'paques', intensity: 'sobre' });
        expect((await server.client().get('/api/theme')).data.mode).toBe('forced');

        await admin.post('/api/system/version', { version: '9.9.9' });
        expect((await server.client().get('/api/system/version')).data).toEqual({ version: '9.9.9' });
        expect((await server.client().get('/api/version')).data.version).toBeTruthy();
    });

    it('aide personnalisée', async () => {
        expect((await admin.post('/api/help/upload', { content: 'pas du html' })).status).toBe(400);
        await admin.post('/api/help/upload', { content: '<!DOCTYPE html><html><body>Aide maison</body></html>' });
        const info = (await admin.get('/api/help/info')).data;
        expect(info.exists).toBe(true);
        const page = await server.client().get('/aide.html');
        expect(page.data).toContain('Aide maison');
        expect(page.data).toContain('<script src="/ui-icons.js" defer></script></body>');
        await admin.delete('/api/help/upload');
        expect((await admin.get('/api/help/info')).data).toEqual({ exists: false, updatedAt: null });
    });
});
