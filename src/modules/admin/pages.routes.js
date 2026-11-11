// @ts-check
// Pages servies hors /api (aide personnalisable)
import { Router } from 'express';
import { envoyerAide, envoyerSondage } from '../../lib/frontend.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import { getSetting } from '../../services/settings.js';

const router = Router();

/**
 * Balises d'une aide personnalisée faite à partir d'une ancienne aide livrée : scripts de public/js et feuille
 * public/css/aide.css (supprimés au lot 6.5, servis par le point d'entrée de l'aide)
 */
const ANCIENNES_BALISES = [
    /<script\b[^>]*\bsrc="\/js\/[^"]*"[^>]*>\s*<\/script>/gi,
    /<link\b[^>]*\bhref="\/css\/aide\.css[^"]*"[^>]*>/gi
];

/** HTML d'une aide personnalisée sans les balises de l'ancienne aide livrée */
export function sansAnciennesBalises(/** @type {string} */ html) {
    return ANCIENNES_BALISES.reduce((h, re) => h.replace(re, ''), html);
}

/**
 * Aide en ligne : styles en ligne admis par la politique de contenu (attributs style de l'aide livrée et des aides
 * personnalisées, contenu statique) ; les scripts en ligne restent interdits
 * @param {import('express').Response} res
 */
export function admettreStylesEnLigne(res) {
    const csp = res.getHeader('Content-Security-Policy');
    if (typeof csp !== 'string') return;
    res.setHeader(
        'Content-Security-Policy',
        csp.replace(/style-src ([^;]*)/, (regle, sources) =>
            sources.includes("'unsafe-inline'") ? regle : `style-src ${sources} 'unsafe-inline'`
        )
    );
}

// /aide.html : HTML personnalisé enregistré dans les paramètres, sinon le fichier livré, avec le point d'entrée de
// l'aide (icônes, bouton « Retour à l'application », feuille de style) ; déclarée avant les fichiers statiques
router.get(
    '/aide.html',
    h(async (req, res) => {
        admettreStylesEnLigne(res);
        const html = await getSetting('help_html_content');
        envoyerAide(res, html ? sansAnciennesBalises(html) : null);
    })
);

// Page publique d'un sondage de date (adresse unique : le jeton figure dans l'adresse)
router.get('/sondage/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    envoyerSondage(req, res);
});

// Anciennes adresses des images, rangées dans public/img : pages en cache dans les navigateurs et aides personnalisées
// qui y font encore référence (scripts et feuilles de style : servis par l'interface Vue depuis le lot 6.5)
const MOVED_ASSETS = {
    img: [
        'asana-logo.png',
        'logo-ans.webp',
        'favicon-calendrier.svg',
        'favicon-gantt.svg',
        'favicon-grille.svg',
        'favicon-timeline.svg'
    ]
};
for (const [dir, files] of Object.entries(MOVED_ASSETS)) {
    for (const file of files) {
        router.get(`/${file}`, (req, res) => {
            const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
            res.redirect(301, `/${dir}/${file}${query}`);
        });
    }
}

export default router;
