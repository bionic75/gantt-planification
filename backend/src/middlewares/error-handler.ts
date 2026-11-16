import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Enveloppe un contrôleur async : toute exception est transmise au gestionnaire d'erreurs. */
export const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
        fn(req, res, next).catch(next);
    };

/** Erreur reçue par le gestionnaire final : erreur métier (HttpError), erreur de lecture du corps, ou autre */
interface ErreurRequete {
    type?: string;
    expose?: boolean;
    status?: number;
    message?: string;
    body?: Record<string, unknown>;
}

/**
 * Gestionnaire d'erreurs final : les erreurs métier (HttpError) sont renvoyées telles quelles,
 * les erreurs techniques sont journalisées et masquées au client.
 */
export function errorHandler(err: ErreurRequete, req: Request, res: Response, _next: NextFunction) {
    if (res.headersSent) return;

    // Corps de requête au-delà de la limite (plus basse sans session ouverte)
    if (err.type === 'entity.too.large') {
        res.status(413).json({ error: 'Requête trop volumineuse' });
        return;
    }
    if (err.expose && err.status) {
        res.status(err.status).json({ error: err.message, ...(err.body || {}) });
        return;
    }
    // Corps JSON invalide envoyé par le client
    if (err.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Requête invalide' });
        return;
    }

    console.error(`❌ ${req.method} ${req.path} :`, err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
}
