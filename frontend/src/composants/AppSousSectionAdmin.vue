<!-- Sous-section repliable d'une section de l'Administration (apparence des sous-sections de l'ancien code) : en-tête
     bouton (icône, titre ; état annoncé par aria-expanded), corps masqué tant que la sous-section est fermée -->
<script setup lang="ts">
defineProps<{ titre: string; idCorps: string }>();
const emit = defineEmits<{ ouverture: [] }>();
const ouverte = defineModel<boolean>('ouverte', { default: false });

function basculer() {
    // Nouvelle valeur gardée localement : contrôlée par le parent (v-model), ouverte.value n'est mise à jour qu'au
    // rendu suivant
    const ouvrir = !ouverte.value;
    ouverte.value = ouvrir;
    if (ouvrir) emit('ouverture');
}
</script>

<template>
    <button
        type="button"
        class="gp-sous-section"
        :aria-expanded="ouverte ? 'true' : 'false'"
        :aria-controls="idCorps"
        @click="basculer"
    >
        <strong class="gp-sous-section__titre">
            <span aria-hidden="true">{{ ouverte ? '▼' : '▶' }}</span>
            <!-- Icône du titre (tracé SVG 24×24) -->
            <slot name="icone" />
            {{ titre }}
        </strong>
    </button>
    <div v-show="ouverte" :id="idCorps" class="gp-sous-section__corps">
        <slot />
    </div>
</template>

<style scoped>
.gp-sous-section,
.gp-sous-section:hover {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    background: #eef1fb;
    border: none;
    border-radius: 5px;
    margin-bottom: 6px;
    cursor: pointer;
    text-align: left;
    font: inherit;
}
.gp-sous-section:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 2px;
}
.gp-sous-section__titre {
    color: #3949ab;
    font-size: 13px;
}
.gp-sous-section__titre :deep(svg) {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -3px;
    margin: 0 6px 0 4px;
}
.gp-sous-section__corps {
    padding: 10px 5px 15px;
}
</style>
