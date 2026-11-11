<!-- Racine de la page principale (lot 6.4b) : mire de connexion (#loginPage, classe « active » sans session),
     application pendant la session (cadre/CadreApplication.vue), bandeau de mise en production (mire comprise),
     écran de déconnexion. -->
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import MireBureau from '@/connexion/MireBureau.vue';
import BandeauMiseEnProduction from '@/ilots/entete/BandeauMiseEnProduction.vue';
import { etatSession } from '@/session/session';
import EcranDeconnexion from './EcranDeconnexion.vue';

// Chargée à la première ouverture d'une session : la mire s'affiche sans attendre l'application
const CadreApplication = defineAsyncComponent(() => import('./CadreApplication.vue'));
</script>

<template>
    <CadreApplication v-if="etatSession.ouverte" />
    <!-- Mire de connexion, double authentification et fenêtres des mots de passe -->
    <div id="loginPage" class="modal lp-page" :class="{ active: !etatSession.ouverte }"><MireBureau /></div>
    <!-- Bandeau de mise en production (visible aussi sur la mire) -->
    <div id="bandeauMiseEnProduction"><BandeauMiseEnProduction /></div>
    <EcranDeconnexion />
</template>
