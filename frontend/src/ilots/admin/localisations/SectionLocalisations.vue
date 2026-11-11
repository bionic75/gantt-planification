<!-- Administration › Localisation (sous-îlot) : section repliable, formulaire, import CSV et liste -->
<script setup lang="ts">
import { ref } from 'vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { emettre } from '@/evenements';
import ConflitsImport from './ConflitsImport.vue';
import FormulaireLocalisation from './FormulaireLocalisation.vue';
import ImportLocalisations from './ImportLocalisations.vue';
import ListeLocalisations from './ListeLocalisations.vue';
import { useLocalisationsStore } from './magasin';

const loc = useLocalisationsStore();
const { demande, repondre } = fournirConfirmation();
const ouverte = ref(false);

// Comme l'ancien code : liste rechargée à chaque ouverture de la section ; les autres écrans relisent les leurs
// (gp:localisations-modifiees)
function ouverture() {
    void loc.charger();
    emettre('localisations-modifiees');
}
surReouverture(() => {
    if (ouverte.value) void loc.charger();
});
</script>

<template>
    <AppSectionAdmin
        v-model:ouverte="ouverte"
        titre="Localisation"
        id-corps="localisationAdminSection"
        teinte="indigo"
        @ouverture="ouverture"
    >
        <FormulaireLocalisation />
        <ImportLocalisations />
        <ListeLocalisations />
        <ConflitsImport />
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </AppSectionAdmin>
</template>
