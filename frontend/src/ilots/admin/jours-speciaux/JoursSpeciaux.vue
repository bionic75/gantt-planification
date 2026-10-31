<!-- Administration › Jours et événements spéciaux (sous-îlot, dans la section de l'ancien code) : congés scolaires et
     dates particulières importés depuis des fichiers .ics, paramétrage des types d'événements, reprise des données -->
<script setup lang="ts">
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import CongesScolaires from './CongesScolaires.vue';
import DatesParticulieres from './DatesParticulieres.vue';
import ParametrageTypes from './ParametrageTypes.vue';
import RepriseEvenements from './RepriseEvenements.vue';

const { demande, repondre } = fournirConfirmation();
</script>

<template>
    <CongesScolaires />
    <DatesParticulieres />
    <ParametrageTypes />
    <RepriseEvenements />
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
