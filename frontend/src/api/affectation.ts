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

/** Période d'une étape d'un déploiement ; needed : ressources nécessaires par jour (étapes à ressources) */
export interface PeriodeEtape {
    start: string;
    end: string;
    needed?: number | null;
}

/** Déploiement d'un SAMU (GET /affectation/projects) */
export interface Deploiement {
    id: number;
    samu_name: string;
    chef_projet_nom: string | null;
    date_debut: string;
    date_mise_en_service: string | null;
    date_mise_en_production: string | null;
    periods: Record<string, PeriodeEtape[]>;
    /** Ressources affectées par étape */
    assignments?: Record<string, number[]>;
    /** Journées d'intervention par étape : date → ressources */
    assignment_days?: Record<string, Record<string, number[]>>;
    from_asana?: boolean | number | null;
}

/** Étape d'un déploiement : période(s), date (mise en service / production) ou jalon (une date) */
export interface EtapeAffectation {
    key: string;
    label: string;
    kind?: 'period' | 'periods' | 'date' | 'milestone';
    /** Étape à ressources expertes (nombre de ressources par jour) */
    resources?: boolean;
    defaultColor?: string;
    defaultPattern?: string;
}

/** Étapes, couleurs et motifs (GET /affectation/config) */
export interface ConfigAffectation {
    stages: EtapeAffectation[];
    colors: Record<string, string>;
    patterns?: Record<string, string>;
}

/** Déploiement complet (administration) : entité, chef de projet */
export interface DeploiementAdmin extends Deploiement {
    location_id: number | null;
    chef_projet_id: number | null;
}

/** Corps d'un déploiement créé ou modifié */
export interface CorpsDeploiement {
    samu_name: string;
    location_id: number | null;
    chef_projet_id: number | null;
    date_debut: string;
    date_mise_en_service: string | null;
    date_mise_en_production: string | null;
    periods: Record<string, PeriodeEtape[]>;
}

/** Chef de projet possible : utilisateur actif */
export interface UtilisateurAffectation {
    id: number;
    nom: string | null;
    prenom: string | null;
}

/** Entrée de l'historique d'un déploiement ; at : « AAAA-MM-JJ HH:MM:SS » (UTC) */
export interface EntreeHistorique {
    id: number;
    user: string | null;
    action: string;
    at: string;
    changes: { label: string; from: string; to: string }[];
    note: string;
}

/** Événement lié à un déploiement, signalé avant sa suppression */
export interface EvenementLie {
    id: number;
    label: string;
    start: string;
    end: string;
    participants: string[];
}

/** Événement du SAMU proposé pour une activité */
export interface EvenementCandidat {
    id: number;
    label: string;
    start: string;
    end: string;
    participants: number;
    type: string | null;
}

/** Événements du SAMU pour une activité : du type de l'activité, autres ; activité découpable en parties (multi) */
export interface CandidatsActivite {
    multi: boolean;
    linkedIds: number[];
    typeId: number | null;
    typeLong: string | null;
    matching: EvenementCandidat[];
    others: EvenementCandidat[];
    linked: number | null;
}

/** Type d'événement (correspondance des activités) */
export interface TypeEvenementAffectation {
    id: number;
    label_long: string;
    label_short: string | null;
    icon: string;
    bg_color: string;
    text_color: string;
    border_color: string;
}

/** Correspondance activités Asana ↔ types d'événements (GET /affectation/stage-event-types) */
export interface CorrespondanceActivites {
    stages: { key: string; label: string; rule: string }[];
    mapping: Record<string, number>;
    types: TypeEvenementAffectation[];
    asanaActivities: { value: string; label: string }[];
    asanaTemplate: { gid: string; name: string; tasks: { value: string; label: string }[] } | null;
    asanaRules: Record<string, string>;
}

/** Expert (identifiant positif) ou ressource externe, utilisateur de l'application (identifiant négatif) */
export interface RessourceAffectable {
    id: number;
    nom: string | null;
    prenom: string | null;
    trigramme: string | null;
    external?: boolean;
}

