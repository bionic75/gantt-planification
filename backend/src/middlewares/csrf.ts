// Protection CSRF par vérification de l'origine (OWASP « Fetch Metadata ») : une requête de modification
// (POST, PUT, PATCH, DELETE) émise par un navigateur depuis un autre site est refusée.
//   1. Sec-Fetch-Site (navigateurs récents) : seules « same-origin » et « none » (saisie directe) sont acceptées ;
//   2. sinon Origin : doit être l'origine de APP_URL ou celle de l'hôte de la requête ;
//   3. ni l'un ni l'autre : client hors navigateur (scripts, API publique par clé), sans cookie de session tiers.
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const APP_ORIGIN = env.APP_URL ? new URL(env.APP_URL).origin : null;

/** Origine acceptée : celle de l'application, ou même hôte que la requête (accès direct, poste de développement) */
function isTrustedOrigin(origin: string, host: string | undefined) {
    let url;
    try {
        url = new URL(origin);
    } catch {
        return false;
    }
    return url.origin === APP_ORIGIN || (!!host && url.host === host);
}

export function rejectCrossOrigin(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();
    const site = req.get('sec-fetch-site');
    const origin = req.get('origin');
    const allowed = site
        ? site === 'same-origin' || site === 'none'
        : !origin || isTrustedOrigin(origin, req.get('host'));
    if (allowed) return next();
    console.warn(`⛔ Requête d'une autre origine refusée : ${req.method} ${req.path} (${origin || site})`);
    res.status(403).json({ error: "Requête refusée : elle provient d'un autre site." });
}
