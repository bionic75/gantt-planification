<!-- Aperçu avant impression du calendrier d'une ressource sur le mois affiché ; calendrier construit par le serveur
     (le même que celui envoyé par e-mail), imprimé dans une fenêtre dédiée -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiExports } from '@/api/planification';
import AppModal from '@/composants/AppModal.vue';
import { imprimerCalendrierRessource } from './exports';

const props = defineProps<{ ressourceId: number | null; annee: number; mois: number }>();
const emit = defineEmits<{ fermer: []; message: [texte: string] }>();

const contenu = ref('');

watch(
    () => [props.ressourceId, props.annee, props.mois] as const,
    async ([id, annee, mois]) => {
        contenu.value = '';
        if (id === null) return;
        try {
            const c = await apiExports.calendrier(id, annee, mois);
            if (props.ressourceId === id) contenu.value = c.contenu;
        } catch (e) {
            emit('message', `Erreur lors du chargement du calendrier : ${(e as Error).message}`);
            emit('fermer');
        }
    },
    { immediate: true }
);
</script>

<template>
    <AppModal
        id="printCalendarModal"
        :opened="!!contenu"
        title="Aperçu avant impression"
        class="gp-calendrier-ressource"
        @close="emit('fermer')"
    >
        <div id="printCalendarContent" class="gp-calendrier-ressource__apercu">
            <!-- Calendrier construit par le serveur, textes échappés (src/modules/notifications/resource-calendar.js) -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div id="calendarToPrint" v-html="contenu"></div>
        </div>
        <template #footer>
            <button
                type="button"
                class="gp-calendrier-ressource__imprimer"
                @click="imprimerCalendrierRessource(contenu)"
            >
                🖨️ Imprimer
            </button>
            <button type="button" class="gp-calendrier-ressource__fermer" @click="emit('fermer')">Fermer</button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.gp-calendrier-ressource .gp-modale__boite {
    width: min(900px, 95%);
    max-width: 900px;
}
.gp-calendrier-ressource__apercu {
    max-height: 600px;
    overflow-y: auto;
    margin: 20px 0;
}
.gp-calendrier-ressource__imprimer {
    background-color: #3498db;
}
.gp-calendrier-ressource__fermer {
    background-color: #95a5a6;
}
</style>
