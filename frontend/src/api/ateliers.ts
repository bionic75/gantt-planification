// Aide à l'affectation › ateliers métier (src/modules/affectation/ateliers.* et sondages.*) : rétroplannings,
// simulation, invitations, sondages de date ; page publique d'un sondage
import { api } from '@/api/client';

export interface SamuAteliers {
    project_id: number;
    samu_name: string;
    /** Zone de vacances scolaires du département du SAMU ; null si indéterminée */
    zone: string | null;
    /** Date de mise en production du déploiement */
    mep: string | null;
    /** Rétroplanning déjà enregistré */
    saved: boolean;
}

export interface MetaAteliers {
    samus: SamuAteliers[];
    zones: string[];
    limites: { min: number; max: number };
    contenus: string[];
}

/** Données propres à chaque jalon (clé : visite, a1…a6, livrables, mep) */
export interface LignesRetroplanning {
    jalons: Record<string, string>;
    contenus: Record<string, string>;
    planifiees: Record<string, string>;
    heures: Record<string, string>;
    /** Invitation envoyée : date d'envoi */
    invites: Record<string, string>;
    teams: string;
    destinataires: { userIds: number[]; emails: string[] };
    ecarts?: { ecart12?: number; ecartAteliers?: number };
}

export interface CorpsRetroplanning {
    samu_name: string;
    mep: string;
    nb: number;
    zone: string;
    delaiVisite: number;
    delaiMep: number;
    ecart12: number;
    ecartAteliers: number;
    lignes: Omit<LignesRetroplanning, 'ecarts'>;
}

export interface JalonSimule {
    key: string;
    ordre: number;
    jalon: string;
    contenu: string;
    cible: string | null;
    proposee: string | null;
    planifiee: string | null;
    statut: string;
    niveau: 'ok' | 'warn' | 'info' | 'fix';
    ecart: number | null;
}

export interface Simulation {
    rows: JalonSimule[];
    warnings: string[];
}

export interface Retroplanning {
    id: number;
    samu_name: string;
    mep_date: string;
    zone: string;
    nb_ateliers: number;
    delai_visite_atelier: number;
    delai_mep: number;
    lignes: Partial<LignesRetroplanning>;
    jalons: JalonSimule[];
    warnings: string[];
    last_sent_at: string | null;
    updated_at: string | null;
}

/** Utilisateur proposé (organisateur, destinataires, copies) */
export interface UtilisateurAteliers {
    id: number;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    actif?: number;
}

export type StatutSondage = 'brouillon' | 'envoye' | 'reponses' | 'termine';

export interface OptionSondage {
    id?: number;
    date: string;
    heure?: string | null;
    heure_fin?: string | null;
}

export interface ReponseSondage {
    nom: string;
    options: number[];
}

export interface Sondage {
    id: number;
    nom: string;
    url: string;
    statut: StatutSondage;
    organisateur_id: number | null;
    destinataires: string[];
    cc_user_ids: number[];
    message: string;
    options: (OptionSondage & { id: number })[];
    reponses: ReponseSondage[];
    option_retenue_id: number | null;
}

/** Statut des sondages (bouton de chaque jalon) */
export interface ResumeSondage {
    id: number;
    retroplanning_id: number;
    ligne: string;
    nom: string;
    statut: StatutSondage;
    reponses: number;
}

export interface CorpsSondage {
    nom: string;
    organisateur_id: number | null;
    options: OptionSondage[];
    destinataires: string[];
    cc_user_ids: number[];
    message: string;
}

export interface CorpsInvitation {
    userIds: number[];
    emails: string[];
    organisateur_id: number | null;
    teams: string;
    heure_fin: string | null;
    subject: string;
    message: string;
}

/** Page publique : sondage vu par une personne invitée (sa seule réponse) */
export interface SondagePublic {
    nom: string;
    atelier?: string | null;
    objectif?: string | null;
    organisateur?: string | null;
    termine: boolean;
    retenue: number | null;
    options: { id: number; date: string; heure?: string | null; heure_fin?: string | null }[];
    mienne: { nom: string; options: number[] } | null;
}

const sondage = (id: number, ligne: string) => `/affectation/ateliers/${id}/sondages/${ligne}`;

export const apiAteliers = {
    meta: () => api.get<MetaAteliers>('/affectation/ateliers/meta'),
    liste: () => api.get<{ retroplannings?: Retroplanning[] }>('/affectation/ateliers'),
    simuler: (corps: CorpsRetroplanning) => api.post<Simulation>('/affectation/ateliers/simulate', corps),
    enregistrer: (corps: CorpsRetroplanning) =>
        api.put<{ id: number; created: boolean; samu_name: string }>('/affectation/ateliers', corps),
    supprimer: (id: number) => api.delete(`/affectation/ateliers/${id}`),
    utilisateurs: () => api.get<UtilisateurAteliers[] | { users?: UtilisateurAteliers[] }>('/users'),
    inviter: (id: number, ligne: string, corps: CorpsInvitation) =>
        api.post<{ sent: number }>(`/affectation/ateliers/${id}/invitation/${ligne}`, corps),
    sondages: () => api.get<{ sondages?: ResumeSondage[] }>('/affectation/ateliers-sondages'),
    sondage: (id: number, ligne: string) =>
        api.get<{
            sondage: Sondage | null;
            modele: Pick<Sondage, 'organisateur_id' | 'destinataires' | 'cc_user_ids'> | null;
        }>(sondage(id, ligne)),
    enregistrerSondage: (id: number, ligne: string, corps: CorpsSondage) =>
        api.put<{ sondage: Sondage }>(sondage(id, ligne), corps),
    envoyerSondage: (id: number, ligne: string) =>
        api.post<{ sent: number; cc?: number }>(`${sondage(id, ligne)}/send`, {}),
    cloturer: (id: number, ligne: string, optionId: number | null) =>
        api.post(`${sondage(id, ligne)}/close`, { option_id: optionId }),
    rouvrir: (id: number, ligne: string) => api.post(`${sondage(id, ligne)}/reopen`, {}),
    supprimerSondage: (id: number, ligne: string) => api.delete(sondage(id, ligne))
};
