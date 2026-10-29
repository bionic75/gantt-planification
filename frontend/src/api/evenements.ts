// Événements : appels et réponses (src/modules/events, locations, users)
import { api } from '@/api/client';
import type { CompteParticipant } from '@/composants/AppSaisieParticipants.vue';

/** Type d'événement (GET /event-types) */
export interface TypeEvenement {
    id: number;
    code: string | null;
    label_long: string;
    label_short: string | null;
    icon: string;
    bg_color: string;
    text_color: string;
    border_color: string;
    is_other: number | boolean;
}

export interface ParticipantInterne {
    user_id: number;
    nom: string | null;
    prenom: string | null;
    email: string | null;
}

export interface ParticipantExterne {
    nom: string | null;
    prenom: string | null;
    email: string | null;
}

/** Événement de la liste (GET /my-custom-events) */
export interface Evenement {
    id: number;
    label: string;
    /** Dates « AAAA-MM-JJ » */
    start_date: string;
    end_date: string;
    /** Couleurs (JSON : bgColor, textColor, borderColor) */
    config: string | { bgColor?: string; textColor?: string; borderColor?: string } | null;
    created_by: number | null;
    /** Horodatage UTC « AAAA-MM-JJ HH:MM:SS » */
    created_at: string | null;
    needs_resources: number | null;
    resources_count: number | null;
    type_id: number | null;
    grist: number | null;
    location_id: number | null;
    period: 'FULL' | 'AM' | 'PM' | string | null;
    creator_nom: string | null;
    creator_prenom: string | null;
    type_long: string | null;
    type_short: string | null;
    type_icon: string | null;
    type_other: number | boolean | null;
    participants: ParticipantInterne[];
    external_participants: ParticipantExterne[];
}

export interface ListeEvenements {
    events: Evenement[];
    isAdmin: boolean;
    userId: number;
}

export interface Localisation {
    id: number;
    libelle_court: string;
    libelle_long: string;
}

/** Compte (GET /users pour l'administrateur, /users/public sinon) */
export interface Compte extends CompteParticipant {
    actif?: number;
}

/** Corps d'un événement pour la création ou la modification */
export interface CorpsEvenement {
    startDate: string;
    endDate: string;
    label: string;
    type_id?: number;
    config: { bgColor: string; textColor: string; borderColor: string };
    participants: number[];
    external_participants: ParticipantExterne[];
    period: string;
    location_id: number | null;
    grist: boolean;
    needs_resources?: boolean;
    resources_count?: number;
    notify_user_ids?: number[];
    /** Changement de créateur (administrateur) */
    createdBy?: number;
}

/** Réponse de l'inscription d'un participant */
export interface Inscription {
    planningUpdated: boolean;
    eventLabel: string;
}

export const apiEvenements = {
    liste: () => api.get<ListeEvenements>('/my-custom-events'),
    types: () => api.get<{ types: TypeEvenement[] }>('/event-types'),
    localisations: () => api.get<{ locations: Localisation[] }>('/locations'),
    comptes: (admin: boolean) => api.get<Compte[]>(admin ? '/users' : '/users/public'),
    creer: (corps: CorpsEvenement) => api.post<{ eventId: number }>('/my-custom-events', corps),
    /** Avec un créateur choisi (administrateur) : route de l'administration, qui permet de le changer */
    modifier: (id: number, corps: CorpsEvenement) =>
        api.put(corps.createdBy ? `/custom-events/${id}` : `/my-custom-events/${id}`, corps),
    supprimer: (id: number) => api.delete(`/my-custom-events/${id}`),
    participer: (id: number) => api.post<Inscription>(`/my-custom-events/${id}/join`),
    creerLocalisation: (corps: {
        libelle_long: string;
        libelle_court: string;
        adresse: string | null;
        latitude: string | null;
        longitude: string | null;
    }) => api.post<{ id: number }>('/locations', corps)
};
