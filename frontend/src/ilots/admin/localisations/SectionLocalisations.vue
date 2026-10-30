<!-- Administration › Localisation (sous-îlot) : section repliable, formulaire, import CSV et liste -->
<script setup lang="ts">
import { ref } from 'vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { emettre } from '@/liaison';
import ConflitsImport from './ConflitsImport.vue';
import FormulaireLocalisation from './FormulaireLocalisation.vue';
import ImportLocalisations from './ImportLocalisations.vue';
import ListeLocalisations from './ListeLocalisations.vue';
import { useLocalisationsStore } from './magasin';

const loc = useLocalisationsStore();
const { demande, repondre } = fournirConfirmation();
const ouverte = ref(false);

// Comme l'ancien code : liste rechargée à chaque ouverture de la section, y compris celle des listes déroulantes de
// l'ancien code (non chargée à la reprise d'une session, anomalie connue : l'ouverture de la section y remédie)
function basculer() {
    ouverte.value = !ouverte.value;
    if (!ouverte.value) return;
    void loc.charger();
    emettre('localisations-modifiees');
}
surReouverture(() => {
    if (ouverte.value) void loc.charger();
});
</script>

<template>
    <div class="form-section loc-section">
        <h3 class="loc-section__titre">
            <button
                type="button"
                class="loc-section__basculer"
                :aria-expanded="ouverte ? 'true' : 'false'"
                aria-controls="localisationAdminSection"
                @click="basculer"
            >
                <span aria-hidden="true">{{ ouverte ? '▼' : '▶' }}</span> Localisation
            </button>
        </h3>
        <div v-show="ouverte" id="localisationAdminSection" class="loc-section__corps">
            <FormulaireLocalisation />
            <ImportLocalisations />
            <ListeLocalisations />
        </div>
        <ConflitsImport />
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </div>
</template>

<style scoped>
.loc-section {
    background-color: #e8eaf6;
    border-left: 4px solid #3f51b5;
}
.loc-section__titre {
    color: #283593;
    border-left: none;
    margin: 0;
    padding: 0;
}
.loc-section__basculer,
.loc-section__basculer:hover {
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.loc-section__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.loc-section__corps {
    margin-top: 15px;
}
</style>
