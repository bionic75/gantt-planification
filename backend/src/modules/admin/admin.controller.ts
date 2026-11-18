import { prisma } from '../../db/prisma.ts';
import { sqlTimestamp, toInt } from '../../db/values.ts';
import { badRequest } from '../../lib/http-error.ts';
import { emailConfig, sendEmail, setEmailConfig, storedSmtpPassword } from '../../lib/mailer.ts';
import { encryptSecret } from '../../lib/secrets.ts';
import { logUserAction } from '../../services/action-log.ts';
import { deleteSettings, getAllSettings, getJsonSetting, getSetting, setSetting } from '../../services/settings.ts';
import { TAB_KEYS, TAB_PROFILES, sanitizeThemeConfig, tabAccessMerge } from './admin.service.ts';

import type { Request, Response } from 'express';

// ---------- Configuration email ----------

/**
 * Configuration SMTP sans le mot de passe : seul passwordSet indique qu'il est enregistré (et lisible sur ce serveur ;
 * sinon il est à ressaisir)
 */
export async function getEmailConfig(req: Request, res: Response) {
    const row = await prisma.emailConfig.findUnique({ where: { id: 1 } });
    if (!row) return res.json({ host: '', port: 587, secure: 0, user: '', passwordSet: false });
    const { password, ...config } = row;
    res.json({ ...config, passwordSet: !!storedSmtpPassword(password) });
}

/** Mot de passe absent ou vide : celui déjà enregistré est conservé. Il est chiffré en base (lib/secrets.ts). */
export async function saveEmailConfig(req: Request, res: Response) {
    const { host, port, secure, user } = req.body;
    const password =
        req.body.password ||
        storedSmtpPassword((await prisma.emailConfig.findUnique({ where: { id: 1 } }))?.password) ||
        '';
    if (!host || !port || !user || !password) throw badRequest('Tous les champs sont requis');
    const data = {
        host: String(host),
        port: toInt(port) as number,
        secure: secure ? 1 : 0,
        user: String(user),
        password: encryptSecret(String(password))
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

export async function testEmailConfig(req: Request, res: Response) {
    try {
        await sendEmail(
            emailConfig.user as string,
            'Test de configuration SMTP',
            '<p>Ceci est un email de test. Si vous recevez ce message, votre configuration SMTP est correcte !</p>'
        );
        res.json({ success: true, message: 'Email de test envoyé avec succès' });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
}

// ---------- Version ----------

export async function setSystemVersion(req: Request, res: Response) {
    const { version } = req.body;
    if (!version) throw badRequest('Version requise');
    const data = { version: String(version), updated_at: sqlTimestamp() };
    await prisma.systemConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    console.log('✅ Version mise à jour:', version);
    res.json({ success: true });
}

export async function getSystemVersion(req: Request, res: Response) {
    const row = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { version: true } });
    res.json({ version: row ? row.version : '1.0.0' });
}

/** Version de l'application (publique) */
export async function getAppVersion(req: Request, res: Response) {
    res.json({ version: (await getSetting('app_version')) ?? '1.0.0' });
}

// ---------- Paramètres ----------

/** Paramètres lus par les écrans des profils non administrateurs : favicon, nouveautés de l'aide, inactivité, CRA */
const PUBLIC_SETTINGS = new Set([
    'favicon',
    'help_publication_enabled',
    'help_publication_version',
    'help_publication_timestamp',
    'inactivity_enabled',
    'inactivity_timeout',
    'automation_4_config'
]);
/** Secrets jamais renvoyés, même chiffrés */
const SECRET_SETTINGS = new Set(['asana_token_enc']);

/** Paramètres : liste complète (secrets exclus) pour l'administration, sinon ceux des écrans des autres profils */
export async function listSettings(req: Request, res: Response) {
    const all = await getAllSettings();
    const visible = (key: string) =>
        req.session.activeProfile === 'admin' ? !SECRET_SETTINGS.has(key) : PUBLIC_SETTINGS.has(key);
    res.json(Object.fromEntries(Object.entries(all).filter(([key]) => visible(key))));
}

export async function saveSetting(req: Request, res: Response) {
    const { key, value } = req.body;
    if (typeof key !== 'string' || !key || value === undefined || value === null) {
        throw badRequest('Clé et valeur requises');
    }
    await setSetting(key, value);
    logUserAction(req, 'Mise à jour paramètre', { key, value });
    res.json({ success: true, key, value });
}

// ---------- Accès aux onglets ----------

export async function getTabAccess(req: Request, res: Response) {
    res.json({
        config: tabAccessMerge(await getJsonSetting('tab_access_config')),
        defaults: tabAccessMerge(null),
        tabs: TAB_KEYS,
        profiles: TAB_PROFILES
    });
}

export async function saveTabAccess(req: Request, res: Response) {
    const cfg = req.body && req.body.config;
    if (!cfg || typeof cfg !== 'object') throw badRequest('Configuration invalide');
    const clean = tabAccessMerge(cfg);
    await setSetting('tab_access_config', JSON.stringify(clean));
    logUserAction(req, "Modification de l'accès aux onglets par profil", { config: clean });
    res.json({ success: true, config: clean });
}

// ---------- Thème (public : il s'applique aussi à l'écran de connexion) ----------

export async function getTheme(req: Request, res: Response) {
    res.json(sanitizeThemeConfig(await getJsonSetting('theme_config')));
}

export async function saveTheme(req: Request, res: Response) {
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

export async function uploadHelp(req: Request, res: Response) {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim().startsWith('<!')) throw badRequest('Contenu HTML invalide');
    await setSetting('help_html_content', content);
    await setSetting('help_html_updated_at', new Date().toISOString());
    res.json({ success: true });
}

export async function deleteHelp(req: Request, res: Response) {
    await deleteSettings(['help_html_content', 'help_html_updated_at']);
    res.json({ success: true });
}

export async function helpInfo(req: Request, res: Response) {
    const updatedAt = await getSetting('help_html_updated_at');
    res.json({ exists: updatedAt !== null, updatedAt: updatedAt || null });
}
