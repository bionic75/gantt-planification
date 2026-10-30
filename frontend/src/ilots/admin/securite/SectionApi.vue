<!-- Administration › Gestion des API (sous-îlot) : clés d'API publiques et connexion Asana, relues à chaque ouverture
     de la section -->
<script setup lang="ts">
import { ref } from 'vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import ClesApi from './ClesApi.vue';
import ConnexionAsana from './ConnexionAsana.vue';

const { demande, repondre } = fournirConfirmation();
const ouverte = ref(false);
const cles = ref<InstanceType<typeof ClesApi> | null>(null);
const asana = ref<InstanceType<typeof ConnexionAsana> | null>(null);

function charger() {
    void cles.value?.charger();
    void asana.value?.charger();
}
surReouverture(() => {
    if (ouverte.value) charger();
});
</script>

<template>
    <AppSectionAdmin
        v-model:ouverte="ouverte"
        titre="Gestion des API"
        id-corps="apiKeysSection"
        teinte="vert-fonce"
        class="api-section"
        @ouverture="charger"
    >
        <ClesApi ref="cles" />
        <ConnexionAsana ref="asana" />
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </AppSectionAdmin>
</template>

<style scoped>
.api-section {
    margin-top: 20px;
}
</style>