/** Disponibilité d'une ressource sur les jours d'une étape : free, here, ans, off, leave, other */
export interface DisponibiliteRessource {
    byDay?: Record<string, string>;
    free?: number;
    other?: number;
    others?: string[];
}

/** État d'une demi-journée dans l'aperçu du report : ok, write, conflict, extra */
export interface EtatReport {
    s: 'ok' | 'write' | 'conflict' | 'extra';
    reason?: string;
}

export interface RessourceReport {
    id: number;
    user_id: number | null;
    nom: string | null;
    prenom: string | null;
    toWrite: number;
    done: number;
    conflictCount: number;
    forceableCount: number;
    extraCount: number;
    addableCount: number;
    /** « AAAA-MM-JJ_AM » → état */
    states: Record<string, EtatReport>;
}

/** Aperçu du report d'une étape dans la planification et l'événement (GET …/sync/:stage) */
export interface ApercuReport {
    samu: string;
    samuLoc: string;
    activity: string;
    locationId: number | null;
    start: string;
    end: string;
    spanStart: string;
    spanEnd: string;
    resources: RessourceReport[];
    event: {
        label: string;
        existing: { label: string; start_date: string; end_date: string; participants: number[] } | null;
    };
}

export interface CorpsReport {
    planning?: {
        resource_ids: number[];
        force_ids: number[];
        drop_ids: number[];
        clear_ids: number[];
        add_ids: number[];
    };
    event?: { apply: true; participants: number[]; label?: string; startDate?: string; endDate?: string };
}

export interface ResultatReport {
    planning: number;
    cleared?: number;
    forced?: number;
    dropped?: number;
    added?: number;
    event?: { created: boolean; participants: number } | null;
}

/** Modèle PowerPoint d'export : présence, zone du planning, pages de garde et de fin */
export interface ModeleExport {
    exists: boolean;
    name?: string;
    size?: number;
    uploadedAt?: string;
    uploadedBy?: string | null;
    info?: {
        zone: { wMm: number; hMm: number };
        cover?: boolean;
        end?: boolean;
        baseSlide?: number;
        slides?: number;
        layout?: string;
    } | null;
}

/** Élément d'une diapositive du modèle (aperçu) : image, rectangle ou texte ; dimensions en EMU */
export interface ElementDiapositive {
    t: 'img' | 'rect' | 'text';
    x: number;
    y: number;
    w: number;
    h: number;
    src?: string;
    color?: string;
    text?: string;
    role?: string;
    anchor?: string;
    sz?: number;
    b?: boolean;
    font?: string;
    algn?: string;
}

export interface ApercuModele {
    W: number;
    H: number;
    zone: { x: number; y: number; w: number; h: number };
    slides: { kind: 'cover' | 'plan' | 'end'; items: ElementDiapositive[] }[];
}

const json = (corps: unknown) => corps;

