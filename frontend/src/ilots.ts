// Point d'entrée des îlots Vue, chargé par index.html (balise injectée par le serveur, src/lib/frontend.js)
import { surveillerIlots, type RegistreIlots } from '@/ilots/montage';
import { installerLiaisonAncienCode } from '@/liaison';

/**
 * Îlots migrés : identifiant du conteneur de l'onglet → composant racine (chargé à la première ouverture).
 * Un îlot s'ajoute ici quand son onglet est migré (docs/migration-vue.md).
 */
const ILOTS: RegistreIlots = {};

installerLiaisonAncienCode();
surveillerIlots(ILOTS);
