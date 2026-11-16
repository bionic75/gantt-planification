// Contrôle d'accès : session authentifiée, profils et droits applicatifs
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SessionData } from 'express-session';
import { prisma } from '../db/prisma.ts';
import { sqlTimestamp } from '../db/values.ts';
import { tabAccessMerge } from '../modules/admin/admin.service.ts';
import { getJsonSetting } from '../services/settings.ts';
import { activeSessions, touchSession } from '../state/sessions.ts';

/**
 * Session fermée par une déconnexion forcée ou un changement de mot de passe : la détruit et répond 401.
 * @returns true si la requête a été rejetée
 */
export function rejectRevokedSession(req: Request, res: Response): boolean {
    if (!req.session.userId || !req.session.terminated) return false;
    req.session.destroy(() => {});
    res.status(401).json({
        error: 'SESSION_TERMINATED',
        message: 'Votre session a été fermée (déconnexion par un administrateur ou changement de mot de passe).'
    });
    return true;
}

/** Session authentifiée et non révoquée ; répond 401 sinon */
function rejectUnauthenticated(req: Request, res: Response) {
    if (!req.session || !req.session.userId) {
        res.status(401).json({ error: 'Non authentifié' });
        return true;
    }
    return rejectRevokedSession(req, res);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    // Mémorise l'URL de l'application depuis les requêtes entrantes (liens des emails envoyés par les tâches planifiées)
    if (!global._detectedAppUrl && req.get('host')) {
        global._detectedAppUrl = `${req.protocol}://${req.get('host')}`;
    }
    if (rejectUnauthenticated(req, res)) return;
    const userId = req.session.userId as number;

    // Ré-enregistre silencieusement la session si absente (longue inactivité ou redémarrage serveur)
    if (!activeSessions.has(userId)) {
        activeSessions.set(userId, { userId, lastActivity: Date.now(), profile: req.session.activeProfile || null });
    } else {
        touchSession(userId);
    }
    next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (rejectUnauthenticated(req, res)) return;
    const userId = req.session.userId as number;
    // Restaure le profil actif depuis le suivi des sessions s'il manque
    if (!req.session.activeProfile) {
        const cached = activeSessions.get(userId);
        if (cached?.profile) req.session.activeProfile = cached.profile as SessionData['activeProfile'];
    }
    if (req.session.activeProfile !== 'admin') {
        res.status(403).json({ error: 'Accès réservé aux administrateurs' });
        return;
    }
    touchSession(userId);
    next();
}

/** Administrateur ou profil RH */
export function requireAdminOrRh(req: Request, res: Response, next: NextFunction) {
    if (rejectUnauthenticated(req, res)) return;
    if (req.session.activeProfile !== 'admin' && req.session.activeProfile !== 'rh') {
        res.status(403).json({ error: 'Accès réservé aux administrateurs et RH' });
        return;
    }
    touchSession(req.session.userId as number);
    next();
}

/** Onglet Reporting : administrateur par défaut, autres profils selon la configuration de l'accès aux onglets */
export async function requireReportingAccess(req: Request, res: Response, next: NextFunction) {
    if (rejectUnauthenticated(req, res)) return;
    const userId = req.session.userId as number;
    const profil = req.session.activeProfile;
    let permis = profil === 'admin';
    if (!permis && profil) {
        const config = tabAccessMerge(await getJsonSetting('tab_access_config').catch(() => null));
        permis = config[profil]?.reporting === true;
    }
    if (!permis) {
        res.status(403).json({ error: 'Accès au reporting non autorisé' });
        return;
    }
    touchSession(userId);
    next();
}

/**
 * Utilisateur autorisé sur l'application « Aide à l'affectation opérationnelle » (accès attribué dans
 * l'Administration), comme le menu Applications et la frise de l'Accueil qui ne la proposent qu'à ces comptes, profil
 * administrateur compris
 */
export function requireAffectationAccess(req: Request, res: Response, next: NextFunction) {
    if (rejectUnauthenticated(req, res)) return;
    const userId = req.session.userId as number;
    prisma.appUserAccess
        .findFirst({ where: { app_key: 'affectation', user_id: userId }, select: { id: true } })
        .then(access => {
            if (!access) return res.status(403).json({ error: "Accès à l'aide à l'affectation non autorisé" });
            touchSession(userId);
            next();
        })
        .catch(() => res.status(403).json({ error: 'Accès refusé' }));
}

/**
 * Lecture des déploiements (frise de l'Accueil) : comptes autorisés sur l'Aide à l'affectation, et profils Expert
 * métier et Utilisateur (lecture seule)
 */
export function requireDeploiementsLecture(req: Request, res: Response, next: NextFunction) {
    if (rejectUnauthenticated(req, res)) return;
    const profil = req.session.activeProfile;
    if (profil === 'expert' || profil === 'user') {
        touchSession(req.session.userId as number);
        return next();
    }
    return requireAffectationAccess(req, res, next);
}

/**
 * Utilisateur autorisé sur l'application « Suivi des déplacements » (accès attribué dans l'Administration), comme le
 * menu Applications qui ne la propose qu'à ces comptes, profil administrateur compris
 */
export function requireDeplacementsAccess(req: Request, res: Response, next: NextFunction) {
    if (rejectUnauthenticated(req, res)) return;
    const userId = req.session.userId as number;
    prisma.appUserAccess
        .findFirst({ where: { app_key: 'deplacements', user_id: userId }, select: { id: true } })
        .then(access => {
            if (!access) return res.status(403).json({ error: 'Accès au suivi des déplacements non autorisé' });
            touchSession(userId);
            next();
        })
        .catch(() => res.status(403).json({ error: 'Accès refusé' }));
}

/**
 * Clé d'API (en-tête X-Api-Key) pour l'API publique. Plus acceptée dans l'URL (paramètre api_key) : elle
 * apparaîtrait dans les journaux, l'historique du navigateur et des proxys.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        const message = req.query.api_key
            ? "Clé API refusée dans l'URL : la transmettre dans l'en-tête X-Api-Key"
            : 'Clé API manquante (en-tête X-Api-Key)';
        res.status(401).json({ error: message });
        return;
    }
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
