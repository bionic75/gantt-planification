// @ts-check
// Interface Vue (frontend/, docs/migration-vue.md) : îlots chargés par index.html, page publique d'un sondage
// (sondage.html).
//   production   : build (dist/frontend) servi sous /vue/, obligatoire (« npm run build:front ») ;
//   développement : serveur Vite intégré (compilation à la volée, rechargement à chaud) ;
//   test          : build s'il existe, sinon page sans îlots.
import fs from 'fs';
import path from 'path';
import express from 'express';
import { env } from '../config/env.js';
import { PROJECT_ROOT, PUBLIC_DIR } from './paths.js';

const DIST_DIR = path.join(PROJECT_ROOT, 'dist', 'frontend');
const MANIFEST = path.join(DIST_DIR, '.vite', 'manifest.json');
/** Points d'entrée : page servie → script d'entrée */
const ENTREES = { 'index.html': 'src/ilots.ts', 'sondage.html': 'src/sondage.ts' };
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

/** Balises des points d'entrée par page (build) */
/** @type {Partial<Record<PageVue, string>>} */
let balises = {};
/** Pages mises en cache (production) */
/** @type {Partial<Record<PageVue, string>>} */
const pagesEnCache = {};

/** Balises <script> et <link> de chaque point d'entrée, d'après le manifeste du build */
function balisesDuBuild() {
    if (!fs.existsSync(MANIFEST)) {
        throw new Error(`Interface Vue non construite (${MANIFEST} absent) : lancer « npm run build:front »`);
    }
    const manifeste = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    /** @type {Partial<Record<PageVue, string>>} */
    const out = {};
    for (const [page, source] of /** @type {[PageVue, string][]} */ (Object.entries(ENTREES))) {
        const entree = manifeste[source];
        if (!entree) throw new Error(`Point d'entrée ${source} absent du manifeste de l'interface Vue`);
        const css = (entree.css || []).map((/** @type {string} */ f) => `<link rel="stylesheet" href="${BASE}${f}">`);
        out[page] = [...css, `<script type="module" src="${BASE}${entree.file}"></script>`].join('');
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

/** Page avec son point d'entrée */
function pageHtml(/** @type {PageVue} */ nom) {
    const enCache = pagesEnCache[nom];
    if (enCache) return enCache;
    const html = fs.readFileSync(path.join(PUBLIC_DIR, nom), 'utf8');
    if (mode === 'vite') {
        // Intégration à un serveur existant (documentation Vite « Backend Integration ») : client du rechargement à
        // chaud et point d'entrée seulement ; le reste de la page (adresses de l'ancien code) n'est pas transformé
        const entree = `<script type="module" src="${BASE}@vite/client"></script><script type="module" src="${BASE}${ENTREES[nom]}"></script>`;
        return html.replace('</body>', `${entree}</body>`);
    }
    const page = mode === 'build' ? html.replace('</body>', `${balises[nom] ?? ''}</body>`) : html;
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
