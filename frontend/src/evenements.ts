// Bus d'événements de l'interface : événements du navigateur préfixés « gp: », émis et écoutés par les composants qui
// ne partagent pas de magasin (cadre, onglets, applications, fenêtres) et par les derniers scripts de public/js
// (décor : thèmes, mode sombre, mise en page). Remplace la liaison avec l'ancien code (lot 6.4b).

import type { UtilisateurConnecte } from '@/api/connexion';

/** Événements échangés et leur contenu */
export interface EvenementsLiaison {
    /** Déconnexion ou session perdue : composants de la session démontés, magasins vidés (session/session.ts) */
    'session-terminee': undefined;
    /** Session refusée par le serveur lors d'un appel (401) : retour sur la mire avec le message (session/session.ts) */
    'session-perdue': { message?: string };
    /**
     * Session ouverte par la mire (connexion) ou reprise au chargement de la page (reprise) : l'application s'ouvre
     * (frontend/src/connexion/MireBureau.vue, session/session.ts)
     */
    'session-ouverte': { utilisateur: UtilisateurConnecte; reprise: boolean };
    /** Aucune session au chargement de la page : l'application reste masquée derrière la mire */
    'session-absente': undefined;
    /**
     * Mire réaffichée (déconnexion, session perdue, réveil du poste) : formulaire vidé, message éventuel affiché
     */
    'mire-affichee': { message?: string } | undefined;
    /** Événements créés, modifiés ou supprimés : les onglets relisent les leurs */
    'evenements-modifies': undefined;
    /** Planification modifiée (inscription d'un expert à un événement) : la grille la relit */
    'planning-modifie': undefined;
    /** Localisations créées ou modifiées, ou section d'administration ouverte : les listes de localisations sont relues */
    'localisations-modifiees': undefined;
    /** Types d'événements modifiés dans l'administration : les onglets relisent types et événements */
    'types-evenements-modifies': undefined;
    /** Accès aux applications modifiés : la session est relue (menu Applications) */
    'applications-modifiees': undefined;
    /** Comptes utilisateurs modifiés : ressources relues (ressources-rechargees), bandeau « Données synchronisées » */
    'utilisateurs-modifies': undefined;
    /** Accès aux onglets enregistrés : la barre d'onglets applique la configuration */
    'onglets-modifies': { config: Record<string, Record<string, boolean>> };
    /** Version de l'application enregistrée : l'en-tête la relit */
    'version-modifiee': undefined;
    /** Compteur d'inactivité enregistré : celui de la session redémarre ou s'arrête */
    'inactivite-modifiee': { active: boolean; minutes: number };
    /** Favicon enregistré : appliqué à la page */
    'favicon-modifie': { favicon: string };
    /** Fichiers de congés scolaires importés ou supprimés : la planification relit les congés */
    'conges-modifies': undefined;
    /** Fichiers de dates particulières modifiés : la planification relit les dates */
    'dates-particulieres-modifiees': undefined;
    /** Ressources créées, modifiées ou supprimées : les ressources sont relues (ressources-rechargees) */
    'ressources-modifiees': undefined;
    /** Ressources à relire (fiche enregistrée, comptes modifiés…) : les onglets relisent les leurs */
    'ressources-rechargees': undefined;
    /** CRA modifiés par l'onglet CRA (lancement, circuit, diffusion, archivage…) : la pastille de l'onglet est relue */
    'cra-modifies': undefined;
    /** Adresse d'un CRA (« /cra/12 », lien d'une notification) : l'onglet CRA ouvre le CRA demandé (ilots/navigation) */
    'cra-demande': undefined;
    /** Bouton d'un en-tête : ouverture d'une fenêtre (cadre/FenetresDemandees.vue) */
    'fenetre-demandee': { fenetre: NomFenetre };
    /** Astreintes / HNO déclarées créées, modifiées ou supprimées : la planification relit les siennes */
    'astreintes-modifiees': undefined;
    /** Nouvelles affectations lues par l'expert : la pastille est relue */
    'notifications-lues': undefined;
    /** Photo de profil enregistrée : l'en-tête relit la session */
    'photo-modifiee': undefined;
    /** Rafraîchissement de la grille (photo de profil, réveil, retour à la planification) */
    'grille-a-rafraichir': undefined;
    /** Zoom de la grille remis à 100 % (mise en page réinitialisée, public/js/layout-fix.js) */
    'zoom-grille-reinitialise': undefined;
    /**
     * Déploiements de l'aide à l'affectation modifiés (administration, Asana) : la grille et l'administration des
     * déploiements les relisent
     */
    'deploiements-modifies': undefined;
}

/** Fenêtres ouvertes par les boutons des en-têtes */
export type NomFenetre =
    | 'calendrier-mensuel'
    | 'calendrier-evenements'
    | 'recherche-avancee'
    | 'astreintes-hno'
    | 'demande-affectation'
    | 'invitations'
    | 'nouvelles-affectations'
    | 'asana'
    | 'profil';

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

/** Ressource telle que la planification la connaît */
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

/** Données de la planification (grille), lues à l'ouverture d'une fenêtre */
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

/** Affectation modifiée dans la grille, en attente d'invitation Outlook */
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

/** Affectations en attente d'invitation : identifiant de la ressource → affectations */
export interface EtatInvitations {
    /** Session de modification (regroupement des notifications côté serveur) */
    sessionId: string | null;
    experts: Record<string, ExpertEnAttente>;
}

/** Fenêtre « Mon profil » (photo, mode d'affichage, mot de passe, SAMU, onglet par défaut) */
export function ouvrirPhotoProfil(): void {
    emettre('fenetre-demandee', { fenetre: 'profil' });
}
