<!-- Administration › Automatisations et rappels (sous-îlot, dans la section de l'ancien code) : rappel de saisie des
     disponibilités (n°1), sauvegarde des plannings (n°2), fenêtre partagée de l'historique et des outils -->
<script setup lang="ts">
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import RappelDisponibilites from './RappelDisponibilites.vue';
import SauvegardePlannings from './SauvegardePlannings.vue';
import FenetreHistorique from './FenetreHistorique.vue';

const { demande, repondre } = fournirConfirmation();
</script>

<template>
    <RappelDisponibilites />
    <SauvegardePlannings />
    <FenetreHistorique />
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
