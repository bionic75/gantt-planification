<!-- Fenêtres ouvertes par les boutons des en-têtes pendant la session (cadre/fenetres.ts) : chargée à la première
     demande, chaque fenêtre reste montée (dans son conteneur [data-fenetre]) jusqu'à la fin de la session ; le nombre de
     demandes lui est fourni (surDemande). -->
<script setup lang="ts">
import {
    defineAsyncComponent,
    defineComponent,
    h,
    markRaw,
    onBeforeUnmount,
    provide,
    reactive,
    toRef,
    type Component
} from 'vue';
import { ecouter, type NomFenetre } from '@/evenements';
import { CLE_DEMANDES, FENETRES } from './fenetres';
import type { ChargeurVue } from './vues';

const props = withDefaults(defineProps<{ registre?: Partial<Record<NomFenetre, ChargeurVue>> }>(), {
    registre: () => FENETRES
});

/** Conteneur d'une fenêtre : compteur des demandes fourni à son composant */
const Fenetre = defineComponent({
    props: {
        nom: { type: String, required: true },
        composant: { type: Object as () => Component, required: true },
        demandes: { type: Number, required: true }
    },
    setup(p) {
        provide(CLE_DEMANDES, toRef(p, 'demandes'));
        return () => h('div', { 'data-fenetre': p.nom }, [h(p.composant)]);
    }
});

interface FenetreOuverte {
    nom: NomFenetre;
    composant: Component;
    demandes: number;
}

const ouvertes = reactive<FenetreOuverte[]>([]);

const arreter = ecouter('fenetre-demandee', ({ fenetre }) => {
    const ouverte = ouvertes.find(f => f.nom === fenetre);
    if (ouverte) ouverte.demandes++;
    else {
        const chargeur = props.registre[fenetre];
        if (chargeur)
            ouvertes.push({
                nom: fenetre,
                composant: markRaw(defineAsyncComponent(() => chargeur().then(m => m.default))),
                demandes: 1
            });
    }
});
onBeforeUnmount(arreter);
</script>

<template>
    <Fenetre v-for="f in ouvertes" :key="f.nom" :nom="f.nom" :composant="f.composant" :demandes="f.demandes" />
</template>
