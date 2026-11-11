<!-- Aide à l'affectation › onglet « Événements » : événements des activités suivies (visite métier, mise en service…)
     pour les SAMU du planning des déploiements ; filtres, recherche, tri, comparaison avec le planning ; suppression et
     doublons (administrateur). Sous-îlot dans le conteneur de l'application, encore construit par l'ancien code. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiAffectation, type ActiviteSuivie, type EvenementAffectation } from '@/api/affectation';
import { apiEvenements } from '@/api/evenements';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import FenetreDoublons from '@/ilots/evenements/FenetreDoublons.vue';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { emettre } from '@/evenements';
import { useSessionStore } from '@/stores/session';
import {
    aujourdhui,
    basculerTri,
    comparaisonPlanning,
    confirmationSuppression,
    datesEvenement,
    demiJournee,
    filtrer,
    nomsParticipants,
    samusPresents,
    trier,
    type ColonneEvenements,
    type FiltresEvenements,
    type TriEvenements
} from './evenements';

const sessionStore = useSessionStore();
const evenements = ref<EvenementAffectation[] | null>(null);
const activites = ref<ActiviteSuivie[]>([]);
const erreur = ref('');
const message = ref('');
const annonce = ref('');
const doublons = ref(false);
const { demande, repondre, confirmer } = fournirConfirmation();

// Filtres et tri conservés d'une ouverture de l'onglet à l'autre, comme l'ancien écran
const filtres = ref<FiltresEvenements>({ samu: '', stage: '', q: '' });
const tri = ref<TriEvenements>({ k: 'start', dir: 1 });

const admin = computed(() => sessionStore.estAdmin);
const samus = computed(() => samusPresents(evenements.value ?? []));
const liste = computed(() => trier(filtrer(evenements.value ?? [], filtres.value), tri.value));
const jour = aujourdhui();

const COLONNES: [ColonneEvenements, string][] = [
    ['samu', 'SAMU'],
    ['type', 'Type'],
    ['label', 'Intitulé'],
    ['start', 'Dates'],
    ['part', 'Participants'],
    ['plan', 'Planning des déploiements']
];

async function charger() {
    erreur.value = '';
    try {
        const r = await apiAffectation.evenements();
        evenements.value = r.events;
        activites.value = r.stages;
    } catch (e) {
        erreur.value = e instanceof Error ? e.message : String(e);
    }
}

let finAnnonce: ReturnType<typeof setTimeout> | undefined;
function annoncer(texte: string) {
    annonce.value = texte;
    clearTimeout(finAnnonce);
    finAnnonce = setTimeout(() => (annonce.value = ''), 4000);
}
onBeforeUnmount(() => clearTimeout(finAnnonce));

/** Suppression (administrateur) : la planification posée par l'affectation est remise en situation par le serveur */
async function supprimer(e: EvenementAffectation) {
    if (!(await confirmer(confirmationSuppression(e), 'Supprimer'))) return;
    try {
        await apiEvenements.supprimer(e.id);
        emettre('evenements-modifies');
        annoncer(`Événement « ${e.label} » supprimé.`);
        await charger();
    } catch (x) {
        message.value = x instanceof Error ? x.message : String(x);
    }
}

async function ouvrir() {
    await sessionStore.charger();
    await charger();
}

onMounted(() => void ouvrir());
surReouverture(() => void charger());
</script>

