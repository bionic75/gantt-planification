<!-- Application « Aide à l'affectation opérationnelle » (menu Applications), à l'adresse /affectation
     (#affectationContainer) : en-tête commun, pastilles (connectés, minuteur), onglets (Planning des déploiements,
     Événements, Planification des ateliers métier ; Administration pour l'administrateur), déconnexion. À chaque
     réouverture de l'application : session relue, onglet « Planning des déploiements ». -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { Session } from '@/api/types';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import EnTeteApplication from '@/ilots/applications/EnTeteApplication.vue';
import PastillesApplication from '@/ilots/applications/PastillesApplication.vue';
import ZoneOnglet from '@/ilots/applications/ZoneOnglet.vue';
import { surReouverture } from '@/ilots/activation';
import { deconnecterDepuisApplication } from '@/ilots/navigation/navigation';
import { useSessionStore } from '@/stores/session';
import OngletAdministrationAffectation from './administration/OngletAdministrationAffectation.vue';
import OngletAteliers from './ateliers/OngletAteliers.vue';
import OngletEvenementsAffectation from './OngletEvenementsAffectation.vue';
import OngletPlanningAffectation from './planning/OngletPlanningAffectation.vue';
import './affectation.css';

type Onglet = 'planning' | 'events' | 'ateliers' | 'admin';

const sessionStore = useSessionStore();
const session = ref<Session | null>(null);
const admin = computed(() => session.value?.activeProfile === 'admin');
const { demande, repondre, confirmer } = fournirConfirmation();

const onglet = ref<Onglet>('planning');
const ouverts = reactive<Record<Onglet, boolean>>({ planning: true, events: false, ateliers: false, admin: false });
const ouvertures = reactive<Record<Onglet, number>>({ planning: 0, events: 0, ateliers: 0, admin: 0 });

/** Onglet affiché ; ses données sont relues à chaque ouverture, comme l'ancien écran */
function ouvrirOnglet(o: Onglet) {
    onglet.value = o;
    if (ouverts[o]) ouvertures[o]++;
    else ouverts[o] = true;
}

const pastilles = ref<InstanceType<typeof PastillesApplication> | null>(null);

async function deconnexion() {
    if (!(await confirmer('Voulez-vous vraiment vous déconnecter ?', 'Confirmer', { danger: false }))) return;
    void deconnecterDepuisApplication();
}

/** Session relue (photo de profil, profil actif) */
async function lireSession() {
    sessionStore.oublier();
    session.value = await sessionStore.charger();
}

onMounted(() => void lireSession());
surReouverture(() => {
    void lireSession();
    void pastilles.value?.relire();
    ouvrirOnglet('planning');
});
</script>

<template>
    <PastillesApplication ref="pastilles" prefixe="affectation" />

    <EnTeteApplication
        titre="Aide à l'affectation opérationnelle"
        prefixe="affectation"
        :session="session"
        @deconnexion="deconnexion"
    >
        <template #onglets>
            <button
                id="affectationTabPlanning"
                type="button"
                class="tab-btn"
                :class="{ active: onglet === 'planning' }"
                @click="ouvrirOnglet('planning')"
            >
                <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="M8 14h5M11 18h5" /></svg
                >Planning des déploiements
            </button>
            <button
                id="affectationTabEvents"
                type="button"
                class="tab-btn"
                :class="{ active: onglet === 'events' }"
                @click="ouvrirOnglet('events')"
            >
                <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="M8 14h5M11 18h5" /></svg
                >Événements
            </button>
            <button
                id="affectationTabAteliers"
                type="button"
                class="tab-btn"
                :class="{ active: onglet === 'ateliers' }"
                @click="ouvrirOnglet('ateliers')"
            >
                <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z" />
                    <path
                        d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"
                    />
                    <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" /></svg
                >Planification des ateliers métier
            </button>
            <button
                v-if="admin"
                id="affectationTabAdmin"
                type="button"
                class="tab-btn"
                :class="{ active: onglet === 'admin' }"
                @click="ouvrirOnglet('admin')"
            >
                <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
                    <circle cx="16" cy="6" r="2" />
                    <circle cx="8" cy="12" r="2" />
                    <circle cx="18" cy="18" r="2" /></svg
                >Administration
            </button>
        </template>
    </EnTeteApplication>

    <ZoneOnglet
        id="affectationPlanningTab"
        class="aff-panel"
        :actif="onglet === 'planning'"
        :ouvert="ouverts.planning"
        :ouvertures="ouvertures.planning"
    >
        <OngletPlanningAffectation />
    </ZoneOnglet>
    <ZoneOnglet
        id="affectationEventsTab"
        class="aff-panel"
        :actif="onglet === 'events'"
        :ouvert="ouverts.events"
        :ouvertures="ouvertures.events"
    >
        <OngletEvenementsAffectation />
    </ZoneOnglet>
    <ZoneOnglet
        id="affectationAteliersTab"
        class="aff-panel"
        :actif="onglet === 'ateliers'"
        :ouvert="ouverts.ateliers"
        :ouvertures="ouvertures.ateliers"
    >
        <OngletAteliers />
    </ZoneOnglet>
    <ZoneOnglet
        v-if="admin"
        id="affectationAdminTab"
        class="aff-panel"
        :actif="onglet === 'admin'"
        :ouvert="ouverts.admin"
        :ouvertures="ouvertures.admin"
    >
        <OngletAdministrationAffectation />
    </ZoneOnglet>

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
