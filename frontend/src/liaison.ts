// Liaison entre l'interface Vue (îlots) et l'ancien code de la page (public/js) : événements du navigateur préfixés
// « gp: », émis et écoutés des deux côtés. Disparaît avec l'ancien code (phase 6 de docs/migration-vue.md).
// Côté ancien code : resetUiForLogin, evtRefreshAfterTypeChange et les écouteurs de public/js/app/core.js.

/** Événements échangés et leur contenu */
export interface EvenementsLiaison {
    /** Déconnexion ou session perdue (émis par resetUiForLogin de l'ancien code) */
    'session-terminee': undefined;
    /** Session refusée par le serveur lors d'un appel d'un îlot (401) : l'ancien code renvoie vers la mire */
    'session-perdue': { message?: string };
    /** Événements créés, modifiés ou supprimés par un îlot : l'ancien code recharge ceux du planning */
    'evenements-modifies': undefined;
    /** Planification modifiée par un îlot (inscription d'un expert à un événement) : l'ancien code la recharge */
    'planning-modifie': undefined;
    /**
     * Localisations créées ou modifiées par un îlot, ou section d'administration ouverte : l'ancien code recharge ses
     * listes de localisations
     */
    'localisations-modifiees': undefined;
    /** Types d'événements modifiés dans l'administration (ancien code) : les îlots rechargent types et événements */
    'types-evenements-modifies': undefined;
    /** Accès aux applications modifiés : l'ancien code relit ceux de la session (menu Applications) */
    'applications-modifiees': undefined;
    /** Comptes utilisateurs modifiés : l'ancien code recharge ses utilisateurs et ses ressources */
    'utilisateurs-modifies': undefined;
    /** Accès aux onglets enregistrés : l'ancien code applique la configuration à la barre d'onglets */
    'onglets-modifies': { config: Record<string, Record<string, boolean>> };
    /** Version de l'application enregistrée : l'ancien code met à jour son affichage (en-tête) */
    'version-modifiee': undefined;
    /** Compteur d'inactivité enregistré : l'ancien code redémarre ou arrête celui de la session */
    'inactivite-modifiee': { active: boolean; minutes: number };
    /** Favicon enregistré : l'ancien code l'applique à la page */
    'favicon-modifie': { favicon: string };
    /** Fichiers de congés scolaires importés ou supprimés : l'ancien code recharge les congés de la planification */
    'conges-modifies': undefined;
    /** Fichiers de dates particulières modifiés : l'ancien code recharge les dates de la planification */
    'dates-particulieres-modifiees': undefined;
}

export type NomEvenement = keyof EvenementsLiaison;

const prefixe = (nom: NomEvenement) => `gp:${nom}`;

export function emettre<N extends NomEvenement>(nom: N, detail?: EvenementsLiaison[N]): void {
    window.dispatchEvent(new CustomEvent(prefixe(nom), { detail }));
}

/** Abonnement ; renvoie la fonction de désabonnement */
export function ecouter<N extends NomEvenement>(nom: N, fn: (detail: EvenementsLiaison[N]) => void): () => void {
    const handler = (e: Event) => fn((e as CustomEvent<EvenementsLiaison[N]>).detail);
    window.addEventListener(prefixe(nom), handler);
    return () => window.removeEventListener(prefixe(nom), handler);
}

/** Fonctions globales de l'ancien code appelées par les îlots */
interface FenetreAncienCode {
    /** Retour sur la mire de connexion (public/js/app/core.js) */
    forceSessionEnd?: (message?: string) => void;
    /** Carte des événements et déplacements, fenêtre plein écran (public/js/app/maps.js) */
    openEventMapModal?: () => void;
    /** Colonnes d'un tableau redimensionnables et masquables (clic droit), état mémorisé (public/js/app/planning.js) */
    makeColResizable?: (tableau: HTMLTableElement) => void;
    /** Son de notification (réglage du navigateur), lu pour l'essai (public/js/app/realtime.js) */
    playNotifSound?: () => void;
    /** Thèmes saisonniers : décor de la page (public/js/themes.js) */
    Themes?: ThemesAncienCode;
}

/** Thème affiché : identifiant et raison (« forcé », « dates ») */
export interface ThemeAffiche {
    id: string;
    reason: string;
}

/** Décor des thèmes de l'ancien code, piloté par l'écran d'administration */
export interface ThemesAncienCode {
    /** Libellés et vignettes (tracés SVG 32×32) */
    catalogue: () => Record<string, { label: string; badge: string }>;
    /** Configuration relue ou enregistrée : appliquée au décor */
    appliquerConfig: (config: unknown) => void;
    /** Aperçu de quelques secondes, à l'intensité donnée */
    apercu: (id: string, intensite: string) => void;
    /** Thème affiché selon la configuration appliquée */
    compute: () => ThemeAffiche | null;
}

const ancienCode = () => window as unknown as FenetreAncienCode;

/** Session perdue : l'ancien code (mire, démontage de l'interface) prend le relais */
export function installerLiaisonAncienCode(): void {
    ecouter('session-perdue', detail => {
        ancienCode().forceSessionEnd?.(detail?.message);
    });
}

/** Carte des événements de l'ancien code (non migrée) */
export function ouvrirCarteEvenements(): void {
    ancienCode().openEventMapModal?.();
}

/** Colonnes redimensionnables et masquables, comme les autres tableaux de l'application (utilitaire de l'ancien code) */
export function rendreColonnesRedimensionnables(tableau: HTMLTableElement): void {
    ancienCode().makeColResizable?.(tableau);
}

/** Son de notification du navigateur (essai) */
export function jouerSonNotification(): void {
    ancienCode().playNotifSound?.();
}

/** Décor des thèmes de l'ancien code (absent hors de la page principale) */
export const themesAncienCode = (): ThemesAncienCode | undefined => ancienCode().Themes;