<template>
    <h2 class="aff-ev__titre">Événements des déploiements</h2>
    <p class="aff-muted aff-ev__intro">
        Visite métier, Mise en service, Mise en production, VFT, Accompagnement post démarrage, Vérification des
        prérequis et Formation des utilisateurs — uniquement pour les SAMU-SAS du planning des déploiements.
    </p>
    <div id="affEvBody">
        <p v-if="erreur" class="aff-ev__erreur">{{ erreur }}</p>
        <p v-else-if="!evenements" class="aff-muted">Chargement…</p>
        <template v-else>
            <div class="aff-ev__filtres">
                <div>
                    <label class="lbl" for="affEvSamu">SAMU</label>
                    <select id="affEvSamu" v-model="filtres.samu" class="aff-ev__liste">
                        <option value="">Tous</option>
                        <option v-for="s in samus" :key="s" :value="s">{{ s }}</option>
                    </select>
                </div>
                <div>
                    <label class="lbl" for="affEvType">Type d'événement</label>
                    <select id="affEvType" v-model="filtres.stage" class="aff-ev__liste aff-ev__liste--large">
                        <option value="">Tous</option>
                        <option v-for="a in activites" :key="a.key" :value="a.key">{{ a.label }}</option>
                    </select>
                </div>
                <div class="aff-ev__recherche">
                    <label class="lbl" for="affEvRecherche">Recherche</label>
                    <input
                        id="affEvRecherche"
                        v-model="filtres.q"
                        type="text"
                        placeholder="SAMU, intitulé, participant…"
                        class="aff-ev__champ"
                    />
                </div>
                <span class="aff-muted aff-ev__compte"
                    >{{ liste.length }} événement{{ liste.length > 1 ? 's' : '' }}</span
                >
                <button
                    v-if="admin"
                    type="button"
                    class="aff-btn aff-ev__doublons"
                    title="Rechercher les doublons certains et probables parmi ces événements"
                    @click="doublons = true"
                >
                    <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" /></svg
                    >Rechercher les doublons
                </button>
            </div>

            <div v-if="liste.length" class="aff-ev__defilement">
                <table class="aff-ev__tableau">
                    <thead>
                        <tr>
                            <th
                                v-for="[k, libelle] in COLONNES"
                                :key="k"
                                class="aff-ev__entete"
                                title="Trier"
                                :aria-sort="tri.k === k ? (tri.dir > 0 ? 'ascending' : 'descending') : undefined"
                                @click="tri = basculerTri(tri, k)"
                            >
                                {{ libelle }}
                                <span v-if="tri.k === k" :key="`${k}${tri.dir}`">{{ tri.dir > 0 ? '▲' : '▼' }}</span>
                                <span v-else class="aff-ev__sans-tri">▲▼</span>
                            </th>
                            <th v-if="admin" class="aff-ev__entete-action"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="e in liste" :key="e.id" :class="{ 'aff-ev__passe': e.end < jour }">
                            <td class="aff-ev__samu">{{ e.samu }}</td>
                            <td>
                                <span
                                    class="aff-ev__type"
                                    :style="{ background: e.type.bg, color: e.type.color, borderColor: e.type.border }"
                                    >{{ e.type.label }}</span
                                >
                            </td>
                            <td>{{ e.label }}</td>
                            <td class="aff-ev__dates">
                                {{ datesEvenement(e)
                                }}<span v-if="demiJournee(e.period)" class="aff-muted">
                                    ({{ demiJournee(e.period) }})</span
                                >
                            </td>
                            <td>
                                <span v-if="e.participants.length" :title="nomsParticipants(e).join(', ')"
                                    >{{ e.participants.length }} · {{ nomsParticipants(e).slice(0, 3).join(', ')
                                    }}{{ e.participants.length > 3 ? '…' : '' }}</span
                                >
                                <span v-else class="aff-muted">—</span>
                            </td>
                            <td class="aff-ev__plan">
                                <span v-if="comparaisonPlanning(e) === 'memes-dates'" class="aff-ev__ok"
                                    >✔ mêmes dates</span
                                >
                                <span v-else-if="comparaisonPlanning(e) === 'autres-dates'" class="aff-ev__alerte"
                                    >⚠ activité prévue : {{ datesEvenement(e.planned!) }}</span
                                >
                                <span v-else class="aff-muted">activité non datée</span>
                            </td>
                            <td v-if="admin" class="aff-ev__action">
                                <button
                                    type="button"
                                    class="aff-icon-btn aff-ev__supprimer"
                                    title="Supprimer cet événement"
                                    :aria-label="`Supprimer l'événement ${e.label}`"
                                    @click="supprimer(e)"
                                >
                                    <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                                        <path
                                            d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"
                                        />
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p v-else class="aff-muted">Aucun événement pour ces critères.</p>
        </template>
    </div>

    <div v-if="annonce" class="aff-toast" role="status">{{ annonce }}</div>
    <FenetreDoublons
        v-if="doublons"
        id="affDupModal"
        :evenements="(evenements ?? []).map(e => e.id)"
        @close="doublons = false"
        @modifies="charger()"
    />
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
#affectationEventsTab th::after {
    content: none !important;
}
.aff-ev__titre {
    margin: 0 0 4px;
}
.aff-ev__intro {
    margin: 0 0 12px;
}
.aff-ev__erreur {
    color: #b3261e;
}
.aff-ev__filtres {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-bottom: 12px;
}
.aff-ev__liste {
    padding: 7px;
    min-width: 170px;
}
.aff-ev__liste--large {
    min-width: 240px;
}
.aff-ev__recherche {
    flex: 1;
    min-width: 180px;
}
.aff-ev__champ {
    width: 100%;
    padding: 7px;
    box-sizing: border-box;
}
.aff-ev__compte {
    padding-bottom: 8px;
}
.aff-ev__doublons {
    margin-left: auto;
}
.aff-ev__defilement {
    overflow-x: auto;
}
.aff-ev__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.aff-ev__tableau thead tr {
    text-align: left;
    font-size: 11px;
}
.aff-ev__entete {
    padding: 6px 8px;
    cursor: pointer;
    user-select: none;
}
.aff-ev__entete-action {
    padding: 6px 8px;
}
.aff-ev__sans-tri {
    opacity: 0.4;
}
.aff-ev__tableau tbody tr {
    border-top: 1px solid #eef1f6;
}
.aff-ev__tableau td {
    padding: 8px;
}
.aff-ev__passe {
    opacity: 0.7;
}
.aff-ev__samu {
    font-weight: 700;
    white-space: nowrap;
}
.aff-ev__type {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid;
}
.aff-ev__dates {
    white-space: nowrap;
}
.aff-ev__tableau td.aff-ev__plan {
    font-size: 12px;
}
.aff-ev__ok {
    color: #1b7f3b;
}
.aff-ev__alerte {
    color: #b26a00;
}
.aff-ev__tableau td.aff-ev__action {
    text-align: right;
}
.aff-ev__supprimer {
    background: #d60b51;
}
</style>
