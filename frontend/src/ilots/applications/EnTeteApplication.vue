<!-- En-tête fixe commun des applications (Suivi des déplacements ; Analyse et Aide à l'affectation à venir) : titre,
     rond de l'utilisateur (photo ou trigramme ; un clic ouvre le changement de photo), nom et profil, onglets (slot),
     retour à l'Accueil, boutons propres à l'application (slot « actions »), déconnexion. Identifiants
     « {prefixe}UserDisplayName », « {prefixe}UserDisplayRole »… de l'ancien en-tête conservés. -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Session } from '@/api/types';
import { allerAccueil, ouvrirPhotoProfil } from '@/liaison';

const props = defineProps<{ titre: string; prefixe: string; session: Session | null }>();
const emit = defineEmits<{ deconnexion: [] }>();

const nomComplet = computed(() => {
    const s = props.session;
    if (!s) return '';
    return `${s.prenom || ''} ${s.nom || ''}`.trim() || s.username;
});

const profil = computed(() => {
    switch (props.session?.activeProfile) {
        case 'admin':
            return 'Administrateur';
        case 'expert':
            return 'Expert Métier';
        default:
            return 'Utilisateur';
    }
});
</script>

<template>
    <div class="fixed-header">
        <div :id="`${prefixe}UserInfo`" class="user-info">
            <span class="app-title-center">{{ titre }}</span>
            <div class="gp-entete-app__zone-rond">
                <button
                    :id="`${prefixe}ProfileCircle`"
                    type="button"
                    class="gp-entete-app__rond"
                    title="Cliquer pour changer la photo"
                    @click="ouvrirPhotoProfil()"
                >
                    <img
                        v-if="session?.profilePhoto"
                        :id="`${prefixe}ProfilePhoto`"
                        :src="session.profilePhoto"
                        alt=""
                        class="gp-entete-app__photo"
                    />
                    <span v-else :id="`${prefixe}ProfileTrigramme`" class="gp-entete-app__trigramme">{{
                        session?.trigramme || '?'
                    }}</span>
                </button>
            </div>
            <span :id="`${prefixe}UserDisplayName`" class="user-info-name gp-entete-app__nom">{{ nomComplet }}</span>
            <span :id="`${prefixe}UserDisplayRole`" class="user-info-role">{{ session ? profil : '' }}</span>
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
.gp-entete-app__zone-rond {
    position: relative;
    display: flex;
    align-items: center;
}
.gp-entete-app__rond {
    width: 50px;
    height: 50px;
    padding: 0;
    border-radius: 50%;
    border: 3px solid #1d70b7;
    background-color: #7f8c8d;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
}
.gp-entete-app__trigramme {
    color: white;
    font-weight: bold;
    font-size: 16px;
}
.gp-entete-app__photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.gp-entete-app__nom {
    margin-left: 15px;
}
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
