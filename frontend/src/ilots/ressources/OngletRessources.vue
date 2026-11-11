<!-- Onglet Ressources : formulaire d'ajout (sauf profil RH, en consultation seule), liste des ressources et fiche d'une
     ressource. Rechargé
     quand les ressources sont relues (gp:ressources-rechargees : fiche enregistrée, comptes modifiés…), SAMU proposés
     relus quand les localisations changent. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { ecouter } from '@/evenements';
import { useSessionStore } from '@/stores/session';
import FicheRessource from './FicheRessource.vue';
import FormulaireAjout from './FormulaireAjout.vue';
import ListeRessources from './ListeRessources.vue';
import { useRessourcesStore } from './magasin';

const magasin = useRessourcesStore();
const session = useSessionStore();
const { demande, repondre } = fournirConfirmation();

const rh = computed(() => session.profil === 'rh');
/** Ressource de la fiche ouverte (fiche fermée si la ressource n'existe plus) */
const ressourceFiche = computed(() =>
    magasin.fiche ? magasin.ressources.find(r => r.id === magasin.fiche!.id) : undefined
);

const arrets = [
    ecouter('ressources-rechargees', () => void magasin.charger()),
    ecouter('localisations-modifiees', () => void magasin.chargerLocalisations())
];
onBeforeUnmount(() => arrets.forEach(arreter => arreter()));

onMounted(() => {
    void session.charger().catch(() => null);
    void magasin.charger();
    void magasin.chargerLocalisations();
});
</script>

<template>
    <h2>Gestion des Ressources</h2>
    <!-- Bandeau affiché quelques secondes (outils/page.ts, afficherSynchronisation) -->
    <div id="syncStatus" class="sync-status" hidden>Données synchronisées</div>
    <FormulaireAjout v-if="session.session && !rh" />
    <!-- Profil connu avant l'affichage : liste en consultation seule pour le profil RH -->
    <ListeRessources v-if="session.session" :rh="rh" />
    <FicheRessource
        v-if="ressourceFiche"
        :key="ressourceFiche.id"
        :ressource="ressourceFiche"
        :consultation="magasin.fiche!.consultation"
        @fermer="magasin.fiche = null"
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
