// Comptes rendus d'activité (CRA) : appels et réponses (backend/src/modules/cra)
import { api } from '@/api/client';
import { emettre } from '@/evenements';

export type StatutCra = 'a_completer' | 'soumis' | 'vise_n1' | 'vise_n2' | 'diffuse';
export type TypeLigne = 'activite_courante' | 'astreinte' | 'hno';
export type NiveauVisa = 'n1' | 'n2';

/** Ligne de la planification à l'origine d'une ligne collectée (MAD volante), renvoyée telle quelle au serveur */
export type OrigineLigne = Record<string, unknown>;

/** Valeurs d'une ligne collectée au moment de la collecte (corrections à reporter dans la planification) */
export interface InstantaneLigne {
    date_debut: string;
    date_fin: string;
    heure_debut: string;
    heure_fin: string;
    samu: string;
    objet: string;
}

/** Ligne d'astreinte, de travail HNO ou d'activité courante du mois */
export interface LigneCra {
    id?: number;
    type: TypeLigne;
    date_debut: string;
    date_fin: string;
    heure_debut: string;
    heure_fin: string;
    samu: string;
    objet: string;
    /** « Tous les SAMU » : la ligne vaut pour tous les SAMU (champ samu vide) */
    tous_samu?: number;
    origin?: OrigineLigne;
    orig?: InstantaneLigne;
}

/** GET /cra/my-list : CRA de l'expert, ou tous les CRA en cours (administrateur) */
export interface Cra {
    id: number;
    user_id: number;
    mois: number;
    annee: number;
    statut: StatutCra;
    archived: number | null;
    created_at: string | null;
    submitted_at: string | null;
    vise_n1_at: string | null;
    vise_n2_at: string | null;
    diffuse_at: string | null;
    refuse_at: string | null;
    commentaire_expert: string | null;
    commentaire_refus: string | null;
    modifie_admin_at: string | null;
    modifie_admin_nom: string | null;
    pdf_filename: string | null;
    vise_n1_nom: string;
    vise_n2_nom: string;
    /** Administrateur : nom de l'expert */
    expert_nom?: string;
}

export interface SignatureCra {
    rang: 1 | 2 | 3;
    signer_name: string;
    signed_at: string;
    ip_address: string | null;
}

/** Ligne enregistrée, ramenée au mois du CRA */
export interface LigneEnregistree {
    id: number;
    type: TypeLigne;
    date_debut: string;
    date_fin: string;
    heure_debut: string | null;
    heure_fin: string | null;
    samu: string | null;
    objet: string | null;
    tous_samu?: number;
}

/** GET /cra/:id */
export interface DetailCra extends Cra {
    expert_nom: string;
    es_rattachement: string | null;
    expert_samu: string | null;
    astreintes_hno: LigneEnregistree[];
    signatures: SignatureCra[];
}

/** Correction d'une ligne collectée à reporter dans la planification (ligne null : supprimée) */
export interface CorrectionCra {
    origin: OrigineLigne;
    line: Pick<LigneCra, 'date_debut' | 'date_fin' | 'heure_debut' | 'heure_fin'> | null;
}

/** POST /cra/:id/propagate */
export interface ResultatReport {
    activity: number;
    astreinte: number;
    skipped?: string[];
}

/** GET /cra/admin/list, /cra/admin/archives : CRA avec le nombre de lignes du mois */
export interface CraListe extends Cra {
    expert_nom: string;
    nb_lignes: number;
}

/** GET /cra/admin/deleted : CRA dans la corbeille, statut et archivage avant suppression */
export interface CraSupprime extends Cra {
    expert_nom: string;
    pre_delete_statut: StatutCra | null;
    pre_delete_archived: number | null;
}

/** Filtres des listes d'administration (vides : non appliqués) */
export interface FiltresCra {
    user_id?: string;
    statut?: string;
    mois?: string;
    annee?: string;
}

/** GET /cra/all-experts, /cra/all-experts-full */
export interface ExpertCra {
    user_id: number;
    nom: string | null;
    prenom: string | null;
}

export type CategorieDestinataire = 'expert' | 'rh_es' | 'drh_ans';
export interface DestinataireDiffusion {
    email: string;
    nom: string | null;
}
export type DestinatairesDiffusion = Record<CategorieDestinataire, DestinataireDiffusion[]>;

