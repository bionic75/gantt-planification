// Réouverture de l'onglet d'un îlot (compteur fourni par le montage, ilots/montage.ts)
import { inject, watch, type InjectionKey, type Ref } from 'vue';

export const CLE_ACTIVATIONS: InjectionKey<Ref<number>> = Symbol('activations');

/** Action à chaque réouverture de l'onglet de l'îlot (pas au premier affichage) */
export function surReouverture(action: () => void): void {
    const activations = inject(CLE_ACTIVATIONS, null);
    if (activations) watch(activations, action);
}
