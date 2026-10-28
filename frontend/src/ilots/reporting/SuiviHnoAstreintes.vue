<!-- Suivi des HNO / astreintes : jours par expert et par mois, avec totaux -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiReporting, type PeriodeMois, type RapportHno } from '@/api/reporting';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppCheckbox from '@/composants/AppCheckbox.vue';
import AppMultiselect from '@/composants/AppMultiselect.vue';
import { moisDeLaPeriode, ouTiret, periodeHno, periodeValide, tableauHno } from './calculs';
import { csvDuTableau, imprimer, nomFichierDuJour, telechargerCsv } from './export';
import { useReportingStore } from './magasin';
import stylesRapports from './rapports.css?raw';
import SelecteurPeriode from './SelecteurPeriode.vue';

const reporting = useReportingStore();
const periode = ref(periodeHno());
const expertsChoisis = ref<string[]>([]);
const avecHno = ref(true);
const avecAstreintes = ref(true);
const message = ref('');
const etat = ref<'attente' | 'chargement' | 'erreur' | 'resultat'>('attente');
const resultats = ref<HTMLElement | null>(null);
/** Rapport généré, avec les options de sa génération */
const rapport = ref<{ donnees: RapportHno; periode: PeriodeMois; hno: boolean; astreintes: boolean } | null>(null);

const optionsExperts = computed(() => reporting.experts.map(e => ({ value: e.id, text: `${e.prenom} ${e.nom}` })));
watch(
    () => reporting.experts,
    experts => (expertsChoisis.value = experts.map(e => String(e.id))),
    { immediate: true }
);

const mois = computed(() => (rapport.value ? moisDeLaPeriode(rapport.value.periode) : []));
const tableau = computed(() => (rapport.value ? tableauHno(rapport.value.donnees, mois.value) : null));
const colonnesParMois = computed(() =>
    rapport.value ? Number(rapport.value.hno) + Number(rapport.value.astreintes) : 0
);

async function generer() {
    message.value = '';
    if (!expertsChoisis.value.length) {
        message.value = 'Veuillez sélectionner au moins un expert';
        return;
    }
    if (!avecHno.value && !avecAstreintes.value) {
        message.value = 'Veuillez sélectionner au moins un type de données (HNO ou Astreintes)';
        return;
    }
    if (!periodeValide(periode.value)) {
        message.value = 'La date de début doit être antérieure à la date de fin';
        return;
    }
    const options = { periode: { ...periode.value }, hno: avecHno.value, astreintes: avecAstreintes.value };
    etat.value = 'chargement';
    try {
        const donnees = await apiReporting.hnoAstreintes({
            ...options.periode,
            expertIds: expertsChoisis.value.map(Number),
            showHno: options.hno,
            showAstreintes: options.astreintes
        });
        rapport.value = { donnees, ...options };
        etat.value = 'resultat';
    } catch {
        etat.value = 'erreur';
    }
}

function exporter() {
    const t = resultats.value?.querySelector('table');
    if (t) telechargerCsv(nomFichierDuJour('reporting_hno_astreintes'), csvDuTableau(t));
}

function imprimerRapport() {
    if (resultats.value) imprimer('Reporting HNO/Astreintes', stylesRapports, resultats.value.innerHTML);
}
</script>

