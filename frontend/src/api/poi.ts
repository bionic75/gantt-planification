// SAMU-SAS TripAdVisor : appels et réponses de /api/poi (src/modules/poi)
import { api } from '@/api/client';

export type Categorie = 'hebergement' | 'restaurant' | 'bar';
export type ModeTrajet = 'walk' | 'car' | 'transit';

/** SAMU-SAS (localisation) avec son nombre de lieux */
export interface SamuSas {
    id: number;
    libelle_court: string;
    libelle_long: string | null;
    adresse: string | null;
    latitude: number | null;
    longitude: number | null;
    n_poi: number;
}

/** GET /api/poi/meta */
export interface MetaLieux {
    locations: SamuSas[];
    creators: Array<{ id: number; name: string }>;
    categories: Categorie[];
    /** Nombre de lieux par SAMU-SAS puis par typologie */
    counts: Record<string, Partial<Record<Categorie, number>>>;
}

/** Lieu de la liste (GET /api/poi) */
export interface Lieu {
    id: number;
    location_id: number;
    loc_court: string;
    loc_long: string | null;
    category: Categorie;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    comment: string | null;
    website: string | null;
    phone: string | null;
    osm_ref: string | null;
    created_by: number | null;
    creator: string;
    /** Horodatages UTC « AAAA-MM-JJ HH:MM:SS » */
    created_at: string;
    updated_at: string | null;
    avg_rating: number | null;
    n_ratings: number;
    n_comments: number;
    my_rating: number | null;
    distance_km: number | null;
    can_edit: boolean;
}

export interface ListeLieux {
    pois: Lieu[];
    isAdmin: boolean;
    userId: number;
}

export interface Commentaire {
    id: number;
    user_id: number;
    author: string;
    text: string;
    created_at: string;
    updated_at: string;
    can_edit: boolean;
}

export interface Note {
    user_id: number;
    author: string;
    rating: number;
    created_at: string;
    updated_at: string;
    can_edit: boolean;
}

/** GET /api/poi/:id */
export interface DetailLieu {
    poi: Lieu;
    comments: Commentaire[];
    ratings: Note[];
}

/** Suggestion de la base de référence (OpenStreetMap) */
export interface Suggestion {
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    category: Categorie | null;
    osm_ref?: string | null;
    phone?: string | null;
    website?: string | null;
    distance_km: number | null;
}

export type Point = [number, number];

/** Étape d'un trajet en transports en commun */
export interface EtapeTransit {
    mode: string;
    line?: string | null;
    from?: string | null;
    to?: string | null;
    duration: number;
    path: Point[];
}

export interface Trajet {
    error?: string;
    /** Durée en secondes, distance en mètres */
    duration: number;
    distance?: number | null;
    path: Point[];
    legs: EtapeTransit[];
    transfers?: number;
}

/** GET /api/poi/:id/route */
export interface TrajetsLieu {
    samu: string;
    from: Point;
    to: Point;
    modes: Record<ModeTrajet, Trajet>;
}

export interface FiltresLieux {
    loc: string;
    cat: Categorie | '';
    creator: string;
    q: string;
}

/** Corps d'un lieu pour la création ou la modification */
export interface CorpsLieu {
    location_id: number;
    category: Categorie | '';
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    osm_ref: string;
    phone: string;
    website: string;
    comment: string;
    rating?: number;
}

export const apiLieux = {
    meta: () => api.get<MetaLieux>('/poi/meta'),
    liste(f: FiltresLieux) {
        const p = new URLSearchParams();
        if (f.loc) p.set('location_id', f.loc);
        if (f.cat) p.set('category', f.cat);
        if (f.creator) p.set('creator', f.creator);
        if (f.q.trim()) p.set('q', f.q.trim());
        return api.get<ListeLieux>(`/poi?${p.toString()}`);
    },
    detail: (id: number) => api.get<DetailLieu>(`/poi/${id}`),
    trajets: (id: number) => api.get<TrajetsLieu>(`/poi/${id}/route`),
    suggestions(q: string, loc: string) {
        const p = new URLSearchParams({ q });
        if (loc) p.set('location_id', loc);
        return api.get<{ places: Suggestion[] }>(`/poi/places?${p.toString()}`);
    },
    creer: (corps: CorpsLieu) => api.post<{ id: number }>('/poi', corps),
    modifier: (id: number, corps: CorpsLieu) => api.put(`/poi/${id}`, corps),
    supprimer: (id: number) => api.delete(`/poi/${id}`),
    noter: (id: number, rating: number) => api.put(`/poi/${id}/rating`, { rating }),
    /** Note de l'utilisateur, ou d'un autre contributeur (administrateur) */
    retirerNote: (id: number, userId?: number) => api.delete(`/poi/${id}/rating${userId ? `?user_id=${userId}` : ''}`),
    commenter: (id: number, text: string) => api.post<{ id: number }>(`/poi/${id}/comments`, { text }),
    modifierCommentaire: (cid: number, text: string) => api.put(`/poi/comments/${cid}`, { text }),
    supprimerCommentaire: (cid: number) => api.delete(`/poi/comments/${cid}`)
};
