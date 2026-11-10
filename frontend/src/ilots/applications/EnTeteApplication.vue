<!-- En-tête fixe commun des applications (Suivi des déplacements, Analyse de fichiers, Aide à l'affectation) : titre,
     zone de l'utilisateur (ZoneUtilisateur, commune avec la Planification), onglets (slot), retour à l'Accueil, boutons
     propres à l'application (slot « actions »), déconnexion. Identifiants « {prefixe}UserDisplayName »,
     « {prefixe}UserDisplayRole »… de l'ancien en-tête conservés. -->
<script setup lang="ts">
import type { Session } from '@/api/types';
import { allerAccueil } from '@/liaison';
import ZoneUtilisateur from './ZoneUtilisateur.vue';

defineProps<{ titre: string; prefixe: string; session: Session | null }>();
const emit = defineEmits<{ deconnexion: [] }>();
</script>

<template>
    <div class="fixed-header">
        <div :id="`${prefixe}UserInfo`" class="user-info">
            <span class="app-title-center">{{ titre }}</span>
            <ZoneUtilisateur :session="session" :prefixe="prefixe" />
        </div>
        <div class="tabs">
            <slot name="onglets" />

            <button
                type="button"
                class="gp-entete-app__accueil"
                title="Accueil"
                aria-label="Accueil"
                @click="allerAccueil()"
            >
                <svg class="app-ico gp-entete-app__icone" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 10.5 12 3l9 7.5" />
                    <path d="M5 9v12h14V9" />
                    <path d="M10 21v-6h4v6" />
                </svg>
            </button>

            <slot name="actions" />

            <button type="button" class="logout-icon" title="Déconnexion" @click="emit('deconnexion')"></button>
        </div>
    </div>

    <!-- Espaceur pour compenser l'en-tête fixe -->
    <div class="header-spacer"></div>
</template>

<style>
.gp-entete-app__accueil {
    padding: 8px 15px;
    background-color: #16a085;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 18px;
    border-radius: 4px;
    margin-right: 5px;
}
.gp-entete-app__icone {
    width: 22px;
    height: 22px;
    stroke: white;
    vertical-align: middle;
}
</style>
