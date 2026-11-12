// Carte des événements : événements des lieux géolocalisés, experts et leur établissement, localisations
// (backend/src/modules/reporting, resources, locations)
import { api } from '@/api/client';

/** Événement placé sur la carte (GET /reporting/events-map) : lieu géolocalisé, type, participants */
export interface EvenementCarte {
    id: number;
    label: string;
    start_date: string;
    end_date: string | null;
    period: string | null;
    config: string | { bgColor?: string; textColor?: string; borderColor?: string } | null;
    location_id: number;
    libelle_court: string;
    libelle_long: string | null;
    adresse: string | null;
    latitude: number;
    longitude: number;
    creator_nom: string | null;
    creator_prenom: string | null;
    type_long: string | null;
    type_short: string | null;
    type_icon: string | null;
    type_other: number | boolean | null;
    /** Participants affichés (« Prénom NOM ») et leurs identifiants, dans le même ordre */
    participants: string[];
    participant_ids: number[];
    external_participants: Array<{ nom: string | null; prenom: string | null; email: string | null }>;
}

/** Expert d'une ressource rattachée à un établissement (GET /resources/experts-map) */
export interface ExpertCarte {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string | null;
    es_rattachement: string;
    samu: string | null;
    profile_photo: string | null;
}

/** Localisation (GET /locations) : coordonnées éventuelles */
export interface LocalisationCarte {
    id: number;
    libelle_court: string;
    libelle_long: string;
    adresse: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
}

export const apiCarte = {
    evenements: (debut: string, fin: string) => {
        const p = new URLSearchParams();
        if (debut) p.set('startDate', debut);
        if (fin) p.set('endDate', fin);
        return api.get<{ events: EvenementCarte[] }>(`/reporting/events-map?${p}`);
    },
    experts: () => api.get<ExpertCarte[]>('/resources/experts-map'),
    localisations: () => api.get<{ locations: LocalisationCarte[] }>('/locations')
};
