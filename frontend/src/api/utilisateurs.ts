// Comptes utilisateurs (administration) : liste, création, modification, droits, mot de passe, TOTP, déconnexion,
// journaux
import { api } from '@/api/client';

/** GET /users (administrateur) ; drapeaux 0 / 1 */
export interface Utilisateur {
    id: number;
    username: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string | null;
    trigramme: string | null;
    resource_id: number | null;
    is_admin: number;
    is_expert: number;
    is_user: number;
    is_rh: number;
    has_reporting_access: number;
    actif: number;
    last_login: string | null;
}

export interface DonneesCreation {
    username: string;
    password: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    is_admin: boolean;
    is_expert: boolean;
    is_user: boolean;
    is_rh: boolean;
    resource_id: string | null;
    sendEmail: boolean;
}

export interface DonneesModification {
    username: string;
    nom: string;
    prenom: string;
    email: string;
    trigramme: string;
    resource_id: string | null;
    is_admin: number;
    is_expert: number;
    is_user: number;
    is_rh: number;
    actif: number;
}

/** Ressource proposée (expert) */
export interface RessourceCompte {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string;
    actif: number;
}

/** Connexions d'un compte, regroupées par profil (GET /reporting/connections) */
export interface ConnexionsCompte {
    username: string;
    profile: string;
    nb_connexions: number;
    derniere_connexion: string | null;
    /** Absent des réponses : lu par l'export CSV de l'ancien écran (anomalie conservée) */
    login_time?: string;
}

/** Action journalisée (GET /logs/actions) ; détails en JSON */
export interface ActionCompte {
    id: number;
    action_type: string;
    details: string | null;
    created_at: string;
}

export type TypeJournal = 'connexions' | 'planning' | 'emails';

export const apiUtilisateurs = {
    liste: () => api.get<Utilisateur[]>('/users'),
    ressources: () => api.get<RessourceCompte[]>('/resources'),
    creer: (corps: DonneesCreation) => api.post<{ id: number; emailSent?: boolean }>('/users', corps),
    modifier: (id: number, corps: DonneesModification) => api.put(`/users/${id}`, corps),
    supprimer: (id: number) => api.delete(`/users/${id}`),
    basculerActif: (id: number) => api.post(`/users/${id}/toggle`),
    accesReporting: (id: number, hasAccess: boolean) => api.post(`/users/${id}/reporting-access`, { hasAccess }),
    validationRh: (id: number, hasAccess: boolean) => api.post(`/users/${id}/rh-access`, { hasAccess }),
    nouveauMotDePasse: (id: number, newPassword: string, sendEmail: boolean) =>
        api.post<{ emailSent?: boolean }>(`/users/${id}/reset-password`, { newPassword, sendEmail }),
    deconnecter: (id: number) =>
        api.post<{ success: boolean; wasConnected?: boolean; error?: string }>(`/users/${id}/force-logout`),
    reinitialiserTotp: (id: number) => api.post(`/mfa/reset-totp/${id}`),
    connexions: (id: number) =>
        api.get<{ rows?: ConnexionsCompte[] }>(
            `/reporting/connections?dateStart=2000-01-01&dateEnd=2099-12-31&userIds=${id}`
        ),
    actions: (id: number) => api.get<{ logs?: ActionCompte[] }>(`/logs/actions?userId=${id}`),
    remiseAZero: (type: TypeJournal, userId: number) => api.delete<{ deleted: number }>('/logs/raz', { type, userId }),
    /** Journal des modifications (comme l'ancien code) */
    journaliser: (modification: string) => api.post('/logs/add-modification', { modification })
};
