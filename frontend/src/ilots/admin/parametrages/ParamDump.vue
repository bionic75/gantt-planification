<!-- Dump complet et restauration : génération et téléchargement ; analyse d'un dump envoyé (progression, version,
     alertes, détail par table, options) ; restauration après saisie du nom du serveur et dernière confirmation -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiDump, type AnalyseDump } from '@/api/parametrages';
import AppModal from '@/composants/AppModal.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { useConfirmation } from '@/composants/confirmation';
import { lignesTables, messageRestauration, niveauVersion, notesColonnes, octets } from './calculs';

const confirmer = useConfirmation();

// ---------- Génération ----------
const generation = ref('');
const enGeneration = ref(false);

async function generer() {
    enGeneration.value = true;
    generation.value = '⏳ Génération en cours…';
    try {
        const { contenu, nom } = await apiDump.generer();
        const url = URL.createObjectURL(contenu);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = nom;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        generation.value = `✅ ${nom} (${octets(contenu.size)})`;
    } catch (e) {
        generation.value = `❌ ${(e as Error).message}`;
    } finally {
        enGeneration.value = false;
    }
}

// ---------- Analyse ----------
const champFichier = ref<HTMLInputElement | null>(null);
const envoi = ref<{ part: number; texte: string } | null>(null);
const analyse = ref<AnalyseDump | null>(null);
const erreurAnalyse = ref('');
const neutraliserEmails = ref(true);
const restaurerPdfs = ref(true);
const confirmation = ref('');
const restauration = ref<{ enCours: boolean; erreur: string }>({ enCours: false, erreur: '' });
const resultat = ref('');

const tables = computed(() => (analyse.value ? lignesTables(analyse.value) : []));
const notes = computed(() => (analyse.value ? notesColonnes(analyse.value) : []));
const nomServeur = computed(() => analyse.value?.current.hostname ?? '');
const confirmationValide = computed(() => !!analyse.value && confirmation.value === nomServeur.value);

function analyser() {
    const f = champFichier.value?.files?.[0];
    erreurAnalyse.value = '';
    if (!f) {
        erreurAnalyse.value = "Sélectionnez d'abord un fichier .gpdump.";
        return;
    }
    analyse.value = null;
    confirmation.value = '';
    restauration.value = { enCours: false, erreur: '' };
    envoi.value = { part: 0, texte: 'Envoi…' };
    apiDump
        .analyser(
            f,
            (n, total) => (envoi.value = { part: (n / total) * 100, texte: `Envoi ${octets(n)} / ${octets(total)}` }),
            () => envoi.value && (envoi.value = { ...envoi.value, texte: 'Analyse du dump…' })
        )
        .then(d => (analyse.value = d))
        .catch(e => (erreurAnalyse.value = `❌ ${(e as Error).message}`))
        .finally(() => (envoi.value = null));
}

function annuler() {
    const token = analyse.value?.token;
    if (token) void apiDump.abandonner(token).catch(() => {});
    analyse.value = null;
    confirmation.value = '';
    if (champFichier.value) champFichier.value.value = '';
}

async function restaurer() {
    const d = analyse.value;
    if (!d || !confirmationValide.value) return;
    const ok = await confirmer(
        'Dernière confirmation : la base de CE serveur va être entièrement remplacée par le contenu du dump.\n\nUne sauvegarde de sécurité est créée avant, et vous serez déconnecté ensuite.\n\nContinuer ?',
        'Restaurer'
    );
    if (!ok) return;
    restauration.value = { enCours: true, erreur: '' };
    try {
        const r = await apiDump.restaurer(d.token, confirmation.value, {
            neutralizeEmails: neutraliserEmails.value,
            restorePdfs: restaurerPdfs.value
        });
        analyse.value = null;
        resultat.value = messageRestauration(r);
    } catch (e) {
        restauration.value = { enCours: false, erreur: `❌ ${(e as Error).message}` };
    }
}

const dateLocale = (iso: string) => new Date(iso).toLocaleString('fr-FR');
const recharger = () => window.location.reload();
</script>

