<!-- Mois et année (listes) d'une borne de période du reporting -->
<script setup lang="ts">
import { useId } from 'vue';
import { ANNEES, MOIS } from './calculs';

defineProps<{ label: string; idMois: string; idAnnee: string }>();
const mois = defineModel<number>('mois', { required: true });
const annee = defineModel<number>('annee', { required: true });
const idLibelle = `rp-periode-${useId()}`;
</script>

<template>
    <div role="group" :aria-labelledby="idLibelle">
        <span :id="idLibelle" class="rp-champ__libelle">{{ label }}</span>
        <div class="rp-periode">
            <select :id="idMois" v-model.number="mois" class="rp-periode__mois" aria-label="Mois">
                <option v-for="(nom, i) in MOIS" :key="i" :value="i">{{ nom }}</option>
            </select>
            <select :id="idAnnee" v-model.number="annee" class="rp-periode__annee" aria-label="Année">
                <option v-for="a in ANNEES" :key="a" :value="a">{{ a }}</option>
            </select>
        </div>
    </div>
</template>

<style scoped>
.rp-periode {
    display: flex;
    gap: 5px;
}
.rp-periode__mois {
    width: 120px;
}
.rp-periode__annee {
    width: 80px;
}
</style>
