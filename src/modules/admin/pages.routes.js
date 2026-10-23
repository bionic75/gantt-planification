// Pages servies hors /api (aide personnalisable)
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import path from 'path';
import { database } from '../../db/database.js';
import { PUBLIC_DIR } from '../../lib/paths.js';

const router = Router();

// Route /aide.html — sert le HTML custom depuis settings si présent, sinon le fichier statique
// (déclarée avant les fichiers statiques, servis par finalizeApp)
router.get('/aide.html', (req, res) => {
    database.get(`SELECT value FROM settings WHERE key = 'help_html_content'`, (err, row) => {
        if (row?.value) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            // Le HTML d'aide peut être personnalisé : on y injecte le script d'icônes de l'application
            let html = row.value;
            if (!html.includes('/ui-icons.js')) {
                const tag = '<script src="/ui-icons.js" defer></script>';
                html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '</body>') : html + tag;
            }
            res.send(html);
        } else {
            res.sendFile(path.join(PUBLIC_DIR, 'aide.html'));
        }
    });
});

export default router;
