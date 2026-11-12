// @ts-check
// Interface Vue (frontend/, docs/migration-vue.md) : îlots chargés par index.html, page publique d'un sondage
// (sondage.html), application mobile (mobile.html).
//   production   : build (dist/frontend) servi sous /vue/, obligatoire (« npm run build:front ») ;
//   développement : serveur Vite intégré (compilation à la volée, rechargement à chaud) ;
//   test          : build s'il existe, sinon page sans îlots.
import fs from 'fs';
import path from 'path';
import express from 'express';
import { env } from '../config/env.js';
import { PAGES_DIR, PROJECT_ROOT } from './paths.js';

const DIST_DIR = path.join(PROJECT_ROOT, 'dist', 'frontend');
const MANIFEST = path.join(DIST_DIR, '.vite', 'manifest.json');
/** Points d'entrée : page servie → script d'entrée */
const ENTREES = {
    'index.html': 'src/principal.ts',
    'sondage.html': 'src/sondage.ts',
    'mobile.html': 'src/mobile.ts',
    'aide.html': 'src/aide.ts'
};
/** Feuilles de style globales d'une page, point d'entrée CSS injecté avant les feuilles des composants */
const STYLES_GLOBAUX = /** @type {Partial<Record<keyof typeof ENTREES, string>>} */ ({
    'index.html': 'src/styles/globales.css'
});
const BASE = '/vue/';
/** Port du rechargement à chaud de Vite (développement), autorisé par la CSP */
export const PORT_HMR = 24678;

/** @typedef {'build' | 'vite' | 'aucun'} ModeFrontend */

/** @returns {ModeFrontend} */
export function modeFrontend() {
    if (env.isProduction) return 'build';
    if (env.NODE_ENV === 'development') return 'vite';
    return fs.existsSync(MANIFEST) ? 'build' : 'aucun';
}

/** @type {ModeFrontend} */
let mode = 'aucun';
/** @typedef {keyof typeof ENTREES} PageVue */

/** @typedef {{ tete: string, corps: string }} Balises feuilles de style (fin de <head>) et script (fin de <body>) */

/** Balises des points d'entrée par page (build) */
/** @type {Partial<Record<PageVue, Balises>>} */
let balises = {};
/** Pages mises en cache (production) */
/** @type {Partial<Record<PageVue, string>>} */
const pagesEnCache = {};

/**
 * Feuilles de style d'un point d'entrée : les siennes et celles des modules qu'il importe statiquement (module partagé
 * entre points d'entrée, ex. la mire commune au bureau et au mobile), sans doublon (documentation Vite « Backend
 * Integration »)
 * @param {Record<string, { css?: string[], imports?: string[] }>} manifeste
 * @param {string} cle
 * @param {Set<string>} [vus]
 * @returns {string[]}
 */
export function feuillesDeStyle(manifeste, cle, vus = new Set()) {
    if (vus.has(cle)) return [];
    vus.add(cle);
    const morceau = manifeste[cle];
    if (!morceau) return [];
    const importees = (morceau.imports || []).flatMap(i => feuillesDeStyle(manifeste, i, vus));
    return [...new Set([...importees, ...(morceau.css || [])])];
}

/** Balises <script> et <link> de chaque point d'entrée, d'après le manifeste du build */
function balisesDuBuild() {
    if (!fs.existsSync(MANIFEST)) {
        throw new Error(`Interface Vue non construite (${MANIFEST} absent) : lancer « npm run build:front »`);
    }
    const manifeste = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    /** @type {Partial<Record<PageVue, Balises>>} */
    const out = {};
    for (const [page, source] of /** @type {[PageVue, string][]} */ (Object.entries(ENTREES))) {
        const entree = manifeste[source];
        if (!entree) throw new Error(`Point d'entrée ${source} absent du manifeste de l'interface Vue`);
        const globales = STYLES_GLOBAUX[page];
        if (globales && !manifeste[globales]) throw new Error(`Feuilles globales ${globales} absentes du manifeste`);
        const css = [...(globales ? [manifeste[globales].file] : []), ...feuillesDeStyle(manifeste, source)].map(
            f => `<link rel="stylesheet" href="${BASE}${f}">`
        );
        out[page] = { tete: css.join(''), corps: `<script type="module" src="${BASE}${entree.file}"></script>` };
    }
    return out;
}

