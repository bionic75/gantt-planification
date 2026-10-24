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
        if (!html.includes('/ui-icons.js')) {
            const tag = '<script src="/ui-icons.js" defer></script>';
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '</body>') : html + tag;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    })
);

export default router;
