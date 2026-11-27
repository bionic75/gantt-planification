<!-- Champ « Adresse » d'un lieu : adresses de la Base Adresse Nationale proposées pendant la saisie, celles du
     département du SAMU-SAS de rattachement d'abord -->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { apiLieux, type Adresse } from '@/api/poi';
import AppInput from '@/composants/AppInput.vue';

const props = defineProps<{ modelValue: string; samu: string }>();
const emit = defineEmits<{ 'update:modelValue': [v: string]; choisie: [a: Adresse] }>();

const adresses = ref<Adresse[]>([]);
const ouverte = ref(false);
const actif = ref(-1);
let minuteur: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

function fermer() {
    clearTimeout(minuteur);
    sequence++;
    ouverte.value = false;
    actif.value = -1;
}

/** Recherche après une pause dans la saisie */
function planifier(texte: string) {
    fermer();
    const q = texte.trim();
    if (q.length < 3) return;
    const n = sequence;
    minuteur = setTimeout(async () => {
        try {
            const { addresses } = await apiLieux.adresses(q, props.samu);
            if (n !== sequence) return;
            adresses.value = addresses;
            ouverte.value = addresses.length > 0;
        } catch {
            /* Base indisponible : saisie manuelle */
        }
    }, 300);
}

function saisie(v: string) {
    emit('update:modelValue', v);
    planifier(v);
}

function choisir(a: Adresse) {
    fermer();
    emit('choisie', a);
}

function clavier(e: KeyboardEvent) {
    if (!ouverte.value) return;
    const n = adresses.value.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const pas = e.key === 'ArrowDown' ? 1 : -1;
        actif.value = actif.value < 0 && pas < 0 ? n - 1 : (actif.value + pas + n) % n;
    } else if (e.key === 'Enter' && actif.value >= 0) {
        e.preventDefault();
        const a = adresses.value[actif.value];
        if (a) choisir(a);
    } else if (e.key === 'Escape') {
        // Fermeture de la liste seulement, pas de la fenêtre
        e.stopPropagation();
        fermer();
    }
}

// Autre SAMU-SAS : la liste ouverte est recalculée
watch(
    () => props.samu,
    () => {
        if (ouverte.value) planifier(props.modelValue);
    }
);
onBeforeUnmount(fermer);
</script>

<template>
    <div class="tr-adresse" @focusout="fermer">
        <AppInput
            id="tfAddr"
            :model-value="modelValue"
            label="Adresse"
            hint="les adresses du département du SAMU-SAS sont proposées"
            maxlength="250"
            autocomplete="off"
            placeholder="Ex : 1 rue de la Gare…"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="tfAddrSug"
            :aria-expanded="ouverte ? 'true' : 'false'"
            :aria-activedescendant="actif >= 0 ? `tfAddrSug_${actif}` : undefined"
            @update:model-value="saisie"
            @keydown="clavier"
        >
            <ul
                v-show="ouverte"
                id="tfAddrSug"
                class="tr-adresse__liste"
                role="listbox"
                aria-label="Adresses proposées"
            >
                <li
                    v-for="(a, i) in adresses"
                    :id="`tfAddrSug_${i}`"
                    :key="a.address"
                    role="option"
                    :aria-selected="i === actif ? 'true' : 'false'"
                    :class="{ 'tr-adresse__active': i === actif }"
                    @mousedown.prevent
                    @click="choisir(a)"
                >
                    {{ a.address }}
                </li>
            </ul>
        </AppInput>
    </div>
</template>

<style scoped>
.tr-adresse :deep(.gp-champ) {
    position: relative;
}
.tr-adresse__liste {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 10;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--gp-fond);
    border: 1px solid var(--gp-bordure);
    border-radius: 0 0 10px 10px;
    box-shadow: var(--gp-ombre-liste);
    max-height: 240px;
    overflow: auto;
}
.tr-adresse__liste li {
    padding: var(--gp-espace-2) var(--gp-espace-3);
    cursor: pointer;
    font-size: var(--gp-police-m);
    border-top: 1px solid var(--gp-bordure-legere);
}
.tr-adresse__liste li:hover,
.tr-adresse__active {
    background: var(--gp-fond-survol);
}
</style>
