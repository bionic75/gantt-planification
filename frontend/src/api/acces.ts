// Accès des comptes aux applications et accès aux onglets par profil (administration)
import { api } from '@/api/client';

/** Compte autorisé ou proposé par la recherche */
export interface CompteAcces {
    id: number;
    nom: string;
    prenom: string;
    email: string | null;
    username: string;
}

/** GET /app-access : comptes autorisés par application */
export type AccesApplications = Record<string, { users: CompteAcces[] }>;

/** Profil → onglet → visible */
export type ConfigOnglets = Record<string, Record<string, boolean>>;

export const apiApplications = {
    liste: () => api.get<AccesApplications>('/app-access'),
    ajouter: (app: string, userId: number) => api.post<{ success: boolean }>(`/app-access/${app}/users`, { userId }),
    retirer: (app: string, userId: number) => api.delete<{ success: boolean }>(`/app-access/${app}/users/${userId}`),
    rechercher: (q: string) => api.get<CompteAcces[]>(`/users/search?q=${encodeURIComponent(q)}`)
};

export const apiOnglets = {
    lire: () => api.get<{ config: ConfigOnglets; defaults: ConfigOnglets }>('/tab-access'),
    enregistrer: (config: ConfigOnglets) => api.put<{ config: ConfigOnglets }>('/tab-access', { config })
};
