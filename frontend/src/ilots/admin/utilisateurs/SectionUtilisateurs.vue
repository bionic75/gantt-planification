<!-- Administration › Gestion des utilisateurs (sous-îlot) : compteur dans le titre, création, liste, fenêtres de
     modification, de mot de passe et de détails ; comptes relus à chaque ouverture de l'onglet -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Utilisateur } from '@/api/utilisateurs';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { compteur } from './calculs';
import FenetreDetails from './FenetreDetails.vue';
import FenetreModification from './FenetreModification.vue';
import FenetresMotDePasse from './FenetresMotDePasse.vue';
import FormulaireCreation from './FormulaireCreation.vue';
import ListeUtilisateurs from './ListeUtilisateurs.vue';
import { useUtilisateursStore } from './magasin';

const store = useUtilisateursStore();
const { demande, repondre } = fournirConfirmation();

/** Compte dont une fenêtre est ouverte */
const enModification = ref<Utilisateur | null>(null);
const pourMotDePasse = ref<Utilisateur | null>(null);
const enDetails = ref<Utilisateur | null>(null);

const titreCompteur = computed(() => (store.charge ? compteur(store.utilisateurs) : ''));

// Comme l'ancien code : comptes relus à chaque ouverture de l'onglet Administration
onMounted(() => void store.charger());
surReouverture(() => void store.charger());
</script>

<template>
    <AppSectionAdmin
        titre="Gestion des utilisateurs"
        id-corps="usersListSection"
        teinte="rose"
        class="utilisateurs-section"
    >
        <template #complement>
            <span id="usersListCount" class="utilisateurs__compteur">{{ titreCompteur }}</span>
        </template>
        <AppAlert
            v-if="store.message"
            :type="store.message.type"
            :description="store.message.texte"
            class="utilisateurs__message"
        />
        <FormulaireCreation />
        <ListeUtilisateurs
            @modifier="u => (enModification = u)"
            @mot-de-passe="u => (pourMotDePasse = u)"
            @details="u => (enDetails = u)"
        />
        <FenetreModification :utilisateur="enModification" @fermer="enModification = null" />
        <FenetresMotDePasse :utilisateur="pourMotDePasse" @fermer="pourMotDePasse = null" />
        <FenetreDetails :utilisateur="enDetails" @fermer="enDetails = null" />
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            :label-annuler="demande?.labelAnnuler"
            :danger="demande?.danger"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </AppSectionAdmin>
</template>

<style scoped>
.utilisateurs-section {
    margin-top: 20px;
}
.utilisateurs__compteur {
    font-size: 12px;
    font-weight: normal;
    color: #ad1457;
}
.utilisateurs__message {
    white-space: pre-line;
}
</style>
