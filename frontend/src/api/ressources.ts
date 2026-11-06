// Ressources (experts mis à disposition) : liste, création, activation, astreintes, suppression, affectations SAMU,
// historique des taux de MAD (src/modules/resources)
import { api } from '@/api/client';

/** Ressource (GET /resources) ; drapeaux 0 / 1 */
export interface Ressource {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string;
    taux: number;
    samu: string;
    es_rattachement: string | null;
    fonction: string | null;
    date_debut: string | null;
    date_fin: string | null;
    actif: number;
    is_mad_volante: number;
    astreinte_volontaire: number;
    astreinte_ho: number;
    astreinte_apd: number;
    astreinte_date_activation: string | null;
    date_fin_mad: string | null;
    jours_max_mad: number | null;
    contacts_rh: string | null;
    user_id: number | null;
    /** E-mail du compte expert rattaché, à défaut celui de la ressource */
    email?: string | null;
}

/** Période de l'historique des taux de MAD */
export interface PeriodeMad {
    id: number;
    date_debut: string;
    date_fin: string | null;
    taux: number;
}

/** Affectation d'une ressource sur un SAMU (expert principal ou secondaire) */
export interface AffectationSamu {
    resource_id: number;
    samu: string;
    role: 'principal' | 'secondaire';
}

/** Ressource créée depuis le formulaire d'ajout */
export interface CorpsRessource {
    nom: string;
    prenom: string;
    trigramme: string;
    email: null;
    telephone: null;
    taux: number;
    samu: string;
    actif: 1;
    date_debut: string;
    date_fin: null;
    es_rattachement: string | null;
    fonction: string | null;
    astreinte_volontaire: 0 | 1;
    astreinte_ho: 0 | 1;
    astreinte_apd: 0 | 1;
    astreinte_date_activation: string | null;
    is_mad_volante: 0 | 1;
    date_fin_mad: string | null;
    jours_max_mad: number | null;
}

/** Particularité d'une période de MAD : variation temporaire du taux */
export interface Particularite {
    id: number;
    date_debut: string;
    date_fin: string;
    taux: number;
    motif: string | null;
}

/** Fiche enregistrée (champs de l'ancien écran : astreintes en booléens) */
export interface CorpsFiche {
    nom: string;
    prenom: string;
    trigramme: string;
    email: null;
    telephone: null;
    taux: number;
    samu: string;
    date_debut: string | null;
    date_fin: string | null;
    es_rattachement: string | null;
    fonction: string | null;
    contacts_rh: string | null;
    astreinte_volontaire: boolean;
    astreinte_ho: boolean;
    astreinte_apd: boolean;
    astreinte_date_activation: string | null;
    is_mad_volante: 0 | 1;
    date_fin_mad: string | null;
    jours_max_mad: number | null;
}

/** Période ou particularité saisie */
export interface CorpsPeriode {
    taux: number;
    date_debut: string;
    date_fin: string | null;
}

export type TypeAstreinte = 'ho' | 'hno' | 'apd';

export const apiRessources = {
    liste: () => api.get<Ressource[]>('/resources'),
    creer: (corps: CorpsRessource) => api.post<{ id: number }>('/resources', corps),
    basculerActif: (id: number) => api.post(`/resources/${id}/toggle`),
    astreinte: (id: number, hasAccess: boolean, type: TypeAstreinte) =>
        api.post(`/resources/${id}/astreinte`, { hasAccess, type }),
    supprimer: (id: number) => api.delete(`/resources/${id}`),
    affectations: () => api.get<AffectationSamu[]>('/resource-samu-assignments'),
    enregistrerAffectations: (id: number, principal: string[], secondaire: string[]) =>
        api.put(`/resources/${id}/samu-assignments`, { principal, secondaire }),
    historiqueMad: (id: number) => api.get<PeriodeMad[]>(`/resources/${id}/mad-history`),
    modifier: (id: number, corps: CorpsFiche) => api.put(`/resources/${id}`, corps),
    ajouterPeriode: (id: number, corps: CorpsPeriode) => api.post(`/resources/${id}/mad-history`, corps),
    modifierPeriode: (id: number, periode: number, corps: CorpsPeriode) =>
        api.put(`/resources/${id}/mad-history/${periode}`, corps),
    supprimerPeriode: (id: number, periode: number) => api.delete(`/resources/${id}/mad-history/${periode}`),
    particularites: (id: number, periode: number) =>
        api.get<Particularite[]>(`/resources/${id}/mad-history/${periode}/particularites`),
    ajouterParticularite: (id: number, periode: number, corps: CorpsPeriode & { motif: string | null }) =>
        api.post(`/resources/${id}/mad-history/${periode}/particularites`, corps),
    modifierParticularite: (
        id: number,
        periode: number,
        particularite: number,
        corps: CorpsPeriode & { motif: string | null }
    ) => api.put(`/resources/${id}/mad-history/${periode}/particularites/${particularite}`, corps),
    supprimerParticularite: (id: number, periode: number, particularite: number) =>
        api.delete(`/resources/${id}/mad-history/${periode}/particularites/${particularite}`),
    /** Journal des modifications (consulté par l'administration) */
    journaliser: (modification: string) => api.post('/logs/add-modification', { modification })
};

/** Export des ressources : fichier téléchargé par le navigateur */
export const URL_EXPORT_RESSOURCES = '/api/export/resources';