<template>
    <AppSousSectionAdmin titre="Dump complet & restauration (test avec données de production)" id-corps="subDump">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 3h6M10 3v6.2L4.5 19a1.6 1.6 0 0 0 1.4 2.4h12.2a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3" />
                <path d="M7.5 15h9" />
            </svg>
        </template>
        <div class="dump__avertissement">
            ⚠️ Le dump contient <strong>toutes les données</strong> (utilisateurs, hash de mots de passe, clés API,
            configuration SMTP, PDF des CRA). Conservez-le de façon sécurisée et ne le restaurez que sur un serveur de
            test.
        </div>

        <div class="dump__etape">
            <div class="dump__etape-titre">1. Créer un dump de ce serveur</div>
            <button
                id="dumpCreateBtn"
                type="button"
                class="export-btn dump__creer"
                :disabled="enGeneration"
                @click="generer"
            >
                📦 Générer et télécharger le dump complet
            </button>
            <span id="dumpCreateStatus" role="status" class="dump__statut">
                <span :key="generation">{{ generation }}</span>
            </span>
        </div>

        <div class="dump__etape">
            <div class="dump__etape-titre">2. Restaurer un dump sur ce serveur</div>
            <div class="dump__envoi">
                <label for="dumpFileInput" class="dump__masque">Fichier de dump (.gpdump)</label>
                <input id="dumpFileInput" ref="champFichier" type="file" accept=".gpdump" class="dump__fichier" />
                <button type="button" class="export-btn dump__analyser" @click="analyser">🔍 Analyser le dump</button>
            </div>
            <div v-if="envoi" id="dumpUploadProgress" class="dump__progression">
                <progress
                    id="dumpUploadBar"
                    class="dump__barre"
                    max="100"
                    :value="Math.round(envoi.part)"
                    aria-label="Envoi du dump"
                ></progress>
                <div id="dumpUploadLabel" class="dump__barre-texte">{{ envoi.texte }}</div>
            </div>
            <div id="dumpInspectResult" class="dump__resultat">
                <div v-if="erreurAnalyse" :key="erreurAnalyse" role="alert" class="dump__erreur">
                    {{ erreurAnalyse }}
                </div>
                <template v-if="analyse">
                    <div class="dump__resume">
                        <div class="dump__case">
                            <div class="dump__case-libelle">Fichier</div>
                            <strong>{{ analyse.filename }}</strong>
                            <div>{{ octets(analyse.fileSize) }} (base : {{ octets(analyse.manifest.db.size) }})</div>
                        </div>
                        <div class="dump__case">
                            <div class="dump__case-libelle">Date de sauvegarde</div>
                            <strong>{{ dateLocale(analyse.manifest.createdAt) }}</strong>
                            <div>par {{ analyse.manifest.createdBy?.nom || '—' }}</div>
                        </div>
                        <div
                            class="dump__case"
                            :class="`dump__case--version-${niveauVersion(analyse.versionRelation)}`"
                        >
                            <div class="dump__case-libelle">Version du site</div>
                            dump <strong>{{ analyse.manifest.appVersion || '?' }}</strong> → serveur
                            <strong>{{ analyse.current.appVersion || '?' }}</strong>
                        </div>
                        <div class="dump__case">
                            <div class="dump__case-libelle">Origine</div>
                            <strong>{{
                                analyse.manifest.source?.host || analyse.manifest.source?.hostname || '—'
                            }}</strong>
                            <div>
                                {{ analyse.manifest.totalRows }} lignes ·
                                {{ Object.keys(analyse.manifest.tables || {}).length }} tables ·
                                {{ (analyse.manifest.files || []).length }} PDF
                            </div>
                        </div>
                    </div>
                    <div
                        v-for="(w, i) in analyse.warnings || []"
                        :key="i"
                        class="dump__alerte"
                        :class="`dump__alerte--${w.level}`"
                    >
                        {{ w.text }}
                    </div>
                    <details class="dump__details">
                        <summary class="dump__details-titre">Détail par table (dump ↔ serveur actuel)</summary>
                        <table class="dump__tables">
                            <thead>
                                <tr>
                                    <th class="dump__table-nom">Table</th>
                                    <th>Dump</th>
                                    <th>Actuel</th>
                                    <th><span class="dump__masque">Remarque</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="l in tables" :key="l.table" :class="{ 'dump__ligne--ecart': l.ecart }">
                                    <td>{{ l.table }}</td>
                                    <td class="dump__nombre">{{ l.dump ?? '—' }}</td>
                                    <td class="dump__nombre">{{ l.actuel ?? '—' }}</td>
                                    <td class="dump__note">{{ l.note }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div v-if="notes.length" class="dump__notes">
                            <div v-for="n in notes" :key="n">{{ n }}</div>
                        </div>
                    </details>
                    <div class="dump__options">
                        <label class="dump__option">
                            <input id="dumpOptEmails" v-model="neutraliserEmails" type="checkbox" />
                            Neutraliser les emails sortants (vider la file d'attente et désactiver le SMTP importé) —
                            <strong>recommandé</strong>
                        </label>
                        <label class="dump__option">
                            <input id="dumpOptPdfs" v-model="restaurerPdfs" type="checkbox" />
                            Restaurer aussi les PDF des CRA ({{ (analyse.manifest.files || []).length }})
                        </label>
                    </div>
                    <div class="dump__consigne">
                        Pour confirmer, saisissez le nom de ce serveur :
                        <code class="dump__serveur">{{ nomServeur }}</code>
                    </div>
                    <div class="dump__confirmation">
                        <label for="dumpConfirmInput" class="dump__masque">Nom du serveur</label>
                        <input
                            id="dumpConfirmInput"
                            v-model="confirmation"
                            type="text"
                            autocomplete="off"
                            :placeholder="nomServeur"
                            class="dump__saisie"
                        />
                        <button
                            id="dumpRestoreBtn"
                            type="button"
                            class="dump__restaurer"
                            :disabled="!confirmationValide || restauration.enCours"
                            @click="restaurer"
                        >
                            ♻️ Restaurer ce dump
                        </button>
                        <button type="button" class="dump__annuler" @click="annuler">Annuler</button>
                    </div>
                    <div id="dumpRestoreStatus" role="status" class="dump__statut-restauration">
                        <span v-if="restauration.enCours">⏳ Restauration en cours… ne fermez pas cette page.</span>
                        <span v-else-if="restauration.erreur" :key="restauration.erreur" class="dump__erreur">
                            {{ restauration.erreur }}
                        </span>
                    </div>
                </template>
            </div>
        </div>

        <!-- Restauration terminée : rechargement de la page à la fermeture (comme l'ancien écran après son message) -->
        <AppModal :opened="!!resultat" title="Restauration terminée" is-alert @close="() => {}">
            <p class="dump__resultat-restauration">{{ resultat }}</p>
            <template #footer>
                <button type="button" @click="recharger">Recharger la page</button>
            </template>
        </AppModal>
    </AppSousSectionAdmin>
</template>

<style scoped>
.dump__avertissement {
    background: #fff8e1;
    border-left: 4px solid #f9a825;
    padding: 10px 12px;
    border-radius: 4px;
    font-size: 12px;
    color: #5d4037;
    margin-bottom: 14px;
}
.dump__etape {
    border: 1px solid #c5cae9;
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 14px;
}
.dump__etape-titre {
    font-weight: bold;
    color: #283593;
    font-size: 13px;
    margin-bottom: 8px;
}
.dump__creer,
.dump__creer:hover {
    background: #3949ab;
}
.dump__statut {
    margin-left: 10px;
    font-size: 12px;
    color: #555;
}
.dump__envoi {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
.dump__fichier {
    font-size: 12px;
}
.dump__analyser,
.dump__analyser:hover {
    background: #6c757d;
}
.dump__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.dump__progression {
    margin-top: 10px;
}
.dump__barre {
    display: block;
    width: 100%;
    height: 8px;
    border: none;
    border-radius: 4px;
    overflow: hidden;
    appearance: none;
    background: #e0e0e0;
    accent-color: #3949ab;
}
.dump__barre::-webkit-progress-bar {
    background: #e0e0e0;
}
.dump__barre::-webkit-progress-value {
    background: #3949ab;
}
.dump__barre::-moz-progress-bar {
    background: #3949ab;
}
.dump__barre-texte {
    font-size: 11px;
    color: #555;
    margin-top: 3px;
}
.dump__resultat {
    margin-top: 14px;
}
.dump__erreur {
    color: #c62828;
    font-size: 13px;
}
.dump__resume {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
}
.dump__case {
    background: #f5f5f5;
    padding: 8px 10px;
    border-radius: 4px;
}
.dump__case-libelle {
    color: #777;
}
.dump__case--version-identique {
    border-left: 4px solid #2e7d32;
}
.dump__case--version-recente {
    border-left: 4px solid #c62828;
}
.dump__case--version-ancienne {
    border-left: 4px solid #e65100;
}
.dump__alerte {
    padding: 7px 10px;
    margin-bottom: 6px;
    font-size: 12px;
    border-radius: 3px;
    border-left: 4px solid;
}
.dump__alerte--danger {
    background: #ffebee;
    color: #c62828;
}
.dump__alerte--warn {
    background: #fff3e0;
    color: #e65100;
}
.dump__alerte--info {
    background: #e3f2fd;
    color: #1565c0;
}
.dump__details {
    margin: 10px 0;
}
.dump__details-titre {
    cursor: pointer;
    font-size: 12px;
    color: #3949ab;
}
.dump__tables {
    font-size: 12px;
    border-collapse: collapse;
    margin-top: 6px;
}
.dump__tables th {
    background: #e8eaf6;
    padding: 3px 8px;
    color: inherit;
}
.dump__tables td {
    padding: 3px 8px;
}
.dump__table-nom {
    text-align: left;
}
.dump__nombre {
    text-align: right;
}
.dump__note {
    color: #e65100;
}
.dump__ligne--ecart {
    background: #fffde7;
}
.dump__notes {
    font-size: 11px;
    color: #e65100;
    margin-top: 6px;
}
.dump__options {
    margin: 12px 0;
    font-size: 12px;
}
.dump__option {
    display: block;
    margin-bottom: 4px;
    font-weight: normal;
    font-size: 12px;
}
.dump__option input {
    width: auto;
    display: inline-block;
    margin: 0 6px 0 0;
    vertical-align: middle;
}
.dump__consigne {
    font-size: 12px;
    margin-bottom: 6px;
}
.dump__serveur {
    background: #eee;
    padding: 1px 6px;
    border-radius: 3px;
}
.dump__confirmation {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
.dump__saisie {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 13px;
    width: 220px;
}
.dump__restaurer,
.dump__restaurer:hover {
    background: #c62828;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 13px;
}
.dump__restaurer:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}
.dump__annuler,
.dump__annuler:hover {
    background: #9e9e9e;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.dump__statut-restauration {
    margin-top: 10px;
    font-size: 12px;
}
.dump__resultat-restauration {
    white-space: pre-line;
}
</style>
