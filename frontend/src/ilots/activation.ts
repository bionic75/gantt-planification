// Réouverture d'un onglet ou d'une application (compteur fourni par son enveloppe, cadre/vues.ts) ou d'un onglet
// interne d'une application (ilots/applications/ZoneOnglet.vue)
import { inject, watch, type InjectionKey, type Ref } from 'vue';

export const CLE_ACTIVATIONS: InjectionKey<Ref<number>> = Symbol('activations');

/** Action à chaque réouverture (pas au premier affichage) */
export function surReouverture(action: () => void): void {
    const activations = inject(CLE_ACTIVATIONS, null);
    if (activations) watch(activations, action);
}
