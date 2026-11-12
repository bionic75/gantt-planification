// Fenêtre « Mon profil » : photo, mot de passe, SAMU de l'expert (sa ressource), onglet ouvert à la connexion
// (backend/src/modules/users, backend/src/modules/resources)
import { api } from './client';

export interface AffectationsSamu {
    principal: string[];
    secondaire: string[];
}

export const apiProfil = {
    /** Photo de profil (image en data URI) */
    enregistrerPhoto: (photo: string) => api.post<{ success?: boolean; error?: string }>('/profile/photo', { photo }),
    changerMotDePasse: (newPassword: string) =>
        api.post<{ success?: boolean; error?: string }>('/profile/change-password', { newPassword }),
    /** SAMU de la ressource de l'expert, par rôle */
    samu: async (resourceId: number): Promise<AffectationsSamu> => {
        const lignes = await api.get<{ role: string; samu: string }[]>(`/resources/${resourceId}/samu-assignments`);
        const role = (r: string) => lignes.filter(l => l.role === r).map(l => l.samu);
        return { principal: role('principal'), secondaire: role('secondaire') };
    },
    /** SAMU de sa propre ressource (profil Expert) */
    enregistrerSamu: (a: AffectationsSamu) => api.put<{ success: boolean }>('/me/samu-assignments', a),
    ongletParDefaut: (userId: number, defaultTab: string) =>
        api.put<{ success: boolean }>(`/users/${userId}/default-tab`, { defaultTab })
};
