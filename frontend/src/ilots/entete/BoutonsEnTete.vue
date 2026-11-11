<!-- Boutons de l'en-tête de la Planification, à droite des onglets (cadre de l'application, monté pendant la session
     dans #enteteBoutons) : Accueil, aide en ligne, recherche avancée, enveloppe des invitations Outlook (pastille des
     affectations en attente, lues dans le magasin de la Planification), déconnexion confirmée. Profil RH : ni recherche
     ni enveloppe. À la déconnexion (comme à la déconnexion pour inactivité, ilots/connectes/inactivite.ts), les
     affectations en attente jamais envoyées sont journalisées. -->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { usePlanificationStore } from '@/ilots/planification/magasin';
import { ouvrirOnglet } from '@/ilots/navigation/navigation';
import { deconnecter, emettre, type NomFenetre } from '@/liaison';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const planification = usePlanificationStore();
const { demande, repondre, confirmer } = fournirConfirmation();

const rh = computed(() => session.profil === 'rh');

/** Affectations en attente d'invitation, par type de modification : nombre et couleur de la pastille */
const pastille = computed(() => {
    let nouvelles = 0;
    let modifiees = 0;
    let supprimees = 0;
    for (const expert of Object.values(planification.enAttente)) {
        for (const a of expert.assignments) {
            if (a.actionType === 'deleted') supprimees++;
            else if (a.actionType === 'modified') modifiees++;
            else nouvelles++;
        }
    }
    const total = nouvelles + modifiees + supprimees;
    // Suppressions seules : rouge foncé ; modifications seules : orange ; sinon rouge
    const teinte =
        supprimees && !nouvelles && !modifiees
            ? 'suppressions'
            : modifiees && !nouvelles && !supprimees
              ? 'modifications'
              : '';
    return { total, teinte };
});

const ouvrir = (fenetre: NomFenetre) => emettre('fenetre-demandee', { fenetre });

function aide() {
    window.open('/aide.html', '_blank', 'width=1200,height=800');
}

async function deconnexion() {
    if (!(await confirmer('Voulez-vous vraiment vous déconnecter ?', 'Confirmer', { danger: false }))) return;
    await planification.journaliserInvitations();
    await deconnecter();
}

onMounted(() => void session.charger().catch(() => {}));
</script>

<template>
    <button
        id="homeBtn"
        type="button"
        class="gp-entete-bouton gp-entete-bouton--accueil"
        title="Accueil"
        aria-label="Accueil"
        @click="ouvrirOnglet('accueil')"
    >
        <svg class="app-ico gp-entete-bouton__icone" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9v12h14V9" />
            <path d="M10 21v-6h4v6" />
        </svg>
    </button>
    <button
        id="helpBtn"
        type="button"
        class="gp-entete-bouton gp-entete-bouton--aide"
        title="Aide en ligne"
        aria-label="Aide en ligne"
        @click="aide"
    >
        <svg class="app-ico gp-entete-bouton__icone" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
        </svg>
    </button>
    <button
        v-if="!rh"
        id="searchBtn"
        type="button"
        class="gp-entete-bouton gp-entete-bouton--recherche"
        title="Recherche avancée"
        aria-label="Recherche avancée"
        @click="ouvrir('recherche-avancee')"
    >
        <svg class="app-ico gp-entete-bouton__icone" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    </button>
    <button
        v-if="!rh"
        id="sendEmailBtn"
        type="button"
        class="gp-entete-bouton gp-entete-bouton--enveloppe"
        title="Envoyer les affectations par email"
        aria-label="Envoyer les affectations par email"
        @click="ouvrir('invitations')"
    >
        <svg class="app-ico gp-entete-bouton__icone" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
        </svg>
        <span
            v-if="pastille.total"
            id="pendingEmailBadge"
            class="gp-entete-bouton__pastille"
            :class="pastille.teinte && `gp-entete-bouton__pastille--${pastille.teinte}`"
            >{{ pastille.total }}</span
        >
    </button>
    <button
        type="button"
        class="logout-icon"
        title="Déconnexion"
        aria-label="Déconnexion"
        @click="deconnexion"
    ></button>

    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>

<style>
.gp-entete-bouton {
    padding: 8px 15px;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.3s;
    border-radius: 4px;
    margin-right: 5px;
}
.gp-entete-bouton--accueil {
    background-color: #16a085;
}
.gp-entete-bouton--aide {
    background-color: #5c6bc0;
}
.gp-entete-bouton--recherche {
    background-color: #3498db;
}
.gp-entete-bouton--enveloppe {
    background-color: #27ae60;
    margin-right: 10px;
    position: relative;
}
.gp-entete-bouton__icone {
    width: 22px;
    height: 22px;
    stroke: white;
    vertical-align: middle;
}
.gp-entete-bouton__pastille {
    display: flex;
    position: absolute;
    top: -8px;
    right: -8px;
    background-color: #e74c3c;
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    font-size: 11px;
    font-weight: bold;
    align-items: center;
    justify-content: center;
}
.gp-entete-bouton__pastille--suppressions {
    background-color: #d60b51;
}
.gp-entete-bouton__pastille--modifications {
    background-color: #ff9800;
}
</style>
