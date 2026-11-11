<!-- Barre d'onglets de la Planification (cadre de l'application, monté pendant la session dans #barreOnglets, devant
     les boutons de l'en-tête) : onglets accessibles au profil, ordre choisi par glisser-déposer (mémorisé dans le
     navigateur pour l'utilisateur), pastille des CRA en cours ; chaque onglet ouvre son adresse (onglet d'arrivée et
     adresse demandée : ilots/navigation). Identifiants de l'ancienne barre conservés (data-tab, #craTabBtn,
     #craPendingBadge…). -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ONGLETS } from '@/ilots/onglets';
import { useSessionStore } from '@/stores/session';
import { ordreMemorise, memoriserOrdre, reordonner } from './ordre';
import { craVisible, navigation, ONGLETS_CONFIGURABLES, ouvrirOnglet, peut } from './navigation';

/** Identifiants de l'ancienne barre (repères des tests et de l'aide) */
const IDENTIFIANTS: Record<string, string> = {
    evenements: 'evenementsTabBtn',
    tripadvisor: 'tripadvisorTabBtn',
    cra: 'craTabBtn',
    reporting: 'reportingTab',
    admin: 'adminTab',
    astreintesGestion: 'astreintesGestionTab'
};
/** Ordre d'origine de la barre */
const ORDRE_ORIGINE = [
    'resources',
    'evenements',
    'planning',
    'tripadvisor',
    'cra',
    'reporting',
    'admin',
    'astreintesGestion'
];

const magasin = useSessionStore();
const ordre = ref<string[]>([...ORDRE_ORIGINE]);
const glisse = ref<string | null>(null);
const survole = ref<string | null>(null);

const visible = (cle: string) => {
    const s = navigation.session;
    if (!s) return false;
    return cle === 'cra' ? craVisible(navigation.config, s) : peut(navigation.config, s.activeProfile, cle);
};
const onglets = computed(() => ordre.value.filter(c => (ONGLETS_CONFIGURABLES as readonly string[]).includes(c)));

function choisir(cle: string) {
    ouvrirOnglet(cle);
}

// ── Glisser-déposer ──────────────────────────────────────────────────────────

function debut(e: DragEvent, cle: string) {
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cle);
    }
    // Fantôme capturé avant l'opacité de l'onglet déplacé
    setTimeout(() => (glisse.value = cle), 0);
}
function survol(e: DragEvent, cle: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    survole.value = cle !== glisse.value ? cle : null;
}
function depot(e: DragEvent, cle: string) {
    e.preventDefault();
    const source = glisse.value ?? e.dataTransfer?.getData('text/plain') ?? null;
    if (source && source !== cle) {
        ordre.value = reordonner(ordre.value, source, cle);
        if (navigation.session) memoriserOrdre(navigation.session.userId, ordre.value);
    }
    fin();
}
function fin() {
    glisse.value = null;
    survole.value = null;
}

// ── Session relue (photo, profil) ────────────────────────────────────────────

watch(
    () => magasin.session,
    s => {
        if (s) navigation.session = s;
    }
);

onMounted(async () => {
    const s = await magasin.charger().catch(() => null);
    if (s) ordre.value = ordreMemorise(s.userId, ORDRE_ORIGINE);
});
</script>

<template>
    <template v-for="cle in onglets" :key="cle">
        <button
            v-show="visible(cle)"
            :id="IDENTIFIANTS[cle]"
            type="button"
            class="tab-btn"
            :class="{
                active: navigation.onglet === cle,
                'tab-dragging': glisse === cle,
                'tab-drag-over': survole === cle,
                'gp-onglet--cra': cle === 'cra'
            }"
            draggable="true"
            :data-tab="cle"
            @click="choisir(cle)"
            @dragstart="debut($event, cle)"
            @dragover="survol($event, cle)"
            @drop="depot($event, cle)"
            @dragend="fin"
        >
            <!-- eslint-disable vue/no-v-html -- tracés fixes de l'application -->
            <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true" v-html="ONGLETS[cle]?.traces ?? ''"></svg
            ><!-- eslint-enable vue/no-v-html --><span v-if="cle === 'cra'" id="craTabLabel">CRA</span
            ><template v-else>{{ ONGLETS[cle]?.libelle }}</template>
            <span v-if="cle === 'cra' && navigation.pastilleCra > 0" id="craPendingBadge" class="gp-onglet__pastille">{{
                navigation.pastilleCra
            }}</span>
        </button>
    </template>
</template>

<style>
.gp-onglet--cra {
    position: relative;
}
.gp-onglet__pastille {
    display: inline-block;
    position: absolute;
    top: -8px;
    right: -8px;
    background: #e74c3c;
    color: white;
    border-radius: 50%;
    min-width: 18px;
    height: 18px;
    font-size: 10px;
    font-weight: bold;
    line-height: 18px;
    text-align: center;
    padding: 0 3px;
    border: 2px solid #2c3e50;
}
</style>
