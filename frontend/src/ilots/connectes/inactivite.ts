// Inactivité de la session, commune à toutes les applications : décompte remis à zéro à chaque clic ou frappe ; à
// l'échéance, fenêtre avec 15 secondes pour rester connecté, puis déconnexion (affectations en attente d'invitation
// journalisées). Paramétrage de l'administration (/api/settings : inactivity_enabled, inactivity_timeout). Réveil du
// poste (onglet de nouveau affiché, retour du focus, saut de l'horloge) : session vérifiée, décompte recalé, données
// relues.
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import { usePlanificationStore } from '@/ilots/planification/magasin';
import { emettre } from '@/evenements';
import { afficherMire, deconnecter as deconnecterSession } from '@/session/session';
import { useConnectesStore } from './magasin';

/** Secondes laissées pour rester connecté à l'échéance */
export const DECOMPTE_ECHEANCE = 15;
/** Écart au-delà duquel le poste est considéré sorti de veille (ms) */
const SEUIL_REVEIL = 60000;
const BATTEMENT = 30000;

/** Secondes restantes avant l'échéance, d'après la dernière activité */
export const restantes = (minutes: number, derniereActivite: number, maintenant: number) =>
    minutes * 60 - Math.floor((maintenant - derniereActivite) / 1000);

export const useInactiviteStore = defineStore('inactivite', () => {
    /** Décompte actif (paramétrage de l'administration) */
    const actif = ref(false);
    const minutes = ref(15);
    const restant = ref(0);
    /** Fenêtre de l'échéance : secondes avant la déconnexion ; null fermée */
    const echeance = ref<number | null>(null);

    let derniereActivite = Date.now();
    let tic: ReturnType<typeof setInterval> | undefined;
    let ticEcheance: ReturnType<typeof setInterval> | undefined;
    let deconnexion = false;

    const activite = () => {
        derniereActivite = Date.now();
        if (actif.value && echeance.value === null) restant.value = minutes.value * 60;
    };

    function demarrer(m: number) {
        arreter();
        minutes.value = m;
        actif.value = true;
        deconnexion = false;
        derniereActivite = Date.now();
        restant.value = m * 60;
        tic = setInterval(() => {
            restant.value = restantes(minutes.value, derniereActivite, Date.now());
            if (restant.value <= 0) ouvrirEcheance();
        }, 1000);
        document.addEventListener('mousedown', activite, true);
        document.addEventListener('keypress', activite, true);
    }

    function arreter() {
        clearInterval(tic);
        clearInterval(ticEcheance);
        tic = ticEcheance = undefined;
        actif.value = false;
        echeance.value = null;
        document.removeEventListener('mousedown', activite, true);
        document.removeEventListener('keypress', activite, true);
    }

    /** Paramétrage de l'administration relu (ouverture de la session, version enregistrée) */
    async function configurer() {
        try {
            const p = await api.get<{ inactivity_enabled?: string; inactivity_timeout?: string }>('/settings');
            if (p.inactivity_enabled === 'true') demarrer(parseInt(p.inactivity_timeout ?? '', 10) || 15);
            else arreter();
        } catch {
            /* décompte inchangé */
        }
    }

    function ouvrirEcheance() {
        if (deconnexion || echeance.value !== null) return;
        clearInterval(tic);
        tic = undefined;
        restant.value = 0;
        echeance.value = DECOMPTE_ECHEANCE;
        ticEcheance = setInterval(() => {
            if (echeance.value === null) return;
            echeance.value--;
            if (echeance.value <= 0) void deconnecter();
        }, 1000);
    }

    function resterConnecte() {
        demarrer(minutes.value);
    }

    async function deconnecter() {
        if (deconnexion) return;
        deconnexion = true;
        arreter();
        await usePlanificationStore().journaliserInvitations();
        await deconnecterSession();
    }

    // ── Réveil du poste ──────────────────────────────────────────────────────

    let dernierSignal = Date.now();
    let battement: ReturnType<typeof setInterval> | undefined;

    async function reveil() {
        const r = await fetch('/api/check-session', { credentials: 'include' }).catch(() => null);
        if (!r?.ok) {
            // Session expirée pendant la veille : retour à la mire
            arreter();
            afficherMire();
            return;
        }
        if (actif.value && echeance.value === null) {
            restant.value = restantes(minutes.value, derniereActivite, Date.now());
            if (restant.value <= 0) ouvrirEcheance();
        }
        await useConnectesStore().charger();
        emettre('grille-a-rafraichir');
    }

    const signal = (seuil: number) => {
        const maintenant = Date.now();
        if (maintenant - dernierSignal > seuil) void reveil();
        dernierSignal = maintenant;
    };
    const auRetour = () => {
        if (document.visibilityState === 'visible') signal(SEUIL_REVEIL);
    };
    const auFocus = () => signal(SEUIL_REVEIL);

    function surveillerReveil() {
        arreterReveil();
        dernierSignal = Date.now();
        document.addEventListener('visibilitychange', auRetour);
        window.addEventListener('focus', auFocus);
        battement = setInterval(() => signal(SEUIL_REVEIL * 2), BATTEMENT);
    }

    function arreterReveil() {
        document.removeEventListener('visibilitychange', auRetour);
        window.removeEventListener('focus', auFocus);
        clearInterval(battement);
        battement = undefined;
    }

    return {
        actif,
        minutes,
        restant,
        echeance,
        demarrer,
        arreter,
        configurer,
        resterConnecte,
        deconnecter,
        surveillerReveil,
        arreterReveil
    };
});
