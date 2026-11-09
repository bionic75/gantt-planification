<!-- Suivi des déplacements › onglet « Administration » (administrateur) : création d'un bon de commande, liste
     (observation : solde, régularisation ou réfaction à prévoir), modification, suppression, déplacements d'un bon et
     régularisation technique. Liste relue à chaque ouverture de l'onglet. Identifiants de l'ancien écran conservés. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiDeplacements, type BonCommandeSuivi } from '@/api/deplacements';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import {
    bonVide,
    confirmationSuppression,
    controlerCreation,
    controlerModification,
    corpsBon,
    messageSuppression,
    type SaisieBon
} from './administration';
import { dateFr } from './calculs';
import FenetreBonCommande from './FenetreBonCommande.vue';
import FenetreDeplacementsBon from './FenetreDeplacementsBon.vue';
import { basculerTri, classeTri, ligneBon, trierBons, type ColonneBon, type EtatTri, type LigneBon } from './suivi';

const bons = ref<BonCommandeSuivi[]>([]);
const charge = ref(false);
const saisie = ref<SaisieBon>(bonVide());
const tri = ref<EtatTri<ColonneBon> | null>(null);
const message = ref('');
const enModification = ref<BonCommandeSuivi | null>(null);
const bonOuvert = ref<LigneBon | null>(null);
const { demande, repondre, confirmer } = fournirConfirmation();

const lignes = computed(() => trierBons(bons.value.map(ligneBon), tri.value));
const trierPar = (colonne: ColonneBon) => (tri.value = basculerTri(tri.value, colonne));
const classe = (colonne: ColonneBon) => classeTri(tri.value, colonne);

/** Message du serveur, sinon message par défaut */
const erreur = (e: unknown, defaut: string) =>
    e instanceof ErreurApi && e.statut !== 401 && e.message && !/^Erreur \d+$/.test(e.message) ? e.message : defaut;

async function charger() {
    try {
        // Synthèse du reporting : UO consommées de chaque bon
        bons.value = await apiDeplacements.suiviBons();
    } catch (e) {
        console.error('Erreur chargement bons de commande:', e);
    }
    charge.value = true;
}

async function creer() {
    const refus = controlerCreation(saisie.value, bons.value);
    if (refus) {
        message.value = refus;
        return;
    }
    try {
        await apiDeplacements.creerBon(corpsBon(saisie.value, false));
        saisie.value = bonVide();
        void charger();
        message.value = 'Bon de commande créé avec succès';
    } catch (e) {
        console.error('Erreur création bon de commande:', e);
        message.value = erreur(e, 'Erreur lors de la création');
    }
}

async function enregistrer(s: SaisieBon) {
    const bon = enModification.value;
    if (!bon) return;
    const refus = controlerModification(s);
    if (refus) {
        message.value = refus;
        return;
    }
    try {
        await apiDeplacements.modifierBon(bon.id, corpsBon(s, true));
        enModification.value = null;
        void charger();
        message.value = 'Bon de commande modifié avec succès';
    } catch (e) {
        console.error('Erreur modification bon de commande:', e);
        message.value = erreur(e, 'Erreur lors de la modification');
    }
}

async function supprimer(bon: BonCommandeSuivi) {
    if (!(await confirmer(confirmationSuppression(bon.intitule), 'Supprimer'))) return;
    try {
        const r = await apiDeplacements.supprimerBon(bon.id);
        void charger();
        message.value = messageSuppression(r.deplacements_desaffectes);
    } catch (e) {
        console.error('Erreur suppression bon de commande:', e);
        message.value = erreur(e, 'Erreur lors de la suppression');
    }
}

function regularise(texte: string) {
    bonOuvert.value = null;
    void charger();
    message.value = texte;
}

onMounted(() => void charger());
surReouverture(() => void charger());
</script>

