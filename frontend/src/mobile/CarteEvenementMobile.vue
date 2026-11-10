<!-- Événement de la période (application mobile) : icône et libellé, dates, lieu, participants (8 au plus) -->
<script setup lang="ts">
import { computed } from 'vue';
import { datesEvenement, iconeEvenement, libelleEvenement, type EvenementMobile } from './planning';

const props = defineProps<{ evenement: EvenementMobile }>();

const libelle = computed(() => libelleEvenement(props.evenement));
const participants = computed(() => props.evenement.participants ?? []);
const initiales = (p: { prenom: string | null; nom: string | null }) =>
    ((p.prenom || '')[0] || '').toUpperCase() + ((p.nom || '')[0] || '').toUpperCase();
</script>

<template>
    <div class="event-card">
        <div class="event-label">
            <!-- eslint-disable-next-line vue/no-v-html -- tracés fixes de l'application -->
            <svg class="evt-ico" viewBox="0 0 24 24" aria-hidden="true" v-html="iconeEvenement(evenement)"></svg
            >{{ libelle.affiche
            }}<template v-if="libelle.detail">
                <span class="mob-evt-detail">— {{ libelle.detail }}</span></template
            >
        </div>
        <div class="event-dates">{{ datesEvenement(evenement) }}</div>
        <div v-if="evenement.location_libelle_court" class="event-loc">📍 {{ evenement.location_libelle_court }}</div>
        <div v-if="participants.length" class="event-participants">
            <div v-for="(p, i) in participants.slice(0, 8)" :key="i" class="p-avatar" :title="`${p.prenom} ${p.nom}`">
                {{ initiales(p) }}
            </div>
            <div v-if="participants.length > 8" class="p-avatar mob-avatar-plus">+{{ participants.length - 8 }}</div>
        </div>
    </div>
</template>
