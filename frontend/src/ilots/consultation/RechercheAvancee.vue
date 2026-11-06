<!-- Recherche avancée (bouton loupe de l'en-tête de l'application, tous les profils) : demi-journées des experts actifs
     selon la disponibilité, l'affectation et la localisation sur un intervalle de dates ; résultats par expert et
     classement des créneaux par nombre d'experts. Données : instantané de la planification lu à l'ouverture. -->
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { surDemande } from '@/ilots/fenetres';
import { etatPlanning, type EtatPlanning } from '@/liaison';
import { iconesCriteres, optionLocalisation, styleOption, type OptionLocalisation } from './icones-recherche';
import {
    AFFECTATIONS,
    COULEURS_RANG,
    CRENEAUX_AFFICHES,
    DISPONIBILITES,
    classerCreneaux,
    detailExpert,
    expertsProposes,
    intervalleParDefaut,
    jourCreneau,
    localisationsProposees,
    rechercher,
    trigrammeExpert,
    type ResultatExpert
} from './recherche';

const ouverte = ref(false);
const etat = shallowRef<EtatPlanning | null>(null);

const experts = ref<number[]>([]);
const debut = ref('');
const fin = ref('');
const disponibilites = ref<string[]>([]);
const affectations = ref<string[]>([]);
const localisations = ref<string[]>([]);

const optionsLocalisation = shallowRef<OptionLocalisation[]>([]);
const icones = shallowRef<ReturnType<typeof iconesCriteres>>({ disponibilites: {}, affectations: {} });

/** Résultats de la dernière recherche ; null avant toute recherche */
const resultats = shallowRef<ResultatExpert[] | null>(null);
const erreur = ref('');

function proposerIntervalle() {
    ({ debut: debut.value, fin: fin.value } = intervalleParDefaut());
}

// À chaque ouverture : listes relues (experts et localisations désélectionnés), intervalle du mois courant ; les autres
// critères et les derniers résultats sont conservés
surDemande(() => {
    const e = etatPlanning();
    if (!e) return;
    etat.value = e;
    experts.value = [];
    localisations.value = [];
    optionsLocalisation.value = localisationsProposees(e).map(l => optionLocalisation(l));
    icones.value = iconesCriteres();
    proposerIntervalle();
    ouverte.value = true;
});

const optionsExperts = computed(() => (etat.value ? expertsProposes(etat.value) : []));

function lancer() {
    erreur.value = '';
    if (!debut.value || !fin.value) {
        erreur.value = 'Veuillez sélectionner un intervalle de dates';
        return;
    }
    if (!etat.value) return;
    resultats.value = rechercher(etat.value, {
        experts: experts.value,
        debut: debut.value,
        fin: fin.value,
        disponibilites: disponibilites.value,
        affectations: affectations.value,
        localisations: localisations.value
    });
}

function reinitialiser() {
    experts.value = [];
    disponibilites.value = [];
    affectations.value = [];
    localisations.value = [];
    proposerIntervalle();
    resultats.value = null;
    erreur.value = '';
}

const lignesExperts = computed(() =>
    (resultats.value ?? []).map(r => ({
        id: r.ressource.id,
        nom: `${r.ressource.nom} ${r.ressource.prenom}`,
        nombre: r.correspondances.length,
        detail: detailExpert(r.correspondances)
    }))
);

const creneaux = computed(() => classerCreneaux(resultats.value ?? []));
const lignesCreneaux = computed(() =>
    creneaux.value.slice(0, CRENEAUX_AFFICHES).map((c, i) => ({
        cle: `${c.date}_${c.periode}`,
        rang: i + 1,
        couleurRang: COULEURS_RANG[i] ?? '#666',
        paire: i % 2 === 0,
        ...jourCreneau(c.date),
        matin: c.periode === 'AM',
        nombre: c.experts.length,
        noms: c.experts.map(trigrammeExpert).join(', ')
    }))
);
</script>

