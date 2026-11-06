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
    /** Ressources créées, modifiées ou supprimées par un îlot : l'ancien code recharge les siennes et la planification */
    'ressources-modifiees': undefined;
    /** Ressources rechargées par l'ancien code (fiche enregistrée, connexion…) : les îlots relisent les leurs */
    'ressources-rechargees': undefined;
    /** CRA modifiés par l'îlot de l'onglet CRA (lancement, circuit, diffusion, archivage…) : l'ancien code relit la
     * pastille de l'onglet */
    'cra-modifies': undefined;
    /** Lien d'une notification (« ?tab=cra&cra_id= ») : l'îlot de l'onglet CRA ouvre le CRA demandé (prendreCraDemande) */
    'cra-demande': undefined;
    /** Bouton de l'ancien code (en-têtes) : ouverture d'une fenêtre Vue (ilots/fenetres.ts) */
    'fenetre-demandee': { fenetre: NomFenetre };
    /** Astreintes / HNO déclarées créées, modifiées ou supprimées : l'ancien code recharge celles de la planification */
    'astreintes-modifiees': undefined;
    /** Invitations Outlook envoyées (ou abandonnées) : l'ancien code retire ces experts des affectations en attente */
    'invitations-envoyees': { resourceIds: number[] };
    /** Nouvelles affectations lues par l'expert : l'ancien code relit la pastille */
    'notifications-lues': undefined;
}

/** Fenêtres Vue ouvertes par les boutons de l'ancien code */
export type NomFenetre =
    | 'calendrier-mensuel'
    | 'calendrier-evenements'
    | 'recherche-avancee'
    | 'astreintes-hno'
    | 'demande-affectation'
    | 'invitations'
    | 'nouvelles-affectations';

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
    /** Accès de l'utilisateur aux fonctions proposées par l'accueil (public/js/app/tab-access.js) */
    accueilAcces?: () => AccesAccueil | null;
    /** Ouverture d'un onglet de la Planification (public/js/app/tabs.js) */
    switchTab?: (onglet: string, evenement: null) => void;
    /** Ouverture d'une application (public/js/app/tab-access.js) */
    switchToApp?: (application: string) => void;
    /** Bandeau « Données synchronisées » de l'onglet Ressources (public/js/app/dump.js) */
    showSyncStatus?: () => void;
    /** CRA demandé par le lien d'une notification, en attente d'ouverture (public/js/app/core.js) */
    craDemande?: number;
    /** Instantané des données de la planification (public/js/app/core.js) */
    etatPlanning?: () => EtatPlanning;
    /** Instantané des affectations en attente d'invitation Outlook (public/js/app/core.js) */
    affectationsEnAttente?: () => EtatInvitations;
    /** Icônes en image (data URI) pour les listes déroulantes (public/js/ui-icons.js) */
    UIIconsApi?: IconesImages;
}

/** Ressource telle que la planification de l'ancien code la connaît */
export interface RessourcePlanning {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string;
    actif: number | boolean;
    date_debut: string | null;
    date_fin: string | null;
}

/** Période de congés scolaires : début inclus, fin exclue (AAAA-MM-JJ) */
export interface PeriodeConges {
    start: string;
    end: string;
}

export type ZoneConges = 'zoneA' | 'zoneB' | 'zoneC';

/** Apparence et description d'une date particulière (fichier .ics ou événement, src/modules/calendar) */
export interface ConfigDateParticuliere {
    label?: string;
    shown?: string;
    eventId?: number;
    locationLibelleCourt?: string;
    typeLong?: string;
    typeIcon?: string;
    bgColor?: string;
    textColor?: string;
    borderColor?: string;
    participants?: string[];
}

/** Date particulière (jour férié, événement…) : du jour date au jour endDate inclus */
export interface DateParticuliere {
    date: string;
    endDate?: string | null;
    summary?: string;
    period?: 'AM' | 'PM' | 'FULL';
    config?: ConfigDateParticuliere;
}

/**
 * Données de la planification tenues par l'ancien code (grille du Gantt), lues à l'ouverture d'une fenêtre ; remplacées
 * par un magasin quand la grille sera migrée (lot 4.5)
 */
