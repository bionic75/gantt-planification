<!-- En-tête de la Planification, zone de l'utilisateur (cadre de l'application, monté pendant la session dans
     #enteteUtilisateur) : titre, logo, zone de l'utilisateur commune aux applications (ZoneUtilisateur) avec changement
     de profil et, pour l'expert, pastille des nouvelles affectations (relue toutes les 30 secondes et après leur
     lecture ; un clic ouvre la fenêtre des nouvelles affectations). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiNotifications } from '@/api/notifications';
import ZoneUtilisateur from '@/ilots/applications/ZoneUtilisateur.vue';
import { ecouter, emettre } from '@/liaison';
import { useSessionStore } from '@/stores/session';

/** Relecture de la pastille des nouvelles affectations (ms) */
const INTERVALLE = 30000;

const magasin = useSessionStore();
const session = computed(() => magasin.session);
const nouvelles = ref(0);
let minuteur: ReturnType<typeof setInterval> | undefined;

async function lireNouvelles() {
    try {
        nouvelles.value = (await apiNotifications.nombreNouvellesAffectations()).count;
    } catch {
        /* pastille inchangée */
    }
}

async function relireSession() {
    magasin.oublier();
    await magasin.charger().catch(() => {});
}

const arrets = [
    ecouter('notifications-lues', () => void lireNouvelles()),
    // Photo de profil enregistrée : rond mis à jour
    ecouter('photo-modifiee', () => void relireSession())
];

onMounted(async () => {
    const s = await magasin.charger().catch(() => null);
    if (s?.activeProfile !== 'expert') return;
    void lireNouvelles();
    minuteur = setInterval(() => void lireNouvelles(), INTERVALLE);
});
onBeforeUnmount(() => {
    clearInterval(minuteur);
    arrets.forEach(arreter => arreter());
});
</script>

<template>
    <div v-if="session" id="userInfo" class="user-info">
        <span class="app-title-center">Planification</span>
        <svg
            class="gp-entete-planif__logo"
            xmlns="http://www.w3.org/2000/svg"
            width="38"
            height="38"
            viewBox="0 0 80 80"
            aria-label="Plateforme de Planification"
        >
            <rect width="80" height="80" rx="13" fill="#1D70B7" />
            <circle cx="40" cy="22" r="10" fill="white" />
            <path d="M22 46 Q40 34 58 46" fill="white" stroke="none" />
            <rect x="18" y="52" width="44" height="6" rx="3" fill="white" opacity="0.95" />
            <rect x="25" y="62" width="32" height="5" rx="2.5" fill="white" opacity="0.65" />
            <polygon points="65,51 71,57 65,63 59,57" fill="white" opacity="0.85" />
        </svg>
        <ZoneUtilisateur
            :session="session"
            format="nom-prenom"
            changement-profil
            :nouvelles-affectations="session.activeProfile === 'expert' ? nouvelles : null"
            @nouvelles-affectations="emettre('fenetre-demandee', { fenetre: 'nouvelles-affectations' })"
        />
    </div>
</template>

<style>
.gp-entete-planif__logo {
    flex-shrink: 0;
    border-radius: 10px;
}
</style>
