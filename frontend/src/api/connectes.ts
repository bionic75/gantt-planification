// Utilisateurs connectés (pastille des en-têtes d'application) : src/modules/logs
import { api } from '@/api/client';

export interface UtilisateurConnecte {
    userId: number;
    username: string;
    nom: string | null;
    prenom: string | null;
    trigramme: string | null;
    profilePhoto: string | null;
    profile: string | null;
}

export const apiConnectes = {
    liste: () => api.get<{ activeUsers?: UtilisateurConnecte[] }>('/active-sessions').then(r => r.activeUsers ?? [])
};