export interface EtatPlanning {
    ressources: RessourcePlanning[];
    /** Planification : clé « {ressource}_{available|activity|localisation}_{AAAA-MM-JJ}_{AM|PM} » → valeur */
    planning: Record<string, string>;
    datesParticulieres: DateParticuliere[];
    conges: Partial<Record<ZoneConges, PeriodeConges[]>>;
    /** Historique des taux de MAD par ressource (période d'accès à la planification) */
    historiqueMad: Record<number, { date_debut: string; date_fin: string | null }[] | undefined>;
    /** Mois affiché par la planification (0 à 11) */
    annee: number;
    mois: number;
    /** Ressources du filtre de la planification (identifiants ; « » : toutes) */
    filtre: string[];
}

/** Affectation modifiée dans la grille, en attente d'invitation Outlook (trackAssignment de l'ancien code) */
export interface AffectationEnAttente {
    date: string;
    period: 'AM' | 'PM';
    /** Libellé avec émoji (ex. « 📞 SAMU (Déploiement) ») */
    activity: string;
    activityCode: string;
    location: string;
    actionType?: 'new' | 'modified' | 'deleted';
    oldActivity?: string | null;
    oldActivityCode?: string | null;
    oldLocation?: string | null;
}

/** Affectations en attente d'un expert (ressource) */
export interface ExpertEnAttente {
    expertId: number;
    expertEmail: string | null;
    expertNom: string;
    expertPrenom: string;
    resourceNom: string;
    resourcePrenom: string;
    assignments: AffectationEnAttente[];
}

/**
 * Affectations en attente d'invitation, tenues par l'ancien code (grille) : identifiant de la ressource → affectations ;
 * remplacées par un magasin quand la grille sera migrée (lot 4.5)
 */
export interface EtatInvitations {
    /** Session de modification (regroupement des notifications côté serveur) */
    sessionId: string | null;
    experts: Record<string, ExpertEnAttente>;
}

/** Icônes de l'ancien code converties en image d'arrière-plan CSS (url("data:…")) */
export interface IconesImages {
    urlForEmoji: (emoji: string, couleur?: string) => string | null;
    urlForSvg: (traces: string, couleur?: string) => string;
    urlForName: (nom: string, couleur?: string) => string | null;
}

/** Fonctions de l'accueil accessibles à l'utilisateur connecté (profil, configuration des onglets, applications) */
export interface AccesAccueil {
    planning: boolean;
    /** Affecter des experts à une mission : tous les profils sauf l'expert */
    affecter: boolean;
    evenements: boolean;
    cra: boolean;
    affectation: boolean;
    deplacements: boolean;
    /** Ajout d'un lieu (SAMU-SAS TripAdVisor) */
    lieux: boolean;
    /** Planning des astreintes HO, proposé aux experts */
    astreintes: boolean;
    /** Compte rattaché à une ressource : il renseigne son propre planning */
    ressource: boolean;
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

/** Accès de l'utilisateur aux fonctions de l'accueil ; null hors de la page principale */
export const accesAccueil = (): AccesAccueil | null => ancienCode().accueilAcces?.() ?? null;

/** Ouvre un onglet de la Planification */
export function ouvrirOnglet(onglet: string): void {
    ancienCode().switchTab?.(onglet, null);
}

/** Ouvre une application (Aide à l'affectation, Suivi des déplacements) */
export function ouvrirApplication(application: 'affectation' | 'deplacements'): void {
    ancienCode().switchToApp?.(application);
}

/** Bandeau « Données synchronisées » (quelques secondes) */
export function afficherSynchronisation(): void {
    ancienCode().showSyncStatus?.();
}

/** Données de la planification de l'ancien code ; null hors de la page principale */
export const etatPlanning = (): EtatPlanning | null => ancienCode().etatPlanning?.() ?? null;

/** Affectations en attente d'invitation (ancien code) ; aucune hors de la page principale */
export const affectationsEnAttente = (): EtatInvitations =>
    ancienCode().affectationsEnAttente?.() ?? { sessionId: null, experts: {} };

/** Icônes en image de l'ancien code ; undefined hors de la page principale */
export const iconesImages = (): IconesImages | undefined => ancienCode().UIIconsApi;

/** CRA demandé par le lien d'une notification, retiré de l'attente ; null si aucun */
export function prendreCraDemande(): number | null {
    const id = ancienCode().craDemande;
    delete ancienCode().craDemande;
    return id ?? null;
}
