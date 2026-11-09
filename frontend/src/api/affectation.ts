// Aide à l'affectation opérationnelle (src/modules/affectation) : événements des activités suivies
import { api } from '@/api/client';

/** Activité d'un déploiement (visite métier, mise en service…) : clé et libellé du type d'événement associé */
export interface ActiviteSuivie {
    key: string;
    label: string;
}

/** Événement d'une activité suivie, pour un SAMU du planning des déploiements (GET /affectation/events) */
export interface EvenementAffectation {
    id: number;
    project_id: number;
    samu: string;
    label: string;
    /** « AAAA-MM-JJ » */
    start: string;
    end: string;
    /** AM, PM, FULL */
    period: string | null;
    stage: string;
    stage_label: string;
    type: {
        id: number;
        label: string;
        short: string | null;
        icon: string | null;
        bg: string;
        color: string;
        border: string;
    };
    participants: string[];
    /** Participants n'intervenant que certains jours de l'activité : nom → « 03/03, 04/03 » */
    participants_jours: Record<string, string>;
    /** Dates de l'activité dans le planning des déploiements ; null : activité non datée */
    planned: { start: string; end: string } | null;
}

export const apiAffectation = {
    evenements: () =>
        api.get<{ events: EvenementAffectation[]; stages: ActiviteSuivie[]; samus: string[] }>('/affectation/events')
};
