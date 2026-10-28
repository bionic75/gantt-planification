// Types des réponses de l'API utilisées par l'interface Vue

export type Profil = 'admin' | 'expert' | 'user' | 'rh';

/** GET /api/check-session (src/modules/auth/auth.controller.js, checkSession) */
export interface Session {
    userId: number;
    username: string;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    activeProfile: Profil;
    resourceId: number | null;
    trigramme: string | null;
    profilePhoto: string | null;
    availableApps: string[];
    is_admin: boolean;
    is_expert: boolean;
    is_user: boolean;
    is_rh: boolean;
    astreinte_volontaire: boolean;
    astreinte_date_activation: string | null;
    mustChangePassword: boolean;
}
