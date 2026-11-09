// Suivi des déplacements : déplacements, bons de commande, AMOA CED (src/modules/deplacements, users)
import { api } from '@/api/client';

/** Bon de commande (GET /bons-commande) ; dates « AAAA-MM-JJ » */
export interface BonCommande {
    id: number;
    intitule: string;
    titulaire: string | null;
    date_debut: string;
    date_fin: string;
    nb_uo: number;
    actif: number | null;
    solde: number | null;
}

/** Bon de commande avec ses UO consommées (GET /reporting-deplacements) */
export interface BonCommandeSuivi {
    id: number;
    intitule: string;
    titulaire: string | null;
    date_debut: string;
    date_fin: string;
    uo_commandees: number;
    uo_consommees: number;
    actif: number | null;
    solde: number | null;
    /** Bon de commande qui a absorbé la surconsommation (régularisation technique) */
    regularisation_cible_bdc_id: number | null;
    regularisation_cible_intitule: string | null;
}

/** Déplacement du reporting (GET /deplacements : tous, ou ceux d'un bon de commande) */
export interface DeplacementReporting {
    id: number;
    user_id: number;
    amoa_ced_id: number | null;
    date_debut: string;
    date_fin: string;
    samu: string;
    ville: string;
    nb_uo: number;
    bon_commande_id: number | null;
    /** Ligne de régularisation technique : bon de commande d'origine de la surconsommation */
    regularisation_source_bdc_id: number | null;
    user_nom: string | null;
    user_prenom: string | null;
    bon_commande_intitule: string | null;
    bon_commande_titulaire: string | null;
    amoa_ced_nom: string | null;
    amoa_ced_prenom: string | null;
}

/** Corps d'un bon de commande (création, modification) */
export interface CorpsBonCommande {
    intitule: string;
    titulaire: string;
    date_debut: string;
    date_fin: string;
    nb_uo: number;
    solde?: boolean;
}

/** Régularisation technique : ligne de déplacement sur le bon cible absorbant la surconsommation du bon source */
export interface CorpsRegularisation {
    source_bdc_id: number;
    cible_bdc_id: number;
    nb_uo: number;
    date_debut: string;
    commentaire: string | null;
}

export interface ResultatRegularisation {
    success: boolean;
    deplacement_id: number;
    source_intitule: string;
    cible_intitule: string;
    nb_uo: number;
    date_debut: string;
    date_fin: string;
}

/** Déplacement de la liste (GET /mes-deplacements : ceux de l'utilisateur, tous pour l'administrateur) */
export interface Deplacement {
    id: number;
    user_id: number;
    amoa_ced_id: number | null;
    date_debut: string;
    date_fin: string;
    samu: string;
    ville: string;
    nb_uo: number;
    commentaire: string | null;
    bon_commande_id: number | null;
    a_regulariser: number | null;
    /** « AAAA-MM-JJ HH:MM:SS » ou ISO */
    created_at: string | null;
    bon_commande_intitule: string | null;
    bon_commande_titulaire: string | null;
    bc_uo_commandees: number | null;
    amoa_ced_nom: string | null;
    amoa_ced_prenom: string | null;
    creator_nom: string | null;
    creator_prenom: string | null;
}

/** Compte AMOA CED (GET /users/amoa-ced) */
export interface AmoaCed {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string | null;
}

/** Corps d'un déplacement (création, modification) */
export interface CorpsDeplacement {
    amoa_ced_id: number;
    date_debut: string;
    date_fin: string;
    samu: string;
    ville: string;
    bon_commande_id: number;
    commentaire: string;
}

export const apiDeplacements = {
    mes: () => api.get<Deplacement[]>('/mes-deplacements'),
    detail: (id: number) => api.get<Deplacement>(`/deplacements/${id}`),
    creer: (corps: CorpsDeplacement) =>
        api.post<{ id: number; nb_uo: number; a_regulariser?: boolean }>('/deplacements', corps),
    modifier: (id: number, corps: CorpsDeplacement) => api.put(`/deplacements/${id}`, corps),
    supprimer: (id: number) => api.delete(`/deplacements/${id}`),
    bons: () => api.get<BonCommande[]>('/bons-commande'),
    suiviBons: () => api.get<BonCommandeSuivi[]>('/reporting-deplacements'),
    amoaCed: () => api.get<AmoaCed[]>('/users/amoa-ced'),
    /** Reporting : tous les déplacements, ou ceux d'un bon de commande */
    tous: (bonId?: number) =>
        api.get<DeplacementReporting[]>(bonId ? `/deplacements?bon_commande_id=${bonId}` : '/deplacements'),
    // Bons de commande (administrateur)
    creerBon: (corps: CorpsBonCommande) => api.post<{ id: number }>('/bons-commande', corps),
    modifierBon: (id: number, corps: CorpsBonCommande) => api.put(`/bons-commande/${id}`, corps),
    supprimerBon: (id: number) =>
        api.delete<{ message: string; deplacements_desaffectes?: number }>(`/bons-commande/${id}`),
    regularisationTechnique: (corps: CorpsRegularisation) =>
        api.post<ResultatRegularisation>('/deplacements/regularisation-technique', corps)
};
