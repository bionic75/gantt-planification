<!-- Choix d'une couleur parmi une palette restreinte : pastille de la couleur actuelle, grille des couleurs au clic -->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ modelValue: string; palette: string[]; libelle: string }>();
const emit = defineEmits<{ 'update:modelValue': [couleur: string] }>();

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
function choisir(c: string) {
    fermer();
    if (c !== props.modelValue) emit('update:modelValue', c);
}
onBeforeUnmount(() => document.removeEventListener('click', clicDocument));
</script>

<template>
    <span ref="zone" class="sc" @keydown.esc="fermer">
        <button
            type="button"
            class="sc__pastille"
            :style="{ background: modelValue }"
            :aria-label="`${libelle} : ${modelValue}`"
            :aria-expanded="ouvert ? 'true' : 'false'"
            @click="basculer"
        ></button>
        <span v-if="ouvert" class="sc__grille" role="listbox" :aria-label="libelle">
            <button
                v-for="c in palette"
                :key="c"
                type="button"
                role="option"
                class="sc__choix"
                :class="{ 'sc__choix--actuel': c === modelValue }"
                :style="{ background: c }"
                :aria-selected="c === modelValue"
                :aria-label="c"
                @click="choisir(c)"
            ></button>
        </span>
    </span>
</template>

<style scoped>
.sc {
    position: relative;
    display: inline-block;
}
.sc__pastille {
    width: 32px;
    height: 26px;
    border: 2px solid #fff;
    border-radius: 4px;
    box-shadow: 0 0 0 1px #9fa8da;
    cursor: pointer;
    padding: 0;
}
.sc__grille {
    position: absolute;
    z-index: 20;
    top: 32px;
    left: 0;
    display: grid;
    grid-template-columns: repeat(5, 26px);
    gap: 5px;
    padding: 8px;
    background: #fff;
    border: 1px solid #c5cae9;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}
.sc__choix {
    width: 26px;
    height: 26px;
    border: 2px solid #fff;
    border-radius: 4px;
    box-shadow: 0 0 0 1px #c5cae9;
    cursor: pointer;
    padding: 0;
}
.sc__choix--actuel {
    box-shadow: 0 0 0 2px #1a237e;
}
</style>
