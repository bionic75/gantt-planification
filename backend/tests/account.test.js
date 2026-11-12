// Compte de l'utilisateur connecté, droits applicatifs, connexion mobile, mot de passe oublié
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

const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';

describe('mon compte', () => {
    it('photo de profil', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        expect((await client.get('/api/profile/photo')).data).toEqual({ photo: null });
        expect((await client.post('/api/profile/photo', {})).status).toBe(400);
        expect((await client.post('/api/profile/photo', { photo: 'http://x/y.png' })).status).toBe(400);
        expect((await client.post('/api/profile/photo', { photo: PHOTO })).status).toBe(200);
        expect((await client.get('/api/profile/photo')).data).toEqual({ photo: PHOTO });
    });

    it('onglet par défaut : uniquement le sien, parmi les onglets connus', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        expect((await client.put(`/api/users/${user.id}/default-tab`, { defaultTab: 'inconnu' })).status).toBe(400);
        expect((await client.put('/api/users/1/default-tab', { defaultTab: 'cra' })).status).toBe(403);
        expect((await client.put(`/api/users/${user.id}/default-tab`, { defaultTab: 'cra' })).status).toBe(200);
        const relog = await server.client().login(user.username, user.password, 'user');
        expect(relog.data.user.defaultTab).toBe('cra');
    });

    it('changement de mot de passe avec vérification de l’ancien', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const url = '/api/users/change-password';
        expect((await client.post(url, { newPassword: 'abcdef' })).status).toBe(400);
        expect((await client.post(url, { oldPassword: user.password, newPassword: 'abc' })).status).toBe(400);
        expect((await client.post(url, { oldPassword: 'faux', newPassword: 'abcdefg' })).status).toBe(401);
        expect((await client.post(url, { oldPassword: user.password, newPassword: 'abcdefg' })).status).toBe(200);
        expect((await server.client().login(user.username, 'abcdefg', 'user')).status).toBe(200);
    });

    it('changement de mot de passe depuis « Mon profil » : 8 caractères dont un spécial', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const url = '/api/profile/change-password';
        expect((await client.post(url, {})).status).toBe(400);
        expect((await client.post(url, { newPassword: 'court!' })).status).toBe(400);
        expect((await client.post(url, { newPassword: 'sansspecial' })).status).toBe(400);
        expect((await client.post(url, { newPassword: 'avec-special' })).status).toBe(200);
        expect((await server.client().login(user.username, 'avec-special', 'user')).status).toBe(200);
    });

    it("email du compte expert d'une ressource", async () => {
        const { user, resource } = await createExpert(admin);
        const r = await admin.get(`/api/user/email-by-resource/${resource.id}`);
        expect(r.data).toEqual({ email: user.email, nom: user.nom, prenom: user.prenom });
        expect((await admin.get('/api/user/email-by-resource/999999')).data).toEqual({ email: null });
    });
});

describe('administration des comptes', () => {
    it('recherche (2 caractères minimum)', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await admin.get('/api/users/search?q=a')).data).toEqual([]);
        const found = (await admin.get(`/api/users/search?q=${user.nom}`)).data;
        expect(found).toEqual([
            { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, username: user.username }
        ]);
    });

    it('droits reporting, RH et AMOA CED', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await admin.post(`/api/users/${user.id}/reporting-access`, { hasAccess: true })).data).toEqual({
            success: true,
            hasReportingAccess: true
        });
        expect((await admin.post(`/api/users/${user.id}/rh-access`, { hasAccess: true })).data).toEqual({
            success: true
        });
        expect((await admin.post(`/api/users/${user.id}/amoa-ced`, { hasAccess: true })).data).toEqual({
            success: true,
            amoaCed: true
        });
        const row = (await admin.get('/api/users')).data.find(u => u.id === user.id);
        expect(row).toMatchObject({ has_reporting_access: 1, is_rh: 1, amoa_ced: 1 });

        const client = await loginAs(server, user, 'user');
        expect((await client.get('/api/reporting/diagnose/1/2025/1')).status).not.toBe(403);
    });

    it('volontariat astreinte : refusé sans ressource rattachée', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await admin.post(`/api/users/${user.id}/astreinte-access`, { hasAccess: true })).status).toBe(400);
        const { user: expert } = await createExpert(admin);
        expect((await admin.post(`/api/users/${expert.id}/astreinte-access`, { hasAccess: true })).status).toBe(200);
    });

    it('accès aux applications', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await admin.post('/api/app-access/inconnue/users', { userId: user.id })).status).toBe(400);
        expect((await admin.post('/api/app-access/deplacements/users', { userId: user.id })).status).toBe(200);
        expect((await admin.post('/api/app-access/affectation/users', { userId: user.id })).status).toBe(200);

        const apps = (await admin.get('/api/app-access')).data;
        expect(Object.keys(apps)).toEqual(['deplacements', 'analyse', 'affectation']);
        expect(apps.deplacements.users.map(u => u.id)).toContain(user.id);

        const relog = await server.client().login(user.username, user.password, 'user');
        expect(relog.data.user).toMatchObject({
            amoaCed: true,
            availableApps: expect.arrayContaining(['affectation'])
        });
        const client = await loginAs(server, user, 'user');
        expect((await client.get('/api/affectation/config')).status).toBe(200);

        expect((await admin.delete(`/api/app-access/affectation/users/${user.id}`)).status).toBe(200);
        expect((await client.get('/api/affectation/config')).status).toBe(403);
    });
});

describe('connexion mobile', () => {
    it('choisit le profil le plus élevé', async () => {
        const { user } = await createExpert(admin);
        const r = await server.client().post('/api/mobile-login', { username: user.username, password: user.password });
        expect(r.status).toBe(200);
        expect(r.data.user.activeProfile).toBe('expert');
    });

    it('identifiants obligatoires et vérifiés', async () => {
        expect((await server.client().post('/api/mobile-login', { username: 'admin' })).status).toBe(400);
        const r = await server.client().post('/api/mobile-login', { username: 'admin', password: 'faux' });
        expect(r.status).toBe(401);
    });

    it('refuse un compte RH seul', async () => {
        const user = await createUser(admin, { is_rh: 1 });
        const r = await server.client().post('/api/mobile-login', { username: user.username, password: user.password });
        expect(r.status).toBe(403);
    });
});
