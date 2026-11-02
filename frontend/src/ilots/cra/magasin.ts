// Onglet CRA : cartes de l'utilisateur, CRA demandé à l'ouverture du détail, fenêtres ouvertes (visualisation,
// diffusion, statut de diffusion), version des listes d'administration et messages des derniers traitements
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiCra, type Cra } from '@/api/cra';

export interface MessageCra {
    type: 'error' | 'success' | 'info';
    texte: string;
}

export const useCraStore = defineStore('cra', () => {
    const cras = ref<Cra[]>([]);
    const charge = ref(false);
    /** Détail demandé (carte, lien d'une notification) : identifiant et numéro de demande (réouverture du même CRA) */
    const demande = ref<{ id: number; n: number } | null>(null);
    /** Résultat du dernier traitement du détail, affiché au-dessus de lui (remplace les alert() de l'ancien écran) */
    const message = ref<MessageCra | null>(null);
    /** Résultat du dernier traitement des listes d'administration ou de la vue RH, affiché sous le titre de l'onglet */
    const messageAdmin = ref<MessageCra | null>(null);
    /** Listes d'administration à relire (CRA signés, en attente de diffusion, archivés, supprimés) */
    const version = ref(0);
    /** CRA visualisé (fenêtre de consultation), en cours de diffusion, statut de diffusion affiché près de son bouton */
    const visualise = ref<number | null>(null);
    const diffuse = ref<number | null>(null);
    const statut = ref<{ id: number; bouton: HTMLElement } | null>(null);

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

    /** Cartes et listes d'administration relues après un traitement */
    async function rafraichir() {
        version.value++;
        await charger();
    }

    return {
        cras,
        charge,
        demande,
        message,
        messageAdmin,
        version,
        visualise,
        diffuse,
        statut,
        charger,
        ouvrir,
        rafraichir
    };
});
