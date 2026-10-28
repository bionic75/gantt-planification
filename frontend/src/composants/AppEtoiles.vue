<!-- Note sur 5 en étoiles, remplies à la proportion de la note (affichage) -->
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ note: number | null; taille?: number }>(), { taille: 16 });

const libelle = computed(() =>
    props.note == null ? 'Pas encore noté' : `${props.note.toFixed(1).replace('.', ',')} / 5`
);
const variables = computed(() => ({
    '--gp-remplissage': `${props.note == null ? 0 : Math.max(0, Math.min(100, (props.note / 5) * 100))}%`,
    '--gp-taille-etoile': `${props.taille}px`
}));
const ETOILE = 'm12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9z';
</script>

<template>
    <span class="gp-etoiles" :style="variables" role="img" :aria-label="libelle" :title="libelle">
        <span class="gp-etoiles__rangee gp-etoiles__rangee--vide">
            <svg v-for="i in 5" :key="i" viewBox="0 0 24 24" aria-hidden="true"><path :d="ETOILE" /></svg>
        </span>
        <span class="gp-etoiles__rangee gp-etoiles__rangee--pleine">
            <svg v-for="i in 5" :key="i" viewBox="0 0 24 24" aria-hidden="true"><path :d="ETOILE" /></svg>
        </span>
    </span>
</template>

<style scoped>
.gp-etoiles {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
}
.gp-etoiles__rangee {
    display: inline-flex;
}
.gp-etoiles__rangee--pleine {
    position: absolute;
    left: 0;
    top: 0;
    overflow: hidden;
    white-space: nowrap;
    width: var(--gp-remplissage);
}
.gp-etoiles svg {
    flex: none;
    width: var(--gp-taille-etoile);
    height: var(--gp-taille-etoile);
    stroke-width: 1.2;
    stroke-linejoin: round;
}
.gp-etoiles__rangee--vide svg {
    fill: var(--gp-etoile-vide);
    stroke: var(--gp-etoile-vide);
}
.gp-etoiles__rangee--pleine svg {
    fill: var(--gp-etoile);
    stroke: var(--gp-etoile);
}
</style>
