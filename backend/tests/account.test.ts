// Compte de l'utilisateur connecté, droits applicatifs, connexion mobile, mot de passe oublié
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.ts';
import { createExpert, createUser, loginAs } from './helpers/fixtures.ts';
import type { TestServer } from './helpers/server.ts';
import type { Client } from './helpers/client.ts';

let server: TestServer;
let admin: Client;

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

    it('changement de mot de passe depuis « Mon profil » : 8 caractères dont un spécial', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const url = '/api/profile/change-password';
        const currentPassword = user.password;
        expect((await client.post(url, { currentPassword })).status).toBe(400);
        expect((await client.post(url, { currentPassword, newPassword: 'court!' })).status).toBe(400);
        expect((await client.post(url, { currentPassword, newPassword: 'sansspecial' })).status).toBe(400);
        expect((await client.post(url, { currentPassword, newPassword: 'avec-special' })).status).toBe(200);
        expect((await server.client().login(user.username, 'avec-special', 'user')).status).toBe(200);
    });

    // Audit de sécurité, lot 2 : une session volée ne suffit pas à s'approprier le compte
    it('mot de passe actuel exigé ; autres sessions fermées, identifiant de session renouvelé', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const other = await loginAs(server, user, 'user');
        const url = '/api/profile/change-password';
        expect((await client.post(url, { newPassword: 'Nouveau-mdp-1' })).status).toBe(400);
        const wrong = await client.post(url, { currentPassword: 'faux', newPassword: 'Nouveau-mdp-1' });
        expect(wrong.status).toBe(400);
        expect(wrong.data.error).toBe('Mot de passe actuel incorrect');

        const before = client.cookieValue('gantt.sid');
        const ok = await client.post(url, { currentPassword: user.password, newPassword: 'Nouveau-mdp-1' });
        expect(ok.status).toBe(200);
        expect(client.cookieValue('gantt.sid')).not.toBe(before);
        expect((await client.get('/api/resources')).status).toBe(200);
        expect((await other.get('/api/resources')).status).toBe(401);
    });

    it('ancienne route de changement (6 caractères, sans règles de complexité) supprimée', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const r = await client.post('/api/users/change-password', {
            oldPassword: user.password,
            newPassword: 'abcdef'
        });
        expect(r.status).toBe(404);
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
        const row = (await admin.get('/api/users')).data.find((u: any) => u.id === user.id);
        expect(row).toMatchObject({ has_reporting_access: 1, is_rh: 1, amoa_ced: 1 });

        const client = await loginAs(server, user, 'user');
        // Reporting réservé au profil administrateur : le drapeau individuel ne donne plus accès
        expect((await client.get('/api/reporting/diagnose/1/2025/1')).status).toBe(403);
        expect((await admin.get('/api/reporting/diagnose/1/2025/1')).status).not.toBe(403);

        // Onglet Reporting administrable : ouvert au profil Utilisateur par la configuration de l'accès aux onglets
        const conf = (await admin.get('/api/tab-access')).data.config;
        expect(conf.admin.reporting).toBe(true);
        expect(conf.user.reporting).toBe(false);
        conf.user.reporting = true;
        expect((await admin.put('/api/tab-access', { config: conf })).status).toBe(200);
        expect((await client.get('/api/reporting/diagnose/1/2025/1')).status).not.toBe(403);
        conf.user.reporting = false;
        expect((await admin.put('/api/tab-access', { config: conf })).status).toBe(200);
        expect((await client.get('/api/reporting/diagnose/1/2025/1')).status).toBe(403);
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
        expect(apps.deplacements.users.map((u: any) => u.id)).toContain(user.id);

        const relog = await server.client().login(user.username, user.password, 'user');
        expect(relog.data.user).toMatchObject({
            amoaCed: true,
            availableApps: expect.arrayContaining(['affectation'])
        });
        const client = await loginAs(server, user, 'user');
        expect((await client.get('/api/affectation/resources')).status).toBe(200);

        expect((await admin.delete(`/api/app-access/affectation/users/${user.id}`)).status).toBe(200);
        expect((await client.get('/api/affectation/resources')).status).toBe(403);
        // Frise de l'Accueil : lecture des déploiements ouverte aux profils Utilisateur et Expert, sans l'application
        expect((await client.get('/api/affectation/projects')).status).toBe(200);
        expect((await client.get('/api/affectation/config')).status).toBe(200);
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
