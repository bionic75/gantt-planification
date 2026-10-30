// Accès aux applications et aux onglets : libellés, suggestions, grille profils × onglets (sans affichage)
import type { CompteAcces, ConfigOnglets } from '@/api/acces';

// ---------- Applications ----------

export const LIBELLES_APPLICATIONS: Record<string, string> = {
    deplacements: 'Plateforme de suivi des déplacements',
    analyse: 'Analyse de fichiers',
    affectation: "Aide à l'affectation opérationnelle"
};

/** Tracés de la vignette d'une application (menu Applications de l'ancien code ; couleurs : classes CSS) */
export const VIGNETTES: Record<string, string> = {
    affectation:
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    analyse:
        '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>',
    deplacements:
        '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="14" r=".7"/><circle cx="16.5" cy="14" r=".7"/><path d="M6 17v2M18 17v2"/>'
};
export const VIGNETTE_PAR_DEFAUT = '<rect x="4" y="4" width="16" height="16" rx="3"/>';

/** Nom affiché d'un compte : NOM Prénom */
export const nomCompte = (c: Pick<CompteAcces, 'nom' | 'prenom'>) => `${c.nom.toUpperCase()} ${c.prenom}`;

/** Recherche lancée à partir de 2 caractères */
export const RECHERCHE_MIN = 2;

/** Suggestions : comptes trouvés, sauf ceux déjà autorisés */
export const suggestions = (trouves: CompteAcces[], autorises: CompteAcces[]) => {
    const deja = new Set(autorises.map(u => u.id));
    return trouves.filter(u => !deja.has(u.id));
};

// ---------- Onglets ----------

export const ONGLETS: Array<[string, string]> = [
    ['resources', 'Ressources'],
    ['evenements', 'Événements'],
    ['planning', 'Planification'],
    ['cra', 'CRA'],
    ['reporting', 'Reporting'],
    ['admin', 'Administration'],
    ['astreintesGestion', 'Astreintes'],
    ['tripadvisor', 'SAMU-SAS TripAdVisor']
];

export const PROFILS: Array<[string, string]> = [
    ['admin', 'Administrateur'],
    ['user', 'Utilisateur'],
    ['rh', 'RH'],
    ['expert', 'Expert métier']
];

/** L'administrateur garde toujours l'accès à l'Administration */
export const verrouillee = (profil: string, onglet: string) => profil === 'admin' && onglet === 'admin';

/** Grille complète (toutes les cases), case verrouillée cochée */
export function grille(cfg: ConfigOnglets): ConfigOnglets {
    return Object.fromEntries(
        PROFILS.map(([p]) => [p, Object.fromEntries(ONGLETS.map(([t]) => [t, verrouillee(p, t) || !!cfg[p]?.[t]]))])
    );
}
