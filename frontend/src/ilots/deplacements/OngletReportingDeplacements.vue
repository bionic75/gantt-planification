<!-- Suivi des déplacements › onglet « Reporting » : synthèse des bons de commande (UO commandées, consommées, solde,
     taux de consommation) et liste de tous les déplacements (filtres, tri, compteur, export CSV). Données relues à
     chaque ouverture de l'onglet, filtres remis à zéro. Identifiants de l'ancien écran conservés. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiDeplacements, type AmoaCed, type BonCommandeSuivi, type DeplacementReporting } from '@/api/deplacements';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { useSessionStore } from '@/stores/session';
import {
    amoaPresents,
    basculerTri,
    classeTri,
    compteur,
    csvReporting,
    filtrer,
    filtresVides,
    ligneReporting,
    ligneSynthese,
    nomFichierCsv,
    samusPresents,
    trierReporting,
    type ColonneReporting,
    type EtatTri
} from './suivi';

const sessionStore = useSessionStore();

const bons = ref<BonCommandeSuivi[]>([]);
const bonsCharges = ref(false);
const deplacements = ref<DeplacementReporting[]>([]);
const deplacementsCharges = ref(false);
const amoaCed = ref<AmoaCed[]>([]);
const filtres = ref(filtresVides());
const tri = ref<EtatTri<ColonneReporting> | null>(null);
const message = ref('');

const synthese = computed(() => bons.value.map(ligneSynthese));
const listeFiltree = computed(() => filtrer(deplacements.value, filtres.value));
const lignes = computed(() =>
    trierReporting(
        listeFiltree.value.map(d => ligneReporting(d, amoaCed.value)),
        tri.value
    )
);
const samus = computed(() => samusPresents(deplacements.value));
const amoas = computed(() => amoaPresents(deplacements.value, amoaCed.value));

const trierPar = (colonne: ColonneReporting) => (tri.value = basculerTri(tri.value, colonne));
const classe = (colonne: ColonneReporting) => classeTri(tri.value, colonne);

function reinitialiser() {
    filtres.value = filtresVides();
}