/** GET /cra/:id/diffusion-log : un e-mail de diffusion et son état dans la file d'envoi */
export interface JournalDiffusion {
    id: number;
    recipient_email: string;
    recipient_name: string | null;
    recipient_type: string;
    sent_at: string;
    email_status: 'sent' | 'failed' | 'pending' | null;
    error_message: string | null;
}

const action = <T = { success: boolean }>(id: number, chemin: string, corps: unknown = {}) =>
    api.post<T>(`/cra/${id}/${chemin}`, corps);

const requete = (filtres: FiltresCra) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filtres)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `?${q}` : '';
};

export const apiCra = {
    mesCra: () => api.get<Cra[]>('/cra/my-list'),
    detail: (id: number) => api.get<DetailCra>(`/cra/${id}`),
    collecte: (id: number) => api.get<{ allowed: boolean; lines: LigneCra[] }>(`/cra/${id}/collect`),
    enregistrerLignes: (id: number, lignes: LigneCra[]) => action(id, 'astreintes', { lignes }),
    reporter: (id: number, corrections: CorrectionCra[]) => action<ResultatReport>(id, 'propagate', { corrections }),
    soumettre: (id: number, commentaire: string) => action(id, 'submit', { commentaire }),
    rienADeclarer: (id: number) => action(id, 'rien-a-declarer'),
    rappeler: (id: number) => action(id, 'recall'),
    viser: (id: number, niveau: NiveauVisa) => action(id, `visa/${niveau}`),
    refuser: (id: number, niveau: NiveauVisa, commentaire: string) => action(id, `refuser/${niveau}`, { commentaire }),
    corriger: (id: number) => action(id, 'admin-correction'),
    renvoyer: (id: number) => action<{ success: boolean; mailed: boolean }>(id, 'return-to-expert'),
    archiver: (id: number) => action(id, 'archive'),
    /** PDF signé enregistré sur le serveur (CRA visé N2 ou diffusé) : présence du fichier */
    async pdfEnregistre(nom: string): Promise<boolean> {
        const r = await fetch(urlPdfEnregistre(nom), { method: 'HEAD', credentials: 'include' });
        if (r.status === 401) emettre('session-perdue', {});
        return r.ok;
    },
    preparerPdf: (id: number) => action<{ success: boolean; pdfFilename: string; error?: string }>(id, 'prepare-pdf'),

    // ---------- Administration ----------
    liste: (filtres: FiltresCra) => api.get<CraListe[]>(`/cra/admin/list${requete(filtres)}`),
    archives: (filtres: FiltresCra) => api.get<CraListe[]>(`/cra/admin/archives${requete(filtres)}`),
    supprimes: () => api.get<CraSupprime[]>('/cra/admin/deleted'),
    /** Experts proposés au lancement (ressources actives) */
    expertsLancement: () => api.get<ExpertCra[]>('/cra/all-experts-full'),
    /** Experts des filtres (actifs ou non) */
    experts: () => api.get<ExpertCra[]>('/cra/all-experts'),
    lancer: (user_id: number, mois: number, annee: number) =>
        api.post<{ success: boolean }>('/cra/launch', { user_id, mois, annee }),
    desarchiver: (id: number) => action(id, 'unarchive'),
    supprimer: (id: number) => action(id, 'soft-delete'),
    restaurer: (id: number) => action(id, 'restore-deleted'),
    purger: (id: number) => api.delete<{ success: boolean }>(`/cra/${id}/purge`),
    destinataires: (id: number) => api.get<DestinatairesDiffusion>(`/cra/${id}/diffusion-recipients`),
    diffuser: (id: number, recipients: DestinatairesDiffusion, pdfFilename: string) =>
        action<{ success: boolean; sent: number }>(id, 'diffuser', { recipients, pdfFilename }),
    journal: (id: number) => api.get<JournalDiffusion[]>(`/cra/${id}/diffusion-log`),
    renvoyerDiffusion: (id: number) => action<{ success: boolean; sent: number }>(id, 'diffusion-resend-all'),
    renvoyerEmail: (id: number, logId: number) => action(id, `diffusion-resend/${logId}`)
};

export const urlPdfEnregistre = (nom: string) => `/api/cra/pdf-saved/${encodeURIComponent(nom)}`;
