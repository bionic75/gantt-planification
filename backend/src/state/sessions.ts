// Suivi en mémoire des utilisateurs connectés (liste des connectés, inactivité). Les sessions elles-mêmes sont
// stockées en base (db/session-store.ts) : après un redémarrage, ce suivi se reconstitue à la requête suivante.
import { terminateUserSessions } from '../db/session-store.ts';

import type { Request } from 'express';

export interface SessionActive {
    lastActivity: number;
    profile?: string | null;
    userId?: number;
    username?: string;
    fullName?: string;
    profilePhoto?: string | null;
}

export const activeSessions = new Map<number, SessionActive>();

/** Ferme toutes les sessions ouvertes de l'utilisateur (déconnexion forcée, changement de mot de passe) */
export async function revokeUserSessions(userId: number) {
    activeSessions.delete(userId);
    await terminateUserSessions(userId);
}

/** Nouvel identifiant pour la session courante, données conservées (changement de droits, de mot de passe) */
export async function regenerateSession(req: Request) {
    // Données de la session seulement : le cookie est recréé par regenerate()
    const data: Record<string, unknown> = { ...req.session };
    delete data.cookie;
    await new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve(undefined))));
    Object.assign(req.session, data);
}

export function touchSession(userId: number) {
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
