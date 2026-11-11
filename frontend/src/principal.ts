// Point d'entrée de la page principale (index.html, balise injectée par le serveur, src/lib/frontend.js) : application
// Vue racine (mire, cadre, onglets et applications par adresse), routeur, session (lot 6.4b, docs/migration-vue.md).
import '@/styles/theme.css';
import '@/cadre/cadre.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import ApplicationPrincipale from '@/cadre/ApplicationPrincipale.vue';
import { viderMagasins } from '@/cadre/magasins';
import { retirerJetonDeLAdresse } from '@/connexion/jeton';
import { creerRouteur } from '@/cadre/routes';
import { ecouter, emettre } from '@/evenements';
import { installerNavigation } from '@/ilots/navigation/navigation';
import { rendreColonnesRedimensionnables } from '@/outils/colonnes';
import { installerStyleImpression } from '@/outils/impression';
import { afficherSynchronisation } from '@/outils/page';
import { installerSurveillanceSession } from '@/session/session';

installerSurveillanceSession();
installerStyleImpression();
// Lien de réinitialisation du mot de passe : jeton retiré de l'adresse avant sa lecture par le routeur
retirerJetonDeLAdresse();

const pinia = createPinia();
const routeur = creerRouteur();
installerNavigation(routeur);

// Fin de la session : magasins vidés (les composants de la session sont démontés avec le cadre)
ecouter('session-terminee', () => viderMagasins(pinia));
// Ressources modifiées (onglet Ressources, comptes) : ressources relues par les onglets
ecouter('ressources-modifiees', () => emettre('ressources-rechargees'));
ecouter('utilisateurs-modifies', () => {
    emettre('ressources-rechargees');
    afficherSynchronisation();
});

// Mise en page (public/js/layout-fix.js, « Ajuster l'affichage ») : zoom de la grille et largeurs des colonnes
Object.assign(window, {
    resetZoomPlanning: () => emettre('zoom-grille-reinitialise'),
    makeColResizable: rendreColonnesRedimensionnables
});

createApp(ApplicationPrincipale).use(pinia).use(routeur).mount('#app');
