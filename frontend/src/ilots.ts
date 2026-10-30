// Point d'entrée des îlots Vue, chargé par index.html (balise injectée par le serveur, src/lib/frontend.js)
import '@/styles/theme.css';
import { surveillerIlots, type RegistreIlots } from '@/ilots/montage';
import { installerLiaisonAncienCode } from '@/liaison';

/**
 * Îlots migrés : identifiant du conteneur de l'onglet → composant racine (chargé à la première ouverture).
 * Sous-îlot (section d'un onglet encore servi par l'ancien code) : conteneur de la section → composant et onglet.
 * Un îlot s'ajoute ici quand son onglet est migré (docs/migration-vue.md).
 */
const ILOTS: RegistreIlots = {
    tripadvisor: () => import('@/ilots/tripadvisor/TripAdvisor.vue'),
    reporting: () => import('@/ilots/reporting/OngletReporting.vue'),
    evenements: () => import('@/ilots/evenements/OngletEvenements.vue'),
    adminLocalisations: {
        chargeur: () => import('@/ilots/admin/localisations/SectionLocalisations.vue'),
        onglet: 'admin'
    }
};

installerLiaisonAncienCode();
surveillerIlots(ILOTS);
