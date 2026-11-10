// Session de la page principale : vérifiée au chargement (GET /check-session), ouverte par la mire, fermée quand la
// mire est réaffichée (déconnexion, session perdue). Repris par l'en-tête et le cadre de l'application (phase 6).
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { connexionApi, type UtilisateurConnecte } from '@/api/connexion';

/** Résultat de la vérification au chargement */
export type EtatSession = 'absente' | 'mot-de-passe-a-changer' | 'ouverte';

export const useSessionStore = defineStore('session', () => {
    const utilisateur = ref<UtilisateurConnecte | null>(null);

    /** Session en cours au chargement de la page (page rechargée, nouvel onglet) */
    async function verifier(): Promise<EtatSession> {
        utilisateur.value = null;
        try {
            const s = await connexionApi.session();
            if (!s?.userId) return 'absente';
            // Session ouverte mais mot de passe à changer (page rechargée) : changement, puis nouvelle vérification
            if (s.mustChangePassword) return 'mot-de-passe-a-changer';
            utilisateur.value = { ...s, id: s.userId };
            return 'ouverte';
        } catch {
            // Refus (401, 403), réponse inattendue ou serveur injoignable : mire de connexion
            return 'absente';
        }
    }

    function ouvrir(u: UtilisateurConnecte) {
        utilisateur.value = { ...u, id: u.userId ?? u.id };
    }

    function fermer() {
        utilisateur.value = null;
    }

    return { utilisateur, verifier, ouvrir, fermer };
});