function exporter() {
    if (!listeFiltree.value.length) {
        message.value = 'Aucune donnée à exporter';
        return;
    }
    const blob = new Blob([csvReporting(listeFiltree.value, amoaCed.value)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichierCsv();
    lien.hidden = true;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    URL.revokeObjectURL(url);
}

/** Comme l'ancien écran à chaque ouverture de l'onglet : synthèse et liste relues */
async function ouvrir() {
    filtres.value = filtresVides();
    const admin = (await sessionStore.charger()).activeProfile === 'admin';
    await Promise.all([
        apiDeplacements
            .suiviBons()
            .then(b => (bons.value = b))
            .catch(e => console.error('Erreur chargement reporting:', e))
            .finally(() => (bonsCharges.value = true)),
        // Noms des AMOA CED : liste réservée à l'administrateur, sinon noms portés par les déplacements
        (admin ? apiDeplacements.amoaCed() : Promise.resolve([]))
            .catch(e => {
                console.error('Erreur chargement AMOA CED:', e);
                return [];
            })
            .then(async u => {
                amoaCed.value = u;
                deplacements.value = await apiDeplacements.tous();
            })
            .catch(e => console.error('Erreur chargement tous déplacements:', e))
            .finally(() => (deplacementsCharges.value = true))
    ]);
}

onMounted(() => void ouvrir());
surReouverture(() => void ouvrir());
</script>

<template>
    <h2>Reporting des déplacements</h2>

    <div class="form-section">
        <h3>Synthèse des bons de commande</h3>
        <div class="table-container">
            <table id="reportingBonsCommandeTable">
                <thead>
                    <tr>
                        <th>Soldé?</th>
                        <th>N° de BDC</th>
                        <th>Période</th>
                        <th>UO commandées</th>
                        <th>UO consommées</th>
                        <th>Solde</th>
                        <th>Taux consommation</th>
                    </tr>
                </thead>
                <tbody id="reportingBonsCommandeBody">
                    <tr v-if="!bonsCharges">
                        <td colspan="7" class="dep-rep__vide">Chargement...</td>
                    </tr>
                    <tr v-else-if="!synthese.length">
                        <td colspan="7" class="dep-rep__vide">Aucun bon de commande</td>
                    </tr>
                    <tr v-for="l in synthese" :key="l.bc.id" :class="{ 'dep-rep__solde': l.bc.solde }">
                        <td class="dep-rep__centre">
                            <span
                                class="dep-rep__badge"
                                :class="l.bc.solde ? 'dep-rep__badge--oui' : 'dep-rep__badge--non'"
                                >{{ l.bc.solde ? 'OUI' : 'NON' }}</span
                            >
                        </td>
                        <td>{{ l.bon }}</td>
                        <td>{{ l.periode }}</td>
                        <td class="dep-rep__nombre">{{ l.bc.uo_commandees }}</td>
                        <td class="dep-rep__nombre">{{ l.bc.uo_consommees }}</td>
                        <td class="dep-rep__nombre" :class="`dep-rep--${l.tonSolde}`">{{ l.solde }}</td>
                        <td>
                            <div class="dep-rep__taux">
                                <div class="dep-rep__jauge">
                                    <div
                                        class="dep-rep__barre"
                                        :class="`dep-rep__barre--${l.tonBarre}`"
                                        :style="{ width: `${Math.min(l.taux, 100)}%` }"
                                    ></div>
                                </div>
                                <span class="dep-rep__pourcentage">{{ l.taux }}%</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="form-section">
        <h3>Détail des déplacements</h3>

        <div class="dep-rep__filtres">
            <div class="dep-rep__filtre dep-rep__filtre--large">
                <label for="filterReportingBdc">N° de BDC</label>
                <select id="filterReportingBdc" v-model="filtres.bon">
                    <option value="">-- Tous les BDC --</option>
                    <option v-for="b in bons" :key="b.id" :value="String(b.id)">
                        {{ b.intitule }} - {{ b.titulaire || 'N/A' }}
                    </option>
                </select>
            </div>
            <div class="dep-rep__filtre">
                <label for="filterReportingDateDebut">Date début</label>
                <input id="filterReportingDateDebut" v-model="filtres.debut" type="date" />
            </div>
            <div class="dep-rep__filtre">
                <label for="filterReportingDateFin">Date fin</label>
                <input id="filterReportingDateFin" v-model="filtres.fin" type="date" />
            </div>
            <div class="dep-rep__filtre">
                <label for="filterReportingSamu">SAMU</label>
                <select id="filterReportingSamu" v-model="filtres.samu">
                    <option value="">-- Tous les SAMU --</option>
                    <option v-for="s in samus" :key="s" :value="s">{{ s }}</option>
                </select>
            </div>
            <div class="dep-rep__filtre dep-rep__filtre--amoa">
                <label for="filterReportingAmoaCed">AMOA CED</label>
                <select id="filterReportingAmoaCed" v-model="filtres.amoa">
                    <option value="">-- Tous les AMOA CED --</option>
                    <option v-for="a in amoas" :key="a.id" :value="String(a.id)">{{ a.libelle }}</option>
                </select>
            </div>
            <div class="dep-rep__boutons">
                <button type="button" class="dep-rep__reinitialiser" @click="reinitialiser">🔄 Réinitialiser</button>
                <button type="button" class="dep-rep__exporter" @click="exporter">📥 Export CSV</button>
            </div>
        </div>

        <div class="table-container">
            <table id="reportingDeplacementsTable">
                <thead>
                    <tr>
                        <th class="sortable" :class="classe('bon')" @click="trierPar('bon')">N° de BDC</th>
                        <th class="sortable" :class="classe('debut')" @click="trierPar('debut')">Date début</th>
                        <th class="sortable" :class="classe('fin')" @click="trierPar('fin')">Date fin</th>
                        <th class="sortable" :class="classe('createur')" @click="trierPar('createur')">Créé par</th>
                        <th class="sortable" :class="classe('amoa')" @click="trierPar('amoa')">AMOA CED</th>
                        <th class="sortable" :class="classe('samu')" @click="trierPar('samu')">SAMU</th>
                        <th class="sortable" :class="classe('ville')" @click="trierPar('ville')">Ville</th>
                        <th class="sortable" :class="classe('uo')" @click="trierPar('uo')">Nb UO</th>
                    </tr>
                </thead>
                <tbody id="reportingDeplacementsBody">
                    <tr v-if="!deplacementsCharges">
                        <td colspan="8" class="dep-rep__vide">Chargement...</td>
                    </tr>
                    <tr v-else-if="!lignes.length">
                        <td colspan="8" class="dep-rep__vide">Aucun déplacement enregistré</td>
                    </tr>
                    <tr v-for="l in lignes" :key="l.d.id">
                        <td>
                            <template v-if="l.bon">{{ l.bon }}</template>
                            <span v-else class="dep-rep__a-affecter">⚠️ À affecter</span>
                        </td>
                        <td>{{ l.debut }}</td>
                        <td>{{ l.fin }}</td>
                        <td>{{ l.createur }}</td>
                        <td>{{ l.amoa }}</td>
                        <td>{{ l.d.samu }}</td>
                        <td>{{ l.d.ville }}</td>
                        <td class="dep-rep__nombre">{{ l.d.nb_uo }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div id="reportingDeplacementsCount" class="dep-rep__compteur">
            {{ deplacementsCharges ? compteur(listeFiltree) : '' }}
        </div>
    </div>

    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
.dep-rep__vide {
    text-align: center;
    color: #999;
}
.dep-rep__centre {
    text-align: center;
}
.dep-rep__nombre {
    text-align: center;
    font-weight: bold;
}
#reportingBonsCommandeTable tr.dep-rep__solde,
#reportingBonsCommandeTable tr.dep-rep__solde:nth-child(n) {
    background-color: #fff8e1;
}
.dep-rep__badge {
    color: white;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
}
.dep-rep__badge--oui {
    background-color: #ff9800;
}
.dep-rep__badge--non {
    background-color: #27ae60;
}
.dep-rep--vert {
    color: #27ae60;
}
.dep-rep--orange {
    color: #f39c12;
}
.dep-rep--rouge {
    color: #e74c3c;
}
.dep-rep__taux {
    display: flex;
    align-items: center;
    gap: 10px;
}
.dep-rep__jauge {
    flex: 1;
    background-color: #ecf0f1;
    border-radius: 10px;
    height: 20px;
    overflow: hidden;
}
.dep-rep__barre {
    height: 100%;
    transition: width 0.3s;
}
.dep-rep__barre--vert {
    background-color: #27ae60;
}
.dep-rep__barre--orange {
    background-color: #f39c12;
}
.dep-rep__barre--rouge {
    background-color: #e74c3c;
}
.dep-rep__pourcentage {
    font-weight: bold;
    min-width: 45px;
}
.dep-rep__filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-end;
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 15px;
    border: 1px solid #dee2e6;
}
.dep-rep__filtre {
    flex: 1;
    min-width: 150px;
}
.dep-rep__filtre--large {
    min-width: 200px;
}
.dep-rep__filtre--amoa {
    min-width: 180px;
}
.dep-rep__filtre label {
    display: block;
    font-weight: bold;
    margin-bottom: 5px;
    font-size: 12px;
    color: #495057;
}
.dep-rep__filtre select,
.dep-rep__filtre input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    box-sizing: border-box;
}
.dep-rep__boutons {
    display: flex;
    gap: 10px;
}
.dep-rep__reinitialiser,
.dep-rep__exporter {
    padding: 8px 15px;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.dep-rep__reinitialiser {
    background: #6c757d;
}
.dep-rep__exporter {
    background: #28a745;
}
.dep-rep__a-affecter {
    color: #e74c3c;
    font-weight: bold;
}
.dep-rep__compteur {
    margin-top: 10px;
    font-size: 12px;
    color: #666;
}
</style>
