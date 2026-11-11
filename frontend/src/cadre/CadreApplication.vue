<!-- Application pendant la session (monté à l'ouverture de la session, démonté à sa fin) : Planification (pastilles,
     en-tête, barre d'onglets, onglet de l'adresse) ou autre application de l'adresse (Déplacements, Analyse,
     Affectation), menu Applications, favicon et nouveautés, connectés et conversations, fenêtres des en-têtes.
     Onglets et applications gardés en vie d'une adresse à l'autre ; conteneurs et identifiants d'origine conservés. -->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import PastillesApplication from '@/ilots/applications/PastillesApplication.vue';
import CadreConnectes from '@/ilots/connectes/CadreConnectes.vue';
import BoutonsEnTete from '@/ilots/entete/BoutonsEnTete.vue';
import CadreSession from '@/ilots/entete/CadreSession.vue';
import EnTetePlanification from '@/ilots/entete/EnTetePlanification.vue';
import MenuApplications from '@/ilots/entete/MenuApplications.vue';
import BarreOnglets from '@/ilots/navigation/BarreOnglets.vue';
import { demarrerNavigation, navigation } from '@/ilots/navigation/navigation';
import { useSessionStore } from '@/stores/session';
import FenetresDemandees from './FenetresDemandees.vue';

const session = useSessionStore();
const route = useRoute();
/** Clé du composant gardé en vie : un par onglet ou application (/cra et /cra/12 : le même onglet) */
const cle = computed(() => route.meta.onglet ?? route.meta.application ?? String(route.name ?? 'vide'));

onMounted(async () => {
    const s = await session.charger().catch(() => null);
    if (s) await demarrerNavigation(s);
});
</script>

<template>
    <div v-show="!route.meta.application" class="container">
        <!-- Utilisateurs connectés et minuteur d'inactivité (commun aux applications) -->
        <div id="pastillesPlanification" class="gp-entete-conteneur"><PastillesApplication /></div>
        <div class="fixed-header">
            <!-- Utilisateur, profil, nouvelles affectations -->
            <div id="enteteUtilisateur" class="gp-entete-conteneur"><EnTetePlanification /></div>
            <div id="mainTabsContainer" class="tabs">
                <!-- Onglets accessibles au profil, ordre choisi par glisser-déposer, pastille des CRA -->
                <div id="barreOnglets" class="gp-entete-conteneur"><BarreOnglets /></div>
                <!-- Accueil, aide, recherche, enveloppe des invitations, déconnexion -->
                <div id="enteteBoutons" class="gp-entete-conteneur"><BoutonsEnTete /></div>
            </div>
        </div>
        <!-- Espaceur pour compenser l'en-tête fixe -->
        <div class="header-spacer"></div>
        <!-- Onglet de l'adresse -->
        <RouterView v-slot="{ Component }">
            <KeepAlive>
                <component :is="Component" v-if="navigation.pret && Component" :key="cle" />
            </KeepAlive>
        </RouterView>
    </div>
    <!-- Autre application de l'adresse (vue « application ») -->
    <RouterView v-slot="{ Component }" name="application">
        <KeepAlive>
            <component :is="Component" v-if="navigation.pret && Component" :key="cle" />
        </KeepAlive>
    </RouterView>
    <!-- Menu « Applications », visible dans toutes les applications -->
    <div id="menuApplications"><MenuApplications /></div>
    <!-- Favicon et nouveautés de l'aide après la connexion -->
    <div id="cadreSession"><CadreSession /></div>
    <!-- Connectés, conversations, inactivité (toutes les applications) -->
    <div id="cadreConnectes"><CadreConnectes /></div>
    <FenetresDemandees />
</template>
