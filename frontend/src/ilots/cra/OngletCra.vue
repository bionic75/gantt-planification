<!-- Onglet CRA selon le profil : administrateur (CRA à lancer, en cours, signés, archivés, supprimés, en attente de
     diffusion), expert (ses CRA en cours et signés), RH (CRA signés et archivés, en consultation) ; détail d'un CRA,
     fenêtres de visualisation, de diffusion et de statut de diffusion. Cartes et listes relues à chaque réouverture
     de l'onglet. -->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { useSessionStore } from '@/stores/session';
import CartesAdmin from './CartesAdmin.vue';
import CartesExpert from './CartesExpert.vue';
import { vueCra } from './calculs';
import CraADiffuser from './CraADiffuser.vue';
import CraArchives from './CraArchives.vue';
import CraSignes from './CraSignes.vue';
import CraSupprimes from './CraSupprimes.vue';
import DetailCra from './DetailCra.vue';
import FenetreDiffusion from './FenetreDiffusion.vue';
import LancerCra from './LancerCra.vue';
import { useCraStore } from './magasin';
import StatutDiffusion from './StatutDiffusion.vue';
import VisualisationCra from './VisualisationCra.vue';

const magasin = useCraStore();
const session = useSessionStore();
const { demande, repondre } = fournirConfirmation();

const vue = computed(() => (session.session ? vueCra(session.session) : null));

onMounted(async () => {
    await session.charger().catch(() => null);
    if (vue.value !== 'rh') void magasin.charger();
});
surReouverture(() => {
    magasin.messageAdmin = null;
    void magasin.rafraichir();
});
</script>

<template>
    <div class="cra-onglet">
        <h2 v-if="vue" class="cra-onglet__titre">{{ vue === 'admin' ? "COMPTE-RENDU D'ACTIVITE" : 'CRA' }}</h2>
        <AppAlert
            v-if="magasin.messageAdmin"
            :type="magasin.messageAdmin.type"
            class="cra-onglet__message"
            :description="magasin.messageAdmin.texte"
        />

        <div v-if="vue === 'admin'" id="craAdminSections" class="cra-onglet__sections">
            <LancerCra />
            <CartesAdmin />
            <CraSignes />
            <CraArchives />
            <CraSupprimes />
            <CraADiffuser />
        </div>
        <CartesExpert v-else-if="vue === 'expert'" />
        <div v-else-if="vue === 'rh'" id="craRhSections" class="cra-onglet__sections">
            <CraSignes rh />
            <CraArchives rh />
        </div>

        <DetailCra v-if="vue" />
    </div>

    <VisualisationCra v-if="magasin.visualise" :id="magasin.visualise" @fermer="magasin.visualise = null" />
    <FenetreDiffusion v-if="magasin.diffuse" :id="magasin.diffuse" @fermer="magasin.diffuse = null" />
    <StatutDiffusion
        v-if="magasin.statut"
        :id="magasin.statut.id"
        :key="`${magasin.statut.id}`"
        :bouton="magasin.statut.bouton"
        @fermer="magasin.statut = null"
    />
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
.cra-onglet {
    padding: 20px;
}
.cra-onglet__titre {
    color: #6a1b9a;
    border-bottom: 2px solid #6a1b9a;
    padding-bottom: 10px;
}
.cra-onglet__message {
    white-space: pre-line;
}
.cra-onglet__sections {
    margin-top: 20px;
}
</style>
