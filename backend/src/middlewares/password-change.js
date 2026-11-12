// @ts-check
// Changement de mot de passe obligatoire (mot de passe donné par un administrateur : compte initial, compte créé ou
// mot de passe réinitialisé par un administrateur) : tant qu'il n'est pas fait, seules les routes nécessaires au
// changement répondent.

/** Routes /api utilisables pendant un changement de mot de passe obligatoire */
const ALLOWED = new Set([
    'POST /api/profile/change-password',
    'POST /api/logout',
    'GET /api/check-session',
    'GET /api/version',
    'GET /api/system/version',
    'GET /api/theme'
]);

/** @type {import('express').RequestHandler} */
export function requirePasswordChanged(req, res, next) {
    if (!req.session?.mustChangePassword || !req.path.startsWith('/api/')) return next();
    if (ALLOWED.has(`${req.method} ${req.path}`)) return next();
    res.status(403).json({
        error: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Vous devez choisir un nouveau mot de passe avant de continuer.'
    });
}
