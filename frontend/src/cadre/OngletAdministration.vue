<!-- Onglet « Administration » (/administration) : sections dans leur ordre et leurs conteneurs d'origine, chacune
     chargée à l'ouverture de l'onglet -->
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';

const SECTIONS = [
    { id: 'adminParametrages', composant: () => import('@/ilots/admin/parametrages/SectionParametrages.vue') },
    { id: 'adminJoursSpeciaux', composant: () => import('@/ilots/admin/jours-speciaux/JoursSpeciaux.vue') },
    { id: 'adminLocalisations', composant: () => import('@/ilots/admin/localisations/SectionLocalisations.vue') },
    { id: 'adminSmtp', composant: () => import('@/ilots/admin/securite/SectionSmtp.vue') },
    { id: 'adminMfa', composant: () => import('@/ilots/admin/securite/SectionMfa.vue') },
    {
        id: 'adminAutomatisations',
        composant: () => import('@/ilots/admin/automatisations/SectionAutomatisations.vue')
    },
    { id: 'adminApi', composant: () => import('@/ilots/admin/securite/SectionApi.vue') },
    { id: 'adminApplications', composant: () => import('@/ilots/admin/acces/SectionApplications.vue') },
    { id: 'adminOnglets', composant: () => import('@/ilots/admin/acces/SectionOnglets.vue') },
    { id: 'adminUtilisateurs', composant: () => import('@/ilots/admin/utilisateurs/SectionUtilisateurs.vue') }
].map(s => ({ id: s.id, composant: defineAsyncComponent(s.composant) }));
</script>

<template>
    <h2>Administration</h2>
    <div v-for="s in SECTIONS" :id="s.id" :key="s.id">
        <component :is="s.composant" />
    </div>
</template>
