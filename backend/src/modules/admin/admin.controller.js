// @ts-check
import { prisma } from '../../db/prisma.js';
import { sqlTimestamp, toInt } from '../../db/values.js';
import { badRequest } from '../../lib/http-error.js';
import { emailConfig, sendEmail, setEmailConfig } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';
import { deleteSettings, getAllSettings, getJsonSetting, getSetting, setSetting } from '../../services/settings.js';
import { TAB_KEYS, TAB_PROFILES, sanitizeThemeConfig, tabAccessMerge } from './admin.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

// ---------- Configuration email ----------

/** Configuration SMTP sans le mot de passe : seul passwordSet indique qu'il est enregistré */
export async function getEmailConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    const row = await prisma.emailConfig.findUnique({ where: { id: 1 } });
    if (!row) return res.json({ host: '', port: 587, secure: 0, user: '', passwordSet: false });
    const { password, ...config } = row;
    res.json({ ...config, passwordSet: !!password });
}

/** Mot de passe absent ou vide : celui déjà enregistré est conservé */
export async function saveEmailConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { host, port, secure, user } = req.body;
    const password = req.body.password || (await prisma.emailConfig.findUnique({ where: { id: 1 } }))?.password || '';
    if (!host || !port || !user || !password) throw badRequest('Tous les champs sont requis');
    const data = {
        host: String(host),
        port: /** @type {number} */ (toInt(port)),
        secure: secure ? 1 : 0,
        user: String(user),
        password: String(password)
    };
    await prisma.emailConfig.upsert({
        where: { id: 1 },
        create: { id: 1, ...data },
        update: { ...data, updated_at: sqlTimestamp() }
    });
    setEmailConfig({ host, port, secure, user, password });
    logUserAction(req, 'Configuration email', { host, port, user });
    res.json({ success: true });
}

export async function testEmailConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    try {
        await sendEmail(
            emailConfig.user,
            'Test de configuration SMTP',
            '<p>Ceci est un email de test. Si vous recevez ce message, votre configuration SMTP est correcte !</p>'
        );
        res.json({ success: true, message: 'Email de test envoyé avec succès' });
    } catch (/** @type {any} */ error) {
        res.json({ success: false, error: error.message });
    }
}

// ---------- Version ----------

export async function setSystemVersion(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { version } = req.body;
    if (!version) throw badRequest('Version requise');
    const data = { version: String(version), updated_at: sqlTimestamp() };
    await prisma.systemConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    console.log('✅ Version mise à jour:', version);
    res.json({ success: true });
}

export async function getSystemVersion(/** @type {Request} */ req, /** @type {Response} */ res) {
    const row = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { version: true } });
    res.json({ version: row ? row.version : '1.0.0' });
}

/** Version de l'application (publique) */
export async function getAppVersion(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ version: (await getSetting('app_version')) ?? '1.0.0' });
}

// ---------- Paramètres ----------

export async function listSettings(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await getAllSettings());
}

export async function saveSetting(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { key, value } = req.body;
    if (typeof key !== 'string' || !key || value === undefined || value === null) {
        throw badRequest('Clé et valeur requises');
    }
    await setSetting(key, value);
    logUserAction(req, 'Mise à jour paramètre', { key, value });
    res.json({ success: true, key, value });
}

// ---------- Accès aux onglets ----------

export async function getTabAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({
        config: tabAccessMerge(await getJsonSetting('tab_access_config')),
        defaults: tabAccessMerge(null),
        tabs: TAB_KEYS,
        profiles: TAB_PROFILES
    });
}

export async function saveTabAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    const cfg = req.body && req.body.config;
    if (!cfg || typeof cfg !== 'object') throw badRequest('Configuration invalide');
    const clean = tabAccessMerge(cfg);
    await setSetting('tab_access_config', JSON.stringify(clean));
    logUserAction(req, "Modification de l'accès aux onglets par profil", { config: clean });
    res.json({ success: true, config: clean });
}

// ---------- Thème (public : il s'applique aussi à l'écran de connexion) ----------

export async function getTheme(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(sanitizeThemeConfig(await getJsonSetting('theme_config')));
}

export async function saveTheme(/** @type {Request} */ req, /** @type {Response} */ res) {
    const cfg = sanitizeThemeConfig(req.body);
    await setSetting('theme_config', JSON.stringify(cfg));
    logUserAction(req, "Mise à jour thème d'affichage", {
        mode: cfg.mode,
        forced: cfg.forced,
        intensity: cfg.intensity
    });
    res.json(cfg);
}

// ---------- Aide personnalisée (HTML stocké dans les paramètres) ----------

export async function uploadHelp(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim().startsWith('<!')) throw badRequest('Contenu HTML invalide');
    await setSetting('help_html_content', content);
    await setSetting('help_html_updated_at', new Date().toISOString());
    res.json({ success: true });
}

export async function deleteHelp(/** @type {Request} */ req, /** @type {Response} */ res) {
    await deleteSettings(['help_html_content', 'help_html_updated_at']);
    res.json({ success: true });
}

export async function helpInfo(/** @type {Request} */ req, /** @type {Response} */ res) {
    const updatedAt = await getSetting('help_html_updated_at');
    res.json({ exists: updatedAt !== null, updatedAt: updatedAt || null });
}
