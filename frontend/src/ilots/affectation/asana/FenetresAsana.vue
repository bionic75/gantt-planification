<!-- Fenêtres Asana de l'aide à l'affectation, communes au planning et à l'administration (fenêtre « asana » du registre
     des fenêtres, montée à la première demande) : import, tâches d'un projet, changements constatés, conflits à
     trancher (au-dessus), message et annonce -->
<script setup lang="ts">
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import FenetreChangements from './FenetreChangements.vue';
import FenetreConflits from './FenetreConflits.vue';
import FenetreImportAsana from './FenetreImportAsana.vue';
import FenetreTachesAsana from './FenetreTachesAsana.vue';
import { useAsanaStore } from './magasin';
import './asana.css';

const magasin = useAsanaStore();
const { demande, repondre } = fournirConfirmation();
</script>

<template>
    <FenetreImportAsana v-if="magasin.importation" :source="magasin.importation" @fermer="magasin.importation = null" />
    <FenetreTachesAsana v-if="magasin.taches !== null" :id="magasin.taches" @fermer="magasin.taches = null" />
    <FenetreChangements
        v-if="magasin.changements"
        :changements="magasin.changements"
        @fermer="magasin.changements = null"
    />
    <FenetreConflits v-if="magasin.conflits.length" :conflits="magasin.conflits" @fermer="magasin.conflits = []" />
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :label-annuler="demande?.labelAnnuler"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
    <FenetreMessage :message="magasin.message" @fermer="magasin.message = ''" />
    <div
        v-if="magasin.annonce"
        class="aff-toast aff-toast--asana"
        :class="{ err: magasin.annonce.erreur, 'aff-toast--cliquable': magasin.annonce.cliquable }"
        role="status"
        :title="magasin.annonce.cliquable ? 'Cliquer pour fermer' : undefined"
        @click="magasin.annonce.cliquable && (magasin.annonce = null)"
    >
        {{ magasin.annonce.texte }}
    </div>
</template>
