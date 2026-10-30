// Localisations : appels et réponses (src/modules/locations)
import { api } from '@/api/client';

export interface Localisation {
    id: number;
    libelle_long: string;
    libelle_court: string;
    adresse: string | null;
    latitude: number | null;
    longitude: number | null;
}

/** Localisation sans identifiant (saisie, ligne d'un fichier CSV) */
export interface DonneesLocalisation {
    libelle_long: string;
    libelle_court: string;
    adresse: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
}

/** GET /locations/:id/usage : événements rattachés */
export interface UsageLocalisation {
    count: number;
    events: Array<{ label: string; start_date: string; end_date: string }>;
}

export const apiLocalisations = {
    liste: () => api.get<{ locations: Localisation[] }>('/locations'),
    creer: (corps: DonneesLocalisation) => api.post<{ id: number }>('/locations', corps),
    modifier: (id: number, corps: DonneesLocalisation) => api.put(`/locations/${id}`, corps),
    supprimer: (id: number) => api.delete(`/locations/${id}`),
    usage: (id: number) => api.get<UsageLocalisation>(`/locations/${id}/usage`),
    importer: (lignes: DonneesLocalisation[]) => api.post<{ inserted?: number }>('/locations/import', { rows: lignes })
};
