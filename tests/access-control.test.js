// Contrôle d'accès sur l'ensemble des routes /api (inventaire : tests/fixtures/routes.json).
// Toute nouvelle route doit être ajoutée à l'inventaire avec sa protection.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import routes from './fixtures/routes.json' with { type: 'json' };
import { startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';

// Les paramètres de chemin (:id, :userId…) sont remplacés par une valeur quelconque :
// la protection doit répondre avant toute lecture en base.
const concrete = p => p.replace(/:\w+/g, '1');
const label = r => `${r.method} ${r.path}`;

let server;
let userClient;

beforeAll(async () => {
    server = await startServer();
    const admin = await loginAs(server, { username: 'admin', password: 'Admin2025!' }, 'admin');
    const user = await createUser(admin, { is_user: 1 });
    userClient = await loginAs(server, user, 'user');
});
afterAll(() => server?.stop());

describe('inventaire des routes', () => {
    it('ne liste que les routes publiques attendues', () => {
        expect(routes.filter(r => r.guard === 'public').map(label)).toEqual([
            'GET /api/check-session',
            'POST /api/forgot-password',
            'POST /api/login',
            'POST /api/logout',
            'POST /api/mobile-login',
            'POST /api/reset-password',
            'POST /api/reset-password/check',
            'GET /api/system/version',
            'GET /api/theme',
            'GET /api/user/profiles',
            'GET /api/version'
        ]);
    });
});

describe('utilisateur anonyme', () => {
    const protectedRoutes = routes.filter(r => r.guard !== 'public');

    it.each(protectedRoutes.map(r => [label(r), r]))('%s → 401', async (_name, r) => {
        const res = await server.client().request(r.method, concrete(r.path), r.method === 'GET' ? undefined : {});
        expect(res.status).toBe(401);
    });
});

describe('profil utilisateur sans droit particulier', () => {
    const restricted = routes.filter(r => ['admin', 'adminOrRh', 'reporting', 'affectation'].includes(r.guard));

    it.each(restricted.map(r => [label(r), r]))('%s → 403', async (_name, r) => {
        const res = await userClient.request(r.method, concrete(r.path), r.method === 'GET' ? undefined : {});
        expect(res.status).toBe(403);
    });
});

describe('API publique par clé', () => {
    it('refuse une clé invalide', async () => {
        const res = await server.client().get('/api/public/events', { 'X-Api-Key': 'invalide' });
        expect(res.status).toBe(401);
    });

    it('accepte une clé créée par un admin', async () => {
        const admin = await loginAs(server, { username: 'admin', password: 'Admin2025!' }, 'admin');
        const created = await admin.post('/api/admin/api-keys', { label: 'tests' });
        expect(created.status, JSON.stringify(created.data)).toBe(200);
        const key = created.data.key;
        expect(key).toBeTruthy();
        const res = await server.client().get('/api/public/events', { 'X-Api-Key': key });
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('events');
    });
});
