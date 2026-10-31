// Types d'événements (administration) et reprise des données des événements : appels et réponses
// (src/modules/events)
import { api } from '@/api/client';
import type { TypeEvenement } from '@/api/evenements';

/** Type de la liste d'administration : nombre d'événements du type */
export interface TypeAdmin extends TypeEvenement {
    events_count?: number;
}

/** Champs d'un type saisis par l'administrateur */
export interface CorpsType {
    label_long: string;
    label_short: string;
    icon: string;
    bg_color: string;
    text_color: string;
    border_color: string;
}

/** Événement de la reprise (seuls le type et le libellé sont modifiables) */
export interface EvenementReprise {
    id: number;
    label: string;
    /** Dates « AAAA-MM-JJ » */
    start_date: string;
    end_date: string;
    period: string | null;
    type_id: number | null;
    location_court: string | null;
    location_long: string | null;
    creator_nom: string | null;
    creator_prenom: string | null;
    participants: string[];
}

/** Modification d'un événement de la reprise */
export interface ModificationReprise {
    type_id?: number | null;
    label?: string;
}

export const apiTypesEvenements = {
    liste: () => api.get<{ types?: TypeAdmin[] }>('/event-types'),
    creer: (corps: CorpsType) => api.post<{ id: number }>('/event-types', corps),
    modifier: (id: number, corps: CorpsType) => api.put(`/event-types/${id}`, corps),
    supprimer: (id: number) => api.delete(`/event-types/${id}`),
    reprise: () => api.get<{ events?: EvenementReprise[] }>('/event-types/events'),
    enregistrerReprise: (updates: Array<{ id: number } & ModificationReprise>) =>
        api.put<{ updated: number }>('/event-types/events/bulk', { updates })
};
