// Connexion, session et profils
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

describe('POST /api/login', () => {
    it('exige identifiant, mot de passe et profil', async () => {
        const r = await server.client().post('/api/login', { username: 'admin', password: ADMIN.password });
        expect(r.status).toBe(400);
    });

    it('refuse un mauvais mot de passe', async () => {
        const r = await server.client().login('admin', 'mauvais', 'admin');
        expect(r.status).toBe(401);
        expect(r.data.error).toBe('Identifiants incorrects');
    });

    it('refuse un identifiant inconnu avec le même message', async () => {
        const r = await server.client().login('inconnu', 'x', 'admin');
        expect(r.status).toBe(401);
        expect(r.data.error).toBe('Identifiants incorrects');
    });

    it("refuse un profil que l'utilisateur ne possède pas", async () => {
        const user = await createUser(admin, { is_user: 1 });
        const r = await server.client().login(user.username, user.password, 'admin');
        expect(r.status).toBe(403);
    });

    it("renvoie l'utilisateur et ouvre une session", async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = server.client();
        const r = await client.login(user.username, user.password, 'user');
        expect(r.status).toBe(200);
        expect(r.data.user).toMatchObject({
            id: user.id,
            username: user.username,
            activeProfile: 'user',
            is_user: true
        });
        expect(r.data.user).not.toHaveProperty('password');

        const s = await client.get('/api/check-session');
        expect(s.status).toBe(200);
        expect(s.data).toMatchObject({ userId: user.id, username: user.username, activeProfile: 'user' });
    });

    it('refuse un compte désactivé', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await admin.post(`/api/users/${user.id}/toggle`)).status).toBe(200);
        const r = await server.client().login(user.username, user.password, 'user');
        expect(r.status).toBe(401);
    });
});

describe('session', () => {
    it('check-session renvoie 401 sans session', async () => {
        const r = await server.client().get('/api/check-session');
        expect(r.status).toBe(401);
        expect(r.data).toEqual({ authenticated: false });
    });

    it('logout ferme la session', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        expect((await client.post('/api/logout')).status).toBe(200);
        expect((await client.get('/api/check-session')).status).toBe(401);
    });

    it("change l'identifiant de session à la connexion", async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = server.client();
        await client.get('/api/version');
        await client.post('/api/logout');
        const before = client.cookie;
        await client.login(user.username, user.password, 'user');
        expect(client.cookie).toBeTruthy();
        expect(client.cookie).not.toBe(before);
    });
});

describe('POST /api/switch-profile', () => {
    it('autorise un profil possédé et refuse les autres', async () => {
        const { user } = await createExpert(admin);
        await admin.put(`/api/users/${user.id}`, { ...user, is_expert: 1, is_user: 1, resource_id: user.resource_id });
        const client = await loginAs(server, user, 'expert');

        const ok = await client.post('/api/switch-profile', { profile: 'user' });
        expect(ok.status).toBe(200);
        expect((await client.get('/api/check-session')).data.activeProfile).toBe('user');

        const ko = await client.post('/api/switch-profile', { profile: 'admin' });
        expect(ko.status).toBe(403);
        expect((await client.get('/api/users')).status).toBe(403);
    });
});

describe('GET /api/user/profiles (avant connexion)', () => {
    it("liste les profils d'un identifiant", async () => {
        const user = await createUser(admin, { is_user: 1, is_rh: 1 });
        const r = await server.client().get(`/api/user/profiles?username=${user.username}`);
        expect(r.status).toBe(200);
        expect(r.data.profiles).toEqual(['user', 'rh']);
    });

    it("ne révèle pas l'existence d'un compte : inconnu ou désactivé = compte utilisateur simple", async () => {
        const plain = await createUser(admin, { is_user: 1 });
        const expected = (await server.client().get(`/api/user/profiles?username=${plain.username}`)).data;
        expect((await server.client().get('/api/user/profiles?username=inconnu')).data).toEqual(expected);

        const disabled = await createUser(admin, { is_user: 1, is_rh: 1 });
        expect((await admin.post(`/api/users/${disabled.id}/toggle`)).status).toBe(200);
        const r = await server.client().get(`/api/user/profiles?username=${disabled.username}`);
        expect(r.data).toEqual(expected);
        // La connexion échoue ensuite comme avec un mauvais mot de passe
        const login = await server.client().login('inconnu', 'x', 'user');
        expect(login.status).toBe(401);
        expect(login.data.error).toBe('Identifiants incorrects');
    });
});

describe('changement de mot de passe', () => {
    it('réinitialisation par admin : 6 caractères minimum', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const r = await admin.post(`/api/users/${user.id}/reset-password`, { newPassword: '12345' });
        expect(r.status).toBe(400);
    });

    it("réinitialisation par l'admin : seul le nouveau mot de passe fonctionne", async () => {
        const user = await createUser(admin, { is_user: 1 });
        const r = await admin.post(`/api/users/${user.id}/reset-password`, { newPassword: 'Nouveau-Mdp-1' });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect((await server.client().login(user.username, user.password, 'user')).status).toBe(401);
        expect((await server.client().login(user.username, 'Nouveau-Mdp-1', 'user')).status).toBe(200);
    });
});
