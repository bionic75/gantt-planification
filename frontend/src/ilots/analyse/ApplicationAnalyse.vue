<!-- Application « Analyse de fichiers » (menu Applications), à l'adresse /analyse (#analyseContainer) :
     en-tête et pastilles communs, chargement d'un fichier (lu dans le navigateur, rien n'est envoyé ; fichier
     conservable dans le navigateur), structure, filtres, colonnes affichées, doublons, tableau paginé, export CSV.
     Identifiants de l'ancien écran conservés. -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Session } from '@/api/types';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import EnTeteApplication from '@/ilots/applications/EnTeteApplication.vue';
import PastillesApplication from '@/ilots/applications/PastillesApplication.vue';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { deconnecterDepuisApplication } from '@/ilots/navigation/navigation';
import { useSessionStore } from '@/stores/session';
import { csvAnalyse, nombreFr, nomExport } from './filtres';
import { FORMAT_NON_SUPPORTE, lignesDuFichier, lireFichier, natureFichier } from './lecture';
import { useAnalyseStore } from './magasin';
import PanneauFiltres from './PanneauFiltres.vue';
import PanneauStructure from './PanneauStructure.vue';
import { fichierConserve } from './stockage';
import TableauAnalyse from './TableauAnalyse.vue';

const sessionStore = useSessionStore();
const session = ref<Session | null>(null);
const magasin = useAnalyseStore();
const message = ref('');
const { demande, repondre, confirmer } = fournirConfirmation();
const pastilles = ref<InstanceType<typeof PastillesApplication> | null>(null);

// ── Chargement ───────────────────────────────────────────────────────────────

const champFichier = ref<HTMLInputElement | null>(null);
const enCours = ref(false);
const survol = ref(false);
const conserver = ref(false);
const conserve = ref<string | null>(null);

async function lireConserve() {
    try {
        conserve.value = (await fichierConserve.lire())?.name ?? null;
    } catch {
        /* stockage du navigateur indisponible */
    }
}

