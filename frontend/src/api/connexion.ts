// Connexion : identifiants (bureau et mobile), double authentification, mots de passe oublié, imposé ou réinitialisé,
// session en cours (backend/src/modules/auth)
import { api } from './client';

export type ProfilConnexion = 'admin' | 'expert' | 'user' | 'rh';

/** Utilisateur connecté, tel que le renvoie le serveur à l'ouverture de la session */
export interface UtilisateurConnecte {
    id?: number;
    userId?: number;
    username?: string;
    nom: string | null;
    prenom: string | null;
    activeProfile: string;
    resourceId?: number | null;
    /** Mot de passe donné par un administrateur, à remplacer avant d'entrer dans l'application */
    mustChangePassword?: boolean;
    [champ: string]: unknown;
}

/** Méthode de double authentification demandée : choix laissé à l'utilisateur, e-mail ou application */
export type MethodeMfa = 'choice' | 'email' | 'totp';

/** Réponse à une connexion : session ouverte, profil à choisir ou double authentification demandée */
export interface ReponseConnexion {
    success?: boolean;
    user?: UtilisateurConnecte;
    profileRequired?: boolean;
    profiles?: ProfilConnexion[];
    mfaRequired?: boolean;
    mfaMethod?: MethodeMfa;
    totpConfigured?: boolean;
    pendingUserId?: number;
    /** Profil choisi par le serveur (compte à profil unique, page mobile) */
    profile?: string;
    pendingProfile?: string;
}

/** Session en cours (GET /check-session) */
export interface SessionEnCours extends UtilisateurConnecte {
    userId?: number;
}

export const connexionApi = {
    /** Mire du bureau : sans profil, le serveur connecte un compte à profil unique ou renvoie les profils du compte */
    connecter: (username: string, password: string, profile?: string) =>
        api.post<ReponseConnexion>('/login', profile ? { username, password, profile } : { username, password }),
    /** Page mobile : profil choisi par le serveur, mot de passe à changer refusé */
    connecterMobile: (username: string, password: string) =>
        api.post<ReponseConnexion>('/mobile-login', { username, password }),
    /**
     * Session en cours ; null sans session. Hors du client commun : un refus (401) n'est pas une session perdue, la mire
     * est simplement affichée
     */
    session: async (): Promise<SessionEnCours | null> => {
        const r = await fetch('/api/check-session', { credentials: 'include' });
        if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) return null;
        return (await r.json()) as SessionEnCours;
    },
    version: () => api.get<{ version?: string }>('/version'),

    envoyerCode: (userId: number) => api.post<{ success?: boolean }>('/mfa/send-code', { userId }),
    verifierCode: (userId: number, code: string, profile: string) =>
        api.post<{ success?: boolean; user?: UtilisateurConnecte }>('/mfa/verify', { userId, code, profile }),
    etatTotp: (userId: number) => api.get<{ configured?: boolean }>(`/mfa/totp-status/${userId}`),
    preparerTotp: (userId: number) => api.post<{ secret: string; qrCode: string }>('/mfa/totp-setup', { userId }),
    confirmerTotp: (userId: number, secret: string, code: string, profile: string) =>
        api.post<{ success?: boolean; user?: UtilisateurConnecte }>('/mfa/totp-confirm', {
            userId,
            secret,
            code,
            profile
        }),

    /** Mot de passe oublié : réponse identique que le compte existe ou non ; 429 avec le délai restant */
    demanderReinitialisation: (username: string) =>
        api.post<{ success?: boolean; message?: string; error?: string }>('/forgot-password', { username }),
    verifierLienReinitialisation: (token: string) =>
        api.post<{ passwordRule: string }>('/reset-password/check', { token }),
    reinitialiser: (token: string, newPassword: string) =>
        api.post<{ message: string }>('/reset-password', { token, newPassword }),
    /** Mot de passe imposé remplacé (session ouverte, PASSWORD_CHANGE_REQUIRED) */
    changerMotDePasse: (newPassword: string) => api.post<unknown>('/profile/change-password', { newPassword }),
    deconnecter: () => api.post<unknown>('/logout')
};
