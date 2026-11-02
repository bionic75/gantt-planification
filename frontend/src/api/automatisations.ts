// Automatisations (administration) : configurations, historiques, tests et envois, diagnostic et nettoyage des données
// du planning (src/modules/automations)
import { api, ErreurApi } from '@/api/client';
import { emettre } from '@/liaison';

/** Configuration enregistrée d'une automatisation (champs propres à chacune) */
export type ConfigAutomatisation = Record<string, unknown>;

/** Envoi de l'historique : rappel (n°1) ou sauvegarde (n°2) */
export interface EnvoiAutomatisation {
    id: number;
    sent_at: string;
    expert_name: string | null;
    expert_email: string | null;
    target_month: string | null;
    /** Sauvegarde : destinataires (JSON, liste de noms) */
    recipients_list: string | null;
    recipients_count: number;
    file_id: number | null;
    filename: string | null;
}

export interface ExpertSansDisponibilite {
    id: number;
    nom: string;
    prenom: string;
    email: string;
    resource_id: number | null;
}

export interface TestRappel {
    targetMonth: string;
    expertsWithoutAvailability: ExpertSansDisponibilite[];
}

/** Paramètres d'une sauvegarde de test (récapitulatif et envoi) */
export interface ParametresSauvegarde {
    groupAdmin: boolean;
    groupUser: boolean;
    groupExpert: boolean;
    recipients: number[];
    allMonths: boolean;
    selectedMonths: string[];
    allExperts: boolean;
    expertsList: number[];
    excludeEmpty: boolean;
    format: string;
}

export interface RecapitulatifSauvegarde {
    recipientsCount: number;
    emailsCount: number;
    recipientsList: string[];
    expertsCount: number;
    monthsLabel?: string;
    filename: string;
}

export interface MoisDiagnostic {
    label: string;
    raw: string;
    totalRows: number;
    availableNot1: number;
    activityNot1: number;
    samples: string | null;
}

export interface ApercuNettoyage {
    toDelete: Array<{ date_key: string; type: string; value: string; resource_id: number }>;
    toNormalize: Array<{ oldKey: string; newKey: string; rowCount: number; hasConflict: boolean }>;
    conflictCount: number;
}

export const apiAutomatisations = {
    config: (n: number) => api.get<{ config?: ConfigAutomatisation | null }>(`/automation/config/${n}`),
    enregistrer: (n: number, config: ConfigAutomatisation) => api.post(`/automation/config/${n}`, { config }),
    envois: (n: number) => api.get<{ logs?: EnvoiAutomatisation[] }>(`/automation/logs/${n}`),
    viderEnvois: (n: number) => api.delete(`/automation/logs/${n}`),
    /** Fichier d'une sauvegarde envoyée : contenu et nom proposé par le serveur */
    async fichierSauvegarde(id: number): Promise<{ contenu: Blob; nom: string }> {
        const r = await fetch(`/api/automation/download/2/${id}`, { credentials: 'include' });
        if (!r.ok) {
            if (r.status === 401) emettre('session-perdue', {});
            throw new ErreurApi(r.status, `Erreur ${r.status}`);
        }
        const disposition = r.headers.get('Content-Disposition');
        const nom = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? 'Expert_Planning_Sauvegarde.csv';
        return { contenu: await r.blob(), nom };
    },
    testRappel: () => api.get<TestRappel>('/automation/test/1'),
    envoyerRappels: (experts: ExpertSansDisponibilite[], targetMonth: string) =>
        api.post<{ sent: number; failed: number }>('/automation/send-reminder', { experts, targetMonth }),
    moisDisponibles: () =>
        api.get<{ months?: Array<{ value: string; label: string }> }>('/automation/available-months'),
    recapitulatif: (p: ParametresSauvegarde) => api.post<RecapitulatifSauvegarde>('/automation/preview/2', p),
    envoyerSauvegarde: (p: ParametresSauvegarde) =>
        api.post<{ sent: number; emailsSent: number; failed: number }>('/automation/send/2', p),
    diagnostic: () => api.get<{ months?: MoisDiagnostic[]; orphanData?: unknown[] }>('/automation/diagnose-months'),
    apercuNettoyage: () => api.post<ApercuNettoyage>('/automation/cleanup-dates-preview'),
    nettoyer: () =>
        api.post<{ deleted: number; normalized: number; duplicatesRemoved: number }>(
            '/automation/cleanup-dates-execute'
        )
};
