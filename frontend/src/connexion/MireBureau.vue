<!-- Mire de la page principale (index.html, monté dans #loginPage) : session vérifiée au chargement, lien de
     réinitialisation du mot de passe (?reset_token=…), mot de passe imposé à changer après un rechargement.
     L'ancien code ouvre l'application (gp:session-ouverte), masque l'application sans session (gp:session-absente) et
     affiche ou masque la mire (classe « active » de #loginPage) ; il demande sa remise à zéro (gp:mire-affichee). -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { UtilisateurConnecte } from '@/api/connexion';
import { ecouter, emettre } from '@/liaison';
import FenetreMotDePasseImpose from './FenetreMotDePasseImpose.vue';
import FenetreNouveauMotDePasse from './FenetreNouveauMotDePasse.vue';
import { useSessionStore } from './magasin';
import MireConnexion from './MireConnexion.vue';

const session = useSessionStore();
const mire = ref<InstanceType<typeof MireConnexion> | null>(null);
const motDePasseImpose = ref(false);

/** Jeton du lien reçu par e-mail, retiré de l'adresse (historique, en-tête Referer) */
function prendreJeton(): string | null {
    const params = new URLSearchParams(window.location.search);
    const jeton = params.get('reset_token');
    if (!jeton) return null;
    params.delete('reset_token');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    return jeton;
}
const jeton = ref(prendreJeton());

async function reprendre() {
    const etat = await session.verifier();
    if (etat === 'ouverte') emettre('session-ouverte', { utilisateur: session.utilisateur!, reprise: true });
    else {
        emettre('session-absente');
        motDePasseImpose.value = etat === 'mot-de-passe-a-changer';
    }
}

function connecte(utilisateur: UtilisateurConnecte) {
    session.ouvrir(utilisateur);
    emettre('session-ouverte', { utilisateur: session.utilisateur!, reprise: false });
}

function motDePasseChange() {
    motDePasseImpose.value = false;
    void reprendre();
}

const arreter = ecouter('mire-affichee', detail => {
    session.fermer();
    motDePasseImpose.value = false;
    mire.value?.reinitialiser(detail?.message);
});

onMounted(reprendre);
onBeforeUnmount(arreter);
</script>

<template>
    <MireConnexion ref="mire" mode="bureau" @connecte="connecte" />
    <FenetreNouveauMotDePasse :jeton="jeton" @fermer="jeton = null" />
    <FenetreMotDePasseImpose :ouverte="motDePasseImpose" @termine="motDePasseChange" />
</template>
