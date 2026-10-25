// Connexion, session et profils
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, DEFAULT_ADMIN, startServer } from './helpers/server.js';
import { createExpert, createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

describe('POST /api/login', () => {
    it('exige identifiant et mot de passe', async () => {
        expect((await server.client().post('/api/login', { username: 'admin' })).status).toBe(400);
        expect((await server.client().post('/api/login', { password: ADMIN.password })).status).toBe(400);
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

describe('connexion sans profil (écran de connexion)', () => {
    const loginWithoutProfile = (username, password) => server.client().post('/api/login', { username, password });

    it('compte à profil unique : connecté directement', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const r = await loginWithoutProfile(user.username, user.password);
        expect(r.status).toBe(200);
        expect(r.data.user).toMatchObject({ id: user.id, activeProfile: 'user' });
    });

    it('compte à plusieurs profils : profils renvoyés après vérification du mot de passe, sans session', async () => {
        const user = await createUser(admin, { is_user: 1, is_rh: 1 });
        const client = server.client();
        const r = await client.post('/api/login', { username: user.username, password: user.password });
        expect(r.data).toEqual({ profileRequired: true, profiles: ['user', 'rh'] });
        expect((await client.get('/api/check-session')).status).toBe(401);

        // Mauvais mot de passe : aucun profil révélé
        const bad = await loginWithoutProfile(user.username, 'mauvais');
        expect(bad.status).toBe(401);
        expect(bad.data).toEqual({ error: 'Identifiants incorrects' });
    });

    it("ne révèle rien d'un compte inconnu ou désactivé", async () => {
        const disabled = await createUser(admin, { is_user: 1, is_rh: 1 });
        expect((await admin.post(`/api/users/${disabled.id}/toggle`)).status).toBe(200);
        for (const [username, password] of [
            ['inconnu', 'x'],
            [disabled.username, disabled.password]
        ]) {
            const r = await loginWithoutProfile(username, password);
            expect(r.status).toBe(401);
            expect(r.data).toEqual({ error: 'Identifiants incorrects' });
        }
    });

    it("l'ancienne route de consultation des profils n'existe plus", async () => {
        const r = await server.client().get('/api/user/profiles?username=admin');
        expect(r.data).not.toHaveProperty('profiles');
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

// Serveurs supplémentaires, chacun avec sa base (PostgreSQL / MariaDB : création et migrations plus longues)
describe('compte administrateur initial', { timeout: 120000 }, () => {
    it('INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD : compte créé avec ces identifiants, mot de passe absent des journaux', async () => {
        const chef = { username: 'chef', password: 'Chef-initial-2026!' };
        const other = await startServer({ initialAdmin: chef });
        try {
            const r = await other.client().login(chef.username, chef.password, 'admin');
            expect(r.status).toBe(200);
            expect(r.data.user).toMatchObject({ username: 'chef', is_admin: true });
            // Pas de compte « admin » en plus
            expect((await other.client().login('admin', 'admin', 'admin')).status).toBe(401);
            expect(other.logs).toContain('Compte administrateur initial créé : chef');
            expect(other.logs).not.toContain(chef.password);
        } finally {
            await other.stop();
        }
    });

    it('sans ces variables : admin / admin', async () => {
        const other = await startServer({ initialAdmin: null });
        try {
            expect((await other.client().login(DEFAULT_ADMIN.username, DEFAULT_ADMIN.password, 'admin')).status).toBe(
                200
            );
        } finally {
            await other.stop();
        }
    });
});

describe('changement de mot de passe obligatoire', () => {
    /** Compte créé par l'administrateur, mot de passe pas encore changé */
    const givenAccount = () => createUser(admin, { is_user: 1 }, { changePassword: false });

    it("compte créé par l'administrateur : application bloquée jusqu'au changement", async () => {
        const user = await givenAccount();
        const client = server.client();
        const r = await client.login(user.username, user.password, 'user');
        expect(r.status).toBe(200);
        expect(r.data.user.mustChangePassword).toBe(true);

        const blocked = await client.get('/api/resources');
        expect(blocked.status).toBe(403);
        expect(blocked.data.error).toBe('PASSWORD_CHANGE_REQUIRED');
        expect((await client.get('/api/check-session')).data.mustChangePassword).toBe(true);
        // Ancienne route de changement (6 caractères) : bloquée aussi
        expect(
            (await client.post('/api/users/change-password', { oldPassword: user.password, newPassword: 'abcdef' }))
                .status
        ).toBe(403);

        // Même mot de passe, ou trop faible : refusé
        expect((await client.post('/api/profile/change-password', { newPassword: user.password })).status).toBe(400);
        expect((await client.post('/api/profile/change-password', { newPassword: 'court' })).status).toBe(400);

        const ok = await client.post('/api/profile/change-password', { newPassword: 'Mon-nouveau-mdp-1' });
        expect(ok.status).toBe(200);
        expect((await client.get('/api/resources')).status).toBe(200);
        expect((await client.get('/api/check-session')).data.mustChangePassword).toBe(false);

        const relog = await server.client().login(user.username, 'Mon-nouveau-mdp-1', 'user');
        expect(relog.data.user.mustChangePassword).toBe(false);
    });

    it('mot de passe réinitialisé par un administrateur : changement de nouveau obligatoire', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await server.client().login(user.username, user.password, 'user')).data.user.mustChangePassword).toBe(
            false
        );
        expect(
            (await admin.post(`/api/users/${user.id}/reset-password`, { newPassword: 'Donne-par-admin-1' })).status
        ).toBe(200);
        const r = await server.client().login(user.username, 'Donne-par-admin-1', 'user');
        expect(r.data.user.mustChangePassword).toBe(true);
    });

    it('compte administrateur initial : changement obligatoire', { timeout: 120000 }, async () => {
        const other = await startServer({ initialAdmin: null });
        try {
            const client = other.client();
            const r = await client.login(DEFAULT_ADMIN.username, DEFAULT_ADMIN.password, 'admin');
            expect(r.data.user.mustChangePassword).toBe(true);
            expect((await client.get('/api/users')).status).toBe(403);
        } finally {
            await other.stop();
        }
    });

    it("application mobile : connexion refusée tant que le mot de passe n'est pas changé", async () => {
        const user = await givenAccount();
        const r = await server.client().post('/api/mobile-login', { username: user.username, password: user.password });
        expect(r.status).toBe(403);
        expect(r.data.error).toMatch(/ordinateur/);
    });
});
