<!-- Choix de la couleur (palette restreinte) et du motif d'un statut : pastille, puis grille au clic -->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { LIBELLES_MOTIFS, fondMotif, type Motif } from './motifs';

const props = defineProps<{ couleur: string; motif: string; palette: string[]; motifs: string[]; libelle: string }>();
const emit = defineEmits<{ 'update:couleur': [couleur: string]; 'update:motif': [motif: string] }>();

const ouvert = ref(false);
const zone = ref<HTMLElement | null>(null);

const clicDocument = (e: MouseEvent) => {
    if (zone.value && !zone.value.contains(e.target as Node)) fermer();
};
function fermer() {
    ouvert.value = false;
    document.removeEventListener('click', clicDocument);
}
function basculer() {
    ouvert.value = !ouvert.value;
    if (ouvert.value) document.addEventListener('click', clicDocument);
    else document.removeEventListener('click', clicDocument);
}
const choisirCouleur = (c: string) => c !== props.couleur && emit('update:couleur', c);
const choisirMotif = (m: string) => m !== props.motif && emit('update:motif', m);
const libelleMotif = (m: string) => LIBELLES_MOTIFS[m as Motif] ?? m;
onBeforeUnmount(() => document.removeEventListener('click', clicDocument));
</script>

<template>
    <span ref="zone" class="ss" @keydown.esc="fermer">
        <button
            type="button"
            class="ss__pastille"
            :style="{ background: fondMotif(couleur, motif) }"
            :aria-label="`${libelle} : ${couleur}, ${libelleMotif(motif)}`"
            :aria-expanded="ouvert ? 'true' : 'false'"
            :title="`${libelle}`"
            @click="basculer"
        ></button>
        <span v-if="ouvert" class="ss__fenetre" role="dialog" :aria-label="libelle">
            <span class="ss__titre">Couleur</span>
            <span class="ss__grille">
                <button
                    v-for="c in palette"
                    :key="c"
                    type="button"
                    class="ss__choix"
                    :class="{ 'ss__choix--actuel': c === couleur }"
                    :style="{ background: c }"
                    :aria-pressed="c === couleur"
                    :aria-label="c"
                    @click="choisirCouleur(c)"
                ></button>
            </span>
            <span class="ss__titre">Motif</span>
            <span class="ss__grille">
                <button
                    v-for="m in motifs"
                    :key="m"
                    type="button"
                    class="ss__choix"
                    :class="{ 'ss__choix--actuel': m === motif }"
                    :style="{ background: fondMotif(couleur, m) }"
                    :aria-pressed="m === motif"
                    :aria-label="libelleMotif(m)"
                    :title="libelleMotif(m)"
                    @click="choisirMotif(m)"
                ></button>
            </span>
        </span>
    </span>
</template>

<style scoped>
.ss {
    position: relative;
    display: inline-block;
    line-height: 0;
}
.ss__pastille,
.ss__choix {
    display: block;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 4px;
    cursor: pointer;
}
.ss__pastille,
.ss__pastille:hover {
    width: 34px;
    height: 22px;
}
.ss__choix,
.ss__choix:hover {
    width: 24px;
    height: 24px;
}
.ss__choix--actuel,
.ss__choix--actuel:hover {
    outline: 2px solid #1a237e;
    outline-offset: 1px;
}
.ss__fenetre {
    position: absolute;
    z-index: 30;
    top: 28px;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 176px;
    padding: 8px 10px 10px;
    background: #fff;
    border: 1px solid #c5cae9;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
    line-height: normal;
}
.ss__titre {
    font-size: 11px;
    font-weight: 700;
    color: #7f8c8d;
    margin-top: 2px;
}
.ss__grille {
    display: grid;
    grid-template-columns: repeat(5, 24px);
    gap: 5px;
}
</style>
