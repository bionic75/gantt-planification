<!-- Cadre de la session (monté pendant la session dans #cadreSession) : favicon choisi dans l'administration (appliqué à
     l'ouverture de la session et quand il est modifié), fenêtre des nouveautés de l'aide après une connexion (pas après
     un rechargement de la page), une fois par publication de l'aide. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '@/api/client';
import AppModal from '@/composants/AppModal.vue';
import { ecouter } from '@/evenements';
import { useSessionStore } from '@/stores/session';
import { appliquerFavicon, CLE_CONNEXION_RECENTE, extraireNouveautes } from './cadre';

interface Parametres {
    favicon?: string;
    help_publication_enabled?: string;
    help_publication_version?: string;
    help_publication_timestamp?: string;
}

const session = useSessionStore();
const nouveautes = ref<{ version: string; contenu: string } | null>(null);

/** Connexion par la mire juste avant le montage (repère posé par la mire, frontend/src/connexion) */
function connexionRecente(): boolean {
    try {
        const recente = sessionStorage.getItem(CLE_CONNEXION_RECENTE) === '1';
        sessionStorage.removeItem(CLE_CONNEXION_RECENTE);
        return recente;
    } catch {
        return false;
    }
}

/** Nouveautés de la version publiée, une fois par publication et par utilisateur */
async function afficherNouveautes(p: Parametres) {
    const version = p.help_publication_version || '';
    if (p.help_publication_enabled !== 'true' || !version) return;
    const s = await session.charger();
    const vue = `help_seen_${s.userId}_${p.help_publication_timestamp || version}`;
    try {
        if (localStorage.getItem(vue)) return;
        localStorage.setItem(vue, 'true');
    } catch {
        /* stockage indisponible : affichée à chaque connexion */
    }
    let contenu = `<p>Consultez la page d'aide pour les détails de la version ${version}.</p>`;
    try {
        contenu = extraireNouveautes(await (await fetch('/aide.html')).text(), version) ?? contenu;
    } catch {
        /* contenu par défaut */
    }
    nouveautes.value = { version, contenu };
}

function aideComplete() {
    window.open('/aide.html#section-notes-version', '_blank', 'width=1200,height=800');
}

const arreter = ecouter('favicon-modifie', d => appliquerFavicon(d.favicon));

onMounted(async () => {
    const recente = connexionRecente();
    try {
        const p = await api.get<Parametres>('/settings');
        if (p.favicon) appliquerFavicon(p.favicon);
        if (recente) await afficherNouveautes(p);
    } catch {
        /* favicon et nouveautés inchangés */
    }
});
onBeforeUnmount(arreter);
</script>

<template>
    <AppModal
        id="helpVersionModal"
        class="gp-nouveautes"
        :opened="!!nouveautes"
        :title="`🆕 Nouveautés de la version ${nouveautes?.version ?? ''}`"
        @close="nouveautes = null"
    >
        <!-- Contenu de l'aide en ligne (aide.html, personnalisable par l'administration), repris tel quel -->
        <!-- eslint-disable-next-line vue/no-v-html -- bloc de l'aide de l'application (décision du lot 6.2b) -->
        <div id="helpVersionModalContent" class="gp-nouveautes__contenu" v-html="nouveautes?.contenu"></div>
        <template #footer>
            <button type="button" class="gp-nouveautes__bouton" @click="nouveautes = null">
                ✅ J'ai pris connaissance des nouveautés
            </button>
            <button type="button" class="gp-nouveautes__bouton gp-nouveautes__bouton--aide" @click="aideComplete">
                📖 Voir l'aide complète
            </button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.gp-nouveautes .gp-modale__boite {
    width: min(900px, 100%);
    max-height: 85vh;
    overflow-y: auto;
}
.gp-nouveautes__contenu {
    padding: 12px 0;
}
.gp-nouveautes__bouton {
    background-color: #1d70b7;
    color: white;
}
.gp-nouveautes__bouton--aide {
    background-color: #5c6bc0;
}
</style>
