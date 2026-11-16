// État d'un scénario : acteurs connectés (un contexte navigateur par profil, session enregistrée par la mise en
// place), appels API avec la session de l'acteur, données créées et leur nettoyage, messages et erreurs observés.
import fs from 'fs';
import { devices, expect } from '@playwright/test';
import { config, profil as profilDe, storageStatePath } from './config.ts';

import type { APIRequestContext, Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import type { Profil } from './config.ts';
import type { DonneesScenario } from './donnees-scenario.ts';

/** Réponse d'un appel à l'API : statut, corps (JSON, texte ou octets) et en-têtes */
export interface Reponse {
    status: number;
    data: any;
    headers: Record<string, string>;
}

/**
 * Délai des appels qui produisent un PDF (Chromium lancé par le serveur à chaque document) : celui que le serveur
 * s'accorde (backend/src/modules/cra/cra.documents.js) ; un runner de CI chargé dépasse les 20 s par défaut
 */
export const DELAI_PDF = 120_000;

/** Appels à l'API de l'application avec la session (cookies) d'un contexte navigateur */
export class Api {
    request: APIRequestContext;

    constructor(request: APIRequestContext) {
        this.request = request;
    }

    /** @param timeout délai de la réponse (défaut : actionTimeout de playwright.config.ts) */
    async appel(
        method: string,
        url: string,
        data?: unknown,
        headers?: Record<string, string>,
        timeout?: number
    ): Promise<Reponse> {
        const r = await this.request.fetch(url, {
            method,
            ...(timeout ? { timeout } : {}),
            data: data as any,
            headers,
            failOnStatusCode: false,
            maxRedirects: 0
        });
        const body = await r.body();
        const type = r.headers()['content-type'] || '';
        let parsed: any = body;
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
    get = (url: string, headers: Record<string, string> = {}, timeout?: number) =>
        this.appel('GET', url, undefined, headers, timeout);
    post = (url: string, data: unknown = {}, headers: Record<string, string> = {}, timeout?: number) =>
        this.appel('POST', url, data, headers, timeout);
    put = (url: string, data: unknown = {}, headers: Record<string, string> = {}) =>
        this.appel('PUT', url, data, headers);
    delete = (url: string, data?: unknown, headers: Record<string, string> = {}) =>
        this.appel('DELETE', url, data, headers);

    /** Appel qui doit réussir (2xx) : renvoie le corps de la réponse */
    async ok(method: string, url: string, data?: unknown): Promise<any> {
        const r = await this.appel(method, url, data);
        expect(r.status, `${method} ${url} → ${JSON.stringify(r.data)?.slice(0, 500)}`).toBeLessThan(300);
        return r.data;
    }
}

/** Acteur d'un scénario : un profil dans son propre contexte navigateur */
export interface Acteur {
    profil: Profil | null;
    context: BrowserContext;
    page: Page;
    api: Api;
    session?: any;
}

interface OptionsActeur {
    mobile?: boolean;
    geolocalisation?: { latitude: number; longitude: number } | null;
}

export class Monde {
    browser: Browser;
    testInfo: TestInfo;
    acteurs = new Map<string, Acteur>();
    courant: Acteur | null = null;
    /** Données du scénario partagées entre étapes (identifiants créés, réponses…) */
    d: DonneesScenario = {};
    nettoyages: Array<{ libelle: string; fn: () => Promise<unknown> }> = [];
    /** Messages des fenêtres alert / confirm, acceptées automatiquement */
    dialogues: string[] = [];
    /** Prochaine fenêtre confirm refusée au lieu d'être acceptée (annulation d'une action) */
    refuserProchainDialogue = false;
    /** Erreurs JavaScript, violations CSP et réponses en erreur de l'application */
    problemes: string[] = [];
    /** Dernière réponse API d'une étape « Quand » */
    reponse: Reponse | null = null;
    suffixe = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    seq = 0;

    constructor({ browser, testInfo }: { browser: Browser; testInfo: TestInfo }) {
        this.browser = browser;
        this.testInfo = testInfo;
    }
    /** Libellé unique pour les données créées par les tests (préfixe E2E) */
    unique(prefixe: string = 'E2E') {
        return `${prefixe} ${this.suffixe}${++this.seq}`;
    }

    /** Action de nettoyage, exécutée en fin de scénario (ordre inverse), même en cas d'échec */
    aNettoyer(libelle: string, fn: () => Promise<unknown>) {
        this.nettoyages.push({ libelle, fn });
    }

    /**
     * Contexte navigateur d'un profil (session enregistrée par la mise en place), créé à la première utilisation
     * @param label « Administrateur », « Expert »…
     */
    async acteur(label: string, options: OptionsActeur = {}): Promise<Acteur> {
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
    async anonyme(nom: string = 'anonyme', options: OptionsActeur = {}): Promise<Acteur> {
        let a = this.acteurs.get(nom);
        if (!a) a = await this.#creerActeur(null, nom, options);
        this.courant = a;
        return a;
    }

    async #creerActeur(
        profil: Profil | null,
        cle: string,
        { storageState, mobile, geolocalisation }: OptionsActeur & { storageState?: string }
    ): Promise<Acteur> {
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
            if (this.refuserProchainDialogue && d.type() === 'confirm') {
                this.refuserProchainDialogue = false;
                d.dismiss().catch(() => {});
            } else d.accept().catch(() => {});
        });
        // Navigateur piloté : gestionnaire de mots de passe (Credential Management) indisponible, sans rapport avec l'application
        page.on('pageerror', e => {
            if (!/Credential Management/i.test(e.message)) this.problemes.push(`JS : ${e.message}`);
        });
        // Violations de la politique de contenu : page de l'acteur et fenêtres qu'elle ouvre (impressions)
        const surveillerCsp = (p: Page) =>
            p.on('console', m => {
                if (!/Content Security Policy/i.test(m.text())) return;
                const { url, lineNumber } = m.location();
                this.problemes.push(`CSP : ${m.text()} (${url || p.url()}:${lineNumber})`);
            });
        surveillerCsp(page);
        context.on('page', p => {
            if (p !== page) surveillerCsp(p);
        });
        page.on('response', r => {
            if (r.status() >= 500 && r.url().startsWith(config.baseUrl))
                this.problemes.push(`${r.status()} : ${r.url()}`);
        });
        const a: Acteur = { profil, context, page, api: new Api(context.request) };
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
    async apiDe(label: string) {
        const courant = this.courant;
        const a = await this.acteur(label);
        this.courant = courant || a;
        return a.api;
    }

    /** Informations de session d'un profil (identifiant, ressource rattachée…) */
    async sessionDe(label: string) {
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
            } catch (e: any) {
                console.warn(`⚠️ Nettoyage « ${libelle} » : ${e.message}`);
            }
        }
        for (const a of this.acteurs.values()) await a.context.close().catch(() => {});
    }
}
