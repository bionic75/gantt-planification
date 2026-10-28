<!-- Saisie d'une note de 1 à 5 : un bouton par étoile (« 4 / 5 »), les étoiles jusqu'à la note choisie sont pleines -->
<script setup lang="ts">
withDefaults(defineProps<{ modelValue: number; taille?: number; label?: string }>(), {
    taille: 22,
    label: 'Note'
});
const emit = defineEmits<{ 'update:modelValue': [note: number] }>();
const ETOILE = 'm12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9z';
</script>

<template>
    <span class="gp-notation" role="group" :aria-label="label">
        <button
            v-for="i in 5"
            :key="i"
            type="button"
            class="gp-notation__etoile"
            :class="{ 'gp-notation__etoile--pleine': i <= modelValue }"
            :aria-label="`${i} / 5`"
            :aria-pressed="i === modelValue ? 'true' : 'false'"
            :title="`${i} / 5`"
            @click="emit('update:modelValue', i)"
        >
            <svg viewBox="0 0 24 24" :width="taille" :height="taille" aria-hidden="true"><path :d="ETOILE" /></svg>
        </button>
    </span>
</template>

<style scoped>
.gp-notation {
    display: inline-flex;
    gap: 2px;
}
.gp-notation__etoile {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    line-height: 0;
}
.gp-notation__etoile:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 1px;
}
.gp-notation__etoile svg {
    fill: none;
    stroke: var(--gp-etoile-contour);
    stroke-width: 1.5;
    stroke-linejoin: round;
}
.gp-notation__etoile--pleine svg {
    fill: var(--gp-etoile);
    stroke: var(--gp-etoile);
}
</style>
