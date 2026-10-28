<!-- Section repliable ; interface proche de DsfrAccordion (VueDsfr) : title, id (contenu), expanded (v-model).
     Extension locale : couleurs (fond, bordure gauche, titre) de la section. Fermée par défaut. -->
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        title: string;
        id: string;
        fond?: string;
        bordure?: string;
        couleurTitre?: string;
    }>(),
    { fond: 'var(--gp-fond-doux)', bordure: 'var(--gp-primaire)', couleurTitre: 'var(--gp-texte)' }
);
const ouvert = defineModel<boolean>('expanded', { default: false });

const variables = computed(() => ({
    '--gp-accordeon-fond': props.fond,
    '--gp-accordeon-bordure': props.bordure,
    '--gp-accordeon-titre': props.couleurTitre
}));
</script>

<template>
    <section class="gp-accordeon" :style="variables">
        <h3 class="gp-accordeon__titre">
            <button
                type="button"
                class="gp-accordeon__bouton"
                :aria-expanded="ouvert ? 'true' : 'false'"
                :aria-controls="id"
                @click="ouvert = !ouvert"
            >
                <span class="gp-accordeon__icone" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span>
                {{ title }}
            </button>
        </h3>
        <div v-show="ouvert" :id="id" class="gp-accordeon__contenu">
            <slot />
        </div>
    </section>
</template>

<style scoped>
.gp-accordeon {
    background-color: var(--gp-accordeon-fond);
    border-left: 4px solid var(--gp-accordeon-bordure);
    padding: 15px;
    border-radius: 5px;
    margin-bottom: 20px;
}
.gp-accordeon__titre {
    margin: 0;
    padding: 0;
    border: none;
    font-size: 14px;
}
.gp-accordeon__bouton {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: var(--gp-accordeon-titre);
    font: inherit;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
}
.gp-accordeon__bouton:hover {
    background: none;
}
.gp-accordeon__bouton:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.gp-accordeon__icone {
    font-size: 13px;
}
.gp-accordeon__contenu {
    margin-top: 15px;
}
</style>
