<!-- Suivi des disponibilités / des affectations : jours disponibles et affectés par expert et par mois -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiReporting, type Diagnostic, type RapportDisponibilites } from '@/api/reporting';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppCheckbox from '@/composants/AppCheckbox.vue';
import AppModal from '@/composants/AppModal.vue';
import AppMultiselect from '@/composants/AppMultiselect.vue';
import { niveauTaux, periodeDisponibilites, periodeValide, MOIS, tableauDisponibilites, trierParNom } from './calculs';
import { csvDuTableau, imprimer, nomFichierDuJour, telechargerCsv } from './export';
import { useReportingStore } from './magasin';
import stylesRapports from './rapports.css?raw';
import SelecteurPeriode from './SelecteurPeriode.vue';

const reporting = useReportingStore();
const periode = ref(periodeDisponibilites());
const fonctionsChoisies = ref<string[]>([]);
const expertsChoisis = ref<string[]>([]);
const avecConges = ref(true);
const message = ref('');
const etat = ref<'attente' | 'chargement' | 'erreur' | 'vide' | 'resultat'>('attente');
const erreur = ref('');
const rapport = ref<RapportDisponibilites | null>(null);
const tri = ref<'asc' | 'desc' | null>(null);
const resultats = ref<HTMLElement | null>(null);
const diagnostic = ref<{ nom: string; mois: number; annee: number; donnees: Diagnostic } | null>(null);

/** Experts proposés : tous, ou ceux des fonctions choisies */
const expertsProposes = computed(() =>
    fonctionsChoisies.value.length
        ? reporting.experts.filter(e => e.fonction && fonctionsChoisies.value.includes(e.fonction))
        : reporting.experts
);
const optionsExperts = computed(() => expertsProposes.value.map(e => ({ value: e.id, text: `${e.prenom} ${e.nom}` })));
const optionsFonctions = computed(() => reporting.fonctions.map(f => ({ value: f, text: f })));

// Tous les experts choisis au chargement
watch(
    () => reporting.experts,
    experts => (expertsChoisis.value = experts.map(e => String(e.id))),
    { immediate: true }
);

/** Filtre par fonction : experts des fonctions choisies, tous choisis ; sans filtre, choix précédent conservé */
watch(fonctionsChoisies, fonctions => {
    const ids = expertsProposes.value.map(e => String(e.id));
    expertsChoisis.value = fonctions.length ? ids : expertsChoisis.value.filter(id => ids.includes(id));
});

const tableau = computed(() => (rapport.value ? tableauDisponibilites(rapport.value) : null));
const lignes = computed(() => (tableau.value ? trierParNom(tableau.value.lignes, tri.value) : []));
const indicateurTri = computed(() => (tri.value === 'asc' ? ' ▲' : tri.value === 'desc' ? ' ▼' : ' ▲▼'));

async function generer() {
    message.value = '';
    if (!expertsChoisis.value.length) {
        message.value = 'Veuillez sélectionner au moins un expert';
        return;
    }
    if (!periodeValide(periode.value)) {
        message.value = 'La date de début doit être antérieure à la date de fin';
        return;
    }
    etat.value = 'chargement';
    try {
        const r = await apiReporting.disponibilites({
            ...periode.value,
            expertIds: expertsChoisis.value.map(Number),
            includeLeave: avecConges.value
        });
        rapport.value = r;
        tri.value = null;
        etat.value = r.experts?.length ? 'resultat' : 'vide';
    } catch (e) {
        erreur.value = (e as Error).message;
        etat.value = 'erreur';
    }
}

function trier() {
    tri.value = tri.value === 'asc' ? 'desc' : 'asc';
}

const tableauAffiche = () => resultats.value?.querySelector('table') ?? null;

function exporter() {
    const t = tableauAffiche();
    if (t) telechargerCsv(nomFichierDuJour('reporting_disponibilites'), csvDuTableau(t));
}

