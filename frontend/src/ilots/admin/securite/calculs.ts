// Sécurité et messagerie : champs des formulaires, contrôles et mises en forme (sans affichage)
import type { CleApi, ConfigMfa, ConfigSmtp, DonneesSmtp } from '@/api/securite';

// ---------- SMTP ----------

export interface ChampsSmtp {
    host: string;
    port: string;
    user: string;
    password: string;
}

/** Valeurs affichées, avec celles proposées par l'ancien écran en l'absence de configuration */
export const champsSmtp = (c: Partial<ConfigSmtp>): ChampsSmtp => ({
    host: c.host || 'smtp.office365.com',
    port: String(c.port || 587),
    user: c.user || '',
    password: ''
});

/** Données envoyées, ou null si un champ requis manque (mot de passe vide accepté s'il est déjà enregistré) */
export function donneesSmtp(champs: ChampsSmtp, motDePasseEnregistre: boolean): DonneesSmtp | null {
    const port = parseInt(champs.port);
    if (!champs.host || !port || !champs.user || (!champs.password && !motDePasseEnregistre)) return null;
    // SSL sur le port 465, STARTTLS sinon
    return { host: champs.host, port, secure: port === 465, user: champs.user, password: champs.password };
}

// ---------- Double authentification ----------

/** Configuration affichée : valeurs par défaut de l'ancien écran pour les réglages absents */
export const champsMfa = (c: Partial<ConfigMfa> | null): ConfigMfa => ({
    enabled: c?.enabled || false,
    method: c?.method || 'email',
    frequency: c?.frequency || 'daily',
    profileAdmin: c?.profileAdmin !== false,
    profileExpert: c?.profileExpert || false,
    profileUser: c?.profileUser || false,
    codeValidity: Number(c?.codeValidity) || 10
});

// ---------- Clés d'API ----------

export const dateCreation = (k: CleApi) => (k.created_at ? new Date(k.created_at).toLocaleDateString('fr-FR') : '—');
export const derniereUtilisation = (k: CleApi) =>
    k.last_used_at ? new Date(k.last_used_at).toLocaleString('fr-FR') : 'Jamais';
