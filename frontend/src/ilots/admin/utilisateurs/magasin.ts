// Gestion des utilisateurs : comptes, ressources proposées, message d'état, actions
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiUtilisateurs, type RessourceCompte, type Utilisateur } from '@/api/utilisateurs';
import type { ColonneTri } from './calculs';
import { emettre } from '@/evenements';

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
    /** Tri de la liste : conservé tant qu'on ne trie pas une autre colonne (liste relue, écran quitté puis rouvert) */
    const tri = ref<ColonneTri | null>(null);
    const croissant = ref<Partial<Record<ColonneTri, boolean>>>({});

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
     * Comptes modifiés : liste relue ; ressources relues par les autres écrans
     * (gp:utilisateurs-modifies). Modification journalisée comme dans l'ancien écran si demandé.
     */
    async function apresModification(journaliser = false) {
        await charger();
        emettre('utilisateurs-modifies');
        if (journaliser) void apiUtilisateurs.journaliser('Modification du planning').catch(() => {});
    }

    const signaler = (type: Message['type'], texte: string) => (message.value = { type, texte });

    return {
        utilisateurs,
        ressources,
        charge,
        message,
        tri,
        croissant,
        charger,
        chargerRessources,
        apresModification,
        signaler
    };
});
