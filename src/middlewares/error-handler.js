// @ts-check

/**
 * Enveloppe un contrôleur async : toute exception est transmise au gestionnaire d'erreurs.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} fn
 * @returns {import('express').RequestHandler}
 */
export const asyncHandler = fn => (req, res, next) => {
    fn(req, res, next).catch(next);
};

/**
 * Gestionnaire d'erreurs final : les erreurs métier (HttpError) sont renvoyées telles quelles,
 * les erreurs techniques sont journalisées et masquées au client.
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
    if (res.headersSent) return;

    // Corps de requête au-delà de la limite (plus basse sans session ouverte)
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Requête trop volumineuse' });
    }
    if (err.expose && err.status) {
        return res.status(err.status).json({ error: err.message, ...(err.body || {}) });
    }
    // Corps JSON invalide envoyé par le client
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Requête invalide' });
    }

    console.error(`❌ ${req.method} ${req.path} :`, err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
}
