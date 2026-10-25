// @ts-check
// Suivi en mémoire des utilisateurs connectés (liste des connectés, inactivité). Les sessions elles-mêmes sont
// stockées en base (db/session-store.js) : après un redémarrage, ce suivi se reconstitue à la requête suivante.
import { terminateUserSessions } from '../db/session-store.js';

/** @type {Map<number, { lastActivity: number, profile?: string | null, userId?: number, username?: string, fullName?: string, profilePhoto?: string | null }>} */
export const activeSessions = new Map();

/** Ferme toutes les sessions ouvertes de l'utilisateur (déconnexion forcée, changement de mot de passe) */
export async function revokeUserSessions(/** @type {number} */ userId) {
    activeSessions.delete(userId);
    await terminateUserSessions(userId);
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
