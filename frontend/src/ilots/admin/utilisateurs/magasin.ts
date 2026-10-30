// Gestion des utilisateurs : comptes, ressources proposées, message d'état, actions
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiUtilisateurs, type RessourceCompte, type Utilisateur } from '@/api/utilisateurs';
import { emettre } from '@/liaison';

/** Message de la section (remplace les alert() de l'ancien écran) */
export interface Message {
    type: 'success' | 'warning' | 'error' | 'info';
    texte: string;
}

export const useUtilisateursStore = defineStore('admin-utilisateurs', () => {
    const utilisateurs = ref<Utilisateur[]>([]);
    const ressources = ref<RessourceCompte[]>([]);
    const charge = ref(false);
    const message = ref<Message | null>(null);

    async function charger() {
        try {
            utilisateurs.value = await apiUtilisateurs.liste();
            charge.value = true;
        } catch {
            /* liste inchangée */
        }
    }

    async function chargerRessources() {
        try {
            ressources.value = await apiUtilisateurs.ressources();
        } catch {
            /* liste inchangée */
        }
    }

    /**
     * Comptes modifiés : liste relue ; l'ancien code recharge ses utilisateurs et ses ressources (automatisations,
     * notifications, planning…). Modification journalisée comme dans l'ancien écran si demandé.
     */
    async function apresModification(journaliser = false) {
        await charger();
        emettre('utilisateurs-modifies');
        if (journaliser) void apiUtilisateurs.journaliser('Modification du planning').catch(() => {});
    }

    const signaler = (type: Message['type'], texte: string) => (message.value = { type, texte });

    return { utilisateurs, ressources, charge, message, charger, chargerRessources, apresModification, signaler };
});
