// Mot de passe oublié : lien de réinitialisation à usage unique envoyé par email
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';
import { startSmtpSink } from './helpers/smtp-sink.js';

let server;
let admin;
let smtp;

beforeAll(async () => {
    smtp = await startSmtpSink();
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
    const r = await admin.post('/api/email-config', {
        host: '127.0.0.1',
        port: smtp.port,
        secure: false,
        user: 'robot@example.test',
        password: 'x'
    });
    expect(r.status).toBe(200);
});
afterAll(async () => {
    await server?.stop();
    await smtp?.stop();
});

const forgot = username => server.client().post('/api/forgot-password', { username });

/** Demande un lien et renvoie le jeton reçu par email */
async function requestToken(user) {
    const r = await forgot(user.username);
    expect(r.status).toBe(200);
    const mail = await smtp.waitFor(new RegExp(`To: ${user.email.replace('.', '\\.')}[\\s\\S]*reset_token=`));
    return mail.match(/reset_token=([A-Za-z0-9_-]+)/)[1];
}

describe('demande de réinitialisation', () => {
    it('identifiant obligatoire', async () => {
        expect((await forgot('')).status).toBe(400);
    });

    it('réponse identique pour un compte inconnu, sans mot de passe dans la réponse', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const known = await forgot(user.username);
        const unknown = await forgot('inconnu');
        expect(unknown.status).toBe(200);
        expect(unknown.data).toEqual(known.data);
        expect(JSON.stringify(known.data)).not.toMatch(/tempPassword|mot de passe temporaire/i);
    });

    it("ne modifie pas le mot de passe tant que le lien n'est pas utilisé", async () => {
        const user = await createUser(admin, { is_user: 1 });
        await requestToken(user);
        expect((await server.client().login(user.username, user.password, 'user')).status).toBe(200);
    });

    it("lien construit à partir d'APP_URL, pas de l'en-tête Host", async () => {
        const user = await createUser(admin, { is_user: 1 });
        await server
            .client()
            .request('POST', '/api/forgot-password', { username: user.username }, { Host: 'evil.example' });
        const mail = await smtp.waitFor(new RegExp(`To: ${user.email.replace('.', '\\.')}`));
        expect(mail).toContain(`${server.appUrl}/?reset_token=`);
        expect(mail).not.toMatch(/evil\.example/);
    });

    it('une seule demande par minute et par compte', async () => {
        const user = await createUser(admin, { is_user: 1 });
        await requestToken(user);
        const before = smtp.messages.length;
        expect((await forgot(user.username)).status).toBe(200);
        await new Promise(r => setTimeout(r, 500));
        expect(smtp.messages.length).toBe(before);
    });

    it('aucun email pour un compte désactivé', async () => {
        const user = await createUser(admin, { is_user: 1 });
        await admin.post(`/api/users/${user.id}/toggle`);
        await forgot(user.username);
        await new Promise(r => setTimeout(r, 500));
        expect(smtp.messages.some(m => m.includes(`To: ${user.email}`))).toBe(false);
    });
});

describe('utilisation du lien', () => {
    it('vérification du lien', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const token = await requestToken(user);
        expect((await server.client().post('/api/reset-password/check', { token })).data).toMatchObject({
            valid: true,
            passwordRule: expect.any(String)
        });
        expect((await server.client().post('/api/reset-password/check', { token: 'faux' })).status).toBe(400);
        expect((await server.client().post('/api/reset-password/check', {})).status).toBe(400);
    });

    it('nouveau mot de passe conforme, lien à usage unique', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const token = await requestToken(user);

        const weak = await server.client().post('/api/reset-password', { token, newPassword: 'court' });
        expect(weak.status).toBe(400);

        const ok = await server.client().post('/api/reset-password', { token, newPassword: 'Nouveau-mdp-1' });
        expect(ok.status).toBe(200);
        expect((await server.client().login(user.username, user.password, 'user')).status).toBe(401);
        expect((await server.client().login(user.username, 'Nouveau-mdp-1', 'user')).status).toBe(200);

        const again = await server.client().post('/api/reset-password', { token, newPassword: 'Autre-mdp-2' });
        expect(again.status).toBe(400);
    });

    it('ferme les sessions ouvertes du compte, mais pas les nouvelles', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const oldSession = await loginAs(server, user, 'user');
        const token = await requestToken(user);
        await server.client().post('/api/reset-password', { token, newPassword: 'Nouveau-mdp-1' });

        const r = await oldSession.get('/api/resources');
        expect(r.status).toBe(401);
        expect(r.data.error).toBe('SESSION_TERMINATED');

        const fresh = await loginAs(server, { username: user.username, password: 'Nouveau-mdp-1' }, 'user');
        expect((await fresh.get('/api/resources')).status).toBe(200);
    });
});

describe('déconnexion forcée', () => {
    it("ferme aussi les routes réservées aux administrateurs et n'affecte pas la connexion suivante", async () => {
        const other = await createUser(admin, { is_admin: 1 });
        const otherSession = await loginAs(server, other, 'admin');
        expect((await admin.post(`/api/users/${other.id}/force-logout`)).status).toBe(200);
        expect((await otherSession.get('/api/users')).status).toBe(401);

        const fresh = await loginAs(server, other, 'admin');
        expect((await fresh.get('/api/users')).status).toBe(200);
    });
});
