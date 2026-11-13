// Aide à l'affectation › Asana (backend/src/modules/affectation/asana.controller.js) : connexion, projets du périmètre,
// import (export CSV ou projet), rafraîchissements, conflits, tâches d'un projet et remplacements ; administrateur
import { api } from '@/api/client';

/** Les rubriques « Formation » reprises d'Asana visent la formation des utilisateurs */
const CIBLE_FORMATION = 'utilisateurs';

export interface ConfigAsana {
    tokenSet: boolean;
    workspaceGid: string;
    workspaceName: string;
    teamGid: string;
    teamName: string;
    nameFilter?: string;
}

export interface DeploiementApparie {
    id: number;
    samu_name: string;
}

/** Projet Asana du périmètre ; deployment : déploiement apparié (automatiquement, ou manuellement si manual) */
export interface ProjetAsana {
    gid: string;
    name: string;
    url?: string;
    samuNo?: string | null;
    deployment: DeploiementApparie | null;
    manual: boolean;
    ignored: boolean;
}

export type EtatRubrique = 'nouveau' | 'modifié' | 'local' | 'conflit' | 'identique' | 'absent';

export interface LigneApercu {
    key: string;
    label: string;
    old: string;
    new: string;
    status: EtatRubrique;
    reason?: string;
    previous?: string;
}

/** Aperçu d'un import, avant toute écriture */
export interface ApercuAsana {
    samuName: string;
    projectName: string;
    taskCount: number;
    existing: { id: number } | null;
    locationFound: boolean;
    rows: LigneApercu[];
}

export interface ChangementAsana {
    label: string;
    from: string;
    to: string;
}

/** Rubrique modifiée dans l'application et dans Asana depuis la dernière reprise */
export interface ConflitAsana {
    key: string;
    label: string;
    app: string;
    asana: string;
    previous?: string;
}

export interface ResultatImport {
    success?: boolean;
    created?: boolean;
    unchanged?: boolean;
    id?: number | null;
    samu_name: string;
    date_debut?: string;
    debutAjuste?: boolean;
    changes?: ChangementAsana[];
    conflicts?: ConflitAsana[];
}

export interface ResultatRafraichissement {
    unchanged?: boolean;
    updated?: number;
    created?: boolean;
    samu_name: string;
    asana?: string;
    changes?: ChangementAsana[];
    conflicts?: ConflitAsana[];
}

export interface ConflitsDeploiement {
    id: number;
    samu: string;
    asana?: string;
    rows: ConflitAsana[];
}

export interface ResultatToutRafraichir {
    total: number;
    updated: { samu: string; asana?: string; changes: ChangementAsana[] }[];
    unchanged: string[];
    noMatch: string[];
    errors: { samu: string; error: string }[];
    conflicts: ConflitsDeploiement[];
}

/** Tâche d'un projet Asana ; eff : dates effectives (null : non datée) */
export interface TacheAsana {
    gid: string;
    code: string | null;
    name: string;
    parent: string | null;
    start: string | null;
    due: string | null;
    eff: { start: string; end: string } | null;
}

/** Valeur d'une rubrique : une date, ou une période */
export interface ValeurRubrique {
    date?: string;
    start?: string;
    end?: string;
}

/** Remplacement de la tâche reprise : tâche (rubrique datée) ou tâches de début et de fin (période) */
export interface Remplacement {
    task?: string;
    start?: string;
    end?: string;
}

export interface RubriqueAsana {
    key: string;
    label: string;
    kind: 'date' | 'period';
    rule: string;
    current: ValeurRubrique | null;
    auto: ValeurRubrique | null;
    sources: string[];
    override: Remplacement | null;
}

export interface TachesProjet {
    /** Faux : données de l'application seulement, Asana n'a pas été interrogé */
    interroge?: boolean;
    /** Date de la dernière lecture d'Asana dont les tâches et valeurs « selon la règle » sont issues */
    cache?: string | null;
    samu: string;
    asana: string;
    gid: string;
    url?: string;
    candidates?: { gid: string; name: string }[];
    tasks: TacheAsana[];
    rubriques: RubriqueAsana[];
}

export const apiAsana = {
    config: () => api.get<ConfigAsana>('/affectation/asana/config'),
    projets: () =>
        api.get<{ projects: ProjetAsana[]; deployments: DeploiementApparie[] }>('/affectation/asana/projects'),
    /** Appariement : déploiement choisi (> 0), projet ignoré (-1), appariement automatique (0) */
    apparier: (gid: string, deploymentId: number) => api.put('/affectation/asana/links', { gid, deploymentId }),
    apercu: (gid: string) =>
        api.post<ApercuAsana>('/affectation/asana/preview', { gid, formationTarget: CIBLE_FORMATION }),
    /** Import des rubriques choisies, ou « auto » : toutes les rubriques nouvelles ou modifiées */
    importer: (gid: string, rubriques: string[] | 'auto') =>
        api.post<ResultatImport>('/affectation/asana/apply', {
            gid,
            formationTarget: CIBLE_FORMATION,
            apply: rubriques
        }),
    apercuCsv: (csv: string) =>
        api.post<ApercuAsana>('/affectation/import/asana-csv', { csv, formationTarget: CIBLE_FORMATION }),
    importerCsv: (csv: string, rubriques: string[]) =>
        api.post<ResultatImport>('/affectation/import/asana-csv/apply', {
            csv,
            formationTarget: CIBLE_FORMATION,
            apply: rubriques
        }),
    rafraichir: (id: number) => api.post<ResultatRafraichissement>(`/affectation/projects/${id}/asana-refresh`, {}),
    toutRafraichir: () => api.post<ResultatToutRafraichir>('/affectation/asana/refresh-all', {}),
    trancher: (id: number, choices: Record<string, 'app' | 'asana'>) =>
        api.post<{ applied: number; kept: number }>(`/affectation/projects/${id}/asana-conflicts`, { choices }),
    /** Sans interrogation d'Asana (avecAsana faux) : contenu de l'application seulement */
    taches: (id: number, avecAsana = true) =>
        api.get<TachesProjet>(`/affectation/projects/${id}/asana-tasks${avecAsana ? '' : '?asana=0'}`),
    remplacer: (id: number, overrides: Record<string, Remplacement>) =>
        api.put<ResultatRafraichissement>(`/affectation/projects/${id}/asana-overrides`, { overrides })
};
