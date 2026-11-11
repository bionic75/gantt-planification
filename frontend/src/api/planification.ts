// Grille de la planification : planning, comptes, congés, dates particulières, astreintes du planning, historique des
// mises à disposition (src/modules/schedule, users, calendar, astreintes, resources)
import { api, ErreurApi } from '@/api/client';
import type { Ressource } from '@/api/ressources';
import { emettre, type DateParticuliere, type PeriodeConges, type ZoneConges } from '@/evenements';

/** Planning : clé « {ressource}_{available|activity|localisation|author}_{AAAA-MM-JJ}_{AM|PM} » → valeur */
export type Planning = Record<string, string>;

/** Compte (photo et rattachement à une ressource, pour la grille et les invitations) */
export interface CompteGrille {
    id: number;
    nom: string;
    prenom: string;
    email: string | null;
    resource_id: number | null;
    is_expert: number | boolean;
    profile_photo?: string | null;
}

/** Astreinte / HNO déclarée, affichée sur la grille (comptes rattachés à une ressource) */
export interface AstreintePlanning {
    id: number;
    resource_id: number | null;
    type: string;
    date_debut: string;
    date_fin: string;
    heure_debut: string | null;
    heure_fin: string | null;
    samu: string | null;
    tous_samu: number;
    objet: string;
}

/** Période de l'historique des taux de MAD */
export interface PeriodeMadGrille {
    id: number;
    date_debut: string;
    date_fin: string | null;
    taux: number;
}

/** Particularité d'une période de MAD (taux différent sur quelques jours) */
export interface ParticulariteMad {
    date_debut: string;
    date_fin: string;
    taux: number;
}

export interface AffectationSamuGrille {
    resource_id: number;
    samu: string;
    role: 'principal' | 'secondaire';
}

export type Conges = Partial<Record<ZoneConges, PeriodeConges[]>>;

/** Cellule à enregistrer ; valeur null : cellule supprimée */
export interface CelluleModifiee {
    key: string;
    value: string | null;
}

export const apiPlanification = {
    planning: () => api.get<Planning>('/schedule'),
    enregistrer: (updates: CelluleModifiee[]) =>
        api.post<{ success: boolean; saved: number }>('/schedule/save', { updates }),
    ressources: () => api.get<Ressource[]>('/resources'),
    /** Administrateur : tous les comptes ; autres profils : comptes publics */
    comptes: (administrateur: boolean) => api.get<CompteGrille[]>(administrateur ? '/users' : '/users/public'),
    affectationsSamu: () => api.get<AffectationSamuGrille[]>('/resource-samu-assignments'),
    historiqueMad: (ressourceId: number) => api.get<PeriodeMadGrille[]>(`/resources/${ressourceId}/mad-history`),
    particularites: (ressourceId: number, periodeId: number) =>
        api.get<ParticulariteMad[]>(`/resources/${ressourceId}/mad-history/${periodeId}/particularites`),
    /** Congés scolaires enregistrés (chargement de la page) */
    conges: () => api.get<{ holidays?: Conges }>('/school-holidays'),
    /** Congés scolaires des fichiers importés (après un import ou une suppression) */
    congesDesFichiers: () => api.get<{ periods?: Conges }>('/ics-files/school-holidays/all-periods'),
    datesParticulieres: () => api.get<{ dates?: DateParticuliere[] }>('/ics-files/special-dates/all'),
    astreintes: () => api.get<AstreintePlanning[]>('/all-astreintes-planning'),
    journaliser: (modification: string) => api.post('/logs/add-modification', { modification })
};

/** Calendrier du mois d'une ressource, construit par le serveur : titre et contenu HTML (en-tête et tableau) */
export interface CalendrierRessource {
    titre: string;
    contenu: string;
}

/** Exports et impressions de la planification (mois de 0 à 11) */
export const apiExports = {
    /** Planning du mois au format CSV, sous le nom de fichier proposé */
    async planningCsv(annee: number, mois: number, nomFichier: string): Promise<Blob> {
        const q = new URLSearchParams({
            year: String(annee),
            month: String(mois),
            format: 'csv',
            filename: nomFichier
        });
        const r = await fetch(`/api/export/gantt?${q}`, { credentials: 'include' });
        if (!r.ok) {
            const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
            if (r.status === 401) emettre('session-perdue', { message: d.message });
            throw new ErreurApi(r.status, d.error || `Erreur ${r.status}`, d);
        }
        return r.blob();
    },
    calendrier: (ressourceId: number, annee: number, mois: number) =>
        api.get<CalendrierRessource>(`/resource-calendar/${ressourceId}?year=${annee}&month=${mois}`),
    /** Adresse de l'expert rattaché à la ressource ; null sans compte avec adresse */
    emailExpert: (ressourceId: number) => api.get<{ email: string | null }>(`/user/email-by-resource/${ressourceId}`),
    envoyerCalendrier: (ressourceId: number, annee: number, mois: number) =>
        api.post<{ success: boolean; error?: string }>('/send-calendar-email', {
            resourceId: ressourceId,
            year: annee,
            month: mois
        })
};
