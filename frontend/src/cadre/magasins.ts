// Magasins Pinia vidés à la fin de la session : aucune donnée d'un utilisateur visible par le suivant. Le magasin de la
// mire (connexion) est gardé : elle reste affichée d'une session à l'autre.
import type { Pinia, StoreGeneric } from 'pinia';

const GARDES = new Set(['connexion']);

export function viderMagasins(pinia: Pinia): void {
    const magasins = (pinia as Pinia & { _s: Map<string, StoreGeneric> })._s;
    for (const [id, magasin] of [...magasins]) {
        if (GARDES.has(id)) continue;
        magasin.$dispose();
        // État retiré : recréé vide au prochain usage du magasin
        delete pinia.state.value[id];
    }
}
