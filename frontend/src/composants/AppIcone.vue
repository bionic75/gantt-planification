<!-- Icône décorative (masquée aux lecteurs d'écran) ; interface proche de VIcon (VueDsfr) -->
<script setup lang="ts">
import { computed } from 'vue';
import { ICONES, type NomIcone } from './icones';

const props = withDefaults(defineProps<{ name: NomIcone; scale?: number }>(), { scale: 1 });

const taille = computed(() => `${Math.round(16 * props.scale)}px`);
</script>

<template>
    <!-- Tracés constants du jeu d'icônes (icones.ts), jamais de donnée saisie -->
    <!-- eslint-disable vue/no-v-html -->
    <svg
        class="gp-icone"
        viewBox="0 0 24 24"
        :width="taille"
        :height="taille"
        aria-hidden="true"
        v-html="ICONES[name]"
    />
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
