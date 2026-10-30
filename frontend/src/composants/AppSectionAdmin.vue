<!-- Section repliable de l'onglet Administration, à l'apparence des sections de l'ancien code : titre (bouton
     d'ouverture, état annoncé par aria-expanded), corps masqué tant que la section est fermée. Teinte : couleurs de
     fond, de bordure et de titre propres à chaque section. -->
<script setup lang="ts">
export type TeinteSection = 'indigo' | 'indigo-fonce' | 'jaune' | 'vert' | 'vert-fonce';

defineProps<{ titre: string; idCorps: string; teinte: TeinteSection }>();
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
    <div class="form-section gp-section-admin" :class="`gp-section-admin--${teinte}`">
        <h3 class="gp-section-admin__titre">
            <button
                type="button"
                class="gp-section-admin__basculer"
                :aria-expanded="ouverte ? 'true' : 'false'"
                :aria-controls="idCorps"
                @click="basculer"
            >
                <span aria-hidden="true">{{ ouverte ? '▼' : '▶' }}</span> {{ titre }}
            </button>
        </h3>
        <div v-show="ouverte" :id="idCorps" class="gp-section-admin__corps">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.gp-section-admin {
    border-left: 4px solid;
}
.gp-section-admin__titre {
    border-left: none;
    margin: 0;
    padding: 0;
}
.gp-section-admin__basculer,
.gp-section-admin__basculer:hover {
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.gp-section-admin__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.gp-section-admin__corps {
    margin-top: 15px;
}
/* Couleurs des sections de l'ancien code */
.gp-section-admin--indigo,
.gp-section-admin--indigo-fonce {
    background-color: #e8eaf6;
    border-left-color: #3f51b5;
}
.gp-section-admin--indigo .gp-section-admin__titre {
    color: #283593;
}
.gp-section-admin--indigo-fonce .gp-section-admin__titre {
    color: #1a237e;
}
.gp-section-admin--jaune {
    background-color: #fff3cd;
    border-left-color: #ffc107;
}
.gp-section-admin--jaune .gp-section-admin__titre {
    color: #856404;
}
.gp-section-admin--vert {
    background-color: #e8f5e9;
    border-left-color: #4caf50;
}
.gp-section-admin--vert .gp-section-admin__titre {
    color: #2e7d32;
}
.gp-section-admin--vert-fonce {
    background-color: #e8f5e9;
    border-left-color: #2e7d32;
}
.gp-section-admin--vert-fonce .gp-section-admin__titre {
    color: #1b5e20;
}
</style>
