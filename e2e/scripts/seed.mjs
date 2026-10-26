// @ts-check
// Jeu de données des tests de bout en bout sur une instance vierge (CI, poste de développement) :
// 4 comptes de test, ressource de l'expert, localisations, SMTP de test, double authentification par e-mail.
// Les scénarios créent ensuite leurs propres données. Relançable : les éléments existants sont conservés.
//
// Usage : node e2e/scripts/seed.mjs
//   E2E_BASE_URL, E2E_<PROFIL>_LOGIN / _PASSWORD, E2E_SHARED_MAILBOX : comme pour les tests (e2e/.env)
//   E2E_SEED_ADMIN_LOGIN / E2E_SEED_ADMIN_PASSWORD : compte administrateur initial de l'instance
//     (INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD du serveur)
//   E2E_SEED_SMTP_HOST / E2E_SEED_SMTP_PORT : SMTP de test vu depuis le serveur (Mailpit : 127.0.0.1:1025)
//   E2E_SEED_ALLOW_REMOTE=true : autorise une instance autre que localhost (jamais la production)
import { config, ORDRE_CONNEXIONS, PROFILS } from '../support/config.js';

const env = (/** @type {string} */ name, fallback = '') => (process.env[name] ?? fallback).trim();

const BASE = config.baseUrl;
const SHARED = config.mail.sharedAddress || 'shared@e2e.local';
const SMTP_HOST = env('E2E_SEED_SMTP_HOST', '127.0.0.1');
const SMTP_PORT = Number(env('E2E_SEED_SMTP_PORT', '1025'));
// Mot de passe donné à la création (à changer à la première connexion), distinct du mot de passe final
const MOT_DE_PASSE_INITIAL = 'Initial-Seed-2026!';

const hote = new URL(BASE).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(hote) && env('E2E_SEED_ALLOW_REMOTE') !== 'true') {
    console.error(
        `Instance ${BASE} : le jeu de données n'est créé que sur une instance locale (E2E_SEED_ALLOW_REMOTE)`
    );
    process.exit(1);
}
for (const key of ORDRE_CONNEXIONS) {
    if (!PROFILS[key].password) {
        console.error(`Mot de passe du profil ${PROFILS[key].label} absent (E2E_*_PASSWORD)`);
        process.exit(1);
    }
}

