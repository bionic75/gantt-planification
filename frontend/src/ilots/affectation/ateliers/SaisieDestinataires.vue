<!-- Destinataires en pastilles : utilisateurs proposés à la saisie (nom ou adresse), adresses libres (destinataires
     externes) ; Entrée, Tab, « , » ou « ; » ajoutent la proposition choisie ; Retour arrière retire la dernière ;
     adresse saisie en entier puis champ quitté : ajoutée -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { UtilisateurAteliers } from '@/api/ateliers';
import { ajouterPastille, estCourriel, pastilleLibre, propositions, type Pastille } from './ateliers';

const props = defineProps<{
    id: string;
    utilisateurs: UtilisateurAteliers[];
    libre?: boolean;
    lectureSeule?: boolean;
    indication?: string;
}>();
const choisies = defineModel<Pastille[]>({ required: true });

const saisie = ref('');
const selection = ref(0);
const champ = ref<HTMLInputElement | null>(null);
const ouverte = ref(false);

const options = computed(() => propositions(props.utilisateurs, choisies.value, saisie.value, !!props.libre));

async function ajouter(p: Pastille | undefined) {
    if (!p) return;
    const avant = choisies.value.length;
    choisies.value = ajouterPastille(choisies.value, p);
    if (choisies.value.length !== avant) saisie.value = '';
    await nextTick();
    champ.value?.focus();
}

function retirer(i: number) {
    choisies.value = choisies.value.filter((_, j) => j !== i);
    void nextTick(() => champ.value?.focus());
}

function frappe() {
    selection.value = 0;
    ouverte.value = true;
}

function touche(e: KeyboardEvent) {
    const n = options.value.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!n) return;
        e.preventDefault();
        selection.value = (selection.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    } else if (['Enter', 'Tab', ',', ';'].includes(e.key) && saisie.value.trim()) {
        const choix = options.value[Math.min(selection.value, n - 1)];
        if (choix) {
            e.preventDefault();
            void ajouter(choix);
        } else if (e.key === 'Enter') e.preventDefault();
    } else if (e.key === 'Backspace' && !saisie.value && choisies.value.length) {
        choisies.value = choisies.value.slice(0, -1);
    }
}

function sortie() {
    const texte = saisie.value.trim();
    setTimeout(() => {
        ouverte.value = false;
        if (props.libre && estCourriel(texte)) void ajouter(pastilleLibre(texte));
        else saisie.value = '';
    }, 150);
}
</script>

<template>
    <div :id="id" class="at-chips-box">
        <div class="at-chips" :class="{ ro: lectureSeule }">
            <span v-for="(p, i) in choisies" :key="p.id" class="at-chip"
                ><i class="at-av" :style="{ background: p.color }">{{ p.initials }}</i
                ><span class="at-chip-l" :title="p.email || p.label">{{ p.label }}</span
                ><button v-if="!lectureSeule" type="button" aria-label="Retirer" @click="retirer(i)">×</button></span
            >
            <input
                v-if="!lectureSeule"
                ref="champ"
                v-model="saisie"
                type="text"
                class="at-chips-in"
                :placeholder="choisies.length ? '' : indication"
                autocomplete="off"
                :aria-label="indication"
                @input="frappe"
                @keydown="touche"
                @blur="sortie"
            />
        </div>
        <div v-if="!lectureSeule && ouverte && options.length" class="at-chips-dd">
            <div
                v-for="(c, i) in options"
                :key="c.id"
                class="at-chips-opt"
                :class="{ on: i === selection }"
                @mousedown.prevent="ajouter(c)"
            >
                <i class="at-av" :style="{ background: c.color }">{{ c.initials }}</i
                ><b>{{ c.free ? 'Ajouter ' : '' }}{{ c.label }}</b
                ><span v-if="!c.free" class="aff-muted">{{ c.email }}</span>
            </div>
        </div>
    </div>
</template>
