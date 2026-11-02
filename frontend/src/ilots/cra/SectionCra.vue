<!-- Bloc repliable de l'onglet CRA (cartes en cours, cartes signées) : titre cliquable, état annoncé (aria-expanded) -->
<script setup lang="ts">
import { ref, useId } from 'vue';

const props = withDefaults(defineProps<{ titre: string; teinte: 'orange' | 'vert'; ouverte?: boolean }>(), {
    ouverte: false
});

const ouvert = ref(props.ouverte);
const idCorps = `cra-section-${useId()}`;
</script>

<template>
    <div class="cra-section" :class="`cra-section--${teinte}`">
        <h3 class="cra-section__titre">
            <button
                type="button"
                class="cra-section__bascule"
                :aria-expanded="ouvert"
                :aria-controls="idCorps"
                @click="ouvert = !ouvert"
            >
                <span :key="String(ouvert)" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span> {{ titre }}
            </button>
        </h3>
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
.cra-section__titre {
    margin: 0;
    font-size: 15px;
}
.cra-section--orange .cra-section__titre {
    color: #e65100;
}
.cra-section--vert .cra-section__titre {
    color: #2e7d32;
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