function imprimerRapport() {
    if (resultats.value) imprimer('Reporting Disponibilités/Affectations', stylesRapports, resultats.value.innerHTML);
}

/** Diagnostic des données brutes du premier expert choisi, sur le mois de début */
async function diagnostiquer() {
    message.value = '';
    const id = expertsChoisis.value[0];
    if (!id) {
        message.value = 'Veuillez sélectionner au moins un expert';
        return;
    }
    const expert = reporting.experts.find(e => String(e.id) === id);
    const { startMonth, startYear } = periode.value;
    try {
        diagnostic.value = {
            nom: expert ? `${expert.prenom} ${expert.nom}` : id,
            mois: startMonth + 1,
            annee: startYear,
            donnees: await apiReporting.diagnostic(Number(id), startYear, startMonth + 1)
        };
    } catch (e) {
        message.value = `Erreur: ${(e as Error).message}`;
    }
}

/** Données brutes regroupées par jour (« disponibilité, activité, localisation ») */
const joursDiagnostic = computed(() => {
    const parJour: Record<string, Record<string, string>> = {};
    for (const r of diagnostic.value?.donnees.rawData ?? []) (parJour[r.date_key] ??= {})[r.type] = r.value;
    return Object.keys(parJour)
        .sort()
        .map(
            jour =>
                ({ jour, ...parJour[jour] }) as {
                    jour: string;
                    available?: string;
                    activity?: string;
                    localisation?: string;
                }
        );
});
const ACTIVITES_AFFECTEES = ['3', '4', '5', '6', '7', '8'];
</script>