/** Fichier lu dans le navigateur ; conservé si demandé */
async function charger(fichier: File, contenu?: ArrayBuffer) {
    if (!natureFichier(fichier.name)) {
        message.value = FORMAT_NON_SUPPORTE;
        return;
    }
    enCours.value = true;
    try {
        const buffer = contenu ?? (await fichier.arrayBuffer());
        const lu = await lireFichier(fichier.name, buffer);
        const lignes = lignesDuFichier(lu);
        if (!lignes.length) throw new Error('Le fichier ne contient pas de données');
        magasin.ouvrirFichier(lu, lignes, fichier.name);
        if (conserver.value) {
            void fichierConserve
                .enregistrer(fichier.name, buffer)
                .then(lireConserve)
                .catch(() => {});
        }
    } catch (e) {
        message.value = `Erreur lors du chargement : ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        enCours.value = false;
    }
}

function choisir(e: Event) {
    const fichier = (e.target as HTMLInputElement).files?.[0];
    if (fichier) void charger(fichier);
}

function deposer(e: DragEvent) {
    survol.value = false;
    const fichier = e.dataTransfer?.files?.[0];
    if (fichier) void charger(fichier);
}

async function chargerConserve() {
    try {
        const r = await fichierConserve.lire();
        if (!r) return;
        await charger(new File([r.buffer], r.name), r.buffer);
    } catch (e) {
        message.value = `Impossible de charger le fichier sauvegardé : ${e instanceof Error ? e.message : String(e)}`;
    }
}

async function supprimerConserve() {
    await fichierConserve.supprimer();
    conserve.value = null;
    conserver.value = false;
}

// ── Espace d'analyse ─────────────────────────────────────────────────────────

const structureOuverte = ref(false);
const colonnesOuvertes = ref(false);
const doublonsOuverts = ref(false);
const filtresVisibles = ref(true);

/** Nouveau fichier intégré : panneau des doublons refermé */
watch(
    () => magasin.integrations,
    () => (doublonsOuverts.value = false)
);

function nouveauFichier() {
    magasin.reinitialiser();
    structureOuverte.value = false;
    doublonsOuverts.value = false;
    if (champFichier.value) champFichier.value.value = '';
}

const encodageWindows = computed(() => /Windows|Latin/.test(magasin.encodage ?? ''));
const doublons = computed(() => {
    const n = magasin.lignesEnDoublon;
    if (n === null) return '';
    return n > 0 ? `${nombreFr(n)} ligne(s) en doublon` : 'Aucun doublon détecté';
});

function exporter() {
    if (!magasin.filtrees.length) {
        message.value = 'Aucune donnée à exporter';
        return;
    }
    const blob = new Blob([csvAnalyse(magasin.filtrees, magasin.affichees)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomExport();
    lien.click();
    URL.revokeObjectURL(url);
}

// ── Cadre ────────────────────────────────────────────────────────────────────

async function deconnexion() {
    if (!(await confirmer('Voulez-vous vraiment vous déconnecter ?', 'Confirmer'))) return;
    void deconnecterDepuisApplication();
}

/** Session relue (photo de profil, profil actif) ; fichier conservé proposé */
async function ouvrir() {
    sessionStore.oublier();
    session.value = await sessionStore.charger();
    void lireConserve();
}

onMounted(() => void ouvrir());
surReouverture(() => {
    void ouvrir();
    void pastilles.value?.relire();
});
</script>

<template>
    <PastillesApplication ref="pastilles" prefixe="analyse" />

    <EnTeteApplication titre="Analyse de fichiers" prefixe="analyse" :session="session" @deconnexion="deconnexion">
        <template #onglets>
            <button type="button" class="tab-btn active">📊 Analyse de fichiers</button>
        </template>
    </EnTeteApplication>

    <div class="ana-app__fichier">
        <span id="analyseFileName" class="ana-app__nom">
            <template v-if="magasin.charge"
                >📄 {{ magasin.nomFichier }}{{ magasin.encodage ? ` — encodage : ${magasin.encodage}` : '' }}</template
            >
        </span>
        <span id="analyseStatsHeader" class="ana-app__stats">
            <template v-if="magasin.charge"
                >{{ nombreFr(magasin.filtrees.length) }} / {{ nombreFr(magasin.lignes.length) }} lignes</template
            >
        </span>
        <button
            v-if="magasin.charge"
            id="analyseResetBtn"
            type="button"
            class="ana-app__nouveau"
            @click="nouveauFichier"
        >
            🔄 Nouveau fichier
        </button>
    </div>

    <!-- Chargement -->
    <div v-show="!magasin.charge" id="analyseDropZone" class="ana-app__depot">
        <div class="ana-app__carte">
            <div class="ana-app__icone" aria-hidden="true">📂</div>
            <h2 class="ana-app__titre">Charger un fichier</h2>
            <p class="ana-app__formats">
                Formats acceptés : .xlsx, .xls, .csv, .txt<br />Le fichier reste sur votre poste — aucune donnée n'est
                envoyée.
            </p>
            <button
                v-show="!enCours"
                id="analyseDropTarget"
                type="button"
                class="ana-app__cible"
                :class="{ 'ana-app__cible--survol': survol }"
                @dragover.prevent="survol = true"
                @dragleave="survol = false"
                @drop.prevent="deposer"
                @click="champFichier?.click()"
            >
                Glissez votre fichier ici<br /><span class="ana-app__parcourir">ou cliquez pour parcourir</span>
            </button>
            <input
                id="analyseFileInput"
                ref="champFichier"
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv"
                class="ana-app__champ"
                @change="choisir"
            />
            <div v-if="enCours" id="analyseLoadProgress" class="ana-app__progression" role="status">
                ⏳ Chargement en cours…
            </div>
            <div v-if="conserve" id="analyseSavedFileBar" class="ana-app__conserve">
                <span>💾 Fichier sauvegardé :</span>
                <span id="analyseSavedFileName" class="ana-app__conserve-nom">{{ conserve }}</span>
                <button type="button" class="ana-app__charger" @click="chargerConserve">Charger</button>
                <button type="button" class="ana-app__supprimer" @click="supprimerConserve">Supprimer</button>
            </div>
            <label class="ana-app__conserver">
                <input id="analyseSaveLocalChk" v-model="conserver" type="checkbox" class="ana-app__case" />
                Conserver ce fichier localement (rechargement sans importation)
            </label>
        </div>
    </div>

    <!-- Analyse -->
    <div v-if="magasin.charge" id="analyseWorkspace" class="ana-app__espace">
        <div
            v-if="magasin.encodage"
            id="analyseEncodingBanner"
            class="ana-app__encodage"
            :class="encodageWindows ? 'ana-app__encodage--windows' : 'ana-app__encodage--utf8'"
        >
            <span :key="String(encodageWindows)"
                >{{ encodageWindows ? '⚠️' : '✅' }} Encodage détecté : <strong>{{ magasin.encodage }}</strong
                >{{ encodageWindows ? ' — les accents ont été corrigés automatiquement' : '' }}</span
            >
        </div>

        <div class="ana-app__outils">
            <div class="ana-app__actions">
                <span class="ana-app__libelle">🔍 Filtres actifs :</span>
                <span
                    id="analyseActiveFiltersCount"
                    class="ana-app__compteur"
                    :class="{ 'ana-app__compteur--actif': magasin.nombreFiltres > 0 }"
                    >{{ magasin.nombreFiltres > 0 ? `${magasin.nombreFiltres} filtre(s)` : 'Aucun' }}</span
                >
                <button type="button" class="ana-app__effacer" @click="magasin.effacerFiltres()">✕ Tout effacer</button>
                <button type="button" class="ana-app__exporter" @click="exporter">⬇ Export CSV</button>
                <button type="button" class="ana-app__colonnes" @click="colonnesOuvertes = !colonnesOuvertes">
                    ⚙ Colonnes
                </button>
                <button
                    id="analyseStructBtn"
                    type="button"
                    class="ana-app__structure"
                    @click="structureOuverte = !structureOuverte"
                >
                    🧬 Structure
                </button>
                <button
                    id="analyseDupBtn"
                    type="button"
                    class="ana-app__doublons"
                    @click="doublonsOuverts = !doublonsOuverts"
                >
                    🔁 Doublons
                </button>
                <button
                    id="analyseFilterToggleBtn"
                    type="button"
                    class="ana-app__replier"
                    title="Afficher / masquer les filtres"
                    aria-label="Afficher/masquer les filtres"
                    :aria-expanded="filtresVisibles"
                    @click="filtresVisibles = !filtresVisibles"
                >
                    <span :key="String(filtresVisibles)">{{ filtresVisibles ? '▲' : '▼' }}</span>
                </button>
            </div>

            <div v-if="structureOuverte" id="analyseStructPanel" class="ana-app__panneau-structure">
                <PanneauStructure :key="magasin.integrations" />
            </div>

            <div v-if="colonnesOuvertes" id="analyseColumnsPanel" class="ana-app__panneau-colonnes">
                <div class="ana-app__panneau-titre">Colonnes affichées :</div>
                <div id="analyseColumnCheckboxes" class="ana-app__puces">
                    <label
                        v-for="c in magasin.entetes"
                        :key="c"
                        class="ana-app__puce"
                        :class="{ 'ana-app__puce--cochee': magasin.visibles.includes(c) }"
                    >
                        <input
                            type="checkbox"
                            class="ana-app__case"
                            :checked="magasin.visibles.includes(c)"
                            @change="magasin.afficherColonne(c, ($event.target as HTMLInputElement).checked)"
                        />
                        {{ c }}
                    </label>
                </div>
            </div>

            <div v-if="doublonsOuverts" id="analyseDupPanel" class="ana-app__panneau-doublons">
                <div class="ana-app__doublons-entete">
                    <span class="ana-app__doublons-titre">🔁 Détection des doublons — colonnes de comparaison :</span>
                    <button type="button" class="ana-app__tout-cocher" @click="magasin.comparerToutes(true)">
                        Tout cocher
                    </button>
                    <button type="button" class="ana-app__tout-decocher" @click="magasin.comparerToutes(false)">
                        Tout décocher
                    </button>
                    <span id="analyseDupCount" class="ana-app__doublons-compte">{{ doublons }}</span>
                </div>
                <div id="analyseDupCheckboxes" class="ana-app__puces">
                    <label
                        v-for="c in magasin.entetes"
                        :key="c"
                        class="ana-app__puce-doublon"
                        :class="{ 'ana-app__puce-doublon--cochee': magasin.colonnesDoublons.includes(c) }"
                    >
                        <input
                            type="checkbox"
                            class="ana-app__case"
                            :checked="magasin.colonnesDoublons.includes(c)"
                            @change="magasin.comparerColonne(c, ($event.target as HTMLInputElement).checked)"
                        /><span>{{ c }}</span>
                    </label>
                </div>
            </div>

            <div v-show="filtresVisibles" id="analyseFiltersPanel" class="ana-app__filtres">
                <PanneauFiltres />
            </div>
        </div>

        <TableauAnalyse />
    </div>

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
.ana-app__fichier {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 24px;
    background: #fff;
    border-bottom: 1px solid #e0e6ef;
}
.ana-app__nom {
    font-size: 13px;
    color: #1a237e;
    font-weight: 600;
}
.ana-app__stats {
    font-size: 12px;
    color: #5c6b8a;
    margin-left: auto;
}
.ana-app__nouveau {
    background: #1a237e;
    border: none;
    color: white;
    padding: 6px 14px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 12px;
}
.ana-app__depot {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 180px);
    padding: 40px;
}
.ana-app__carte {
    background: white;
    border-radius: 16px;
    padding: 60px 80px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
    text-align: center;
    max-width: 600px;
    width: 100%;
    box-sizing: border-box;
}
.ana-app__icone {
    font-size: 64px;
    margin-bottom: 20px;
}
.ana-app__titre {
    color: #1a237e;
    margin-bottom: 10px;
}
.ana-app__formats {
    color: #666;
    margin-bottom: 24px;
    font-size: 14px;
}
.ana-app__cible {
    display: block;
    width: 100%;
    border: 3px dashed #90caf9;
    border-radius: 12px;
    padding: 40px;
    background: #f3f8ff;
    margin-bottom: 20px;
    cursor: pointer;
    transition: all 0.2s;
    color: #3f51b5;
    font-size: 15px;
}
.ana-app__cible--survol {
    border-color: #3f51b5;
    background: #e8eaf6;
}
.ana-app__parcourir {
    font-size: 13px;
    color: #90a4ae;
}
.ana-app__champ {
    display: none;
}
.ana-app__progression {
    background: #e3f2fd;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    color: #1565c0;
    font-size: 13px;
}
.ana-app__conserve {
    margin-top: 16px;
    background: #e8f5e9;
    border: 1px solid #a5d6a7;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #2e7d32;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.ana-app__conserve-nom {
    font-weight: bold;
}
.ana-app__charger {
    background: #388e3c;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    margin-left: auto;
}
.ana-app__supprimer {
    background: none;
    border: 1px solid #e57373;
    color: #c62828;
    padding: 4px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
}
.ana-app__conserver {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    font-size: 12px;
    color: #666;
    cursor: pointer;
    justify-content: center;
}
.ana-app__case {
    cursor: pointer;
    width: auto;
    display: inline-block;
    flex: none;
    margin: 0;
}
.ana-app__espace {
    padding: 16px 20px;
}
.ana-app__encodage {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid;
    margin-bottom: 12px;
    flex-wrap: wrap;
    font-size: 13px;
}
.ana-app__encodage--windows {
    background: #fff8e1;
    border-color: #ffca28;
}
.ana-app__encodage--utf8 {
    background: #e8f5e9;
    border-color: #66bb6a;
}
.ana-app__outils {
    background: white;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 14px;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
}
.ana-app__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
}
.ana-app__libelle {
    font-weight: bold;
    color: #1a237e;
    font-size: 14px;
}
.ana-app__compteur {
    background: #e8eaf6;
    color: #3f51b5;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: bold;
}
.ana-app__compteur--actif {
    background: #3f51b5;
    color: white;
}
.ana-app__actions button {
    color: white;
    border: none;
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
}
.ana-app__actions .ana-app__effacer {
    margin-left: auto;
    background: #ef5350;
}
.ana-app__actions .ana-app__exporter {
    background: #2e7d32;
}
.ana-app__actions .ana-app__colonnes {
    background: #5c6bc0;
}
.ana-app__actions .ana-app__structure {
    background: #00897b;
}
.ana-app__actions .ana-app__doublons {
    background: #ec407a;
}
.ana-app__actions .ana-app__replier {
    background: #7986cb;
    padding: 5px 12px;
    font-size: 14px;
}
.ana-app__panneau-structure {
    background: #e0f2f1;
    border: 1px solid #80cbc4;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
}
.ana-app__panneau-colonnes {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
}
.ana-app__panneau-titre {
    font-size: 12px;
    color: #555;
    margin-bottom: 8px;
    font-weight: bold;
}
.ana-app__puces {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.ana-app__puce {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    background: #fff;
    padding: 3px 8px;
    border-radius: 12px;
    cursor: pointer;
    border: 1px solid #c5cae9;
}
.ana-app__puce--cochee {
    background: #e8eaf6;
}
.ana-app__panneau-doublons {
    background: #fce4ec;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid #f48fb1;
}
.ana-app__doublons-entete {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 8px;
}
.ana-app__doublons-titre {
    font-size: 12px;
    font-weight: bold;
    color: #880e4f;
}
.ana-app__tout-cocher,
.ana-app__tout-decocher {
    background: none;
    padding: 2px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 11px;
}
.ana-app__tout-cocher {
    border: 1px solid #e91e63;
    color: #e91e63;
}
.ana-app__tout-decocher {
    border: 1px solid #999;
    color: #666;
}
.ana-app__doublons-compte {
    margin-left: auto;
    font-size: 12px;
    font-weight: bold;
    color: #c62828;
}
.ana-app__puce-doublon {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #fff;
    border: 1px solid #f48fb1;
    border-radius: 12px;
    padding: 3px 10px;
    cursor: pointer;
    font-size: 11px;
    color: #880e4f;
    user-select: none;
    transition: background 0.1s;
}
.ana-app__puce-doublon--cochee {
    background: #f48fb1;
}
.ana-app__filtres {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
</style>
