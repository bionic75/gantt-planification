<!-- Rubrique « Connexion Asana » : zones remplies par l'ancien code (connexion, projets Asana, import en masse) jusqu'à
     la migration d'Asana. Créées hors du rendu de Vue, qui n'y touche donc jamais. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { chargerConnexionAsana } from '@/liaison';

const hote = ref<HTMLElement | null>(null);

onMounted(() => {
    const cfg = document.createElement('div');
    cfg.id = 'affAsanaCfg';
    cfg.innerHTML = '<p class="aff-muted">Chargement…</p>';
    const projets = document.createElement('div');
    projets.id = 'affAsanaProjects';
    hote.value?.append(cfg, projets);
    chargerConnexionAsana();
});
</script>

<template>
    <div ref="hote"></div>
</template>
