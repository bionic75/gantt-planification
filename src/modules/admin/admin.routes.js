// Administration : configuration email, version, paramètres, accès aux onglets, thèmes, aide
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';
import { emailConfig, sendEmail, setEmailConfig } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';
import { TAB_KEYS, TAB_PROFILES, sanitizeThemeConfig, tabAccessMerge } from './admin.service.js';

const router = Router();

router.get('/email-config', requireAdmin, (req, res) => {
    database.get('SELECT * FROM email_config WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('Erreur récup config:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(row || { host: '', port: 587, secure: 0, user: '', password: '' });
        }
    });
});

router.post('/email-config', requireAdmin, (req, res) => {
    const { host, port, secure, user, password } = req.body;

    if (!host || !port || !user || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    database.run(
        `INSERT INTO email_config (id, host, port, secure, user, password)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
            host = excluded.host,
            port = excluded.port,
            secure = excluded.secure,
            user = excluded.user,
            password = excluded.password,
            updated_at = CURRENT_TIMESTAMP`,
        [host, port, secure ? 1 : 0, user, password],
        err => {
            if (err) {
                console.error('Erreur sauvegarde config email:', err);
                res.status(500).json({ error: err.message });
            } else {
                setEmailConfig({ host, port, secure, user, password });
                logUserAction(req, 'Configuration email', {
                    host,
                    port,
                    user
                });
                res.json({ success: true });
            }
        }
    );
});

router.post('/email-config/test', requireAdmin, async (req, res) => {
    try {
        await sendEmail(
            emailConfig.user,
            'Test de configuration SMTP',
            '<p>Ceci est un email de test. Si vous recevez ce message, votre configuration SMTP est correcte !</p>'
        );
        res.json({ success: true, message: 'Email de test envoyé avec succès' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Configuration et récupération de la version
router.post('/system/version', requireAdmin, (req, res) => {
    const { version } = req.body;

    if (!version) {
        return res.status(400).json({ error: 'Version requise' });
    }

    database.run(
        `INSERT INTO system_config (id, version, updated_at)
         VALUES (1, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET 
            version = excluded.version,
            updated_at = CURRENT_TIMESTAMP`,
        [version],
        err => {
            if (err) {
                console.error('Erreur sauvegarde version:', err);
                res.status(500).json({ success: false, error: err.message });
            } else {
                console.log('✅ Version mise à jour:', version);
                res.json({ success: true });
            }
        }
    );
});

router.get('/system/version', (req, res) => {
    database.get('SELECT version FROM system_config WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('Erreur récup version:', err);
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json({ version: row.version });
        } else {
            res.json({ version: '1.0.0' });
        }
    });
});

router.get('/settings', requireAuth, (req, res) => {
    database.all('SELECT * FROM settings', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    });
});

// Endpoint PUBLIC pour récupérer la version (accessible sans authentification)
router.get('/version', (req, res) => {
    database.get('SELECT value FROM settings WHERE key = ?', ['app_version'], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ version: row ? row.value : '1.0.0' });
    });
});

router.get('/tab-access', requireAuth, (req, res) => {
    database.get("SELECT value FROM settings WHERE key = 'tab_access_config'", (err, row) => {
        let stored = null;
        try {
            stored = row && row.value ? JSON.parse(row.value) : null;
        } catch (e) {
            stored = null;
        }
        res.json({
            config: tabAccessMerge(stored),
            defaults: tabAccessMerge(null),
            tabs: TAB_KEYS,
            profiles: TAB_PROFILES
        });
    });
});

router.put('/tab-access', requireAdmin, (req, res) => {
    const cfg = req.body && req.body.config;
    if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: 'Configuration invalide' });
    const clean = tabAccessMerge(cfg);
    database.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('tab_access_config', ?)",
        [JSON.stringify(clean)],
        err => {
            if (err) return res.status(500).json({ error: err.message });
            logUserAction(req, "Modification de l'accès aux onglets par profil", { config: clean });
            res.json({ success: true, config: clean });
        }
    );
});

// Public : le thème s'applique aussi à l'écran de connexion
router.get('/theme', (req, res) => {
    database.get('SELECT value FROM settings WHERE key = ?', ['theme_config'], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        let parsed = null;
        try {
            parsed = row ? JSON.parse(row.value) : null;
        } catch (e) {
            /* valeur corrompue : défauts */
        }
        res.json(sanitizeThemeConfig(parsed));
    });
});

router.put('/theme', requireAdmin, (req, res) => {
    const cfg = sanitizeThemeConfig(req.body);
    database.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['theme_config', JSON.stringify(cfg)],
        err => {
            if (err) return res.status(500).json({ error: err.message });
            logUserAction(req, "Mise à jour thème d'affichage", {
                mode: cfg.mode,
                forced: cfg.forced,
                intensity: cfg.intensity
            });
            res.json(cfg);
        }
    );
});

router.put('/settings', requireAuth, requireAdmin, (req, res) => {
    const { key, value } = req.body;
    database.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logUserAction(req, 'Mise à jour paramètre', { key, value });
        res.json({ success: true, key, value });
    });
});

// Alias POST pour saveHelpPublication et autres appels front
router.post('/settings', requireAuth, requireAdmin, (req, res) => {
    const { key, value } = req.body;
    database.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logUserAction(req, 'Mise à jour paramètre', { key, value });
        res.json({ success: true, key, value });
    });
});

// POST /api/help/upload — stocke le contenu HTML dans settings
router.post('/help/upload', requireAdmin, (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim().startsWith('<!')) {
        return res.status(400).json({ error: 'Contenu HTML invalide' });
    }
    database.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('help_html_content', ?)`, [content], err => {
        if (err) return res.status(500).json({ error: err.message });
        database.run(
            `INSERT OR REPLACE INTO settings (key, value) VALUES ('help_html_updated_at', ?)`,
            [new Date().toISOString()],
            () => res.json({ success: true })
        );
    });
});

// DELETE /api/help/upload — supprime le HTML custom
router.delete('/help/upload', requireAdmin, (req, res) => {
    database.run(`DELETE FROM settings WHERE key IN ('help_html_content', 'help_html_updated_at')`, err =>
        err ? res.status(500).json({ error: err.message }) : res.json({ success: true })
    );
});

// GET /api/help/info — métadonnées du fichier d'aide (sans le contenu)
router.get('/help/info', requireAdmin, (req, res) => {
    database.get(`SELECT value FROM settings WHERE key = 'help_html_updated_at'`, (err, row) => {
        res.json({ exists: !!row, updatedAt: row?.value || null });
    });
});

export default router;
