<!-- Application « Suivi des déplacements » (menu Applications), montée dans #deplacementsContainer quand l'ancien code
     l'affiche : en-tête commun, pastilles (connectés, minuteur), onglets (Planification des déplacements ; Reporting pour
     les comptes autorisés sur l'application ; Administration pour l'administrateur), recherche, fenêtre de
     déconnexion. À chaque réouverture de l'application : session relue, onglet « Planification des déplacements ». -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { Session } from '@/api/types';
import AppModal from '@/composants/AppModal.vue';
import EnTeteApplication from '@/ilots/applications/EnTeteApplication.vue';
import PastillesApplication from '@/ilots/applications/PastillesApplication.vue';
import ZoneOnglet from '@/ilots/applications/ZoneOnglet.vue';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { deconnecterDepuisApplication, quitterDeplacementsVersPlanification } from '@/ilots/navigation/navigation';
import { useSessionStore } from '@/stores/session';
import OngletAdministrationBons from './OngletAdministrationBons.vue';
import OngletMesDeplacements from './OngletMesDeplacements.vue';
import OngletReportingDeplacements from './OngletReportingDeplacements.vue';

type Onglet = 'planification' | 'reporting' | 'admin';

const sessionStore = useSessionStore();
const session = ref<Session | null>(null);
const admin = computed(() => session.value?.activeProfile === 'admin');
/** Reporting : administrateur et comptes AMOA CED (comptes autorisés sur l'application) */
const reporting = computed(() => admin.value || !!session.value?.is_amoa_ced);

const onglet = ref<Onglet>('planification');
const ouverts = reactive<Record<Onglet, boolean>>({ planification: true, reporting: false, admin: false });
const ouvertures = reactive<Record<Onglet, number>>({ planification: 0, reporting: 0, admin: 0 });

/** Onglet affiché ; ses données sont relues à chaque ouverture, comme l'ancien écran */
function ouvrirOnglet(o: Onglet) {
    onglet.value = o;
    if (ouverts[o]) ouvertures[o]++;
    else ouverts[o] = true;
}

const message = ref('');
const deconnexion = ref(false);
const pastilles = ref<InstanceType<typeof PastillesApplication> | null>(null);

function rechercher() {
    message.value = 'Recherche - Fonctionnalité en cours de développement';
}

function allerPlanification() {
    deconnexion.value = false;
    quitterDeplacementsVersPlanification();
}

function seDeconnecter() {
    deconnexion.value = false;
    void deconnecterDepuisApplication('deplacements');
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
    ouvrirOnglet('planification');
});
</script>

<template>
    <PastillesApplication ref="pastilles" prefixe="deplacements" />

    <EnTeteApplication
        titre="Suivi des déplacements"
        prefixe="deplacements"
        :session="session"
        @deconnexion="deconnexion = true"
    >
        <template #onglets>
            <button
                id="deplacementsTabPlanification"
                type="button"
                class="tab-btn"
                :class="{ active: onglet === 'planification' }"
                @click="ouvrirOnglet('planification')"
            >
                <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" />
                    <rect x="3" y="11" width="18" height="6" rx="2" />
                    <circle cx="7.5" cy="14" r=".7" />
                    <circle cx="16.5" cy="14" r=".7" />
                    <path d="M6 17v2M18 17v2" /></svg
                >Planification des déplacements
            </button>
            <button
                v-if="reporting"
                id="deplacementsTabReporting"
                type="button"
                class="tab-btn"
                :class="{ active: onglet === 'reporting' }"
                @click="ouvrirOnglet('reporting')"
            >
                <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg
                >Reporting
            </button>
            <button
                v-if="admin"
                id="deplacementsTabAdmin"
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
        <template #actions>
            <button type="button" class="dep-app__recherche" title="Recherche" @click="rechercher">
                <svg class="app-ico dep-app__icone" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                </svg>
            </button>
        </template>
    </EnTeteApplication>

    <ZoneOnglet
        id="deplacementsPlanificationTab"
        :actif="onglet === 'planification'"
        :ouvert="ouverts.planification"
        :ouvertures="ouvertures.planification"
    >
        <OngletMesDeplacements />
    </ZoneOnglet>
    <ZoneOnglet
        v-if="reporting"
        id="deplacementsReportingTab"
        :actif="onglet === 'reporting'"
        :ouvert="ouverts.reporting"
        :ouvertures="ouvertures.reporting"
    >
        <OngletReportingDeplacements />
    </ZoneOnglet>
    <ZoneOnglet
        v-if="admin"
        id="deplacementsAdminTab"
        :actif="onglet === 'admin'"
        :ouvert="ouverts.admin"
        :ouvertures="ouvertures.admin"
    >
        <OngletAdministrationBons />
    </ZoneOnglet>

    <AppModal
        id="deplacementsLogoutModal"
        :opened="deconnexion"
        title="Que souhaitez-vous faire ?"
        class="dep-app__deconnexion"
        @close="deconnexion = false"
    >
        <div class="dep-app__choix">
            <button type="button" class="dep-app__choix-planification" @click="allerPlanification">
                <span class="dep-app__choix-icone" aria-hidden="true">📅</span>
                <span>Aller sur la Plateforme de planification</span>
            </button>
            <button type="button" class="dep-app__choix-deconnexion" @click="seDeconnecter">
                <span class="dep-app__choix-icone" aria-hidden="true">🚪</span>
                <span>Se déconnecter</span>
            </button>
            <button type="button" class="dep-app__choix-annuler" @click="deconnexion = false">Annuler</button>
        </div>
    </AppModal>
    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
.dep-app__recherche {
    padding: 8px 15px;
    background-color: #3498db;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.3s;
    border-radius: 4px;
    margin-right: 10px;
}
.dep-app__icone {
    width: 22px;
    height: 22px;
    stroke: white;
}
.gp-modale.dep-app__deconnexion .gp-modale__boite {
    width: min(400px, 100%);
    text-align: center;
}
.dep-app__choix {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-top: 20px;
}
.dep-app__choix button {
    color: white;
    padding: 15px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}
.dep-app__choix .dep-app__choix-planification {
    background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
}
.dep-app__choix .dep-app__choix-deconnexion {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
}
.dep-app__choix .dep-app__choix-annuler {
    background-color: #95a5a6;
    padding: 12px 20px;
}
.dep-app__choix-icone {
    font-size: 24px;
}
</style>
