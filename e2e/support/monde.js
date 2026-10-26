// @ts-check
// État d'un scénario : acteurs connectés (un contexte navigateur par profil, session enregistrée par la mise en
// place), appels API avec la session de l'acteur, données créées et leur nettoyage, messages et erreurs observés.
import fs from 'fs';
import { devices, expect } from '@playwright/test';
import { config, profil as profilDe, storageStatePath } from './config.js';

/** @typedef {import('@playwright/test').Browser} Browser */
/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').APIRequestContext} APIRequestContext */
/** @typedef {import('./config.js').Profil} Profil */
/** @typedef {{ status: number, data: any, headers: Record<string, string> }} Reponse */

/** Appels à l'API de l'application avec la session (cookies) d'un contexte navigateur */
export class Api {
    constructor(/** @type {APIRequestContext} */ request) {
        this.request = request;
    }

    /**
     * @param {string} method
     * @param {string} url
     * @param {unknown} [data]
     * @param {Record<string, string>} [headers]
     * @returns {Promise<Reponse>}
     */
    async appel(method, url, data, headers) {
        const r = await this.request.fetch(url, {
            method,
            data: /** @type {any} */ (data),
            headers,
            failOnStatusCode: false,
            maxRedirects: 0
        });
        const body = await r.body();
        const type = r.headers()['content-type'] || '';
        let parsed = /** @type {any} */ (body);
        if (/json/.test(type)) {
            try {
                parsed = JSON.parse(body.toString('utf8'));
            } catch {
                parsed = body.toString('utf8');
            }
        } else if (/^text\//.test(type)) {
            parsed = body.toString('utf8');
        }
        return { status: r.status(), data: parsed, headers: r.headers() };
    }
    get = (/** @type {string} */ url, /** @type {Record<string, string>} */ headers = {}) =>
        this.appel('GET', url, undefined, headers);
    post = (
        /** @type {string} */ url,
        /** @type {unknown} */ data = {},
        /** @type {Record<string, string>} */ headers = {}
    ) => this.appel('POST', url, data, headers);
    put = (/** @type {string} */ url, /** @type {unknown} */ data = {}, headers = {}) =>
        this.appel('PUT', url, data, headers);
    delete = (/** @type {string} */ url, /** @type {unknown} */ data, headers = {}) =>
        this.appel('DELETE', url, data, headers);

    /** Appel qui doit réussir (2xx) : renvoie le corps de la réponse */
    async ok(/** @type {string} */ method, /** @type {string} */ url, /** @type {unknown} */ data) {
        const r = await this.appel(method, url, data);
        expect(r.status, `${method} ${url} → ${JSON.stringify(r.data)?.slice(0, 500)}`).toBeLessThan(300);
        return r.data;
    }
}

/**
 * Acteur d'un scénario : un profil dans son propre contexte navigateur
 * @typedef {{ profil: Profil | null, context: BrowserContext, page: Page, api: Api, session?: any }} Acteur
 */

export class Monde {
    /** @param {{ browser: Browser, testInfo: import('@playwright/test').TestInfo }} p */
    constructor({ browser, testInfo }) {
        this.browser = browser;
        this.testInfo = testInfo;
        /** @type {Map<string, Acteur>} */
        this.acteurs = new Map();
        /** @type {Acteur | null} */
        this.courant = null;
        /** Données du scénario (identifiants créés, réponses…) @type {Record<string, any>} */
        this.d = {};
        /** @type {Array<{ libelle: string, fn: () => Promise<unknown> }>} */
        this.nettoyages = [];
        /** Messages des fenêtres alert / confirm, acceptées automatiquement @type {string[]} */
        this.dialogues = [];
        /** Erreurs JavaScript, violations CSP et réponses en erreur de l'application @type {string[]} */
        this.problemes = [];
        /** Dernière réponse API d'une étape « Quand » @type {Reponse | null} */
        this.reponse = null;
        this.suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
        this.seq = 0;
    }

    /** Libellé unique pour les données créées par les tests (préfixe E2E) */
    unique(/** @type {string} */ prefixe = 'E2E') {
        return `${prefixe} ${this.suffixe}${++this.seq}`;
    }

