<!-- Onglet Événements : formulaire d'ajout / de modification, carte (ancien code), liste des événements -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Evenement } from '@/api/evenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { ecouter, ouvrirCarteEvenements } from '@/liaison';
import FormulaireEvenement from './FormulaireEvenement.vue';
import ListeEvenements from './ListeEvenements.vue';
import { useEvenementsStore } from './magasin';

const ev = useEvenementsStore();
const { demande, repondre, confirmer } = fournirConfirmation();
const erreur = ref('');

async function supprimer(e: Evenement) {
    if (!(await confirmer('Êtes-vous sûr de vouloir supprimer cet événement ?', 'Supprimer'))) return;
    erreur.value = '';
    try {
        await ev.supprimer(e.id);
    } catch (x) {
        erreur.value = `Erreur: ${(x as Error).message}`;
    }
}

onMounted(() => void ev.charger());
// Comme à chaque ouverture de l'onglet dans l'ancien code : liste et référentiels rechargés
surReouverture(() => void ev.charger());
// Types modifiés dans l'administration (ancien code)
const arreter = ecouter('types-evenements-modifies', () => {
    void ev.chargerTypes();
    void ev.chargerListe();
});
onBeforeUnmount(arreter);
</script>

<template>
    <h2>Événements</h2>
    <p class="ev-onglet__intro">Créez des événements qui s'afficheront sur le planning</p>
    <AppAlert v-if="ev.message" :type="ev.message.type" class="ev-onglet__message" :description="ev.message.texte" />
    <AppAlert v-if="erreur" type="error" :description="erreur" />
    <FormulaireEvenement />
    <div class="ev-onglet__carte">
        <button type="button" class="ev-onglet__bouton-carte" @click="ouvrirCarteEvenements">
            🗺️ Carte des Événements / Déplacements
        </button>
    </div>
    <ListeEvenements @supprimer="supprimer" />
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>

<style scoped>
.ev-onglet__intro {
    color: #7f8c8d;
    font-size: 12px;
    margin: -10px 0 15px;
}
.ev-onglet__message {
    white-space: pre-line;
}
.ev-onglet__carte {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-bottom: 15px;
}
.ev-onglet__bouton-carte,
.ev-onglet__bouton-carte:hover {
    background-color: #3f51b5;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 13px;
}
</style>
