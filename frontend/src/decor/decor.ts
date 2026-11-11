// Décor de la page principale (lot 6.5, ex-scripts de public/js) : mode d'affichage, thèmes saisonniers, mise en page,
// icônes des émojis et des alertes, barre d'outils flottante.
import { installerIconesAlerte } from './alertes';
import { installerIconesEmojis } from './icones-emojis';
import { installerMiseEnPage } from './mise-en-page';
import { installerModeAffichage } from './mode-affichage';
import { installerOutilsFlottants } from './outils-flottants';
import { installerThemes } from './themes';

export function installerDecor(): void {
    installerOutilsFlottants();
    installerModeAffichage();
    installerThemes();
    installerMiseEnPage();
    // Les ⚠️ restent aux icônes d'alerte, colorées selon la gravité
    installerIconesEmojis({ garderAlerte: true });
    installerIconesAlerte();
}
