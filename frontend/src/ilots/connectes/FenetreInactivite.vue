<!-- Échéance de l'inactivité : déconnexion annoncée dans 15 secondes, « Rester connecté » relance le décompte,
     « Se déconnecter » déconnecte aussitôt. Identifiants de l'ancienne fenêtre conservés. -->
<script setup lang="ts">
import AppModal from '@/composants/AppModal.vue';
import { useInactiviteStore } from './inactivite';

const inactivite = useInactiviteStore();
</script>

<template>
    <AppModal
        id="inactivityModal"
        class="gp-inactivite"
        :opened="inactivite.echeance !== null"
        title="⏳ Session inactive"
        is-alert
        @close="inactivite.resterConnecte()"
    >
        <p id="inactivityModalMessage" class="gp-inactivite__message">
            Vous êtes inactif depuis
            <strong id="inactivityModalMinutes">{{ inactivite.minutes }}</strong> minutes.<br />
            Vous allez être déconnecté automatiquement.
        </p>
        <div class="gp-inactivite__decompte">
            Déconnexion dans
            <span id="inactivityCountdown" class="gp-inactivite__secondes">{{ inactivite.echeance }}</span> s
        </div>
        <template #footer>
            <button type="button" class="gp-inactivite__rester" @click="inactivite.resterConnecte()">
                ✅ Rester connecté
            </button>
            <button type="button" class="gp-inactivite__quitter" @click="inactivite.deconnecter()">
                🚪 Se déconnecter
            </button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.gp-inactivite .gp-modale__boite {
    text-align: center;
}
.gp-inactivite__message {
    color: #555;
    margin: 12px 0 20px;
}
.gp-inactivite__decompte {
    background: #fdf2f2;
    border: 2px solid #e74c3c;
    border-radius: 50px;
    padding: 12px 20px;
    display: inline-block;
    font-size: 18px;
    font-weight: bold;
    color: #e74c3c;
}
.gp-inactivite__secondes {
    font-size: 24px;
    font-weight: 900;
}
.gp-modale.gp-inactivite .gp-modale__actions {
    justify-content: center;
}
.gp-inactivite__rester,
.gp-inactivite__quitter {
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
}
.gp-inactivite__rester {
    background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
    font-weight: bold;
}
.gp-inactivite__quitter {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
}
</style>
