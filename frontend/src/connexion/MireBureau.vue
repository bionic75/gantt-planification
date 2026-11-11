<!-- Mire de la page principale (dans #loginPage, cadre/ApplicationPrincipale.vue) : session vérifiée au chargement,
     lien de réinitialisation du mot de passe (?reset_token=…), mot de passe imposé à changer après un rechargement.
     Session ouverte (gp:session-ouverte) ou absente (gp:session-absente) : l'application s'affiche ou reste masquée
     (session/session.ts) ; remise à zéro à chaque nouvel affichage de la mire (gp:mire-affichee). -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { UtilisateurConnecte } from '@/api/connexion';
import { CLE_CONNEXION_RECENTE } from '@/ilots/entete/cadre';
import { ecouter, emettre } from '@/evenements';
import FenetreMotDePasseImpose from './FenetreMotDePasseImpose.vue';
import FenetreNouveauMotDePasse from './FenetreNouveauMotDePasse.vue';
import { prendreJeton } from './jeton';
import { useSessionStore } from './magasin';
import MireConnexion from './MireConnexion.vue';

const session = useSessionStore();
const mire = ref<InstanceType<typeof MireConnexion> | null>(null);
const motDePasseImpose = ref(false);

/** Jeton du lien reçu par e-mail, retiré de l'adresse (connexion/jeton.ts) */
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
    // Nouveautés de l'aide proposées une fois la session ouverte (ilots/entete/CadreSession.vue)
    try {
        sessionStorage.setItem(CLE_CONNEXION_RECENTE, '1');
    } catch {
        /* stockage indisponible */
    }
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
