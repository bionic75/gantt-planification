// Enveloppes des adresses de la page : conteneur d'origine (identifiant et classes gardés pour les tests, l'aide et
// les feuilles de style) autour du composant de l'onglet ou de l'application, chargé à la première ouverture. Gardées
// en vie (KeepAlive) pendant la session : chaque réouverture est signalée aux composants (surReouverture).
/* eslint-disable vue/one-component-per-file -- fabrique d'enveloppes, une par adresse */
import {
    defineAsyncComponent,
    defineComponent,
    h,
    onActivated,
    provide,
    ref,
    type Component,
    type VNodeProps
} from 'vue';
import { CLE_ACTIVATIONS } from '@/ilots/activation';

/** Composant chargé à la demande (fichier séparé dans le build) */
export type ChargeurVue = () => Promise<{ default: Component }>;

function enveloppe(nom: string, chargeur: ChargeurVue, attributs: VNodeProps & Record<string, unknown>): Component {
    const contenu = defineAsyncComponent(() => chargeur().then(m => m.default));
    return defineComponent({
        name: nom,
        setup() {
            const activations = ref(0);
            let premiere = true;
            onActivated(() => {
                if (premiere) premiere = false;
                else activations.value++;
            });
            provide(CLE_ACTIVATIONS, activations);
            return () => h('div', attributs, [h(contenu)]);
        }
    });
}

/** Onglet de la Planification : conteneur « tab-content » d'origine (ex. #planning) */
export const vueOnglet = (id: string, chargeur: ChargeurVue): Component =>
    enveloppe(`Onglet-${id}`, chargeur, { id, class: 'tab-content active' });

/** Autre application : son conteneur d'origine (ex. #deplacementsContainer) */
export const vueApplication = (id: string, chargeur: ChargeurVue, classe = 'container'): Component =>
    enveloppe(`Application-${id}`, chargeur, { id, class: classe });

/** Adresse sans contenu (racine, adresse inconnue) : renvoyée vers l'onglet d'arrivée une fois la session ouverte */
export const VueVide = defineComponent({ name: 'VueVide', render: () => null });
