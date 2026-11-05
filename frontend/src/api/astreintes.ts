// Astreintes HO (heures ouvrées) et astreinte HO ANS : appels et réponses (src/modules/astreintes-ho)
import { api } from '@/api/client';

export type PeriodeHo = 'AM' | 'PM';

/** Expert déclaré pour les astreintes HO (ressource active) */
export interface ExpertHo {
    resource_id: number;
    nom: string;
    prenom: string;
    trigramme: string;
    user_id: number | null;
    email: string | null;
}

/** Utilisateur déclaré « Astreinte HO ANS » */
export interface UtilisateurAns {
    user_id: number;
    nom: string;
    prenom: string;
    trigramme: string | null;
    email: string | null;
}

/** Nom d'une personne inscrite ou désignée, même si elle n'est plus déclarée */
export interface NomHo {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string | null;
}

/** Envoi d'un e-mail de mise à jour quand la semaine en cours est modifiée */
export interface EmailMiseAJour {
    enabled: boolean;
    recipients: number;
}

/** GET /astreintes-ho?month=AAAA-MM */
export interface MoisHo {
    month: string;
    weeks: Array<{ monday: string; days: string[] }>;
    slots: Array<{ date: string; period: PeriodeHo; resource_id: number }>;
    names: NomHo[];
    experts: ExpertHo[];
    me: { today: string; currentWeek: string; isAdmin: boolean; resourceId: number | null; canEdit: boolean };
    updateMail?: EmailMiseAJour;
    ans: {
        slots: Array<{ date: string; user_id: number }>;
        users: UtilisateurAns[];
        names: NomHo[];
        me: { today: string; currentWeek: string; userId: number; isAdmin: boolean; canEdit: boolean };
        updateMail?: EmailMiseAJour;
    };
}

export interface ModificationHo {
    date: string;
    period: PeriodeHo;
    resource_id: number;
    action: 'add' | 'remove';
}

/** Utilisateurs en astreinte HO ANS un jour (liste vide : jour libéré) */
export interface ModificationAns {
    date: string;
    user_ids: number[];
}

interface EnvoiMiseAJour {
    sent: boolean;
    recipients: number;
}

/** POST /astreintes-ho/save */
export interface ResultatHo {
    success: boolean;
    applied: unknown[];
    mail?: EnvoiMiseAJour;
    ans: { applied: unknown[]; mail?: EnvoiMiseAJour } | null;
}

export const apiAstreintesHo = {
    mois: (mois: string) => api.get<MoisHo>(`/astreintes-ho?month=${encodeURIComponent(mois)}`),
    enregistrer: (changes: ModificationHo[], ansChanges: ModificationAns[]) =>
        api.post<ResultatHo>('/astreintes-ho/save', { changes, ansChanges })
};
