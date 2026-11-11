// Adresses de la page principale (Vue Router, historique du navigateur) : un onglet de la Planification ou une autre
// application par adresse (vue nommée « application », hors du conteneur de la Planification) ; racine et adresse
// inconnue renvoyées vers l'onglet d'arrivée (ilots/navigation).
import { createRouter, createWebHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';
import { CHEMINS_APPLICATIONS, CHEMINS_ONGLETS } from '@/ilots/navigation/navigation';
import { vueApplication, vueOnglet, VueVide } from './vues';

export const ROUTES: RouteRecordRaw[] = [
    // Racine : onglet d'arrivée ; ancien lien d'une notification (« /?tab=cra&cra_id=12 ») : le CRA
    { path: '/', name: 'racine', component: VueVide },
    {
        path: CHEMINS_ONGLETS.accueil,
        component: vueOnglet('accueil', () => import('@/ilots/accueil/OngletAccueil.vue')),
        meta: { onglet: 'accueil' }
    },
    {
        path: CHEMINS_ONGLETS.resources,
        component: vueOnglet('resources', () => import('@/ilots/ressources/OngletRessources.vue')),
        meta: { onglet: 'resources' }
    },
    {
        path: CHEMINS_ONGLETS.evenements,
        component: vueOnglet('evenements', () => import('@/ilots/evenements/OngletEvenements.vue')),
        meta: { onglet: 'evenements' }
    },
    {
        path: CHEMINS_ONGLETS.planning,
        component: vueOnglet('planning', () => import('@/ilots/planification/OngletPlanification.vue')),
        meta: { onglet: 'planning' }
    },
    {
        path: CHEMINS_ONGLETS.tripadvisor,
        component: vueOnglet('tripadvisor', () => import('@/ilots/tripadvisor/TripAdvisor.vue')),
        meta: { onglet: 'tripadvisor' }
    },
    // Onglet CRA ; /cra/12 : CRA ouvert (lien d'une notification)
    {
        path: `${CHEMINS_ONGLETS.cra}/:id(\\d+)?`,
        component: vueOnglet('cra', () => import('@/ilots/cra/OngletCra.vue')),
        meta: { onglet: 'cra' }
    },
    {
        path: CHEMINS_ONGLETS.reporting,
        component: vueOnglet('reporting', () => import('@/ilots/reporting/OngletReporting.vue')),
        meta: { onglet: 'reporting' }
    },
    {
        path: CHEMINS_ONGLETS.admin,
        component: vueOnglet('admin', () => import('./OngletAdministration.vue')),
        meta: { onglet: 'admin' }
    },
    {
        path: CHEMINS_ONGLETS.astreintesGestion,
        component: vueOnglet('astreintesGestion', () => import('@/ilots/astreintes/OngletAstreintes.vue')),
        meta: { onglet: 'astreintesGestion' }
    },
    {
        path: CHEMINS_APPLICATIONS.deplacements,
        components: {
            application: vueApplication(
                'deplacementsContainer',
                () => import('@/ilots/deplacements/ApplicationDeplacements.vue')
            )
        },
        meta: { application: 'deplacements' }
    },
    {
        path: CHEMINS_APPLICATIONS.analyse,
        components: {
            application: vueApplication(
                'analyseContainer',
                () => import('@/ilots/analyse/ApplicationAnalyse.vue'),
                'gp-application-analyse'
            )
        },
        meta: { application: 'analyse' }
    },
    {
        path: CHEMINS_APPLICATIONS.affectation,
        components: {
            application: vueApplication(
                'affectationContainer',
                () => import('@/ilots/affectation/ApplicationAffectation.vue')
            )
        },
        meta: { application: 'affectation' }
    },
    { path: '/:chemin(.*)*', name: 'inconnue', component: VueVide }
];

/** Défilement de la page inchangé d'un onglet à l'autre, comme avant les adresses */
export const creerRouteur = (historique: RouterHistory = createWebHistory()) =>
    createRouter({ history: historique, routes: ROUTES });