<template>
    <div class="rp-filtres">
        <SelecteurPeriode
            v-model:mois="periode.startMonth"
            v-model:annee="periode.startYear"
            label="Période de début"
            id-mois="hnoReportingStartMonth"
            id-annee="hnoReportingStartYear"
        />
        <SelecteurPeriode
            v-model:mois="periode.endMonth"
            v-model:annee="periode.endYear"
            label="Période de fin"
            id-mois="hnoReportingEndMonth"
            id-annee="hnoReportingEndYear"
        />
        <AppMultiselect
            id="hnoReportingExperts"
            v-model="expertsChoisis"
            label="Experts métier"
            :options="optionsExperts"
        />
        <div role="group" aria-labelledby="hnoReportingTypes">
            <span id="hnoReportingTypes" class="rp-champ__libelle">Type de données</span>
            <div class="rp-types">
                <AppCheckbox id="hnoReportingShowHno" v-model="avecHno" label="⏰ HNO" />
                <AppCheckbox id="hnoReportingShowAstreintes" v-model="avecAstreintes" label="🔔 Astreintes" />
            </div>
        </div>
        <div class="rp-filtres__action">
            <AppButton size="lg" couleur="#9c27b0" label="📊 Générer le rapport" @click="generer" />
        </div>
    </div>
    <AppAlert v-if="message" type="error" small :description="message" />

    <div v-if="etat === 'resultat'" id="hnoReportingExportButtons" class="rp-exports">
        <AppButton couleur="#4caf50" label="📥 Exporter CSV" @click="exporter" />
        <AppButton couleur="#2196f3" label="🖨️ Imprimer" @click="imprimerRapport" />
    </div>

    <div id="hnoReportingResults" ref="resultats" class="rp-resultats">
        <p v-if="etat === 'attente'" class="rp-attente">
            Sélectionnez les paramètres et cliquez sur "Générer le rapport"
        </p>
        <p v-else-if="etat === 'chargement'" class="rp-attente rp-attente--chargement">
            <span class="rp-sablier">⏳</span> Génération en cours...
        </p>
        <p v-else-if="etat === 'erreur'" class="rp-erreur">Erreur lors de la génération du rapport</p>
        <!-- Colonne Expert figée : attribut style « sticky » attendu par les règles globales de l'ancienne page
             (public/css/ui-polish.css : pas d'angles arrondis ni de couleurs alternées sur ces tableaux) -->
        <table v-else-if="rapport && tableau" class="rp-tableau rp-hno">
            <thead>
                <tr class="rp-hno__mois">
                    <th rowspan="2" class="rp-hno__expert" style="position: sticky">Expert</th>
                    <th v-for="m in mois" :key="m.cle" :colspan="colonnesParMois">{{ m.libelle }}</th>
                    <th :colspan="colonnesParMois" class="rp-hno__total">Total</th>
                </tr>
                <tr class="rp-hno__types">
                    <template v-for="i in mois.length + 1" :key="i">
                        <th v-if="rapport.hno">⏰ HNO</th>
                        <th v-if="rapport.astreintes">🔔 ASTR</th>
                    </template>
                </tr>
            </thead>
            <tbody>
                <tr v-for="l in tableau.lignes" :key="l.id">
                    <td class="rp-hno__nom" style="position: sticky">{{ l.nom }}</td>
                    <template v-for="(v, i) in l.valeurs" :key="i">
                        <td v-if="rapport.hno" :class="{ 'rp-hno__hno': v.hno > 0 }">{{ ouTiret(v.hno) }}</td>
                        <td v-if="rapport.astreintes" :class="{ 'rp-hno__astr': v.astreintes > 0 }">
                            {{ ouTiret(v.astreintes) }}
                        </td>
                    </template>
                    <td v-if="rapport.hno" class="rp-hno__total-expert rp-hno__type-hno">{{ ouTiret(l.hno) }}</td>
                    <td v-if="rapport.astreintes" class="rp-hno__total-expert rp-hno__type-astr">
                        {{ ouTiret(l.astreintes) }}
                    </td>
                </tr>
                <tr class="rp-hno__ligne-total">
                    <td class="rp-hno__nom" style="position: sticky">TOTAL</td>
                    <template v-for="(m, i) in tableau.parMois" :key="i">
                        <td v-if="rapport.hno">{{ ouTiret(m.hno) }}</td>
                        <td v-if="rapport.astreintes">{{ ouTiret(m.astreintes) }}</td>
                    </template>
                    <td v-if="rapport.hno" class="rp-hno__total-general">{{ ouTiret(tableau.total.hno) }}</td>
                    <td v-if="rapport.astreintes" class="rp-hno__total-general">
                        {{ ouTiret(tableau.total.astreintes) }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.rp-filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 20px;
}
.rp-types {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: flex-start;
}
.rp-filtres__action {
    align-self: flex-end;
}
</style>
