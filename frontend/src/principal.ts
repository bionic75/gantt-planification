// Point d'entrée de la page principale (index.html, balise injectée par le serveur, backend/src/lib/frontend.js) : application
// Vue racine (mire, cadre, onglets et applications par adresse), routeur, session (lot 6.4b), décor de la page (lot 6.5).
// Feuilles de style globales : point d'entrée CSS à part (styles/globales.css), injecté avant celles des composants
import '@/styles/theme.css';
import '@/cadre/cadre.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import ApplicationPrincipale from '@/cadre/ApplicationPrincipale.vue';
import { viderMagasins } from '@/cadre/magasins';
import { creerRouteur } from '@/cadre/routes';
import { retirerJetonDeLAdresse } from '@/connexion/jeton';
import { installerDecor } from '@/decor/decor';
import { ecouter, emettre } from '@/evenements';
import { installerNavigation } from '@/ilots/navigation/navigation';
import { afficherSynchronisation } from '@/outils/synchronisation';
import { installerSurveillanceSession } from '@/session/session';

installerSurveillanceSession();
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

createApp(ApplicationPrincipale).use(pinia).use(routeur).mount('#app');
// Mode d'affichage, thèmes, mise en page, icônes des émojis et des alertes, barre d'outils flottante
installerDecor();