<template>
    <div class="rp-filtres">
        <SelecteurPeriode
            v-model:mois="periode.startMonth"
            v-model:annee="periode.startYear"
            label="Période de début"
            id-mois="reportingStartMonth"
            id-annee="reportingStartYear"
        />
        <SelecteurPeriode
            v-model:mois="periode.endMonth"
            v-model:annee="periode.endYear"
            label="Période de fin"
            id-mois="reportingEndMonth"
            id-annee="reportingEndYear"
        />
        <AppMultiselect
            id="reportingExperts"
            v-model="expertsChoisis"
            label="Experts métier"
            :options="optionsExperts"
        />
        <AppMultiselect
            id="reportingFonctionFilter"
            v-model="fonctionsChoisies"
            class="rp-fonctions"
            label="Filtrer par fonction(s)"
            :options="optionsFonctions"
        />
        <div class="rp-filtres__case">
            <AppCheckbox id="reportingIncludeLeave" v-model="avecConges" label="Prendre en compte les congés" />
        </div>
        <div class="rp-filtres__action">
            <AppButton size="lg" couleur="#4caf50" label="📊 Générer le rapport" @click="generer" />
        </div>
        <div class="rp-filtres__action">
            <AppButton size="lg" couleur="#9c27b0" label="🔍 Diagnostic" @click="diagnostiquer" />
        </div>
    </div>
    <AppAlert v-if="message" type="error" small :description="message" />

    <div class="rp-legende">
        <span class="rp-legende__titre">Légende taux d'affectation :</span>
        <span class="rp-legende__item"
            ><span class="rp-legende__pastille rp-legende__pastille--optimal"></span>≥ 75% (Optimal)</span
        >
        <span class="rp-legende__item"
            ><span class="rp-legende__pastille rp-legende__pastille--moyen"></span>50-74% (Moyen)</span
        >
        <span class="rp-legende__item"
            ><span class="rp-legende__pastille rp-legende__pastille--faible"></span>&lt; 50% (Faible)</span
        >
    </div>

    <div v-if="etat === 'resultat'" id="reportingExportButtons" class="rp-exports">
        <AppButton couleur="#4caf50" label="📥 Exporter CSV" @click="exporter" />
        <AppButton couleur="#2196f3" label="🖨️ Imprimer" @click="imprimerRapport" />
    </div>

    <div id="reportingResults" ref="resultats" class="rp-resultats">
        <p v-if="etat === 'attente'" class="rp-attente">
            Sélectionnez les paramètres et cliquez sur "Générer le rapport"
        </p>
        <p v-else-if="etat === 'chargement'" class="rp-attente rp-attente--chargement">
            <span class="rp-sablier">⏳</span> Génération en cours...
        </p>
        <p v-else-if="etat === 'erreur'" class="rp-erreur">❌ Erreur: {{ erreur }}</p>
        <p v-else-if="etat === 'vide'" class="rp-vide">Aucune donnée à afficher</p>
        <template v-else-if="rapport && tableau">
            <table id="reportingTable" class="rp-tableau rp-dispo">
                <thead>
                    <tr>
                        <th
                            class="rp-dispo__expert"
                            :aria-sort="tri === 'asc' ? 'ascending' : tri === 'desc' ? 'descending' : 'none'"
                            @click="trier"
                        >
                            Expert{{ indicateurTri }}
                        </th>
                        <th class="rp-dispo__mad">Taux MAD<br /><span class="rp-sous-titre">Jours/mois</span></th>
                        <th v-for="m in rapport.months" :key="`${m.year}-${m.month}`">
                            {{ MOIS[m.month] }} {{ m.year }}<br /><span class="rp-sous-titre">Dispo | Affecté</span>
                        </th>
                        <th class="rp-dispo__total">TOTAL<br /><span class="rp-sous-titre">Dispo | Affecté</span></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="l in lignes" :key="l.id">
                        <td class="rp-dispo__nom">{{ l.nom }}</td>
                        <td class="rp-dispo__taux-mad">
                            <div class="rp-dispo__mad-taux">{{ l.tauxMad }}%</div>
                            <div class="rp-dispo__mad-jours">~{{ l.joursMad }} j/mois</div>
                        </td>
                        <td v-for="(s, i) in l.mois" :key="i" :class="`rp-niveau--${niveauTaux(s.rate, s.available)}`">
                            <div>
                                <span class="rp-dispo__dispo">{{ s.available }}</span> |
                                <span class="rp-dispo__affecte">{{ s.assigned }}</span>
                            </div>
                            <div class="rp-dispo__taux">{{ s.rate.toFixed(0) }}%</div>
                            <div v-if="s.leave > 0" class="rp-dispo__conges">🏖️ -{{ s.leave }}j</div>
                        </td>
                        <td class="rp-dispo__total-expert" :class="`rp-niveau--${niveauTaux(l.taux)}`">
                            <div>
                                <span class="rp-dispo__dispo">{{ l.disponible }}</span> |
                                <span class="rp-dispo__affecte">{{ l.affecte }}</span>
                            </div>
                            <div class="rp-dispo__taux">{{ l.taux.toFixed(0) }}%</div>
                        </td>
                    </tr>
                    <tr class="rp-dispo__ligne-total">
                        <td>TOTAL</td>
                        <td>-</td>
                        <td v-for="(m, i) in tableau.parMois" :key="i">
                            <span class="rp-dispo__total-dispo">{{ m.disponible }}</span> |
                            <span class="rp-dispo__total-affecte">{{ m.affecte }}</span>
                        </td>
                        <td class="rp-dispo__total-general">
                            <span class="rp-dispo__total-dispo">{{ tableau.total.disponible }}</span> |
                            <span class="rp-dispo__total-affecte">{{ tableau.total.affecte }}</span>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div class="rp-legende-format">
                <strong>Format des cellules :</strong> <span class="rp-dispo__dispo">Disponible</span> |
                <span class="rp-dispo__affecte">Affecté</span><br />
                • <strong>Disponible</strong> = jours où disponibilité = "Disponible"<br />
                • <strong>Affecté</strong> = jours où activité ≠ "Indisponible" et ≠ "En attente"<br />
                • <strong>Taux</strong> = Affecté / Disponible × 100
            </div>
        </template>
    </div>

    <AppModal :opened="!!diagnostic" title="🔍 Diagnostic Reporting" @close="diagnostic = null">
        <template v-if="diagnostic">
            <h3 class="rp-diag__titre">🔍 Diagnostic pour {{ diagnostic.nom }}</h3>
            <p><strong>Mois :</strong> {{ diagnostic.mois }}/{{ diagnostic.annee }}</p>
            <p><strong>Expert ID :</strong> {{ diagnostic.donnees.expertId }}</p>
            <p><strong>Patterns SQL :</strong> {{ diagnostic.donnees.patterns.join(' ou ') }}</p>
            <p><strong>Total lignes en base :</strong> {{ diagnostic.donnees.totalRows }}</p>
            <h4>📊 Résumé calculé</h4>
            <table class="rp-diag__resume">
                <tbody>
                    <tr>
                        <td>Demi-journées disponibles (available=2)</td>
                        <td>
                            {{ diagnostic.donnees.summary.availableSlots }} →
                            {{ diagnostic.donnees.summary.availableDays }} jours
                        </td>
                    </tr>
                    <tr>
                        <td>Demi-journées affectées (activity=3,4,5,6,7,8)</td>
                        <td>
                            {{ diagnostic.donnees.summary.assignedSlots }} →
                            {{ diagnostic.donnees.summary.assignedDays }} jours
                        </td>
                    </tr>
                    <tr>
                        <td>Demi-journées congés (available=3)</td>
                        <td>
                            {{ diagnostic.donnees.summary.leaveSlots }} →
                            {{ diagnostic.donnees.summary.leaveDays }} jours
                        </td>
                    </tr>
                </tbody>
            </table>
            <h4>📋 Données brutes (100 premières lignes)</h4>
            <div class="rp-diag__brut">
                <div v-for="j in joursDiagnostic" :key="j.jour">
                    <strong>{{ j.jour }}</strong
                    >: avail=<span
                        :class="{ 'rp-diag__dispo': j.available === '2', 'rp-diag__conges': j.available === '3' }"
                        >{{ j.available || '-' }}</span
                    >, act=<span :class="{ 'rp-diag__affecte': ACTIVITES_AFFECTEES.includes(j.activity ?? '') }">{{
                        j.activity || '-'
                    }}</span
                    >, loc={{ j.localisation || '-' }}
                </div>
            </div>
        </template>
    </AppModal>
