// Double authentification (audit de sécurité, lot 1) : seules les méthodes configurées sont acceptées (E2), un profil
// soumis à la double authentification n'est pas accessible par changement de profil sans elle (E3), la dispense vaut
// pour l'appareil (cookie « appareil de confiance ») et non pour tout le compte (E4).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.ts';
import { totp, type Client } from './helpers/client.ts';
import { createUser, loginAs } from './helpers/fixtures.ts';
import { startSmtpSink, type SmtpSink } from './helpers/smtp-sink.ts';
import type { TestServer } from './helpers/server.ts';

let server: TestServer;
let admin: Client;
let smtp: SmtpSink;

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

/** Configuration de la double authentification : profils Utilisateur et Expert soumis, jamais RH */
async function configurer(method: 'email' | 'totp' | 'both', frequency = 'always') {
    const r = await admin.post('/api/mfa/config', {
        config: { enabled: true, method, frequency, profileAdmin: false, profileExpert: true, profileUser: true }
    });
    expect(r.status).toBe(200);
}

/**
 * Compte de test au mot de passe déjà changé (changement fait à sa création, double authentification désactivée le
 * temps de cette connexion)
 */
async function nouveauCompte(profils: Record<string, number>) {
    expect((await admin.post('/api/mfa/config', { config: { enabled: false } })).status).toBe(200);
    return createUser(admin, profils);
}

