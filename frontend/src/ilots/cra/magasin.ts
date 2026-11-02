// CRA (circuit) : cartes de l'utilisateur, CRA demandé à l'ouverture du détail, message du dernier traitement.
// Partagé par les sous-îlots de l'onglet (cartes de l'expert, cartes de l'administrateur, détail).
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiCra, type Cra } from '@/api/cra';

export interface MessageCra {
    type: 'error' | 'success';
    texte: string;
}

export const useCraStore = defineStore('cra', () => {
    const cras = ref<Cra[]>([]);
    const charge = ref(false);
    /** Détail demandé (carte, lien d'une notification) : identifiant et numéro de demande (réouverture du même CRA) */
    const demande = ref<{ id: number; n: number } | null>(null);
    /** Résultat du dernier traitement, affiché au-dessus du détail (remplace les alert() de l'ancien écran) */
    const message = ref<MessageCra | null>(null);

    async function charger() {
        try {
            cras.value = await apiCra.mesCra();
            charge.value = true;
        } catch (e) {
            console.error('Erreur chargement CRA:', e);
        }
    }

    function ouvrir(id: number) {
        message.value = null;
        demande.value = { id, n: (demande.value?.n ?? 0) + 1 };
    }

    return { cras, charge, demande, message, charger, ouvrir };
});
