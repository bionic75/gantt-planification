// Protections transverses : CSRF (origine des requêtes), CORS, en-têtes de sécurité, taille des requêtes,
// limitation des tentatives de connexion, masquage des secrets dans les journaux
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, BROWSER_PATH, startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const EVIL = 'https://malveillant.example';

describe('CSRF : origine des requêtes de modification', () => {
    const setting = value => ['/api/settings', { key: 'test_csrf', value }];
    const saved = async () => (await admin.get('/api/settings')).data.test_csrf;

    it('refuse une requête venant d’un autre site (Origin)', async () => {
        const r = await admin.request('POST', ...setting('evil'), { Origin: EVIL });
        expect(r.status).toBe(403);
        expect(r.data.error).toMatch(/autre site/);
        expect(await saved()).not.toBe('evil');
    });

    it('refuse une requête signalée cross-site ou same-site par le navigateur (Sec-Fetch-Site)', async () => {
        for (const site of ['cross-site', 'same-site']) {
            const r = await admin.request('POST', ...setting(site), { 'Sec-Fetch-Site': site });
            expect(r.status, site).toBe(403);
        }
        // Sec-Fetch-Site prioritaire sur Origin
        const r = await admin.request('POST', ...setting('x'), {
            'Sec-Fetch-Site': 'cross-site',
            Origin: server.baseUrl
        });
        expect(r.status).toBe(403);
    });

    it('accepte la même origine, et les clients hors navigateur (sans Origin ni Sec-Fetch-Site)', async () => {
        expect((await admin.request('POST', ...setting('a'), { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
        expect((await admin.request('POST', ...setting('b'), { Origin: server.baseUrl })).status).toBe(200);
        expect((await admin.request('POST', ...setting('c'), { Origin: server.appUrl })).status).toBe(200);
        expect((await admin.post(...setting('d'))).status).toBe(200);
        expect(await saved()).toBe('d');
    });

    it('les lectures ne sont pas concernées', async () => {
        expect((await admin.get('/api/settings', { Origin: EVIL, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(200);
    });

    it('protège aussi la connexion (login CSRF)', async () => {
        const r = await server.client().request('POST', '/api/login', { ...ADMIN, profile: 'admin' }, { Origin: EVIL });
        expect(r.status).toBe(403);
    });
});

describe('CORS', () => {
    it("l'application n'autorise pas les autres origines", async () => {
        const r = await admin.get('/api/settings', { Origin: EVIL });
        expect(r.headers.get('access-control-allow-origin')).toBeNull();
        expect(r.headers.get('access-control-allow-credentials')).toBeNull();
    });

    it("l'API publique est appelable depuis un autre site, sans cookie", async () => {
        const r = await server.client().get('/api/public/events', { Origin: EVIL, 'X-Api-Key': 'invalide' });
        expect(r.headers.get('access-control-allow-origin')).toBe('*');
        expect(r.headers.get('access-control-allow-credentials')).toBeNull();
    });
});

describe('en-têtes de sécurité', () => {
    it('pages et API', async () => {
        for (const url of ['/', '/api/version']) {
            const { headers } = await server.client().get(url);
            expect(headers.get('x-powered-by'), url).toBeNull();
            expect(headers.get('x-content-type-options'), url).toBe('nosniff');
            expect(headers.get('referrer-policy'), url).toBe('strict-origin-when-cross-origin');
            const csp = headers.get('content-security-policy');
            expect(csp, url).toMatch(/frame-ancestors 'self'/);
            expect(csp, url).toMatch(/object-src 'none'/);
            expect(csp, url).toMatch(/connect-src 'self' https:\/\/nominatim\.openstreetmap\.org/);
            // Application en HTTP en test : pas de HSTS ni de passage forcé en HTTPS
            expect(headers.get('strict-transport-security'), url).toBeNull();
            expect(csp, url).not.toMatch(/upgrade-insecure-requests/);
        }
    });

    it('cookie de session HttpOnly, SameSite=Lax, non Secure en HTTP', async () => {
        const res = await fetch(`${server.baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...ADMIN, profile: 'admin' })
        });
        const cookie = res.headers.get('set-cookie');
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).not.toMatch(/Secure/i);
    });

    it('cookie Secure derrière un proxy HTTPS de confiance', async () => {
        const res = await fetch(`${server.baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
            body: JSON.stringify({ ...ADMIN, profile: 'admin' })
        });
        expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
    });
});

describe('taille des requêtes', () => {
    const big = 'x'.repeat(200 * 1024);

    it('limitée sans session ouverte', async () => {
        const r = await server.client().post('/api/login', { username: big, password: 'x', profile: 'user' });
        expect(r.status).toBe(413);
        expect(r.data.error).toBe('Requête trop volumineuse');
    });

    it('volumineuse acceptée pour un utilisateur connecté', async () => {
        const r = await admin.post('/api/settings', { key: 'test_taille', value: big });
        expect(r.status).toBe(200);
    });
});

describe('limitation des tentatives de connexion', () => {
    it('bloque un identifiant après 10 échecs, même avec le bon mot de passe', async () => {
        const user = await createUser(admin, { is_user: 1 });
        for (let i = 0; i < 10; i++) {
            expect((await server.client().login(user.username, 'mauvais', 'user')).status).toBe(401);
        }
        const blocked = await server.client().login(user.username, user.password, 'user');
        expect(blocked.status).toBe(429);
        expect(blocked.data.error).toMatch(/Trop de tentatives/);
        expect(blocked.headers.get('ratelimit-policy')).toBeTruthy();
        // Les autres comptes ne sont pas concernés
        expect((await loginAs(server, ADMIN, 'admin')).cookie).toBeTruthy();
    });

    it('les connexions réussies ne sont pas comptées', async () => {
        const user = await createUser(admin, { is_user: 1 });
        for (let i = 0; i < 12; i++) {
            expect((await server.client().login(user.username, user.password, 'user')).status).toBe(200);
        }
    });
});

describe.skipIf(!BROWSER_PATH)('rendu PDF côté serveur (Chromium)', () => {
    it("le HTML exporté ne peut ni exécuter de script ni faire appeler d'adresse par le serveur (SSRF)", async () => {
        const target = `${server.baseUrl}/api/version`;
        const html = `<!doctype html><html><body><div class="pg">Planning</div>
            <img src="${target}?ssrf=IMG-MARK">
            <link rel="stylesheet" href="${target}?ssrf=CSS-MARK">
            <script>fetch('${target}?ssrf=SCRIPT-MARK')</script></body></html>`;
        const r = await admin.request('POST', '/api/affectation/export/pdf', { html, wMm: 210, hMm: 297 });
        expect(r.status).toBe(200);
        await new Promise(res => setTimeout(res, 500));
        expect(server.logs).not.toMatch(/ssrf=/);
    }, 60000);
});

describe('journaux', () => {
    it('masquent les jetons et clés présents dans les URL', async () => {
        await server.client().get('/api/public/events?api_key=SECRET-CLE-123&format=json');
        await server.client().get('/?reset_token=SECRET-JETON-456');
        expect(server.logs).not.toMatch(/SECRET-CLE-123|SECRET-JETON-456/);
        expect(server.logs).toMatch(/api_key=\*\*\*&format=json/);
    });
});