/**
 * Installe l'interface Vue (fichiers du build ou serveur Vite) ; à appeler avant finalizeApp
 * @param {import('express').Express} app
 */
export async function installerFrontend(app) {
    mode = modeFrontend();
    if (mode === 'build') {
        balises = balisesDuBuild();
        // Noms de fichiers à empreinte : mise en cache longue
        app.use(BASE, express.static(DIST_DIR, { immutable: true, maxAge: '1y', index: false }));
        console.log('🧩 Interface Vue : build (dist/frontend)');
    } else if (mode === 'vite') {
        // Dépendance de développement : absente de l'image de production
        const { createServer } = await import('vite');
        const vite = await createServer({
            configFile: path.join(PROJECT_ROOT, 'frontend', 'vite.config.ts'),
            server: { middlewareMode: true, hmr: { port: PORT_HMR } },
            appType: 'custom'
        });
        // Seules les adresses de l'interface Vue lui sont confiées (pas les scripts de l'ancien code ni /api)
        app.use((req, res, next) => (req.originalUrl.startsWith(BASE) ? vite.middlewares(req, res, next) : next()));
        console.log('🧩 Interface Vue : serveur Vite (développement)');
    } else {
        console.warn('⚠️  Interface Vue non construite : page servie sans îlots (npm run build:front)');
    }
}

/**
 * Balises du point d'entrée d'une page insérées dans son HTML : feuilles de style à la fin de <head> (page affichée
 * déjà mise en forme), script à la fin de <body> ; HTML sans ces balises (aide personnalisée) : au début et à la fin
 * @param {string} html
 * @param {PageVue} nom
 */
export function avecPointEntree(html, nom) {
    /** @type {Balises} */
    let b = { tete: '', corps: '' };
    if (mode === 'vite') {
        // Intégration à un serveur existant (documentation Vite « Backend Integration ») : client du rechargement à
        // chaud et point d'entrée seulement (styles injectés par le script)
        const globales = STYLES_GLOBAUX[nom];
        b = {
            tete: globales ? `<link rel="stylesheet" href="${BASE}${globales}">` : '',
            corps: `<script type="module" src="${BASE}@vite/client"></script><script type="module" src="${BASE}${ENTREES[nom]}"></script>`
        };
    } else if (mode === 'build') b = balises[nom] ?? b;
    const tete = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${b.tete}</head>`) : b.tete + html;
    return /<\/body>/i.test(tete) ? tete.replace(/<\/body>/i, `${b.corps}</body>`) : tete + b.corps;
}

/** Page avec son point d'entrée */
function pageHtml(/** @type {PageVue} */ nom) {
    const enCache = pagesEnCache[nom];
    if (enCache) return enCache;
    const page = avecPointEntree(fs.readFileSync(path.join(PAGES_DIR, nom), 'utf8'), nom);
    if (env.isProduction) pagesEnCache[nom] = page;
    return page;
}
/** Page principale (/, /index.html et toute adresse de l'application) */
export function envoyerIndex(
    /** @type {import('express').Request} */ req,
    /** @type {import('express').Response} */ res
) {
    res.type('html').send(pageHtml('index.html'));
}

/** Page publique d'un sondage de date (/sondage/:jeton) */
export function envoyerSondage(
    /** @type {import('express').Request} */ req,
    /** @type {import('express').Response} */ res
) {
    res.type('html').send(pageHtml('sondage.html'));
}

/** Application mobile (/mobile depuis un téléphone, /mobile.html) */
export function envoyerMobile(
    /** @type {import('express').Request} */ req,
    /** @type {import('express').Response} */ res
) {
    res.type('html').send(pageHtml('mobile.html'));
}

/** Aide en ligne (/aide.html) : fichier livré, ou HTML personnalisé enregistré dans l'administration */
export function envoyerAide(/** @type {import('express').Response} */ res, /** @type {string | null} */ personnalise) {
    res.type('html').send(personnalise ? avecPointEntree(personnalise, 'aide.html') : pageHtml('aide.html'));
}
