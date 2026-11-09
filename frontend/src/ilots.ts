// Point d'entrée des îlots Vue, chargé par index.html (balise injectée par le serveur, src/lib/frontend.js)
import '@/styles/theme.css';
import { surveillerFenetres, type RegistreFenetres } from '@/ilots/fenetres';
import { piniaDesIlots, surveillerIlots, type RegistreIlots } from '@/ilots/montage';
import { installerLiaisonAncienCode } from '@/liaison';

/**
 * Îlots migrés : identifiant du conteneur de l'onglet → composant racine (chargé à la première ouverture).
 * Sous-îlot (section d'un onglet encore servi par l'ancien code) : conteneur de la section → composant et onglet.
 * Un îlot s'ajoute ici quand son onglet est migré (docs/migration-vue.md).
 */
const ILOTS: RegistreIlots = {
    accueil: () => import('@/ilots/accueil/OngletAccueil.vue'),
    resources: () => import('@/ilots/ressources/OngletRessources.vue'),
    tripadvisor: () => import('@/ilots/tripadvisor/TripAdvisor.vue'),
    reporting: () => import('@/ilots/reporting/OngletReporting.vue'),
    evenements: () => import('@/ilots/evenements/OngletEvenements.vue'),
    adminLocalisations: {
        chargeur: () => import('@/ilots/admin/localisations/SectionLocalisations.vue'),
        onglet: 'admin'
    },
    adminSmtp: { chargeur: () => import('@/ilots/admin/securite/SectionSmtp.vue'), onglet: 'admin' },
    adminMfa: { chargeur: () => import('@/ilots/admin/securite/SectionMfa.vue'), onglet: 'admin' },
    adminApi: { chargeur: () => import('@/ilots/admin/securite/SectionApi.vue'), onglet: 'admin' },
    adminApplications: { chargeur: () => import('@/ilots/admin/acces/SectionApplications.vue'), onglet: 'admin' },
    adminOnglets: { chargeur: () => import('@/ilots/admin/acces/SectionOnglets.vue'), onglet: 'admin' },
    adminParametrages: {
        chargeur: () => import('@/ilots/admin/parametrages/SectionParametrages.vue'),
        onglet: 'admin'
    },
    adminUtilisateurs: {
        chargeur: () => import('@/ilots/admin/utilisateurs/SectionUtilisateurs.vue'),
        onglet: 'admin'
    },
    adminJoursSpeciaux: {
        chargeur: () => import('@/ilots/admin/jours-speciaux/JoursSpeciaux.vue'),
        onglet: 'admin'
    },
    adminAutomatisations: {
        chargeur: () => import('@/ilots/admin/automatisations/SectionAutomatisations.vue'),
        onglet: 'admin'
    },
    cra: () => import('@/ilots/cra/OngletCra.vue'),
    astreintesGestion: () => import('@/ilots/astreintes/OngletAstreintes.vue'),
    planning: () => import('@/ilots/planification/OngletPlanification.vue'),
    // Application « Suivi des déplacements » : montée quand l'ancien code l'affiche (menu Applications)
    deplacementsContainer: {
        chargeur: () => import('@/ilots/deplacements/ApplicationDeplacements.vue'),
        application: true
    },
    // Application « Analyse de fichiers » : montée quand l'ancien code l'affiche (menu Applications)
    analyseContainer: {
        chargeur: () => import('@/ilots/analyse/ApplicationAnalyse.vue'),
        application: true
    },
    // Aide à l'affectation : onglets de l'application, encore construite par l'ancien code
    affectationPlanningTab: {
        chargeur: () => import('@/ilots/affectation/planning/OngletPlanningAffectation.vue'),
        application: 'affectationContainer'
    },
    affectationEventsTab: {
        chargeur: () => import('@/ilots/affectation/OngletEvenementsAffectation.vue'),
        application: 'affectationContainer'
    },
    affectationAdminTab: {
        chargeur: () => import('@/ilots/affectation/administration/OngletAdministrationAffectation.vue'),
        application: 'affectationContainer'
    }
};

/** Fenêtres migrées ouvertes par des boutons de l'ancien code (ilots/fenetres.ts) : nom → composant racine */
const FENETRES: RegistreFenetres = {
    'calendrier-mensuel': () => import('@/ilots/consultation/CalendrierMensuel.vue'),
    'calendrier-evenements': () => import('@/ilots/consultation/CalendrierEvenements.vue'),
    'recherche-avancee': () => import('@/ilots/consultation/RechercheAvancee.vue'),
    'astreintes-hno': () => import('@/ilots/saisie/FenetreAstreintes.vue'),
    'demande-affectation': () => import('@/ilots/saisie/FenetreDemande.vue'),
    invitations: () => import('@/ilots/saisie/FenetreInvitations.vue'),
    'nouvelles-affectations': () => import('@/ilots/saisie/FenetreNouvellesAffectations.vue'),
    // Fenêtres Asana de l'aide à l'affectation (planning et administration)
    asana: () => import('@/ilots/affectation/asana/FenetresAsana.vue')
};

installerLiaisonAncienCode();
surveillerIlots(ILOTS);
// Fenêtres et onglets partagent le magasin de la session (planification : données de la grille)
surveillerFenetres(FENETRES, piniaDesIlots);
