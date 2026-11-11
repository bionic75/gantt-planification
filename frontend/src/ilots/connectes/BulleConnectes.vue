<!-- Liste des utilisateurs connectés, commune à toutes les applications, ouverte sous la pastille cliquée : avatar, nom,
     profil, bouton de message (sauf pour soi-même). Un clic ailleurs la ferme. Identifiants de l'ancienne bulle conservés. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { UtilisateurConnecte } from '@/api/connectes';
import { useSessionStore } from '@/stores/session';
import BadgeProfil from './BadgeProfil.vue';
import { useDiscussionsStore } from './discussions';
import { COULEURS_PROFILS, initialesConnecte, nomConnecte, useConnectesStore } from './magasin';

const connectes = useConnectesStore();
const discussions = useDiscussionsStore();
const session = useSessionStore();
const bulle = ref<HTMLElement | null>(null);

const position = computed(() =>
    connectes.bulle ? { top: `${connectes.bulle.haut}px`, right: `${connectes.bulle.droite}px` } : {}
);
const couleur = (u: UtilisateurConnecte) => COULEURS_PROFILS[u.profile ?? ''] ?? '#7f8c8d';
const soi = (u: UtilisateurConnecte) => u.userId === session.session?.userId;

function ecrire(u: UtilisateurConnecte) {
    connectes.fermerBulle();
    discussions.demarrer(u.userId, nomConnecte(u), u.profilePhoto, u.profile);
}

function clicAilleurs(e: MouseEvent) {
    if (connectes.bulle && !bulle.value?.contains(e.target as Node)) connectes.fermerBulle();
}
onMounted(() => {
    document.addEventListener('click', clicAilleurs);
    void session.charger().catch(() => {});
});
onBeforeUnmount(() => document.removeEventListener('click', clicAilleurs));
</script>

<template>
    <div v-if="connectes.bulle" id="onlineUsersTooltip" ref="bulle" class="gp-bulle-connectes" :style="position">
        <div class="gp-bulle-connectes__titre">
            <svg class="app-ico gp-bulle-connectes__icone" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg
            >Utilisateurs connectés
        </div>
        <div id="onlineUsersTooltipList" class="gp-bulle-connectes__liste">
            <p v-if="!connectes.liste.length" class="gp-bulle-connectes__vide">Aucun utilisateur connecté</p>
            <div v-for="u in connectes.liste" :key="u.userId" class="gp-bulle-connectes__ligne">
                <img
                    v-if="u.profilePhoto"
                    :src="u.profilePhoto"
                    alt=""
                    class="gp-bulle-connectes__avatar gp-bulle-connectes__avatar--photo"
                    :style="{ borderColor: couleur(u) }"
                />
                <span v-else class="gp-bulle-connectes__avatar" :style="{ backgroundColor: couleur(u) }">{{
                    initialesConnecte(u)
                }}</span>
                <div class="gp-bulle-connectes__identite">
                    <div class="gp-bulle-connectes__nom">{{ nomConnecte(u) }}</div>
                    <BadgeProfil :profil="u.profile" />
                </div>
                <button
                    v-if="!soi(u)"
                    type="button"
                    class="gp-bulle-connectes__message"
                    :title="`Envoyer un message à ${nomConnecte(u)}`"
                    :aria-label="`Envoyer un message à ${nomConnecte(u)}`"
                    @click.stop="ecrire(u)"
                >
                    <svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-10 6L2 7" />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<style>
.gp-bulle-connectes {
    position: fixed;
    z-index: 100001;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 10px;
    min-width: 200px;
    max-width: 300px;
}
.gp-bulle-connectes__titre {
    font-weight: bold;
    color: #2c3e50;
    margin-bottom: 8px;
    font-size: 12px;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
}
.gp-bulle-connectes__icone {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    vertical-align: -3px;
    margin-right: 6px;
}
.gp-bulle-connectes__liste {
    max-height: 200px;
    overflow-y: auto;
}
.gp-bulle-connectes__vide {
    color: #999;
    font-size: 11px;
}
.gp-bulle-connectes__ligne {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid #f0f0f0;
}
.gp-bulle-connectes__avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 11px;
    font-weight: bold;
    flex-shrink: 0;
}
.gp-bulle-connectes__avatar--photo {
    border: 2px solid;
    object-fit: cover;
    box-sizing: border-box;
}
.gp-bulle-connectes__identite {
    flex: 1;
    min-width: 0;
}
.gp-bulle-connectes__nom {
    font-size: 12px;
    font-weight: 500;
    color: #2c3e50;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
}
.gp-bulle-connectes__message {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    background: #3f51b5;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s;
    box-shadow: 0 2px 6px rgba(63, 81, 181, 0.35);
    padding: 0;
    color: white;
}
.gp-bulle-connectes__message:hover {
    background: #283593;
}
.gp-bulle-connectes__message svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
}
</style>
