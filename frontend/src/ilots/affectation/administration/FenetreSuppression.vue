<!-- Suppression d'un déploiement relié à des événements : sort des événements (conservés, ou supprimés avec remise en
     situation de la planification des experts) -->
<script setup lang="ts">
import type { DeploiementAdmin, EvenementLie } from '@/api/affectation';
import AppModal from '@/composants/AppModal.vue';
import { jourFr } from '../planning/outils';

defineProps<{ deploiement: DeploiementAdmin; evenements: EvenementLie[] }>();
const emit = defineEmits<{ fermer: []; supprimer: [mode: 'keep' | 'delete'] }>();
</script>

<template>
    <AppModal
        id="affDelEvModal"
        opened
        title="Événements liés à ce déploiement"
        class="aff-suppression"
        @close="emit('fermer')"
    >
        <div id="affDelEvBody">
            <p class="aff-supp-intro">
                <b>{{ deploiement.samu_name }}</b> est relié à <b>{{ evenements.length }}</b> événement(s). Que faire ?
            </p>
            <div class="aff-supp-liste">
                <div v-for="e in evenements" :key="e.id">
                    <b>{{ e.label }}</b>
                    <span class="aff-muted"
                        >{{ ' ' }}{{ jourFr(e.start) }}{{ e.end !== e.start ? ` → ${jourFr(e.end)}` : '' }}</span
                    >
                    <div v-if="e.participants.length" class="aff-muted aff-supp-participants">
                        Participants : {{ e.participants.join(', ') }}
                    </div>
                </div>
            </div>
            <ul class="aff-supp-choix">
                <li>
                    <b>Supprimer le déploiement ET les événements</b> : les experts mobilisés sont remis, dans leur
                    planification, en <b>« 2 - Disponible »</b> et <b>« 2 - En attente d'affectation »</b> et la
                    <b>localisation est effacée</b> (uniquement sur les demi-journées posées par l'affectation pour ce
                    SAMU).
                </li>
                <li>
                    <b>Supprimer le déploiement seulement</b> : les événements et la planification des experts restent
                    inchangés.
                </li>
            </ul>
        </div>
        <template #footer>
            <button type="button" class="aff-btn" @click="emit('fermer')">Annuler (ne rien supprimer)</button>
            <button
                type="button"
                class="aff-btn"
                title="Le déploiement est supprimé, les événements restent dans l'application"
                @click="emit('supprimer', 'keep')"
            >
                Supprimer le déploiement seulement
            </button>
            <button
                type="button"
                class="aff-btn aff-btn-danger"
                title="Supprime aussi les événements ; les experts mobilisés sont remis Disponible / En attente d'affectation, localisation effacée"
                @click="emit('supprimer', 'delete')"
            >
                Supprimer le déploiement ET les événements
            </button>
        </template>
    </AppModal>
</template>