<template>
    <AppModal
        id="searchModal"
        :opened="ouverte"
        title="🔍 Recherche avancée"
        class="gp-recherche"
        @close="ouverte = false"
    >
        <div class="gp-recherche__criteres">
            <div>
                <div class="gp-recherche__champ">
                    <label for="searchExperts" class="gp-recherche__libelle">Experts (choix multiple) :</label>
                    <select
                        id="searchExperts"
                        v-model="experts"
                        multiple
                        class="gp-recherche__liste gp-recherche__liste--experts"
                    >
                        <option v-for="r in optionsExperts" :key="r.id" :value="r.id">
                            {{ r.nom }} {{ r.prenom }}
                        </option>
                    </select>
                    <div class="gp-recherche__aide">
                        Maintenez Ctrl/Cmd pour sélectionner plusieurs experts. Laissez vide pour tous.
                    </div>
                </div>
                <div class="gp-recherche__dates">
                    <div>
                        <label for="searchStartDate" class="gp-recherche__libelle">Date de début :</label>
                        <input id="searchStartDate" v-model="debut" type="date" class="gp-recherche__date" />
                    </div>
                    <div>
                        <label for="searchEndDate" class="gp-recherche__libelle">Date de fin :</label>
                        <input id="searchEndDate" v-model="fin" type="date" class="gp-recherche__date" />
                    </div>
                </div>
            </div>
            <div>
                <div class="gp-recherche__champ">
                    <label for="searchAvailability" class="gp-recherche__libelle"
                        >Disponibilité (choix multiple) :</label
                    >
                    <select
                        id="searchAvailability"
                        v-model="disponibilites"
                        multiple
                        class="gp-recherche__liste gp-recherche__liste--courte"
                    >
                        <option
                            v-for="o in DISPONIBILITES"
                            :key="o.valeur"
                            :value="o.valeur"
                            :style="styleOption(icones.disponibilites[o.valeur])"
                        >
                            {{ o.libelle }}
                        </option>
                    </select>
                </div>
                <div class="gp-recherche__champ">
                    <label for="searchActivity" class="gp-recherche__libelle">Affectation (choix multiple) :</label>
                    <select
                        id="searchActivity"
                        v-model="affectations"
                        multiple
                        class="gp-recherche__liste gp-recherche__liste--affectations"
                    >
                        <option
                            v-for="o in AFFECTATIONS"
                            :key="o.valeur"
                            :value="o.valeur"
                            :style="styleOption(icones.affectations[o.valeur])"
                        >
                            {{ o.libelle }}
                        </option>
                    </select>
                </div>
                <div class="gp-recherche__champ">
                    <label for="searchLocation" class="gp-recherche__libelle">Localisation (choix multiple) :</label>
                    <select
                        id="searchLocation"
                        v-model="localisations"
                        multiple
                        class="gp-recherche__liste gp-recherche__liste--courte"
                    >
                        <option
                            v-for="o in optionsLocalisation"
                            :key="o.valeur"
                            :value="o.valeur"
                            :style="styleOption(o.icone)"
                        >
                            {{ o.libelle }}
                        </option>
                    </select>
                </div>
            </div>
        </div>

        <div class="gp-recherche__actions">
            <button type="button" class="gp-recherche__lancer" @click="lancer">🔍 Rechercher</button>
            <button type="button" class="gp-recherche__secondaire" @click="reinitialiser">🔄 Réinitialiser</button>
        </div>
        <AppAlert v-if="erreur" type="error" :description="erreur" />

        <div id="searchResults" class="gp-recherche__resultats">
            <h3 class="gp-recherche__titre">Résultats par expert</h3>
            <div id="searchResultsContent" class="gp-recherche__defilement">
                <p v-if="resultats === null" class="gp-recherche__invite">
                    Sélectionnez vos critères et cliquez sur "Rechercher"
                </p>
                <p v-else-if="resultats.length === 0" class="gp-recherche__aucun">
                    Aucun résultat trouvé pour ces critères
                </p>
                <template v-else>
                    <p class="gp-recherche__nombre">{{ resultats.length }} expert(s) trouvé(s)</p>
                    <table class="gp-recherche__table">
                        <thead>
                            <tr class="gp-recherche__entete">
                                <th class="gp-recherche__gauche">Expert</th>
                                <th>Nb demi-journées</th>
                                <th class="gp-recherche__gauche">Détails</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="l in lignesExperts" :key="l.id">
                                <td class="gp-recherche__expert">{{ l.nom }}</td>
                                <td class="gp-recherche__centre">{{ l.nombre }}</td>
                                <td>{{ l.detail }}</td>
                            </tr>
                        </tbody>
                    </table>
                </template>
            </div>
        </div>

        <div v-if="lignesCreneaux.length" id="searchSlotRanking" class="gp-recherche__classement">
            <h3 class="gp-recherche__titre gp-recherche__titre--classement">
                📊 Créneaux par nombre d'experts disponibles ANS
            </h3>
            <div id="searchSlotRankingContent" class="gp-recherche__defilement">
                <p class="gp-recherche__nombre">{{ creneaux.length }} créneau(x) trouvé(s)</p>
                <table class="gp-recherche__table">
                    <thead>
                        <tr class="gp-recherche__entete gp-recherche__entete--classement">
                            <th class="gp-recherche__rang">Rang</th>
                            <th class="gp-recherche__gauche">Date</th>
                            <th>Période</th>
                            <th>Nb experts</th>
                            <th class="gp-recherche__gauche">Experts disponibles</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="l in lignesCreneaux" :key="l.cle" :class="{ 'gp-recherche__ligne--paire': l.paire }">
                            <td class="gp-recherche__centre gp-recherche__gras" :style="{ color: l.couleurRang }">
                                {{ l.rang }}
                            </td>
                            <td>
                                <strong>{{ l.jour }}</strong> {{ l.date }}
                            </td>
                            <td class="gp-recherche__centre">
                                <span
                                    class="gp-recherche__periode"
                                    :class="{ 'gp-recherche__periode--pm': !l.matin }"
                                    >{{ l.matin ? 'Matin' : 'Après-midi' }}</span
                                >
                            </td>
                            <td class="gp-recherche__centre gp-recherche__gras gp-recherche__nombre-experts">
                                {{ l.nombre }}
                            </td>
                            <td class="gp-recherche__noms">{{ l.noms }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="creneaux.length > CRENEAUX_AFFICHES" class="gp-recherche__suite">
                    ... et {{ creneaux.length - CRENEAUX_AFFICHES }} autres créneaux
                </p>
            </div>
        </div>

        <template #footer>
            <button type="button" class="gp-recherche__secondaire gp-recherche__fermer" @click="ouverte = false">
                Fermer
            </button>
        </template>
    </AppModal>
</template>

<style>
/* Fenêtre téléportée hors du composant : règles ciblées par sa classe */
.gp-modale.gp-recherche {
    z-index: 10002;
}
.gp-modale.gp-recherche .gp-modale__boite {
    width: min(900px, 95%);
    padding: 30px;
    border-radius: 12px;
}
.gp-modale.gp-recherche .gp-modale__titre {
    color: #3498db;
    font-size: 1.5em;
}
.gp-recherche__criteres {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 20px 0;
}
.gp-recherche__champ {
    margin-bottom: 15px;
}
.gp-recherche__libelle {
    font-size: 12px;
    font-weight: bold;
    color: #333;
    display: block;
    margin-bottom: 5px;
}
.gp-recherche__liste {
    width: 100%;
    padding: 5px;
}
.gp-recherche__liste--experts {
    height: 120px;
}
.gp-recherche__liste--courte {
    height: 80px;
}
.gp-recherche__liste--affectations {
    height: 100px;
}
.gp-recherche__aide {
    font-size: 10px;
    color: #999;
    margin-top: 2px;
}
.gp-recherche__dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 15px;
}
.gp-recherche__date {
    width: 100%;
    padding: 8px;
}
.gp-recherche__actions {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}
.gp-recherche__lancer,
.gp-recherche__secondaire {
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 25px;
    cursor: pointer;
}
.gp-recherche__lancer {
    background-color: #3498db;
    flex: 1;
}
.gp-recherche__secondaire {
    background-color: #95a5a6;
}
.gp-recherche__fermer {
    padding: 10px 20px;
}
.gp-recherche__resultats {
    border-top: 2px solid #3498db;
    padding-top: 15px;
}
.gp-recherche__classement {
    border-top: 2px solid #27ae60;
    padding-top: 15px;
    margin-top: 20px;
}
.gp-recherche__titre {
    color: #2c3e50;
    margin-bottom: 10px;
}
.gp-recherche__titre--classement {
    color: #27ae60;
}
.gp-recherche__defilement {
    max-height: 300px;
    overflow-y: auto;
}
.gp-recherche__invite {
    color: #999;
    text-align: center;
}
.gp-recherche__aucun {
    color: #e74c3c;
    text-align: center;
}
.gp-recherche__nombre {
    color: #27ae60;
    font-weight: bold;
    margin-bottom: 10px;
}
.gp-recherche__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}
.gp-recherche__table th,
.gp-recherche__table td {
    padding: 8px;
}
.gp-recherche__table tbody tr {
    border-bottom: 1px solid #ddd;
    background-color: white;
}
.gp-recherche__table tbody tr.gp-recherche__ligne--paire {
    background-color: #f9f9f9;
}
.gp-recherche__entete {
    background: #3498db;
    color: white;
}
.gp-recherche__entete--classement {
    background: #27ae60;
}
.gp-recherche__entete th {
    text-align: center;
}
.gp-recherche__table th.gp-recherche__gauche {
    text-align: left;
}
.gp-recherche__rang {
    width: 50px;
}
.gp-recherche__expert,
.gp-recherche__gras {
    font-weight: bold;
}
.gp-recherche__centre {
    text-align: center;
}
.gp-recherche__nombre-experts {
    font-size: 14px;
}
.gp-recherche__noms {
    font-size: 10px;
}
.gp-recherche__periode {
    background: #3498db;
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
}
.gp-recherche__periode--pm {
    background: #e67e22;
}
.gp-recherche__suite {
    color: #999;
    font-size: 11px;
    margin-top: 10px;
    text-align: center;
}
</style>
