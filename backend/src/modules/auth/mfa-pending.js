// @ts-check
// Connexion en attente de validation MFA, conservée côté serveur dans la session.
// Les routes /api/mfa/* ne font jamais confiance au userId / profile / secret envoyés par le client.

const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const MAX_CODE_SENDS = 5;

/**
 * À appeler après vérification du mot de passe
 * @param {import('express').Request} req
 * @param {number} userId
 * @param {any} profile
 */
export function startMfaPending(req, userId, profile) {
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
/** @type {import('express').RequestHandler} */
export function requireMfaPending(req, res, next) {
    const pending = req.session?.mfaPending;
    if (pending && Date.now() > pending.expiresAt) delete req.session.mfaPending;
    if (!req.session?.mfaPending) {
        return res.status(401).json({ error: 'Session de connexion expirée, veuillez vous reconnecter.' });
    }
    req.mfaPending = req.session.mfaPending;
    next();
}

/**
 * Comptabilise un essai de code ; au-delà du maximum, la connexion en attente est annulée.
 * @param {import('express').Request} req
 * @returns {boolean} false si le nombre maximal d'essais est dépassé
 */
export function consumeMfaAttempt(req) {
    const pending = /** @type {NonNullable<typeof req.mfaPending>} */ (req.mfaPending);
    pending.attempts++;
    if (pending.attempts > MAX_ATTEMPTS) {
        delete req.session.mfaPending;
        return false;
    }
    return true;
}
