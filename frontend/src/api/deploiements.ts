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

/** Déploiement placé sur la carte (GET /affectation/deployment-map) */
export interface DeploiementCarte {
    id: number;
    samu_name: string;
    location_id: number | null;
    latitude: number | null;
    longitude: number | null;
    status_id: number | null;
    date_mise_en_service: string | null;
}

export const apiDeploiements = {
    carte: () =>
        api.get<{ statuses: StatutDeploiement[]; deployments: DeploiementCarte[] }>('/affectation/deployment-map'),
    statuts: () => api.get<{ statuses: StatutDeploiement[] }>('/affectation/deployment-statuses'),
    creer: (d: { label: string; color: string }) => api.post<StatutDeploiement>('/affectation/deployment-statuses', d),
    modifier: (id: number, d: { label: string; color: string }) =>
        api.put<StatutDeploiement>(`/affectation/deployment-statuses/${id}`, d),
    supprimer: (id: number) => api.delete<{ success: boolean }>(`/affectation/deployment-statuses/${id}`),
    reordonner: (ids: number[]) =>
        api.put<{ statuses: StatutDeploiement[] }>('/affectation/deployment-statuses-order', { ids }),
    affecter: (projectId: number, d: { status_id: number | null; date_mise_en_service?: string | null }) =>
        api.put<{ success: boolean }>(`/affectation/projects/${projectId}/status`, d)
};
