<!-- Pastilles fixes en haut à droite, communes à la Planification et aux applications : utilisateurs connectés (un clic
     ouvre la liste commune, ilots/connectes/BulleConnectes.vue) et minuteur d'inactivité (décompte de la session, orange
     sous 2 min, rouge sous 1 min ; absent si l'inactivité n'est pas paramétrée). Données des magasins de la session
     (ilots/connectes). Identifiants « {prefixe}OnlineUsersContainer », « {prefixe}TimerDisplay »… ; sans préfixe
     (Planification) ceux de l'ancien en-tête : « onlineUsersContainer », « inactivityTimerDisplay », « timerMinutes ». -->
<script setup lang="ts">
import { computed } from 'vue';
import { COULEURS_PROFILS, initialesConnecte, nomConnecte, useConnectesStore } from '@/ilots/connectes/magasin';
import { useInactiviteStore } from '@/ilots/connectes/inactivite';

const props = withDefaults(defineProps<{ prefixe?: string }>(), { prefixe: '' });

const MAX_AVATARS = 5;
const connectes = useConnectesStore();
const inactivite = useInactiviteStore();

/** Identifiants de l'ancien en-tête de la Planification (sans préfixe) */
const SANS_PREFIXE: Record<string, string> = {
    OnlineUsersContainer: 'onlineUsersContainer',
    OnlineUsersAvatars: 'onlineUsersAvatars',
    OnlineUsersCount: 'onlineUsersCount',
    TimerDisplay: 'inactivityTimerDisplay',
    TimerMinutes: 'timerMinutes',
    TimerSeconds: 'timerSeconds'
};
const id = (nom: string) => (props.prefixe ? `${props.prefixe}${nom}` : SANS_PREFIXE[nom]);

const deux = (n: number) => String(n).padStart(2, '0');
const secondes = computed(() => Math.max(0, inactivite.restant));
const ton = computed(() =>
    secondes.value <= 60
        ? 'gp-pastilles__minuteur--rouge'
        : secondes.value <= 120
          ? 'gp-pastilles__minuteur--orange'
          : undefined
);

/** Relecture immédiate (réouverture d'une application) */
defineExpose({ relire: () => connectes.charger() });
</script>

<template>
    <button
        v-if="connectes.liste.length"
        :id="id('OnlineUsersContainer')"
        type="button"
        class="gp-pastilles__connectes"
        title="Utilisateurs connectés"
        @click.stop="connectes.basculerBulle($event.currentTarget as HTMLElement)"
    >
        <span class="gp-pastilles__point" aria-hidden="true">●</span>
        <span :id="id('OnlineUsersAvatars')" class="gp-pastilles__avatars">
            <span
                v-for="(u, i) in connectes.liste.slice(0, MAX_AVATARS)"
                :key="u.userId"
                class="gp-pastilles__avatar"
                :style="{
                    marginLeft: i > 0 ? '-8px' : '0',
                    zIndex: MAX_AVATARS - i,
                    backgroundColor: COULEURS_PROFILS[u.profile ?? ''] ?? '#7f8c8d'
                }"
                :title="nomConnecte(u)"
            >
                <img v-if="u.profilePhoto" :src="u.profilePhoto" alt="" class="gp-pastilles__photo" />
                <template v-else>{{ initialesConnecte(u) }}</template>
            </span>
            <span v-if="connectes.liste.length > MAX_AVATARS" class="gp-pastilles__avatar gp-pastilles__avatar--plus"
                >+{{ connectes.liste.length - MAX_AVATARS }}</span
            >
        </span>
        <span :id="id('OnlineUsersCount')" class="gp-pastilles__compte">{{ connectes.liste.length }} connecté(s)</span>
    </button>
    <div v-if="inactivite.actif" :id="id('TimerDisplay')" class="inactivity-timer gp-pastilles__minuteur" :class="ton">
        ⏱ <span :id="id('TimerMinutes')">{{ deux(Math.floor(secondes / 60)) }}</span
        >:<span :id="id('TimerSeconds')">{{ deux(secondes % 60) }}</span>
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
    height: 32px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #fff;
    padding: 0 12px;
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
