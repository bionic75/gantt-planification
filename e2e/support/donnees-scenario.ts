// Données partagées entre les étapes d'un scénario (monde.d) : champs écrits par une étape et lus par une suivante,
// tous facultatifs. Une faute de frappe dans un nom de champ est une erreur de compilation. Types tirés des valeurs
// affectées ; « any » pour les réponses de l'API et les objets libres. En commentaire : fichiers d'étapes qui
// l'utilisent.
import type { SpawnSyncReturns } from 'child_process';
import type { APIRequestContext, Page } from '@playwright/test';
import type { ResultatConnexion } from './connexion.ts';

/** Ressource de test créée par l'API (champs de la création, et ceux relus ensuite) */
export interface RessourceTest {
    id: number;
    nom: string;
    prenom: string;
    trigramme: string;
    [champ: string]: any;
}

export interface DonneesScenario {
    /** Ressources de test à supprimer en fin de scénario, planifications d'expert nettoyées (donnees.ts) */
    [nettoyage: `nettoyage_${string}`]: boolean | undefined;
    [planif: `planif_${string}`]: boolean | undefined;
    /** Lieux et événements de test créés pour le mobile (mobile.ts) */
    [mobile: `mobile_${string}`]: any;
    /** Valeurs avant le scénario des automatisations n°1 à 6 (admin-automatisations.ts), rétablies à la fin */
    [automatisation: `automatisation${number}`]: any;
    /** Nombre d'envois de l'historique avant le scénario (admin-automatisations.ts) */
    [envois: `envoisAvant${number}`]: any;
    /** acces.ts */
    accesOngletsInitial?: any;
    /** securite.ts */
    accueil?: { status: number; headers: { [key: string]: string }; corps: string };
    /** administration.ts */
    analyseDump?: any;
    /** deplacements.ts, deplacements-cadre.ts */
    annee?: number;
    /** affectation.ts */
    apercu?: any;
    /** affectation.ts */
    apercu2?: any;
    /** acces.ts */
    appels?: any[];
    /** admin-acces.ts */
    applicationRecherchee?: any;
    /** acces.ts */
    applications?: string[];
    /** authentification.ts */
    apresDeconnexion?: string[];
    /** affectation-asana.ts */
    asanaAppels?: any[];
    /** affectation.ts */
    asanaConfig?: any;
    /** affectation-asana.ts */
    asanaRoute?: boolean;
    /** affectation-asana.ts */
    asanaSim?: any;
    /** affectation-ateliers.ts */
    atelier1Avant?: string | undefined;
    /** administration.ts */
    automatisation?: any;
    /** astreintes-hno.ts */
    autre?: any;
    /** cra.ts */
    autreMois?: any;
    /** deplacements.ts, deplacements-cadre.ts */
    bdc?: any;
    /** deplacements-cadre.ts */
    bdc2?: any;
    /** deplacements-cadre.ts */
    bonEcran?: string;
    /** admin-securite.ts */
    cleApi?: string;
    /** cra.ts */
    collecte?: any;
    /** tripadvisor.ts */
    commentaireIhm?: any;
    /** tripadvisor.ts */
    commentaireIhmPublieA?: number;
    /** tripadvisor.ts */
    commentaires?: Record<string, any>;
    /** admin-acces.ts, admin-utilisateurs.ts, authentification.ts */
    compte?: any;
    /** connectes.ts */
    compteCourant?: any;
    /** entete.ts, profil.ts */
    compteEntete?: {
        username: string;
        password: string;
        nom: string;
        prenom: string;
        email: string;
        is_user: number;
        id: number;
    };
    /** mire.ts */
    compteMire?: {
        username: string;
        password: string;
        nom: string;
        prenom: string;
        email: string;
        is_user: number;
        id: number;
    };
    /** affectation.ts */
    config?: any;
    /** admin-localisations.ts, admin-securite.ts, admin-utilisateurs.ts */
    confirmation?: string;
    /** planification-exports.ts */
    confirmationEnvoi?: string;
    /** authentification.ts */
    connexion?: ResultatConnexion;
    /** mobile.ts */
    connexionMobile?: { etat: 'planning' | 'acces-reserve' | 'erreur'; message?: string | undefined };
    /** connectes.ts */
    conversation?: any;
    /** cra.ts */
    craDiffuse?: any;
    /** cra.ts, cra-administration.ts, cra-ecran.ts */
    craId?: number;
    /** tripadvisor.ts */
    createurLieu?: any;
    /** affectation-asana.ts, affectation.ts */
    csv?: string;
    /** affectation-asana.ts, affectation.ts */
    csvNo?: any;
    /** securite.ts */
    debutAction?: number;
    /** authentification.ts */
    deconnexion?: Promise<void>;
    /** donnees.ts, affectation-administration.ts, affectation-asana.ts, affectation-planning.ts, affectation.ts, evenements.ts, planification.ts */
    deploiement?: any;
    /** affectation.ts */
    deploiementAsana?: any;
    /** planification-grille.ts */
    derniereAnnee?: number;
    /** cra.ts */
    destinataires?: any;
    /** affectation.ts */
    disponibilite?: any;
    /** cra-ecran.ts */
    documentCra?: Page;
    /** admin-parametrages.ts, administration.ts */
    dump?: { nom: string; fichier?: string; contenu?: Buffer };
    /** mire.ts */
    envoiReinit?: any;
    /** connectes.ts */
    envois?: any[];
    /** planification-exports.ts */
    envoisCalendrier?: any[];
    /** mire.ts */
    envoisCode?: number;
    /** admin-automatisations.ts */
    envoisHistorique?: any;
    /** admin-jours-speciaux.ts, administration.ts, affectation.ts, evenements-ecran.ts, evenements.ts, planification-consultation.ts */
    evenement?: any;
    /** affectation.ts */
    evenementAutre?: number;
    /** planification.ts */
    evenementDuJour?: boolean;
    /** affectation.ts */
    evenementHorsPlanning?: number;
    /** mobile-planning.ts */
    evenementMobile?: string;
    /** reporting-suivis.ts */
    evenementReporting?: { id: number; label: string };
    /** affectation-administration.ts, affectation-evenements.ts */
    evenements?: any[];
    /** evenements-ecran.ts */
    evenementSansParticipant?: any;
    /** affectation.ts, evenements.ts */
    evenementsLies?: any[];
    /** affectation.ts, evenements.ts */
    evenementVisite?: any;
    /** evenements.ts */
    evt?: any;
    /** carte-evenements.ts */
    evtExpert?: string;
    /** planification.ts */
    expert?: any;
    /** carte-evenements.ts */
    expertCarte?: any;
    /** planification-saisie.ts */
    expertDemande?: any;
    /** affectation-planning.ts */
    exportPdf?: string;
    /** carte-evenements.ts */
    externeCarte?: { nom: string; prenom: string; email: string };
    /** admin-parametrages.ts */
    faviconChoisi?: string;
    /** admin-parametrages.ts */
    faviconInitial?: any;
    /** cloture.ts, entete.ts */
    fenetreAide?: Page;
    /** admin-automatisations.ts */
    fenetreTest1?: boolean;
    /** cloture.ts */
    fermetureAide?: Promise<Page>;
    /** planification-exports.ts */
    fichier?: { nom: string; contenu: string };
    /** admin-jours-speciaux.ts */
    fichierConges?: string;
    /** admin-jours-speciaux.ts */
    fichierDates?: string;
    /** admin-automatisations.ts */
    historiqueDe?: any;
    /** affectation.ts */
    importe?: any;
    /** planification-consultation.ts, planification-exports.ts */
    impressions?: any;
    /** evenements-ecran.ts */
    inviteExterne?: any;
    /** mire.ts */
    jetonReinit?: string;
    /** planification-menu.ts */
    jourMenu?: { annee: number; mois0: number; jour: number; date: string };
    /** cra.ts, securite.ts */
    journal?: any;
    /** affectation-asana.ts */
    lecturesProjets?: any;
    /** admin-securite.ts */
    libelleCle?: string;
    /** admin-jours-speciaux.ts, evenements.ts */
    libelleEvenement?: any;
    /** evenements-ecran.ts */
    libelleIhm?: string;
    /** mobile.ts */
    libellePeriode?: string | null;
    /** evenements-ecran.ts */
    libelleSupprime?: string;
    /** admin-jours-speciaux.ts */
    libelleType?: string;
    /** donnees.ts, mobile.ts, tripadvisor.ts */
    lieu?: any;
    /** planification.ts */
    ligneMasquee?: { id: string | null; nom: string | null };
    /** cra.ts */
    liste?: any;
    /** affectation.ts */
    listeAffectation?: any;
    /** administration.ts */
    loc?: any;
    /** donnees.ts, admin-localisations.ts, affectation-administration.ts, affectation-asana.ts, affectation-ateliers.ts, affectation-evenements.ts, affectation-planning.ts, affectation.ts, evenements-ecran.ts, evenements.ts, statuts-deploiements.ts */
    localisation?: { id: number; court: string; long: string };
    /** admin-localisations.ts */
    localisation2?: { id: number; court: string; long: string };
    /** evenements-ecran.ts */
    localisationIhm?: string;
    /** carte-evenements.ts */
    locCarte?: { id: number; court: string; long: string };
    /** Nom du dernier fichier téléchargé (carte : export GIF) */
    telechargement?: string;
    /** admin-securite.ts */
    mfaInitiale?: any;
    /** cra.ts, cra-administration.ts, cra-ecran.ts */
    mois?: { mois: number; annee: number };
    /** affectation-administration.ts */
    nomExportRetabli?: boolean;
    /** admin-utilisateurs.ts */
    nouveau?: { login: string; prenom: string; email: string; password?: string };
    /** admin-jours-speciaux.ts */
    nouveauLibelle?: string;
    /** profil.ts */
    nouveauMotDePasse?: any;
    /** admin-localisations.ts */
    nouvelleCsv?: string;
    /** planification-saisie.ts */
    objetAstreinte?: string;
    /** planification-menu.ts */
    objetMenu?: string;
    /** profil.ts */
    ongletDefaut?: { cle: string | null; libelle: string } | { cle: string; libelle: string };
    /** admin-acces.ts */
    ongletsInitiaux?: any;
    /** securite.ts */
    ongletsOuverts?: (string | undefined)[];
    /** admin-parametrages.ts */
    parametres?: any;
    /** securite.ts */
    parite?: SpawnSyncReturns<string>;
    /** cra-administration.ts */
    periode?: { mois: number; annee: number };
    /** planification-menu.ts */
    periodeMenu?: string;
    /** affectation-administration.ts, affectation-evenements.ts */
    prefixeEvenements?: string;
    /** affectation.ts */
    projetsAsana?: any;
    /** affectation.ts */
    rafraichissement?: any;
    /** connectes.ts */
    refusEnvoi?: any;
    /** admin-securite.ts */
    reinitialisationsMfa?: number;
    /** administration.ts, affectation-planning.ts, affectation.ts, astreintes-hno.ts, mobile-planning.ts, planification.ts, planification-consultation.ts, planification-exports.ts, planification-grille.ts, planification-menu.ts, ressources-ecran.ts, ressources.ts, securite.ts */
    ressource?: RessourceTest;
    /** planification-exports.ts */
    ressourceCalendrier?: any;
    /** affectation.ts, astreintes-hno.ts */
    ressources?: RessourceTest[];
    /** reporting-suivis.ts */
    ressourcesReporting?: Record<string, any>;
    /** authentification.ts */
    resteAvantAction?: number;
    /** admin-jours-speciaux.ts */
    resumeConges?: string;
    /** affectation.ts */
    rubriques?: any;
    /** ressources-ecran.ts, ressources.ts */
    saisie?: { nom: string; trigramme: string };
    /** planification.ts */
    saisiePlanning?: any;
    /** cra-ecran.ts */
    samu?: string;
    /** profil.ts */
    samuExpert?: { resourceId: number };
    /** planification-menu.ts */
    samuMenu?: string | null;
    /** ressources-ecran.ts */
    samus?: string[];
    /** donnees.ts, mobile.ts, tripadvisor.ts */
    samuSas?: { id: number; court: string; long: string };
    /** planification.ts */
    secondeLigne?: string | null;
    /** reporting.ts */
    sensTri?: string | null;
    /** admin-utilisateurs.ts */
    sessionCompte?: APIRequestContext;
    /** securite.ts */
    setCookie?: string[];
    /** admin-securite.ts */
    smtpInitial?: any;
    /** authentification.ts */
    statutAction?: number;
    /** statuts-deploiements.ts */
    statutDeploiement?: string;
    /** tripadvisor.ts */
    suggestions?: any;
    /** affectation.ts */
    tachesAsana?: any;
    /** entete.ts */
    texteConfirmation?: string;
    /** admin-jours-speciaux.ts, evenements-ecran.ts, evenements.ts */
    type?: any;
    /** carte-evenements.ts */
    typeCarte?: {
        label_long: string;
        label_short: string;
        icon: string;
        bg_color: string;
        text_color: string;
        border_color: string;
        id: number;
    };
    /** affectation-ateliers.ts */
    urlSondage?: any;
    /** admin-securite.ts */
    validiteChoisie?: number;
    /** administration.ts */
    version?: string;
    /** securite.ts */
    versionNode?: string;
    /** profil.ts */
    versionSimulee?: any;
    /** deplacements.ts */
    villeBase?: string;
}
