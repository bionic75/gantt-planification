<!-- Administration › Administration des jours ou événements spéciaux (sous-îlot) : congés scolaires et dates
     particulières importés depuis des fichiers .ics, paramétrage des types d'événements, reprise des données -->
<script setup lang="ts">
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import CongesScolaires from './CongesScolaires.vue';
import DatesParticulieres from './DatesParticulieres.vue';
import ParametrageTypes from './ParametrageTypes.vue';
import RepriseEvenements from './RepriseEvenements.vue';

const { demande, repondre } = fournirConfirmation();
</script>

<template>
    <AppSectionAdmin
        titre="Administration des jours ou événements spéciaux"
        id-corps="specialEventsSection"
        teinte="vert"
    >
        <CongesScolaires />
        <DatesParticulieres />
        <ParametrageTypes />
        <RepriseEvenements />
    </AppSectionAdmin>
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :label-annuler="demande?.labelAnnuler"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>
