<!-- Bloc repliable de l'onglet CRA (cartes, CRA signés, archivés, supprimés) : titre cliquable, état annoncé
     (aria-expanded), action facultative à droite du titre ; « ouverture » émis à chaque ouverture -->
<script setup lang="ts">
import { ref, useId } from 'vue';

const props = withDefaults(
    defineProps<{ titre: string; teinte: 'orange' | 'vert' | 'gris' | 'rose'; ouverte?: boolean }>(),
    { ouverte: false }
);
const emit = defineEmits<{ ouverture: []; fermeture: [] }>();

const ouvert = ref(props.ouverte);
const idCorps = `cra-section-${useId()}`;

function basculer() {
    ouvert.value = !ouvert.value;
    if (ouvert.value) emit('ouverture');
    else emit('fermeture');
}
</script>

<template>
    <div class="cra-section" :class="`cra-section--${teinte}`">
        <div class="cra-section__entete">
            <h3 class="cra-section__titre">
                <button
                    type="button"
                    class="cra-section__bascule"
                    :aria-expanded="ouvert"
                    :aria-controls="idCorps"
                    @click="basculer"
                >
                    <span :key="String(ouvert)" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span> {{ titre }}
                </button>
            </h3>
            <slot name="actions" :ouvert="ouvert" />
        </div>
        <div v-show="ouvert" :id="idCorps" class="cra-section__corps">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.cra-section {
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 16px;
}
.cra-section--orange {
    background: #fff3e0;
    border: 1px solid #ffb74d;
}
.cra-section--vert {
    background: #e8f5e9;
    border: 1px solid #a5d6a7;
}
.cra-section--gris {
    background: #f3f4f6;
    border: 1px solid #b0bec5;
}
.cra-section--rose {
    background: #fce4ec;
    border: 1px solid #f48fb1;
}
.cra-section__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
}
.cra-section__titre {
    margin: 0;
    font-size: 15px;
    flex: 1;
}
.cra-section--orange .cra-section__titre {
    color: #e65100;
}
.cra-section--vert .cra-section__titre {
    color: #2e7d32;
}
.cra-section--gris .cra-section__titre {
    color: #546e7a;
}
.cra-section--rose .cra-section__titre {
    color: #880e4f;
}
.cra-section__bascule,
.cra-section__bascule:hover {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
.cra-section__corps {
    margin-top: 12px;
}
</style>
