// Limitation des tentatives sur les routes d'authentification (force brute, envoi massif d'emails).
// Compteurs en mémoire, propres à chaque processus serveur.
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';

const MINUTE = 60 * 1000;

const limiter = (windowMs: number, limit: number, options: Partial<Options> = {}) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res, _next, opts) => {
            console.warn(`⛔ Trop de tentatives : ${req.method} ${req.path} (${req.ip})`);
            res.status(opts.statusCode).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
        },
        ...options
    });

const clientIp = (req: Request) => ipKeyGenerator(req.ip || '');
const username = (req: Request) =>
    String(req.body?.username || '')
        .trim()
        .toLowerCase();

/** Connexion : échecs comptés par adresse IP et par identifiant (un compte ciblé depuis plusieurs adresses) */
export const loginLimiters = [
    limiter(15 * MINUTE, 30, { skipSuccessfulRequests: true, keyGenerator: clientIp }),
    limiter(15 * MINUTE, 10, {
        skipSuccessfulRequests: true,
        keyGenerator: req => `user:${username(req)}`,
        skip: req => !username(req)
    })
];

/** Mot de passe oublié : chaque demande envoie un email (en plus de la limite d'une demande par minute et par compte) */
export const passwordResetRequestLimiter = limiter(15 * MINUTE, 20, { keyGenerator: clientIp });

/** Vérification des liens de réinitialisation et des codes de double authentification : échecs par adresse IP */
export const tokenCheckLimiter = limiter(15 * MINUTE, 30, { skipSuccessfulRequests: true, keyGenerator: clientIp });

/** Sondages publics : consultation (jetons inconnus comptés) et réponses, par adresse IP */
export const sondagePublicLimiters = {
    read: limiter(15 * MINUTE, 60, { skipSuccessfulRequests: true, keyGenerator: clientIp }),
    answer: limiter(15 * MINUTE, 60, { keyGenerator: clientIp })
};
