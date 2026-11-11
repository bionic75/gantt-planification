<!-- Bandeau de mise en production (monté dès le chargement de la page, mire comprise, dans #bandeauMiseEnProduction) :
     version du serveur relue toutes les 30 secondes (onglet affiché ; aussi au retour sur l'onglet). Coupure prolongée :
     « mise en production en cours » ; nouvelle version : rechargement proposé, bandeau masquable pour cette version. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { suiviVersion, type EtatBandeau } from './cadre';

/** Intervalle des relectures (ms) et délai de la première (page initialisée) */
const INTERVALLE = 30000;
const PREMIERE = 5000;
const CLE_MASQUEE = 'deployDismissed';

const suivi = suiviVersion();
const etat = ref<EtatBandeau>({ type: 'aucun' });
let minuteur: ReturnType<typeof setTimeout> | undefined;
let intervalle: ReturnType<typeof setInterval> | undefined;

function versionMasquee(): string | null {
    try {
        return sessionStorage.getItem(CLE_MASQUEE);
    } catch {
        return null;
    }
}

async function verifier() {
    // Onglet en arrière-plan : vérification au retour
    if (document.hidden) return;
    try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { version } = (await r.json()) as { version: string };
        etat.value = suivi.lue(version, versionMasquee());
    } catch {
        etat.value = suivi.echec();
    }
}

function masquer() {
    if (etat.value.type === 'version') {
        try {
            sessionStorage.setItem(CLE_MASQUEE, etat.value.version);
        } catch {
            /* stockage indisponible */
        }
    }
    etat.value = suivi.masquer();
}

const recharger = () => location.reload();

const auRetour = () => {
    if (!document.hidden) void verifier();
};

onMounted(() => {
    document.addEventListener('visibilitychange', auRetour);
    minuteur = setTimeout(() => {
        void verifier();
        intervalle = setInterval(() => void verifier(), INTERVALLE);
    }, PREMIERE);
});
onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', auRetour);
    clearTimeout(minuteur);
    clearInterval(intervalle);
});
</script>

<template>
    <div
        v-if="etat.type !== 'aucun'"
        id="deployBanner"
        class="gp-bandeau-mep"
        :class="etat.type === 'coupure' ? 'gp-bandeau-mep--coupure' : 'gp-bandeau-mep--version'"
        role="status"
    >
        <!-- Texte recréé à chaque changement : pictogrammes remplacés par des icônes (decor/icones-emojis.ts) -->
        <span id="deployBannerText" :key="etat.type === 'version' ? etat.version : etat.type">{{
            etat.type === 'coupure'
                ? "⚙️  Mise en production en cours — l'application sera de nouveau disponible dans 1 à 2 minutes. Une reconnexion sera nécessaire."
                : `✅  Nouvelle version disponible (${etat.version}) — veuillez recharger la page et vous reconnecter.`
        }}</span>
        <button
            v-if="etat.type === 'version'"
            id="deployBannerReload"
            type="button"
            class="gp-bandeau-mep__recharger"
            @click="recharger"
        >
            🔄 Recharger
        </button>
        <button
            id="deployBannerClose"
            type="button"
            class="gp-bandeau-mep__masquer"
            title="Masquer ce message"
            aria-label="Masquer"
            @click="masquer"
        >
            ×
        </button>
    </div>
</template>

<style>
.gp-bandeau-mep {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 99999;
    padding: 14px 24px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    color: white;
    transition: background 0.3s;
}
.gp-bandeau-mep--coupure {
    background: #e65100;
}
.gp-bandeau-mep--version {
    background: #1b5e20;
}
.gp-bandeau-mep__recharger {
    margin-left: 18px;
    background: white;
    color: #1a237e;
    border: none;
    padding: 5px 16px;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 700;
    font-size: 13px;
}
.gp-bandeau-mep__masquer {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.18);
    color: white;
    border: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
}
</style>