</template>

<style scoped>
.rp-filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 20px;
}
.rp-fonctions {
    --gp-multi-largeur: 180px;
}
.rp-filtres__case,
.rp-filtres__action {
    padding-top: 22px;
}
.rp-legende {
    display: flex;
    gap: 20px;
    margin-bottom: 15px;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 4px;
    font-size: 12px;
}
.rp-legende__titre {
    font-weight: bold;
}
.rp-legende__item {
    display: flex;
    align-items: center;
    gap: 5px;
}
.rp-legende__pastille {
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: 1px solid;
}
.rp-legende__pastille--optimal {
    background: #c8e6c9;
    border-color: #a5d6a7;
}
.rp-legende__pastille--moyen {
    background: #ffe0b2;
    border-color: #ffcc80;
}
.rp-legende__pastille--faible {
    background: #ffcdd2;
    border-color: #ef9a9a;
}
.rp-diag__titre {
    border: none;
    padding: 0;
}
.rp-diag__resume {
    border-collapse: collapse;
    font-size: 12px;
    width: auto;
}
.rp-diag__resume td {
    padding: 5px;
    border: 1px solid #ddd;
}
.rp-diag__resume td + td {
    font-weight: bold;
}
.rp-diag__brut {
    max-height: 300px;
    overflow-y: auto;
    background: #f5f5f5;
    padding: 10px;
    font-family: monospace;
    font-size: 10px;
}
.rp-diag__dispo {
    color: green;
    font-weight: bold;
}
.rp-diag__conges {
    color: purple;
}
.rp-diag__affecte {
    color: blue;
    font-weight: bold;
}
</style>
