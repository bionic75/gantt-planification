// Double authentification (MFA) : la connexion en attente est conservée côté serveur,
// les userId / profile / secret envoyés par le client sont ignorés.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { totp } from './helpers/client.js';
import { createUser, loginAs } from './helpers/fixtures.js';

const ATTACKER_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
    const r = await admin.post('/api/mfa/config', {
        config: {
            enabled: true,
            method: 'both',
            frequency: 'always',
            profileAdmin: false,
            profileExpert: true,
            profileUser: true
        }
    });
    expect(r.status).toBe(200);
});
afterAll(() => server?.stop());

// Connexion par mot de passe d'un nouvel utilisateur : renvoie le client en attente de MFA
async function pendingLogin(user) {
    const client = server.client();
    const r = await client.login(user.username, user.password, 'user');
    expect(r.data.mfaRequired).toBe(true);
    return { client, login: r.data };
}

// Configure le TOTP d'un utilisateur et renvoie son secret
async function enrollTotp(user) {
    const { client } = await pendingLogin(user);
    const setup = await client.post('/api/mfa/totp-setup');
    expect(setup.status).toBe(200);
    const confirm = await client.post('/api/mfa/totp-confirm', { code: totp(setup.data.secret) });
    expect(confirm.status).toBe(200);
    return setup.data.secret;
}

describe('sans connexion par mot de passe', () => {
    it.each([
        [
            'POST',
            '/api/mfa/totp-confirm',
            { userId: 1, secret: ATTACKER_SECRET, code: totp(ATTACKER_SECRET), profile: 'admin' }
        ],
        ['POST', '/api/mfa/verify', { userId: 1, code: '123456', profile: 'admin' }],
        ['POST', '/api/mfa/send-code', { userId: 1 }],
        ['POST', '/api/mfa/totp-setup', { userId: 1 }],
        ['GET', '/api/mfa/totp-status/1', undefined]
    ])('%s %s → 401', async (method, url, body) => {
        const client = server.client();
        expect((await client.request(method, url, body)).status).toBe(401);
        expect((await client.get('/api/check-session')).status).toBe(401);
    });
});

describe('connexion avec MFA', () => {
    it("ne crée pas de session tant que le code n'est pas validé", async () => {
        const user = await createUser(admin, { is_user: 1 });
        const { client, login } = await pendingLogin(user);
        expect(login).toMatchObject({ mfaMethod: 'choice', totpConfigured: false });
        expect((await client.get('/api/check-session')).status).toBe(401);
        expect((await client.get('/api/resources')).status).toBe(401);
    });

    it('configure le TOTP avec le secret généré par le serveur, en ignorant userId/profile/secret du client', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const { client } = await pendingLogin(user);

        expect((await client.get('/api/mfa/totp-status/1')).data).toEqual({ configured: false });
        expect((await client.post('/api/mfa/totp-confirm', { code: '123456' })).status).toBe(400);

        const setup = await client.post('/api/mfa/totp-setup', { userId: 1 });
        expect(setup.status).toBe(200);
        expect(setup.data.qrCode).toMatch(/^data:image\/png;base64,/);

        const forged = { userId: 1, secret: ATTACKER_SECRET, profile: 'admin' };
        expect((await client.post('/api/mfa/totp-confirm', { ...forged, code: totp(ATTACKER_SECRET) })).status).toBe(
            401
        );

        const ok = await client.post('/api/mfa/totp-confirm', { ...forged, code: totp(setup.data.secret) });
        expect(ok.status).toBe(200);
        expect(ok.data.user).toMatchObject({ id: user.id, activeProfile: 'user' });
        expect((await client.get('/api/users')).status).toBe(403);
    });

    it('valide un code TOTP via /api/mfa/verify', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const secret = await enrollTotp(user);
        const { client, login } = await pendingLogin(user);
        expect(login.totpConfigured).toBe(true);

        const r = await client.post('/api/mfa/verify', { userId: 1, profile: 'admin', code: totp(secret) });
        expect(r.status).toBe(200);
        expect(r.data.user).toMatchObject({ id: user.id, activeProfile: 'user' });
        expect((await client.get('/api/check-session')).data.userId).toBe(user.id);
    });

    it('refuse de remplacer un TOTP déjà configuré', async () => {
        const user = await createUser(admin, { is_user: 1 });
        await enrollTotp(user);
        const { client } = await pendingLogin(user);
        expect((await client.post('/api/mfa/totp-setup')).status).toBe(403);
    });

    it('bloque après 5 codes erronés et annule la connexion en attente', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const secret = await enrollTotp(user);
        const { client } = await pendingLogin(user);

        const statuses = [];
        for (let i = 0; i < 6; i++) statuses.push((await client.post('/api/mfa/verify', { code: '000000' })).status);
        expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
        expect((await client.post('/api/mfa/verify', { code: totp(secret) })).status).toBe(401);
    });

    it('send-code échoue proprement sans configuration SMTP', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const { client } = await pendingLogin(user);
        const r = await client.post('/api/mfa/send-code', { userId: 1 });
        expect(r.status).toBe(500);
        expect(r.data.error).toMatch(/SMTP/);
    });

    it('le profil non soumis au MFA se connecte directement', async () => {
        const r = await server.client().login(ADMIN.username, ADMIN.password, 'admin');
        expect(r.status).toBe(200);
        expect(r.data.success).toBe(true);
    });
});
