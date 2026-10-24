// @ts-check
// Contrôle d'accès : session authentifiée, profils et droits applicatifs
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { sqlTimestamp } from '../db/values.js';
import { activeSessions, isSessionRevoked, touchSession } from '../state/sessions.js';

/** @typedef {import('express').RequestHandler} RequestHandler */

/**
 * Session fermée par une déconnexion forcée ou un changement de mot de passe : la détruit et répond 401.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean} true si la requête a été rejetée
 */
export function rejectRevokedSession(req, res) {
    const { userId, loginAt } = req.session;
    if (!userId || !isSessionRevoked(userId, loginAt)) return false;
    req.session.destroy(() => {});
    res.status(401).json({
        error: 'SESSION_TERMINATED',
        message: 'Votre session a été fermée (déconnexion par un administrateur ou changement de mot de passe).'
    });
    return true;
}

/** Session authentifiée et non révoquée ; répond 401 sinon */
function rejectUnauthenticated(
    /** @type {import('express').Request} */ req,
    /** @type {import('express').Response} */ res
) {
    if (!req.session || !req.session.userId) {
        res.status(401).json({ error: 'Non authentifié' });
        return true;
    }
    return rejectRevokedSession(req, res);
}

/** @type {RequestHandler} */
export function requireAuth(req, res, next) {
    // Mémorise l'URL de l'application depuis les requêtes entrantes (liens des emails envoyés par les tâches planifiées)
    if (!global._detectedAppUrl && req.get('host')) {
        global._detectedAppUrl = `${req.protocol}://${req.get('host')}`;
    }
    if (rejectUnauthenticated(req, res)) return;
    const userId = /** @type {number} */ (req.session.userId);

    // Ré-enregistre silencieusement la session si absente (longue inactivité ou redémarrage serveur)
    if (!activeSessions.has(userId)) {
        activeSessions.set(userId, { userId, lastActivity: Date.now(), profile: req.session.activeProfile || null });
    } else {
        touchSession(userId);
    }
    next();
}

/** @type {RequestHandler} */
export function requireAdmin(req, res, next) {
    if (rejectUnauthenticated(req, res)) return;
    const userId = /** @type {number} */ (req.session.userId);
    // Restaure le profil actif depuis le suivi des sessions s'il manque
    if (!req.session.activeProfile) {
        const cached = activeSessions.get(userId);
        if (cached?.profile) req.session.activeProfile = /** @type {any} */ (cached.profile);
    }
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    touchSession(userId);
    next();
}

/** Administrateur ou profil RH */
/** @type {RequestHandler} */
export function requireAdminOrRh(req, res, next) {
    if (rejectUnauthenticated(req, res)) return;
    if (req.session.activeProfile !== 'admin' && req.session.activeProfile !== 'rh') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs et RH' });
    }
    touchSession(/** @type {number} */ (req.session.userId));
    next();
}

/** Administrateur, ou utilisateur disposant du droit « reporting » */
/** @type {RequestHandler} */
export function requireReportingAccess(req, res, next) {
    if (rejectUnauthenticated(req, res)) return;
    const userId = /** @type {number} */ (req.session.userId);
    if (req.session.activeProfile === 'admin') {
        touchSession(userId);
        return next();
    }
    prisma.user
        .findUnique({ where: { id: userId }, select: { has_reporting_access: true, is_admin: true } })
        .then(user => {
            if (!user) return res.status(403).json({ error: 'Accès refusé' });
            if (user.is_admin === 1 || user.has_reporting_access === 1) {
                touchSession(userId);
                return next();
            }
            return res.status(403).json({ error: 'Accès au reporting non autorisé' });
        })
        .catch(() => res.status(403).json({ error: 'Accès refusé' }));
}

/** Administrateur, ou utilisateur autorisé sur l'application « Aide à l'affectation » */
/** @type {RequestHandler} */
export function requireAffectationAccess(req, res, next) {
    if (rejectUnauthenticated(req, res)) return;
    if (req.session.activeProfile === 'admin') return next();
    prisma.appUserAccess
        .findFirst({ where: { app_key: 'affectation', user_id: req.session.userId }, select: { id: true } })
        .then(access => (access ? next() : res.status(403).json({ error: 'Accès refusé' })))
        .catch(() => res.status(403).json({ error: 'Accès refusé' }));
}

/** Clé d'API (en-tête X-Api-Key ou paramètre api_key) pour l'API publique */
/** @type {RequestHandler} */
export function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return res.status(401).json({ error: 'Clé API manquante (header X-Api-Key ou paramètre api_key)' });
    const keyHash = crypto.createHash('sha256').update(String(apiKey)).digest('hex');
    prisma.apiKey
        .findFirst({ where: { key_hash: keyHash, revoked: 0 }, select: { id: true } })
        .then(key => {
            if (!key) return res.status(401).json({ error: 'Clé API invalide ou révoquée' });
            prisma.apiKey
                .update({ where: { id: key.id }, data: { last_used_at: sqlTimestamp() } })
                .catch(err => console.error('Erreur mise à jour clé API:', err));
            next();
        })
        .catch(() => res.status(401).json({ error: 'Clé API invalide ou révoquée' }));
}
