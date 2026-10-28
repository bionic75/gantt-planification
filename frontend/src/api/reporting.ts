// Reporting : appels et réponses (src/modules/reporting, logs, events, users, resources)
import { api } from '@/api/client';
import type { Profil } from '@/api/types';

/** Ressource (GET /resources), champs utiles au reporting */
export interface RessourceReporting {
    id: number;
    nom: string;
    prenom: string;
    fonction: string | null;
    actif: number | boolean;
}

/** Compte (GET /users pour l'administrateur, /users/public sinon), champs utiles au reporting */
export interface CompteReporting {
    id: number;
    nom: string | null;
    prenom: string | null;
    username?: string;
    email?: string | null;
}

/** Statistiques d'un mois (jours) */
export interface StatsMois {
    available: number;
    assigned: number;
    leave: number;
    rate: number;
}

/** POST /reporting/availability */
export interface RapportDisponibilites {
    months: Array<{ year: number; month: number }>;
    experts: Array<{
        id: number;
        name: string;
        tauxMad: number;
        avgWorkingDaysPerMonth?: number;
        /** Clé « AAAA-MM » (mois de 1 à 12) */
        monthlyStats: Record<string, StatsMois>;
    }>;
}

export interface PeriodeMois {
    startMonth: number;
    startYear: number;
    endMonth: number;
    endYear: number;
}

/** GET /reporting/diagnose/:expertId/:year/:month */
export interface Diagnostic {
    expertId: number;
    patterns: string[];
    totalRows: number;
    summary: {
        availableSlots: number;
        availableDays: number;
        assignedSlots: number;
        assignedDays: number;
        leaveSlots: number;
        leaveDays: number;
    };
    rawData: Array<{ date_key: string; type: string; value: string }>;
}

/** POST /reporting/hno-astreintes */
export interface RapportHno {
    experts: Array<{
        resource_id: number;
        nom: string;
        prenom: string;
        /** Clé « AAAA-m » (mois de 0 à 11) */
        monthlyData: Record<string, { hno: number; astreintes: number }>;
    }>;
}

/** Événement trouvé (GET /custom-events/search) */
export interface EvenementTrouve {
    id: number;
    label: string;
    start_date: string;
    end_date: string;
    period: 'AM' | 'PM' | string | null;
    config: string | { bgColor?: string; textColor?: string; borderColor?: string } | null;
    creator_prenom: string | null;
    creator_nom: string | null;
    participants: Array<{ user_id: number; nom: string | null; prenom: string | null }>;
}

/** Ligne du rapport des connexions : un utilisateur et un profil utilisé */
export interface LigneConnexions {
    user_id?: number;
    username: string | null;
    nom: string | null;
    prenom: string | null;
    profile: Profil | string;
    nb_connexions: number | null;
    derniere_connexion: string | null;
}

export const apiReporting = {
    ressources: () => api.get<RessourceReporting[]>('/resources'),
    comptes: (admin: boolean) => api.get<CompteReporting[]>(admin ? '/users' : '/users/public'),
    disponibilites: (corps: PeriodeMois & { expertIds: number[]; includeLeave: boolean }) =>
        api.post<RapportDisponibilites>('/reporting/availability', corps),
    diagnostic: (expertId: number, annee: number, mois: number) =>
        api.get<Diagnostic>(`/reporting/diagnose/${expertId}/${annee}/${mois}`),
    hnoAstreintes: (corps: PeriodeMois & { expertIds: number[]; showHno: boolean; showAstreintes: boolean }) =>
        api.post<RapportHno>('/reporting/hno-astreintes', corps),
    evenements(criteres: { startDate: string; endDate: string; label: string; participantIds: number[] }) {
        const p = new URLSearchParams();
        if (criteres.startDate) p.set('startDate', criteres.startDate);
        if (criteres.endDate) p.set('endDate', criteres.endDate);
        if (criteres.label.trim()) p.set('label', criteres.label.trim());
        if (criteres.participantIds.length) p.set('participantIds', criteres.participantIds.join(','));
        return api.get<{ events: EvenementTrouve[] }>(`/custom-events/search?${p.toString()}`);
    },
    connexions(dateStart: string, dateEnd: string, userIds: string[]) {
        const p = new URLSearchParams({ dateStart, dateEnd });
        if (userIds.length) p.set('userIds', userIds.join(','));
        return api.get<{ rows: LigneConnexions[] }>(`/reporting/connections?${p.toString()}`);
    }
};