<template>
    <h2>Administration des bons de commande</h2>

    <div class="form-section">
        <h3>Créer un bon de commande</h3>
        <div class="form-row">
            <div class="form-group">
                <label for="bcIntitule">Numéro de CBDC *</label>
                <input id="bcIntitule" v-model="saisie.intitule" type="text" placeholder="Ex: CBDC-2026-001" />
            </div>
            <div class="form-group">
                <label for="bcTitulaire">Titulaire *</label>
                <input
                    id="bcTitulaire"
                    :value="saisie.titulaire"
                    type="text"
                    placeholder="Ex: PWC"
                    class="dep-adm__majuscules"
                    @input="saisie.titulaire = ($event.target as HTMLInputElement).value.toUpperCase()"
                />
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="bcDateDebut">Date de début *</label>
                <input id="bcDateDebut" v-model="saisie.debut" type="date" />
            </div>
            <div class="form-group">
                <label for="bcDateFin">Date de fin *</label>
                <input id="bcDateFin" v-model="saisie.fin" type="date" />
            </div>
            <div class="form-group">
                <label for="bcNbUO">Nombre d'UO *</label>
                <input id="bcNbUO" v-model="saisie.uo" type="number" placeholder="Ex: 100" min="1" />
            </div>
        </div>
        <div class="button-group">
            <button type="button" @click="creer">Créer le bon de commande</button>
        </div>
    </div>

    <div class="form-section">
        <h3>Liste des bons de commande</h3>
        <div class="table-container">
            <table id="bonsCommandeTable">
                <thead>
                    <tr>
                        <th class="sortable" :class="classe('intitule')" @click="trierPar('intitule')">
                            Numéro de CBDC
                        </th>
                        <th class="sortable" :class="classe('titulaire')" @click="trierPar('titulaire')">Titulaire</th>
                        <th class="sortable" :class="classe('debut')" @click="trierPar('debut')">Date début</th>
                        <th class="sortable" :class="classe('fin')" @click="trierPar('fin')">Date fin</th>
                        <th class="sortable" :class="classe('consommees')" @click="trierPar('consommees')">
                            UO consommées
                        </th>
                        <th class="sortable" :class="classe('commandees')" @click="trierPar('commandees')">Nb UO</th>
                        <th class="sortable" :class="classe('solde')" @click="trierPar('solde')">Soldé</th>
                        <th>Observation</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="bonsCommandeBody">
                    <tr v-if="!charge">
                        <td colspan="9" class="dep-adm__vide">Chargement...</td>
                    </tr>
                    <tr v-else-if="!lignes.length">
                        <td colspan="9" class="dep-adm__vide">Aucun bon de commande</td>
                    </tr>
                    <tr v-for="l in lignes" :key="l.bc.id" :class="{ 'dep-adm__solde': l.bc.solde }">
                        <td>
                            <a href="#" class="dep-adm__lien" @click.prevent="bonOuvert = l">{{ l.bc.intitule }}</a>
                        </td>
                        <td class="dep-adm__majuscules">{{ l.bc.titulaire || '-' }}</td>
                        <td>{{ dateFr(l.bc.date_debut) }}</td>
                        <td>{{ dateFr(l.bc.date_fin) }}</td>
                        <td class="dep-adm__nombre">{{ l.consommees }}</td>
                        <td class="dep-adm__nombre">{{ l.commandees }}</td>
                        <td class="dep-adm__centre">
                            <span
                                class="dep-adm__badge"
                                :class="l.bc.solde ? 'dep-adm__badge--oui' : 'dep-adm__badge--non'"
                                >{{ l.bc.solde ? 'OUI' : 'NON' }}</span
                            >
                        </td>
                        <td class="dep-adm__observation">
                            <span :class="[`dep-adm--${l.observation.ton}`, { 'dep-adm__gras': l.observation.gras }]">{{
                                l.observation.texte
                            }}</span>
                        </td>
                        <td>
                            <button type="button" class="dep-adm__modifier" @click="enModification = l.bc">
                                ✏️ Modifier
                            </button>
                            <button type="button" class="dep-adm__supprimer" @click="supprimer(l.bc)">
                                🗑️ Supprimer
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <FenetreBonCommande :bon="enModification" @fermer="enModification = null" @enregistrer="enregistrer" />
    <FenetreDeplacementsBon
        :ligne="bonOuvert"
        @fermer="bonOuvert = null"
        @regularise="regularise"
        @message="message = $event"
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
.dep-adm__majuscules {
    text-transform: uppercase;
}
.dep-adm__vide {
    text-align: center;
    color: #999;
}
#bonsCommandeTable tr.dep-adm__solde,
#bonsCommandeTable tr.dep-adm__solde:nth-child(n) {
    background-color: #fff8e1;
}
.dep-adm__lien {
    color: #3498db;
    text-decoration: underline;
    cursor: pointer;
    font-weight: bold;
}
.dep-adm__nombre {
    text-align: center;
    font-weight: bold;
}
.dep-adm__centre {
    text-align: center;
}
.dep-adm__badge {
    color: white;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
}
.dep-adm__badge--oui {
    background-color: #ff9800;
}
.dep-adm__badge--non {
    background-color: #27ae60;
}
.dep-adm__observation {
    font-size: 12px;
}
.dep-adm--vert {
    color: #27ae60;
}
.dep-adm--rouge {
    color: #e74c3c;
}
.dep-adm--bleu {
    color: #2196f3;
}
.dep-adm__gras {
    font-weight: bold;
}
.dep-adm__modifier,
.dep-adm__supprimer {
    color: white;
    padding: 5px 10px;
    font-size: 12px;
}
.dep-adm__modifier {
    background-color: #3498db;
    margin-right: 5px;
}
.dep-adm__supprimer {
    background-color: #e74c3c;
}
</style>
