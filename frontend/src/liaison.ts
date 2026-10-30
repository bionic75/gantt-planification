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
    /** Accès aux onglets enregistrés : l'ancien code applique la configuration à la barre d'onglets */
    'onglets-modifies': { config: Record<string, Record<string, boolean>> };
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
