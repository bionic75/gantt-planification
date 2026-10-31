<!-- Cartouche d'un type d'événement (icône et libellé aux couleurs du type), ou échantillon « Aa » d'un gabarit -->
<script setup lang="ts">
import AppIcone from '@/composants/AppIcone.vue';
import type { Couleurs } from './types-evenements';

defineProps<{ couleurs: Couleurs; icone?: string; libelle?: string; petit?: boolean }>();
</script>

<template>
    <!-- Couleurs choisies par l'administrateur -->
    <span
        class="cartouche"
        :class="{ 'cartouche--petit': petit, 'cartouche--echantillon': icone === undefined }"
        :style="{ background: couleurs.bg, color: couleurs.text, borderColor: couleurs.border }"
    >
        <AppIcone v-if="icone !== undefined" :name="icone" :scale="petit ? 11 / 16 : 13 / 16" />
        {{ icone === undefined ? 'Aa' : libelle }}
    </span>
</template>

<style scoped>
.cartouche {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    border: 2px solid;
    white-space: nowrap;
}
.cartouche--petit {
    padding: 1px 6px;
    font-size: 10px;
}
.cartouche--echantillon {
    display: inline-block;
    padding: 2px 12px;
}
</style>
