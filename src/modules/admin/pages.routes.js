// @ts-check
// Pages servies hors /api (aide personnalisable)
import { Router } from 'express';
import path from 'path';
import { PUBLIC_DIR } from '../../lib/paths.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import { getSetting } from '../../services/settings.js';

const router = Router();

// /aide.html : HTML personnalisé enregistré dans les paramètres, sinon le fichier statique
// (déclarée avant les fichiers statiques, servis par finalizeApp)
router.get(
    '/aide.html',
    h(async (req, res) => {
        let html = await getSetting('help_html_content');
        if (!html) return res.sendFile(path.join(PUBLIC_DIR, 'aide.html'));
        // Le HTML d'aide peut être personnalisé : on y injecte le script d'icônes de l'application
        if (!html.includes('ui-icons.js')) {
            const tag = '<script src="/js/ui-icons.js" defer></script>';
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '</body>') : html + tag;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    })
);

// Anciennes adresses des scripts, feuilles de style et images, rangés dans public/js, public/css et public/img :
// pages en cache dans les navigateurs et aides personnalisées qui y font encore référence
const MOVED_ASSETS = {
    js: [
        'darkmode.js',
        'themes.js',
        'layout-fix.js',
        'ui-icons.js',
        'affectation-app.js',
        'event-types.js',
        'map-timelapse.js'
    ],
    css: ['themes.css', 'darkmode.css', 'login.css', 'ui-polish.css'],
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
