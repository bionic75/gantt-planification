<!-- Sous-section repliable d'une section de l'Administration (apparence des sous-sections de l'ancien code) : en-tête
     bouton (icône, titre ; état annoncé par aria-expanded), corps masqué tant que la sous-section est fermée.
     encadre : sous-section dans une boîte colorée (jours et événements spéciaux), en-tête et corps dans la boîte. -->
<script setup lang="ts">
export type CadreSousSection = 'vert' | 'orange' | 'bleu';

defineProps<{ titre: string; idCorps: string; encadre?: CadreSousSection }>();
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
    <div :class="encadre ? ['gp-cadre', `gp-cadre--${encadre}`] : undefined">
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

/* Boîtes colorées (jours et événements spéciaux de l'ancien code) */
.gp-cadre {
    border-radius: 5px;
    margin-bottom: 15px;
    overflow: hidden;
}
.gp-cadre .gp-sous-section,
.gp-cadre .gp-sous-section:hover {
    justify-content: flex-start;
    padding: 10px 15px;
    background: none;
    border-radius: 0;
    margin-bottom: 0;
}
.gp-cadre .gp-sous-section__titre {
    font-size: 14px;
}
.gp-cadre .gp-sous-section__titre :deep(svg) {
    width: 18px;
    height: 18px;
}
.gp-cadre .gp-sous-section__corps {
    padding: 0 15px 15px;
}
.gp-cadre--vert {
    background-color: #c8e6c9;
}
.gp-cadre--vert .gp-sous-section__titre {
    color: #1b5e20;
}
.gp-cadre--orange {
    background-color: #fff3e0;
}
.gp-cadre--orange .gp-sous-section__titre {
    color: #e65100;
}
.gp-cadre--bleu {
    background-color: #e3f2fd;
}
.gp-cadre--bleu .gp-sous-section__titre {
    color: #1565c0;
}
</style>