/** Client HTTP avec cookie de session */
function client() {
    let cookie = '';
    /**
     * @param {string} method
     * @param {string} url
     * @param {unknown} [body]
     * @param {{ accepter?: number[] }} [options] statuts d'erreur tolérés (élément déjà présent…)
     */
    return async (method, url, body, { accepter = [] } = {}) => {
        const r = await fetch(BASE + url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const setCookie = r.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const texte = await r.text();
        let data;
        try {
            data = JSON.parse(texte);
        } catch {
            data = texte;
        }
        if (r.status >= 400 && !accepter.includes(r.status)) {
            throw new Error(`${method} ${url} → ${r.status} ${texte.slice(0, 300)}`);
        }
        return { status: r.status, data };
    };
}

/** Connexion ; un mot de passe à changer est remplacé par nouveauMotDePasse */
async function connecter(
    /** @type {string} */ login,
    /** @type {string} */ password,
    /** @type {string} */ nouveauMotDePasse
) {
    const api = client();
    const { data } = await api('POST', '/api/login', { username: login, password });
    if (data.mfaRequired)
        throw new Error(`${login} : double authentification déjà active, instance déjà initialisée ?`);
    if (data.profileRequired) await api('POST', '/api/login', { username: login, password, profile: data.profiles[0] });
    if (data.user?.mustChangePassword)
        await api('POST', '/api/profile/change-password', { newPassword: nouveauMotDePasse });
    return api;
}

// ---------- Administrateur initial ----------

const adminLogin = env('E2E_SEED_ADMIN_LOGIN', 'admin');
const adminPassword = env('E2E_SEED_ADMIN_PASSWORD', 'admin');
// Mot de passe imposé à la première connexion : dérivé du mot de passe initial (relance du script)
const adminPasswordChange = `${adminPassword}-Seed1!`;
/** @type {Awaited<ReturnType<typeof connecter>> | null} */
let admin = null;
for (const password of [adminPassword, adminPasswordChange]) {
    try {
        admin = await connecter(adminLogin, password, adminPasswordChange);
        break;
    } catch (/** @type {any} */ e) {
        if (/double authentification/.test(e.message)) {
            console.log('Instance déjà initialisée (double authentification active) : rien à faire');
            process.exit(0);
        }
        if (!/→ 401/.test(e.message)) throw e;
    }
}
if (!admin) throw new Error(`Connexion de l'administrateur initial ${adminLogin} impossible (E2E_SEED_ADMIN_PASSWORD)`);
console.log(`Administrateur initial connecté : ${adminLogin}`);

// ---------- Localisations (SAMU géolocalisés) ----------

const LOCALISATIONS = [
    ['SAMU DE PARIS', 'SAMU 75', 48.8402, 2.3655],
    ['SAMU DES HAUTS-DE-SEINE', 'SAMU 92', 48.8924, 2.2069],
    ['SAMU DE SEINE-SAINT-DENIS', 'SAMU 93', 48.9137, 2.4847],
    ['SAMU DES BOUCHES-DU-RHONE', 'SAMU 13', 43.2965, 5.3698]
];
for (const [libelle_long, libelle_court, latitude, longitude] of LOCALISATIONS) {
    const { status } = await admin(
        'POST',
        '/api/locations',
        { libelle_long, libelle_court, adresse: libelle_long, latitude, longitude },
        { accepter: [409] }
    );
    console.log(`Localisation ${libelle_court} : ${status === 409 ? 'déjà présente' : 'créée'}`);
}

// ---------- Ressource de l'expert (volontaire aux astreintes) ----------

const RESSOURCE_EXPERT = {
    nom: 'EXPERT-E2E',
    prenom: 'Expert',
    trigramme: 'EXE',
    taux: 50,
    samu: 'SAMU 75',
    date_debut: '2025-01-01'
};
let ressource = (await admin('GET', '/api/resources')).data.find(
    (/** @type {any} */ r) => r.nom === RESSOURCE_EXPERT.nom
);
if (!ressource) {
    const { data } = await admin('POST', '/api/resources', { ...RESSOURCE_EXPERT, email: SHARED });
    ressource = { id: data.id };
    console.log(`Ressource ${RESSOURCE_EXPERT.nom} créée`);
}
await admin('POST', `/api/resources/${ressource.id}/astreinte`, { hasAccess: true });

// ---------- Comptes de test ----------

const COMPTES = {
    admin: { is_admin: 1, nom: 'Administrateur', prenom: 'E2E' },
    expert: { is_expert: 1, resource_id: ressource.id, nom: 'Expert', prenom: 'E2E' },
    user: { is_user: 1, nom: 'Utilisateur', prenom: 'E2E' },
    rh: { is_rh: 1, nom: 'Rh', prenom: 'E2E' }
};
const usersDe = async () => {
    const { data } = await admin('GET', '/api/users');
    return /** @type {any[]} */ (Array.isArray(data) ? data : data.users);
};
const existants = new Set((await usersDe()).map(u => u.username));
for (const key of ORDRE_CONNEXIONS) {
    const p = PROFILS[key];
    if (existants.has(p.login)) {
        console.log(`Compte ${p.login} : déjà présent`);
        continue;
    }
    await admin('POST', '/api/users', {
        username: p.login,
        password: MOT_DE_PASSE_INITIAL,
        email: SHARED,
        ...COMPTES[key]
    });
    // Première connexion : mot de passe initial remplacé par celui des tests
    await connecter(p.login, MOT_DE_PASSE_INITIAL, p.password);
    console.log(`Compte ${p.login} créé`);
}

// Applications supplémentaires (menu Applications) pour l'administrateur de test
const adminTest = (await usersDe()).find(u => u.username === PROFILS.admin.login);
for (const app of ['affectation', 'analyse', 'deplacements']) {
    await admin(
        'POST',
        `/api/app-access/${app}/users`,
        { userId: adminTest.id, user_id: adminTest.id },
        { accepter: [400, 409] }
    );
}

// ---------- SMTP de test et double authentification ----------

await admin('POST', '/api/email-config', {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    user: 'robot@e2e.local',
    password: 'smtp-de-test'
});
console.log(`SMTP de test : ${SMTP_HOST}:${SMTP_PORT}`);

// Code demandé à chaque connexion (profils administrateur, expert et utilisateur ; jamais RH)
await admin('POST', '/api/mfa/config', {
    config: {
        enabled: true,
        method: 'email',
        frequency: 'always',
        profileAdmin: true,
        profileExpert: true,
        profileUser: true,
        codeValidity: 10
    }
});
console.log('Double authentification par e-mail activée');
console.log('Jeu de données prêt');
