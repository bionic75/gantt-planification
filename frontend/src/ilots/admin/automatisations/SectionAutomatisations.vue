<!-- Administration › Automatisations et rappels (sous-îlot) : rappel de saisie des disponibilités (n°1), sauvegarde des
     plannings (n°2), notifications Teams (n°3), workflow CRA (n°4), astreintes HO (n°5 et n°6), astreintes HO ANS (n°7 et n°8), fenêtre partagée de
     l'historique et des outils -->
<script setup lang="ts">
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import AstreinteHo from './AstreinteHo.vue';
import FenetreHistorique from './FenetreHistorique.vue';
import NotificationsTeams from './NotificationsTeams.vue';
import RappelDisponibilites from './RappelDisponibilites.vue';
import SauvegardePlannings from './SauvegardePlannings.vue';
import WorkflowCra from './WorkflowCra.vue';

const { demande, repondre } = fournirConfirmation();
</script>

<template>
    <AppSectionAdmin titre="Automatisations et rappels" id-corps="automationSection" teinte="orange">
        <RappelDisponibilites />
        <SauvegardePlannings />
        <NotificationsTeams />
        <WorkflowCra />
        <AstreinteHo :numero="5" />
        <AstreinteHo :numero="6" />
        <AstreinteHo :numero="7" />
        <AstreinteHo :numero="8" />
    </AppSectionAdmin>
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