/** Code reçu par email après la demande (dernier message adressé au compte) */
async function codeEmail(client: Client, email: string) {
    const avant = smtp.messages.length;
    expect((await client.post('/api/mfa/send-code')).status).toBe(200);
    const limite = Date.now() + 10000;
    while (Date.now() < limite) {
        const message = smtp.messages.slice(avant).find(m => m.includes(`To: ${email}`));
        const code = message && /color:#1d70b7;">(\d{6})</.exec(message)?.[1];
        if (code) return code;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Aucun code reçu pour ${email}`);
}

/** Connexion par mot de passe : renvoie le client (connexion en attente si la double authentification est demandée) */
async function connexion(user: { username: string; password: string }, profile: string, client = server.client()) {
    const r = await client.login(user.username, user.password, profile);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { client, r };
}

describe('E2 : méthodes acceptées et enregistrement de l’application', () => {
    it('méthode « email » : enregistrement d’une application refusé, code d’application refusé, code email accepté', async () => {
        // Application enregistrée quand la méthode le permettait, puis passage à la méthode « email »
        const user = await nouveauCompte({ is_user: 1 });
        const autre = await nouveauCompte({ is_user: 1 });
        await configurer('totp');
        const { client: avant } = await connexion(user, 'user');
        const setup = await avant.post('/api/mfa/totp-setup');
        expect(setup.status).toBe(200);
        expect((await avant.post('/api/mfa/totp-confirm', { code: totp(setup.data.secret) })).status).toBe(200);

        await configurer('email');
        const { client: attaquant } = await connexion(autre, 'user');
        expect((await attaquant.post('/api/mfa/totp-setup')).status).toBe(403);
        expect((await attaquant.post('/api/mfa/totp-confirm', { code: '123456' })).status).toBe(403);
        expect((await attaquant.get('/api/check-session')).status).toBe(401);

        const { client } = await connexion(user, 'user');
        expect((await client.post('/api/mfa/verify', { code: totp(setup.data.secret) })).status).toBe(401);
        const ok = await client.post('/api/mfa/verify', { code: await codeEmail(client, user.email) });
        expect(ok.status).toBe(200);
    });

    it('méthode « au choix » : application enregistrée seulement après un code email', async () => {
        const user = await nouveauCompte({ is_user: 1 });
        await configurer('both');
        const { client } = await connexion(user, 'user');
        // Sans code email : refus (un mot de passe volé ne suffit pas à enregistrer l'application de l'attaquant)
        expect((await client.post('/api/mfa/totp-setup')).status).toBe(403);
        expect((await client.post('/api/mfa/totp-unlock', { code: '000000' })).status).toBe(401);

        const unlock = await client.post('/api/mfa/totp-unlock', { code: await codeEmail(client, user.email) });
        expect(unlock.status).toBe(200);
        // La connexion reste en attente : le code email autorise seulement l'enregistrement
        expect((await client.get('/api/check-session')).status).toBe(401);
        const setup = await client.post('/api/mfa/totp-setup');
        expect(setup.status).toBe(200);
        const ok = await client.post('/api/mfa/totp-confirm', { code: totp(setup.data.secret) });
        expect(ok.status).toBe(200);
        expect(ok.data.user).toMatchObject({ id: user.id, activeProfile: 'user' });
    });

    it('méthode « application » seule : code email refusé à la vérification', async () => {
        const user = await nouveauCompte({ is_user: 1 });
        await configurer('totp');
        const { client } = await connexion(user, 'user');
        const code = await codeEmail(client, user.email);
        expect((await client.post('/api/mfa/verify', { code })).status).toBe(401);
    });
});

describe('E3 : changement de profil vers un profil soumis à la double authentification', () => {
    it('refusé depuis une connexion sans double authentification ; nouvel identifiant de session sinon', async () => {
        const user = await nouveauCompte({ is_rh: 1, is_user: 1 });
        await configurer('email');
        // Profil RH : jamais soumis à la double authentification
        const { client, r } = await connexion(user, 'rh');
        expect(r.data.success).toBe(true);
        const refus = await client.post('/api/switch-profile', { profile: 'user' });
        expect(refus.status).toBe(403);
        expect(refus.data.error).toMatch(/demande la double authentification/);
        expect((await client.get('/api/check-session')).data.activeProfile).toBe('rh');

        // Connexion au profil Utilisateur avec double authentification : passages libres ensuite
        const { client: valide } = await connexion(user, 'user');
        expect((await valide.post('/api/mfa/verify', { code: await codeEmail(valide, user.email) })).status).toBe(200);
        const avant = valide.cookieValue('gantt.sid');
        expect((await valide.post('/api/switch-profile', { profile: 'rh' })).status).toBe(200);
        expect(valide.cookieValue('gantt.sid')).not.toBe(avant);
        expect((await valide.post('/api/switch-profile', { profile: 'user' })).status).toBe(200);
        expect((await valide.get('/api/check-session')).data.activeProfile).toBe('user');
    });
});

describe('E4 : dispense de double authentification liée à l’appareil', () => {
    it('reconnexion sans code depuis l’appareil validé, code demandé depuis un autre appareil', async () => {
        const user = await nouveauCompte({ is_user: 1 });
        const intrus = await nouveauCompte({ is_user: 1 });
        await configurer('email', 'daily');
        const { client } = await connexion(user, 'user');
        const ok = await client.post('/api/mfa/verify', { code: await codeEmail(client, user.email) });
        expect(ok.status).toBe(200);
        expect(client.cookieValue('gantt.mfa')).toBeTruthy();
        expect((await client.post('/api/logout')).status).toBe(200);

        // Même appareil (cookie « appareil de confiance ») : pas de code
        const meme = await client.login(user.username, user.password, 'user');
        expect(meme.data).toMatchObject({ success: true });

        // Autre appareil, même compte et même période : code demandé
        const autre = await server.client().login(user.username, user.password, 'user');
        expect(autre.data.mfaRequired).toBe(true);

        // Jeton d'appareil d'un autre compte : sans effet
        const emprunt = server.client();
        const r = await emprunt.request(
            'POST',
            '/api/login',
            { username: intrus.username, password: intrus.password, profile: 'user' },
            { Cookie: `gantt.mfa=${client.cookieValue('gantt.mfa')}` }
        );
        expect(r.data.mfaRequired).toBe(true);
    });

    it('appareil validé : passage à un profil soumis à la double authentification depuis le profil RH', async () => {
        const user = await nouveauCompte({ is_rh: 1, is_user: 1 });
        await configurer('email', 'daily');
        const { client } = await connexion(user, 'user');
        expect((await client.post('/api/mfa/verify', { code: await codeEmail(client, user.email) })).status).toBe(200);
        expect((await client.post('/api/logout')).status).toBe(200);

        const { r } = await connexion(user, 'rh', client);
        expect(r.data.success).toBe(true);
        expect((await client.post('/api/switch-profile', { profile: 'user' })).status).toBe(200);
    });
});

// Audit de sécurité, lot 2 : la limite de 5 essais par connexion se contournait en se reconnectant
describe('Lot 2 : codes erronés', () => {
    /** Cinq codes faux (jamais tirés : codes de 100000 à 999999) depuis une nouvelle connexion */
    async function cinqErreurs(user: { username: string; password: string }) {
        const { client } = await connexion(user, 'user');
        for (let i = 0; i < 5; i++) {
            expect((await client.post('/api/mfa/verify', { code: '000000' })).status).toBe(401);
        }
        return client;
    }

    it('code email supprimé après 5 erreurs', async () => {
        const user = await nouveauCompte({ is_user: 1 });
        await configurer('email');
        const { client } = await connexion(user, 'user');
        const code = await codeEmail(client, user.email);
        for (let i = 0; i < 5; i++) {
            expect((await client.post('/api/mfa/verify', { code: '000000' })).status).toBe(401);
        }
        const { client: reprise } = await connexion(user, 'user');
        expect((await reprise.post('/api/mfa/verify', { code })).status).toBe(401);
    });

    it('10 codes erronés en 15 minutes : compte bloqué, même avec un bon code', async () => {
        const user = await nouveauCompte({ is_user: 1 });
        await configurer('email');
        await cinqErreurs(user);
        await cinqErreurs(user);
        const { client } = await connexion(user, 'user');
        const r = await client.post('/api/mfa/verify', { code: await codeEmail(client, user.email) });
        expect(r.status).toBe(429);
        expect(r.data.error).toMatch(/Trop de codes erronés pour ce compte/);
    });
});