    /** Action de nettoyage, exécutée en fin de scénario (ordre inverse), même en cas d'échec */
    aNettoyer(/** @type {string} */ libelle, /** @type {() => Promise<unknown>} */ fn) {
        this.nettoyages.push({ libelle, fn });
    }

    /**
     * Contexte navigateur d'un profil (session enregistrée par la mise en place), créé à la première utilisation
     * @param {string} label « Administrateur », « Expert »…
     * @param {{ mobile?: boolean, geolocalisation?: { latitude: number, longitude: number } | null }} [options]
     */
    async acteur(label, options = {}) {
        const p = profilDe(label);
        const cle = `${p.key}${options.mobile ? ':mobile' : ''}`;
        let a = this.acteurs.get(cle);
        if (!a) {
            const etat = storageStatePath(p.key);
            if (!fs.existsSync(etat))
                throw new Error(`Session de ${p.label} absente (${etat}) : la mise en place a échoué`);
            a = await this.#creerActeur(p, cle, { storageState: etat, ...options });
        }
        this.courant = a;
        return a;
    }

    /** Navigateur sans session (mire de connexion) */
    async anonyme(
        /** @type {string} */ nom = 'anonyme',
        /** @type {{ mobile?: boolean, geolocalisation?: any }} */ options = {}
    ) {
        let a = this.acteurs.get(nom);
        if (!a) a = await this.#creerActeur(null, nom, options);
        this.courant = a;
        return a;
    }

    /**
     * @param {Profil | null} profil
     * @param {string} cle
     * @param {{ storageState?: string, mobile?: boolean, geolocalisation?: { latitude: number, longitude: number } | null }} options
     */
    async #creerActeur(profil, cle, { storageState, mobile, geolocalisation }) {
        const context = await this.browser.newContext({
            ...(mobile ? devices['Pixel 7'] : {}),
            baseURL: config.baseUrl,
            locale: 'fr-FR',
            timezoneId: 'Europe/Paris',
            storageState,
            ...(geolocalisation ? { geolocation: geolocalisation, permissions: ['geolocation'] } : {})
        });
        const page = await context.newPage();
        page.on('dialog', d => {
            this.dialogues.push(d.message());
            d.accept().catch(() => {});
        });
        // Navigateur piloté : gestionnaire de mots de passe (Credential Management) indisponible, sans rapport avec l'application
        page.on('pageerror', e => {
            if (!/Credential Management/i.test(e.message)) this.problemes.push(`JS : ${e.message}`);
        });
        page.on('console', m => {
            if (/Content Security Policy/i.test(m.text())) this.problemes.push(`CSP : ${m.text()}`);
        });
        page.on('response', r => {
            if (r.status() >= 500 && r.url().startsWith(config.baseUrl))
                this.problemes.push(`${r.status()} : ${r.url()}`);
        });
        const a = { profil, context, page, api: new Api(context.request) };
        this.acteurs.set(cle, a);
        return a;
    }

    get page() {
        if (!this.courant) throw new Error('Aucun acteur : commencer le scénario par une étape de connexion');
        return this.courant.page;
    }

    get api() {
        if (!this.courant) throw new Error('Aucun acteur : commencer le scénario par une étape de connexion');
        return this.courant.api;
    }

    /** API avec la session d'un profil (préparation des données par l'administrateur, par exemple) */
    async apiDe(/** @type {string} */ label) {
        const courant = this.courant;
        const a = await this.acteur(label);
        this.courant = courant || a;
        return a.api;
    }

    /** Informations de session d'un profil (identifiant, ressource rattachée…) */
    async sessionDe(/** @type {string} */ label) {
        const courant = this.courant;
        const a = await this.acteur(label);
        this.courant = courant || a;
        if (!a.session) {
            const r = await a.api.get('/api/check-session');
            expect(r.status, `Session de ${label} expirée : relancer la mise en place (supprimer e2e/.auth)`).toBe(200);
            a.session = r.data;
        }
        return a.session;
    }

    async fermer() {
        for (const { libelle, fn } of this.nettoyages.reverse()) {
            try {
                await fn();
            } catch (/** @type {any} */ e) {
                console.warn(`⚠️ Nettoyage « ${libelle} » : ${e.message}`);
            }
        }
        for (const a of this.acteurs.values()) await a.context.close().catch(() => {});
    }
}
