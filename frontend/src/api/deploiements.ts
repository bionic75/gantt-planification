// Statuts de déploiement et carte des déploiements (backend/src/modules/affectation)
import { api } from '@/api/client';

/** Statut d'un déploiement : libellé, couleur, ordre ; « En service » (is_service) porte une date de mise en service */
export interface StatutDeploiement {
    id: number;
    label: string;
    color: string;
    position: number;
    is_service: number;
}

/**
 * SAMU suivi (GET /affectation/deployment-map) : une ligne par localisation. `date_suggeree` : mise en service lue dans
 * les événements ou le déploiement ; `derive` : SAMU d'un déploiement ou d'un événement « Mise en service » (non retirable)
 */
export interface DeploiementCarte {
    id: number;
    samu_name: string;
    location_id: number | null;
    latitude: number | null;
    longitude: number | null;
    status_id: number | null;
    date_mise_en_service: string | null;
    date_suggeree?: string | null;
    derive?: boolean;
}

export const apiDeploiements = {
    carte: () =>
        api.get<{ statuses: StatutDeploiement[]; palette: string[]; deployments: DeploiementCarte[] }>(
            '/affectation/deployment-map'
        ),
    statuts: () => api.get<{ statuses: StatutDeploiement[]; palette: string[] }>('/affectation/deployment-statuses'),
    creer: (d: { label: string; color: string }) => api.post<StatutDeploiement>('/affectation/deployment-statuses', d),
    modifier: (id: number, d: { label: string; color: string }) =>
        api.put<StatutDeploiement>(`/affectation/deployment-statuses/${id}`, d),
    supprimer: (id: number) => api.delete<{ success: boolean }>(`/affectation/deployment-statuses/${id}`),
    reordonner: (ids: number[]) =>
        api.put<{ statuses: StatutDeploiement[] }>('/affectation/deployment-statuses-order', { ids }),
    affecter: (locationId: number, d: { status_id: number | null; date_mise_en_service?: string | null }) =>
        api.put<{ success: boolean }>(`/affectation/deployment-samus/${locationId}`, d),
    retirer: (locationId: number) => api.delete<{ success: boolean }>(`/affectation/deployment-samus/${locationId}`),
    importerMes: () => api.post<{ imported: number }>('/affectation/deployment-import-mes')
};
