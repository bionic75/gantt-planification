<!-- Onglet Astreintes, rubrique « Gestion des astreintes HNO » (administrateurs) : volontaires, disponibilités,
     génération du planning, planning actuel. Ressources relues à l'affichage de la rubrique et quand l'ancien code
     recharge les siennes. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { apiRessources, type Ressource } from '@/api/ressources';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { ecouter, emettre } from '@/liaison';
import DisponibilitesHno from './DisponibilitesHno.vue';
import GenerationHno from './GenerationHno.vue';
import PlanningActuelHno from './PlanningActuelHno.vue';
import SectionHno from './SectionHno.vue';
import VolontairesHno from './VolontairesHno.vue';

const { demande, repondre } = fournirConfirmation();
const ressources = ref<Ressource[]>([]);

async function charger() {
    try {
        ressources.value = await apiRessources.liste();
    } catch (e) {
        console.error('Erreur chargement ressources:', e);
    }
}

/** Volontaires modifiés : ressources relues, l'ancien code recharge les siennes et la planification */
async function volontairesModifies() {
    await charger();
    emettre('ressources-modifiees');
}

const arreter = ecouter('ressources-rechargees', () => void charger());
onBeforeUnmount(arreter);
onMounted(charger);
defineExpose({ charger });
</script>

<template>
    <h3 class="rubrique-hno__titre">🌙 Gestion des astreintes HNO</h3>
    <p class="rubrique-hno__intro">
        Génération du planning d'astreinte N2 (accompagnement métier des équipes support), heures non ouvrées.
    </p>
    <SectionHno titre="👥 Volontaires au dispositif d'astreinte">
        <VolontairesHno :ressources="ressources" @modifie="volontairesModifies" />
    </SectionHno>
    <SectionHno titre="📅 Disponibilités pour l'astreinte">
        <DisponibilitesHno :ressources="ressources" />
    </SectionHno>
    <SectionHno titre="⚙️ Génération du planning d'astreinte">
        <GenerationHno :ressources="ressources" />
    </SectionHno>
    <SectionHno titre="📅 Planning d'astreinte actuel">
        <PlanningActuelHno :ressources="ressources" />
    </SectionHno>
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

<style scoped>
.rubrique-hno__titre {
    color: #4a148c;
    border-left: none;
    margin: 0 0 6px;
}
.rubrique-hno__intro {
    font-size: 13px;
    color: #555;
    margin: 0 0 14px;
}
</style>
