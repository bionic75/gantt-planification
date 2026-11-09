<!-- Filtre texte d'une colonne : recherche libre (jokers * et ?, sans accents ni casse), valeurs commençant par la saisie
     proposées, bouton d'effacement -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { normaliser } from './filtres';
import { useAnalyseStore } from './magasin';

const props = defineProps<{ colonne: string; valeurs: string[] }>();
const magasin = useAnalyseStore();

const valeur = computed(() => {
    const f = magasin.filtres[props.colonne];
    return typeof f === 'string' ? f : '';
});
const ouverte = ref(false);
const propositions = computed(() => {
    if (!valeur.value || !props.valeurs.length) return [];
    const q = normaliser(valeur.value);
    return props.valeurs.filter(v => normaliser(v).startsWith(q)).slice(0, 50);
});

function saisir(texte: string) {
    magasin.definirFiltre(props.colonne, texte || null);
    ouverte.value = true;
}

function choisir(v: string) {
    magasin.definirFiltre(props.colonne, v);
    ouverte.value = false;
}

let fermeture: ReturnType<typeof setTimeout> | undefined;
function quitter() {
    clearTimeout(fermeture);
    fermeture = setTimeout(() => (ouverte.value = false), 150);
}
</script>

<template>
    <div class="ana-texte">
        <div class="ana-texte__ligne">
            <input
                type="text"
                class="ana-texte__champ"
                placeholder="Recherche libre…"
                :value="valeur"
                :aria-label="`Recherche dans ${colonne}`"
                @input="saisir(($event.target as HTMLInputElement).value)"
                @focus="ouverte = true"
                @blur="quitter"
                @keydown.escape="ouverte = false"
            />
            <button
                v-if="valeur"
                type="button"
                class="ana-texte__effacer"
                title="Effacer"
                @mousedown.prevent="magasin.definirFiltre(colonne, null)"
            >
                ×
            </button>
        </div>
        <div v-if="ouverte && propositions.length" class="ana-texte__propositions">
            <div v-for="v in propositions" :key="v" class="ana-texte__proposition" @mousedown.prevent="choisir(v)">
                {{ v }}
            </div>
        </div>
    </div>
</template>

<style>
.ana-texte {
    position: relative;
}
.ana-texte__ligne {
    display: flex;
    align-items: center;
    gap: 4px;
}
.ana-texte__champ {
    flex: 1;
    padding: 4px 6px;
    border: 1px solid #c5cae9;
    border-radius: 4px;
    font-size: 12px;
    box-sizing: border-box;
    min-width: 0;
}
.ana-texte__effacer {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #999;
    font-size: 16px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
}
.ana-texte__propositions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #c5cae9;
    border-top: none;
    border-radius: 0 0 6px 6px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 200;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    font-size: 12px;
    margin-top: 2px;
}
.ana-texte__proposition {
    padding: 4px 8px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ana-texte__proposition:hover {
    background: #e8eaf6;
}
</style>
