<!-- Icône décorative (masquée aux lecteurs d'écran) ; interface proche de VIcon (VueDsfr).
     Nom du jeu d'icônes (icones.ts) ou de l'ancien code (icones-application.ts : icônes des types d'événements, dont
     le nom est enregistré en base) ; nom inconnu : icône vide. -->
<script setup lang="ts">
import { computed } from 'vue';
import { ICONES, type NomIcone } from './icones';
import { ICONES_APPLICATION } from './icones-application';

const props = withDefaults(defineProps<{ name: NomIcone | (string & {}); scale?: number }>(), { scale: 1 });

const taille = computed(() => `${Math.round(16 * props.scale)}px`);
const traces = computed(() => (ICONES as Record<string, string>)[props.name] ?? ICONES_APPLICATION[props.name] ?? '');
</script>

<template>
    <!-- Tracés constants des jeux d'icônes, jamais de donnée saisie -->
    <!-- eslint-disable vue/no-v-html -->
    <svg class="gp-icone" viewBox="0 0 24 24" :width="taille" :height="taille" aria-hidden="true" v-html="traces" />
    <!-- eslint-enable vue/no-v-html -->
</template>

<style>
.gp-icone {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
    vertical-align: middle;
}
</style>