export const apiAffectation = {
    evenements: () =>
        api.get<{ events: EvenementAffectation[]; stages: ActiviteSuivie[]; samus: string[] }>('/affectation/events'),
    config: () => api.get<ConfigAffectation>('/affectation/config'),
    deploiements: () => api.get<{ projects: Deploiement[] }>('/affectation/projects'),
    ressources: () =>
        api.get<{ resources: RessourceAffectable[]; externals?: RessourceAffectable[] }>('/affectation/resources'),
    /** Participants des événements repris comme ressources affectées (tous les déploiements, ou un seul) */
    synchroniserDepuisEvenements: (projectId?: number) =>
        api.post<{ changes?: unknown[] }>('/affectation/sync-from-events', projectId ? { projectId } : {}),
    disponibilites: (id: number, etape: string) =>
        api.get<{ availability: Record<number, DisponibiliteRessource>; dates?: string[] }>(
            `/affectation/projects/${id}/availability/${etape}`
        ),
    enregistrerJournees: (id: number, etape: string, days: Record<string, number[]>) =>
        api.put<{ resource_ids: number[]; assignment_days: Record<string, number[]> }>(
            `/affectation/projects/${id}/assignment-days/${etape}`,
            { days }
        ),
    /** Remise en situation de la planification (administrateur) : ressources retirées, ou journées décochées */
    liberer: (id: number, etape: string, corps: { resource_ids: number[] } | { days: Record<number, string[]> }) =>
        api.post<{ planningReset: number; removedFromEvents?: number }>(
            `/affectation/projects/${id}/assignments/${etape}/release`,
            json(corps)
        ),
    apercuReport: (id: number, etape: string) => api.get<ApercuReport>(`/affectation/projects/${id}/sync/${etape}`),
    reporter: (id: number, etape: string, corps: CorpsReport) =>
        api.post<ResultatReport>(`/affectation/projects/${id}/sync/${etape}`, corps),
    modele: () => api.get<ModeleExport>('/affectation/template'),
    apercuModele: () => api.get<ApercuModele>('/affectation/template/preview'),
    nomExport: () => api.get<{ pattern?: string; defaultPattern?: string }>('/affectation/export-config'),

    // ── Administration (administrateur) ──
    deploiementsAdmin: () => api.get<{ projects: DeploiementAdmin[] }>('/affectation/projects'),
    utilisateurs: () => api.get<{ users: UtilisateurAffectation[] }>('/affectation/users'),
    creerDeploiement: (corps: CorpsDeploiement) => api.post<DeploiementAdmin>('/affectation/projects', corps),
    modifierDeploiement: (id: number, corps: CorpsDeploiement) =>
        api.put<DeploiementAdmin>(`/affectation/projects/${id}`, corps),
    /** Suppression ; refusée (409, code EVENTS_LINKED, événements) si des événements sont liés et le sort non précisé */
    supprimerDeploiement: (id: number, evenements?: 'keep' | 'delete') =>
        api.delete<{ eventsRemoved: number; planningReset: number }>(
            `/affectation/projects/${id}${evenements ? `?events=${evenements}` : ''}`
        ),
    historique: (id: number) => api.get<{ history: EntreeHistorique[] }>(`/affectation/projects/${id}/history`),
    candidatsEvenements: (id: number) =>
        api.get<{ candidates: Record<string, CandidatsActivite> }>(`/affectation/projects/${id}/events-candidates`),
    lierEvenements: (id: number, corps: { key: string; eventId?: number | null; eventIds?: number[] }) =>
        api.put(`/affectation/projects/${id}/event-link`, corps),
    creerEvenement: (id: number, corps: { key: string; start: string; end: string }) =>
        api.post(`/affectation/projects/${id}/event-create`, corps),
    enregistrerCouleurs: (colors: Record<string, string>, patterns: Record<string, string>) =>
        api.put<{ colors: Record<string, string>; patterns: Record<string, string> }>('/affectation/colors', {
            colors,
            patterns
        }),
    enregistrerNomExport: (pattern: string) =>
        api.put<{ pattern?: string; defaultPattern?: string }>('/affectation/export-config', { pattern }),
    /** Modèle PowerPoint : fichier lu en data URI */
    importerModele: (name: string, data: string) => api.put<ModeleExport>('/affectation/template', { name, data }),
    supprimerModele: () => api.delete<ModeleExport>('/affectation/template'),
    correspondance: () => api.get<CorrespondanceActivites>('/affectation/stage-event-types'),
    enregistrerCorrespondance: (mapping: Record<string, number>, asanaRules: Record<string, string>) =>
        api.put<{ mapping: Record<string, number>; asanaRules: Record<string, string> }>(
            '/affectation/stage-event-types',
            { mapping, asanaRules }
        ),
    projetsTypesAsana: () =>
        api.get<{ projects: { gid: string; name: string }[] }>('/affectation/asana/template-projects'),
    choisirProjetTypeAsana: (gid: string) =>
        api.put<{ template: CorrespondanceActivites['asanaTemplate'] }>('/affectation/asana/template', { gid })
};
