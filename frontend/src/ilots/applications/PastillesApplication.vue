<!-- Pastilles fixes en haut à droite d'une application : utilisateurs connectés (relus toutes les 30 s ; un clic ouvre
     la bulle de discussion commune) et minuteur d'inactivité (décompte de la session, orange sous 2 min, rouge sous
     1 min). Identifiants « {prefixe}OnlineUsersContainer » et « {prefixe}TimerDisplay » (barre d'outils flottante). -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { apiConnectes, type UtilisateurConnecte } from '@/api/connectes';
import { basculerBulleConnectes, inactiviteRestante } from '@/liaison';

const props = defineProps<{ prefixe: string }>();

const MAX_AVATARS = 5;
const connectes = ref<UtilisateurConnecte[]>([]);
const secondes = ref<number | null>(null);

const nom = (u: UtilisateurConnecte) => `${u.prenom || ''} ${u.nom || ''}`.trim() || u.username;
const initiale = (u: UtilisateurConnecte) => u.trigramme || u.prenom?.charAt(0) || '?';
const deux = (n: number) => String(n).padStart(2, '0');

async function lireConnectes() {
    try {
        connectes.value = await apiConnectes.liste();
    } catch (e) {
        console.error('Erreur chargement utilisateurs connectés:', e);
    }
}

function lireMinuteur() {
    const restant = inactiviteRestante();
    secondes.value = restant === null ? null : Math.max(0, restant);
}

let boucleConnectes: ReturnType<typeof setInterval> | undefined;
let boucleMinuteur: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
    void lireConnectes();
    lireMinuteur();
    boucleConnectes = setInterval(() => void lireConnectes(), 30000);
    boucleMinuteur = setInterval(lireMinuteur, 1000);
});
onBeforeUnmount(() => {
    clearInterval(boucleConnectes);
    clearInterval(boucleMinuteur);
});

/** Relecture immédiate (réouverture de l'application) */
defineExpose({ relire: lireConnectes });

const ton = () =>
    secondes.value === null
        ? undefined
        : secondes.value <= 60
          ? 'gp-pastilles__minuteur--rouge'
          : secondes.value <= 120
            ? 'gp-pastilles__minuteur--orange'
            : undefined;
</script>

<template>
    <button
        :id="`${props.prefixe}OnlineUsersContainer`"
        type="button"
        class="gp-pastilles__connectes"
        title="Utilisateurs connectés"
        @click="basculerBulleConnectes($event.currentTarget as HTMLElement, $event)"
    >
        <span class="gp-pastilles__point" aria-hidden="true">●</span>
        <span :id="`${props.prefixe}OnlineUsersAvatars`" class="gp-pastilles__avatars">
            <span
                v-for="(u, i) in connectes.slice(0, MAX_AVATARS)"
                :key="u.userId"
                class="gp-pastilles__avatar"
                :style="{ marginLeft: i > 0 ? '-8px' : '0', zIndex: MAX_AVATARS - i }"
                :title="nom(u)"
            >
                <img v-if="u.profilePhoto" :src="u.profilePhoto" alt="" class="gp-pastilles__photo" />
                <template v-else>{{ initiale(u) }}</template>
            </span>
            <span v-if="connectes.length > MAX_AVATARS" class="gp-pastilles__avatar gp-pastilles__avatar--plus"
                >+{{ connectes.length - MAX_AVATARS }}</span
            >
        </span>
        <span :id="`${props.prefixe}OnlineUsersCount`" class="gp-pastilles__compte"
            >{{ connectes.length }} connecté(s)</span
        >
    </button>
    <div :id="`${props.prefixe}TimerDisplay`" class="inactivity-timer gp-pastilles__minuteur" :class="ton()">
        ⏱
        <span :id="`${props.prefixe}TimerMinutes`">{{
            secondes === null ? '--' : deux(Math.floor(secondes / 60))
        }}</span
        >:<span :id="`${props.prefixe}TimerSeconds`">{{ secondes === null ? '--' : deux(secondes % 60) }}</span>
    </div>
</template>

<style>
.gp-pastilles__connectes {
    position: fixed;
    top: 10px;
    right: 120px;
    height: 32px;
    box-sizing: border-box;
    background: #fff;
    color: #666;
    padding: 0 12px;
    border: none;
    border-radius: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 1001;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
}
.gp-pastilles__point {
    font-size: 12px;
    color: #27ae60;
    margin-right: 4px;
}
.gp-pastilles__avatars {
    display: flex;
    align-items: center;
}
.gp-pastilles__avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: #3498db;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    border: 2px solid white;
    position: relative;
    overflow: hidden;
    box-sizing: content-box;
}
.gp-pastilles__avatar--plus {
    background-color: #95a5a6;
    font-size: 9px;
    margin-left: -8px;
}
.gp-pastilles__photo {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
}
.gp-pastilles__compte {
    font-size: 11px;
    color: #666;
    margin-left: 4px;
}
.gp-pastilles__minuteur {
    position: fixed;
    top: 10px;
    right: 10px;
    background: #fff;
    padding: 6px 12px;
    border-radius: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 1001;
    font-size: 13px;
    font-weight: bold;
    color: #2c3e50;
    white-space: nowrap;
}
.gp-pastilles__minuteur--orange {
    color: #f39c12;
}
.gp-pastilles__minuteur--rouge {
    color: #e74c3c;
}
</style>
