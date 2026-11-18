// Connexion en attente de validation MFA, conservée côté serveur dans la session.
// Les routes /api/mfa/* ne font jamais confiance au userId / profile / secret envoyés par le client.
import type { NextFunction, Request, Response } from 'express';
import type { SessionData } from 'express-session';

const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const MAX_CODE_SENDS = 5;

/**
 * À appeler après vérification du mot de passe
 */
export function startMfaPending(req: Request, userId: number, profile: SessionData['mfaPending']['profile']) {
    req.session.mfaPending = {
        userId,
        profile,
        expiresAt: Date.now() + PENDING_TTL_MS,
        attempts: 0,
        codeSends: 0,
        totpSecret: null
    };
}

/** Middleware : exige une connexion en attente de MFA non expirée (exposée dans req.mfaPending) */
export function requireMfaPending(req: Request, res: Response, next: NextFunction) {
    const pending = req.session?.mfaPending;
    if (pending && Date.now() > pending.expiresAt) delete req.session.mfaPending;
    if (!req.session?.mfaPending) {
        res.status(401).json({ error: 'Session de connexion expirée, veuillez vous reconnecter.' });
        return;
    }
    req.mfaPending = req.session.mfaPending;
    next();
}

// ---------- Codes erronés par compte ----------
// La limite par connexion en attente se contourne en se reconnectant (mot de passe connu) : codes erronés aussi
// comptés par compte, sur une fenêtre glissante. En mémoire : remis à zéro au redémarrage, propre à chaque instance.

const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_MAX_FAILURES = 10;
const accountFailures = new Map<number, number[]>();

/** Codes erronés du compte dans la fenêtre (les plus anciens sont oubliés) */
function recentFailures(userId: number) {
    const now = Date.now();
    const recent = (accountFailures.get(userId) ?? []).filter(t => now - t < ACCOUNT_WINDOW_MS);
    if (recent.length) accountFailures.set(userId, recent);
    else accountFailures.delete(userId);
    return recent;
}

/** Compte bloqué : trop de codes erronés dans les 15 dernières minutes */
export const mfaAccountLocked = (userId: number) => recentFailures(userId).length >= ACCOUNT_MAX_FAILURES;

export function recordMfaFailure(userId: number) {
    accountFailures.set(userId, [...recentFailures(userId), Date.now()]);
}

export function clearMfaFailures(userId: number) {
    accountFailures.delete(userId);
}

/**
 * Comptabilise un essai de code ; au-delà du maximum, la connexion en attente est annulée.
 * @returns false si le nombre maximal d'essais est dépassé
 */
export function consumeMfaAttempt(req: import('express').Request): boolean {
    const pending = req.mfaPending as NonNullable<typeof req.mfaPending>;
    pending.attempts++;
    if (pending.attempts > MAX_ATTEMPTS) {
        delete req.session.mfaPending;
        return false;
    }
    return true;
}
