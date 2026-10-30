// Sécurité et messagerie (administration) : configuration SMTP, double authentification, clés d'API, connexion Asana
import { api } from '@/api/client';

/** GET /email-config : le mot de passe n'est jamais renvoyé, seulement sa présence */
export interface ConfigSmtp {
    host: string;
    port: number;
    secure: number | boolean;
    user: string;
    passwordSet: boolean;
}

/** Corps de POST /email-config : mot de passe vide = celui enregistré est conservé */
export interface DonneesSmtp {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
}

export type MethodeMfa = 'email' | 'totp' | 'both';
export type FrequenceMfa = 'always' | 'daily' | 'weekly' | 'monthly';

export interface ConfigMfa {
    enabled: boolean;
    method: MethodeMfa;
    frequency: FrequenceMfa;
    profileAdmin: boolean;
    profileExpert: boolean;
    profileUser: boolean;
    codeValidity: number;
}

/** Clé d'API (GET /admin/api-keys) : préfixe seulement, la clé n'est montrée qu'à sa création */
export interface CleApi {
    id: number;
    label: string;
    key_prefix: string;
    created_at: string | null;
    last_used_at: string | null;
    revoked: number;
}

export interface ConfigAsana {
    tokenSet: boolean;
    workspaceGid: string;
    workspaceName: string;
    teamGid: string;
    teamName: string;
    nameFilter: string;
}

export interface ElementAsana {
    gid: string;
    name: string;
}

export const apiSmtp = {
    lire: () => api.get<ConfigSmtp>('/email-config'),
    enregistrer: (corps: DonneesSmtp) => api.post<{ success: boolean; error?: string }>('/email-config', corps),
    tester: () => api.post<{ success: boolean; error?: string }>('/email-config/test'),
    /** Journal des modifications (comme l'ancien code) */
    journaliser: (modification: string) => api.post('/logs/add-modification', { modification })
};

export const apiMfa = {
    lire: () => api.get<{ config: Partial<ConfigMfa> | null }>('/mfa/config'),
    enregistrer: (config: ConfigMfa) => api.post('/mfa/config', { config }),
    reinitialiserTout: () => api.post('/mfa/reset-all')
};

export const apiCles = {
    liste: () => api.get<CleApi[]>('/admin/api-keys'),
    creer: (label: string) => api.post<{ key: string; prefix: string }>('/admin/api-keys', { label }),
    revoquer: (id: number) => api.delete(`/admin/api-keys/${id}`)
};

export const apiAsana = {
    config: () => api.get<ConfigAsana>('/affectation/asana/config'),
    enregistrer: (corps: Partial<ConfigAsana> & { token?: string }) => api.put('/affectation/asana/config', corps),
    supprimerJeton: () => api.delete('/affectation/asana/token'),
    tester: () => api.post<{ name: string; email: string; workspaces: ElementAsana[] }>('/affectation/asana/test'),
    equipes: () => api.get<{ teams: ElementAsana[] }>('/affectation/asana/teams')
};
