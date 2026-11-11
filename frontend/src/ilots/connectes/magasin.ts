// Utilisateurs connectés, communs à toutes les applications de la session : liste relue toutes les 30 secondes (pastilles
// des en-têtes) et bulle de la liste, ouverte sous la pastille cliquée
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiConnectes, type UtilisateurConnecte } from '@/api/connectes';

/** Relecture de la liste (ms) */
export const INTERVALLE_CONNECTES = 30000;

export const useConnectesStore = defineStore('connectes', () => {
    const liste = ref<UtilisateurConnecte[]>([]);
    /** Bulle ouverte : position (sous la pastille) et identifiant de la pastille */
    const bulle = ref<{ ancre: string; haut: number; droite: number } | null>(null);
    let boucle: ReturnType<typeof setInterval> | undefined;

    async function charger() {
        try {
            liste.value = await apiConnectes.liste();
        } catch (e) {
            console.error('Erreur chargement utilisateurs connectés:', e);
        }
    }

    function suivre() {
        arreter();
        void charger();
        boucle = setInterval(() => void charger(), INTERVALLE_CONNECTES);
    }

    function arreter() {
        clearInterval(boucle);
        boucle = undefined;
    }

    /** Bulle ouverte sous la pastille (liste relue), ou fermée si elle l'était sous la même pastille */
    async function basculerBulle(pastille: HTMLElement) {
        if (bulle.value?.ancre === pastille.id) {
            bulle.value = null;
            return;
        }
        await charger();
        const r = pastille.getBoundingClientRect();
        bulle.value = { ancre: pastille.id, haut: r.bottom + 6, droite: Math.max(8, window.innerWidth - r.right) };
    }

    const fermerBulle = () => (bulle.value = null);

    return { liste, bulle, charger, suivre, arreter, basculerBulle, fermerBulle };
});

/** Couleur d'un profil (avatars, badges) */
export const COULEURS_PROFILS: Record<string, string> = {
    admin: '#e74c3c',
    user: '#3498db',
    expert: '#27ae60',
    rh: '#8e44ad'
};

/** Libellé court et icône d'un profil (badges de la liste et des conversations) */
export const PROFILS: Record<string, { libelle: string; icone: string }> = {
    admin: { libelle: 'Admin', icone: 'crown' },
    user: { libelle: 'Utilisateur', icone: 'user' },
    expert: { libelle: 'Expert', icone: 'briefcase' },
    rh: { libelle: 'RH', icone: 'users' }
};

export const nomConnecte = (u: Pick<UtilisateurConnecte, 'prenom' | 'nom' | 'username'>) =>
    `${u.prenom || ''} ${u.nom || ''}`.trim() || u.username;

/** Initiales d'un avatar : trigramme, à défaut initiales du prénom et du nom */
export const initialesConnecte = (u: Pick<UtilisateurConnecte, 'trigramme' | 'prenom' | 'nom'>) =>
    u.trigramme || `${u.prenom?.charAt(0) || ''}${u.nom?.charAt(0) || ''}`;
