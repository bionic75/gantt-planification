<!-- Bouton ; interface de DsfrButton (VueDsfr) : label, secondary, tertiary, icon, iconOnly, size, disabled.
     Extensions locales : danger (action destructrice), link (présentation en lien, ex. actions d'un commentaire),
     couleur (fond d'un bouton principal, ex. couleur d'une section du reporting). -->
<script setup lang="ts">
import { computed } from 'vue';
import AppIcone from './AppIcone.vue';
import type { NomIcone } from './icones';

const props = withDefaults(
    defineProps<{
        label?: string;
        secondary?: boolean;
        tertiary?: boolean;
        danger?: boolean;
        link?: boolean;
        icon?: NomIcone;
        iconOnly?: boolean;
        size?: 'sm' | 'md' | 'lg';
        disabled?: boolean;
        type?: 'button' | 'submit';
        couleur?: string;
    }>(),
    { label: '', icon: undefined, size: 'md', type: 'button', couleur: undefined }
);

const variables = computed(() => (props.couleur ? { '--gp-bouton-couleur': props.couleur } : undefined));
</script>

<template>
    <button
        :type="type"
        class="gp-bouton"
        :class="{
            'gp-bouton--primaire': !secondary && !tertiary && !danger && !link,
            'gp-bouton--danger': danger && !link,
            'gp-bouton--lien': link,
            'gp-bouton--lien-danger': link && danger,
            'gp-bouton--sm': size === 'sm',
            'gp-bouton--lg': size === 'lg'
        }"
        :style="variables"
        :disabled="disabled"
        :aria-label="iconOnly ? label : undefined"
        :title="iconOnly ? label : undefined"
    >
        <AppIcone v-if="icon" :name="icon" :scale="size === 'sm' ? 0.8 : 0.9" />
        <slot>
            <template v-if="!iconOnly">{{ label }}</template>
        </slot>
    </button>
</template>

<style scoped>
.gp-bouton {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px var(--gp-espace-3);
    border: 1px solid var(--gp-bordure);
    border-radius: var(--gp-rayon-1);
    background: var(--gp-fond);
    color: var(--gp-texte);
    font-size: var(--gp-police-s);
    font-weight: 600;
    cursor: pointer;
}
.gp-bouton:disabled {
    opacity: 0.55;
    cursor: default;
}
.gp-bouton:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 2px;
}
.gp-bouton--primaire {
    background: var(--gp-bouton-couleur, var(--gp-primaire));
    border-color: var(--gp-bouton-couleur, var(--gp-primaire));
    color: #fff;
}
.gp-bouton--primaire:hover:not(:disabled) {
    filter: brightness(0.92);
}
.gp-bouton--danger {
    color: var(--gp-danger);
    border-color: var(--gp-danger-bordure);
}
.gp-bouton--sm {
    padding: 2px var(--gp-espace-2);
}
.gp-bouton--lg {
    padding: 10px 22px;
    border-radius: 4px;
    font-size: var(--gp-police-m);
    font-weight: 700;
}
.gp-bouton--lien {
    padding: 0;
    border: none;
    background: none;
    color: var(--gp-primaire);
    font-weight: 400;
    text-decoration: underline;
}
.gp-bouton--lien-danger {
    color: var(--gp-danger);
}
</style>
