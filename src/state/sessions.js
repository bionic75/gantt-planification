// @ts-check
// Suivi en mémoire des utilisateurs connectés (sera persisté avec le store de sessions en phase 4)

/** @type {Map<number, { lastActivity: number, profile?: string | null, userId?: number, username?: string, fullName?: string, profilePhoto?: string | null }>} */
export const activeSessions = new Map();

/** userId → date de révocation : les sessions ouvertes avant cette date sont fermées à leur prochaine requête */
/** @type {Map<number, number>} */
const revokedAt = new Map();

/** Ferme toutes les sessions ouvertes de l'utilisateur (déconnexion forcée, changement de mot de passe) */
export function revokeUserSessions(/** @type {number} */ userId) {
    revokedAt.set(userId, Date.now());
    activeSessions.delete(userId);
}

/**
 * La session a-t-elle été révoquée ?
 * @param {number} userId
 * @param {number | undefined} loginAt horodatage de la connexion (sessions antérieures à ce suivi : 0)
 */
export function isSessionRevoked(userId, loginAt) {
    const revoked = revokedAt.get(userId);
    return revoked !== undefined && (loginAt || 0) <= revoked;
}

/** @param {number} userId */
export function touchSession(userId) {
    const s = activeSessions.get(userId);
    if (s) s.lastActivity = Date.now();
}

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

// Nettoyage des sessions inactives toutes les minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of activeSessions) {
        if (now - session.lastActivity > INACTIVITY_TIMEOUT_MS) {
            activeSessions.delete(userId);
            console.log(`🔴 Session expirée pour userId: ${userId}`);
        }
    }
}, 60 * 1000).unref();
