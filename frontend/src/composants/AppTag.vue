<!-- Étiquette, sélectionnable ou non ; interface de DsfrTag (VueDsfr) : label, icon, selectable, selected, small.
     Extension locale : couleur (fond de l'étiquette, ou de l'étiquette sélectionnée). -->
<script setup lang="ts">
import { computed } from 'vue';
import AppIcone from './AppIcone.vue';
import type { NomIcone } from './icones';

const props = withDefaults(
    defineProps<{
        label: string;
        icon?: NomIcone;
        selectable?: boolean;
        selected?: boolean;
        small?: boolean;
        couleur?: string;
    }>(),
    { icon: undefined, couleur: 'var(--gp-cat-tout)' }
);
const emit = defineEmits<{ select: [] }>();

const variables = computed(() => ({ '--gp-tag-couleur': props.couleur }));
</script>

<template>
    <button
        v-if="selectable"
        type="button"
        class="gp-tag gp-tag--choix"
        :class="{ 'gp-tag--choisi': selected, 'gp-tag--sm': small }"
        :style="variables"
        :aria-pressed="selected ? 'true' : 'false'"
        @click="emit('select')"
    >
        <AppIcone v-if="icon" :name="icon" :scale="0.85" />{{ label }}
    </button>
    <span v-else class="gp-tag gp-tag--fixe gp-couleurs-fixes" :class="{ 'gp-tag--sm': small }" :style="variables">
        <AppIcone v-if="icon" :name="icon" :scale="0.75" />{{ label }}
    </span>
</template>

<style scoped>
.gp-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: var(--gp-rayon-pastille);
    font-size: var(--gp-police-s);
    font-weight: 600;
    white-space: nowrap;
}
.gp-tag--fixe {
    padding: 2px 10px;
    font-size: var(--gp-police-xs);
    font-weight: 700;
    background: var(--gp-tag-couleur);
    color: #fff;
}
.gp-tag--choix {
    padding: 6px 10px;
    border: 1px solid var(--gp-bordure);
    background: var(--gp-fond);
    color: var(--gp-texte-action);
    cursor: pointer;
}
.gp-tag--choix:not(.gp-tag--sm) {
    padding: var(--gp-espace-2) 14px;
}
.gp-tag--choix.gp-tag--sm {
    padding: 6px 10px;
}
.gp-tag--choisi {
    background: var(--gp-tag-couleur);
    border-color: transparent;
    color: #fff;
}
.gp-tag--choix:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 2px;
}
</style>
