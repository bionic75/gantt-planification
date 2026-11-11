// Décor de la page servi par les scripts restants de public/js (thèmes saisonniers, mode d'affichage, icônes en
// image) jusqu'à leur passage en modules (lot 6.5), et bandeau « Données synchronisées » de l'onglet Ressources.

/** Icônes converties en image d'arrière-plan CSS (url("data:…")), public/js/ui-icons.js */
export interface IconesImages {
    urlForEmoji: (emoji: string, couleur?: string) => string | null;
    urlForSvg: (traces: string, couleur?: string) => string;
    urlForName: (nom: string, couleur?: string) => string | null;
}

/** Thème affiché : identifiant et raison (« forcé », « dates ») */
export interface ThemeAffiche {
    id: string;
    reason: string;
}

/** Décor des thèmes (public/js/themes.js), piloté par l'écran d'administration */
export interface ThemesAncienCode {
    /** Libellés et vignettes (tracés SVG 32×32) */
    catalogue: () => Record<string, { label: string; badge: string }>;
    /** Configuration relue ou enregistrée : appliquée au décor */
    appliquerConfig: (config: unknown) => void;
    /** Aperçu de quelques secondes, à l'intensité donnée */
    apercu: (id: string, intensite: string) => void;
    /** Thème affiché selon la configuration appliquée */
    compute: () => ThemeAffiche | null;
    /** Thème saisonnier affiché pour l'utilisateur (préférence du navigateur) */
    userEnabled: () => boolean;
    setUserEnabled: (actif: boolean) => void;
}

/** Mode d'affichage de l'application */
export type ModeAffichage = 'light' | 'dark' | 'auto';

interface FenetreDecor {
    Themes?: ThemesAncienCode;
    UIIconsApi?: IconesImages;
    ColorMode?: { get: () => ModeAffichage; set: (mode: ModeAffichage) => void };
}

const decor = () => window as unknown as FenetreDecor;

/** Décor des thèmes (absent hors de la page principale) */
export const themesAncienCode = (): ThemesAncienCode | undefined => decor().Themes;

/** Icônes en image ; undefined hors de la page principale */
export const iconesImages = (): IconesImages | undefined => decor().UIIconsApi;

export const modeAffichage = (): ModeAffichage => decor().ColorMode?.get() ?? 'light';

export function choisirModeAffichage(mode: ModeAffichage): void {
    decor().ColorMode?.set(mode);
}

let masquage: ReturnType<typeof setTimeout> | undefined;

/** Bandeau « Données synchronisées » de l'onglet Ressources (quelques secondes) ; sans effet onglet fermé */
export function afficherSynchronisation(): void {
    const bandeau = document.getElementById('syncStatus');
    if (!bandeau) return;
    bandeau.hidden = false;
    clearTimeout(masquage);
    masquage = setTimeout(() => (bandeau.hidden = true), 3000);
}
