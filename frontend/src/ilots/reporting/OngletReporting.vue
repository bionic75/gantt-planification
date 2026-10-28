<!-- Onglet Reporting : disponibilités / affectations, HNO / astreintes, événements, connexions -->
<script setup lang="ts">
import { onMounted } from 'vue';
import AppAccordion from '@/composants/AppAccordion.vue';
import '@/composants/champs.css';
import { useReportingStore } from './magasin';
import './rapports.css';
import SuiviConnexions from './SuiviConnexions.vue';
import SuiviDisponibilites from './SuiviDisponibilites.vue';
import SuiviEvenements from './SuiviEvenements.vue';
import SuiviHnoAstreintes from './SuiviHnoAstreintes.vue';

const reporting = useReportingStore();
onMounted(() => void reporting.charger());
</script>

<template>
    <h2>Reporting</h2>
    <AppAccordion
        id="reportingDispoBody"
        title="Suivi des disponibilités / Suivi des affectations"
        fond="#e8f5e9"
        bordure="#4caf50"
        couleur-titre="#2e7d32"
    >
        <SuiviDisponibilites />
    </AppAccordion>
    <AppAccordion
        id="reportingHnoBody"
        title="Suivi des HNO / Astreintes"
        fond="#f3e5f5"
        bordure="#9c27b0"
        couleur-titre="#7b1fa2"
    >
        <SuiviHnoAstreintes />
    </AppAccordion>
    <AppAccordion
        id="reportingEventsBody"
        title="Suivi des événements"
        fond="#e3f2fd"
        bordure="#1976d2"
        couleur-titre="#1565c0"
    >
        <SuiviEvenements />
    </AppAccordion>
    <AppAccordion
        id="reportingConnexionsBody"
        class="rp-section-connexions"
        title="Suivi des connexions utilisateurs"
        fond="#e8f5e9"
        bordure="#2e7d32"
        couleur-titre="#2e7d32"
    >
        <SuiviConnexions />
    </AppAccordion>
</template>

<style scoped>
.rp-section-connexions {
    margin-top: 20px;
}
</style>
