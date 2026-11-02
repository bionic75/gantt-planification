<!-- Ajouter une nouvelle ressource (section repliable) : identité (trigramme proposé), taux ou MAD volante, SAMU et ES,
     expert principal / secondaire sur des SAMU, astreintes ; export des ressources -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiRessources, URL_EXPORT_RESSOURCES } from '@/api/ressources';
import { ErreurApi } from '@/api/client';
import AppAlert from '@/composants/AppAlert.vue';
import { afficherSynchronisation, emettre } from '@/liaison';
import {
    ajoutIncomplet,
    apresAjout,
    capitaliser,
    corpsAjout,
    esDuSamu,
    formulaireVide,
    trigrammePropose,
    type FormulaireAjout
} from './calculs';
import { useRessourcesStore } from './magasin';
import SaisieSamu from './SaisieSamu.vue';

const magasin = useRessourcesStore();

const ouverte = ref(false);
const f = ref<FormulaireAjout>(formulaireVide());
const principal = ref<string[]>([]);
const secondaire = ref<string[]>([]);
const erreur = ref('');

/** SAMU de rattachement proposés (libellés courts, ordre alphabétique) */
const samus = computed(() =>
    [...magasin.localisations]
        .sort((a, b) => (a.libelle_court || '').localeCompare(b.libelle_court || ''))
        .map(l => l.libelle_court)
        .filter((s): s is string => !!s)
);
const libellesSamu = computed(() => magasin.localisations.map(l => l.libelle_court));

function proposerTrigramme() {
    const t = trigrammePropose(f.value.nom, f.value.prenom);
    if (t) f.value.trigramme = t;
}
function quitterPrenom() {
    f.value.prenom = capitaliser(f.value.prenom);
    proposerTrigramme();
}
function choisirSamu() {
    f.value.es = esDuSamu(magasin.localisations.find(l => l.libelle_court === f.value.samu)?.adresse);
}
function basculerMadVolante() {
    if (f.value.madVolante) f.value.taux = '';
    else {
        f.value.dateFinMad = '';
        f.value.joursMaxMad = '';
    }
}
function basculerHno() {
    if (!f.value.astreinteHno) f.value.dateAstreinte = '';
}

async function ajouter() {
    erreur.value = '';
    const incomplet = ajoutIncomplet(f.value);
    if (incomplet) {
        erreur.value = incomplet;
        return;
    }
    try {
        const { id } = await apiRessources.creer(corpsAjout(f.value));
        if (id) {
            try {
                await apiRessources.enregistrerAffectations(id, principal.value, secondaire.value);
            } catch {
                /* affectations non enregistrées (ancien écran : erreur dans la console) */
            }
        }
        afficherSynchronisation();
        apiRessources.journaliser('Modification du planning').catch(() => undefined);
        emettre('ressources-modifiees');
        f.value = apresAjout(f.value);
        await magasin.charger();
        principal.value = [];
        secondaire.value = [];
    } catch (e) {
        const message =
            e instanceof ErreurApi
                ? ((e.donnees as { error?: string } | null)?.error ?? 'Erreur ajout ressource')
                : (e as Error).message;
        erreur.value = `Erreur lors de l'ajout de la ressource: ${message}`;
    }
}

function exporter() {
    window.location.href = URL_EXPORT_RESSOURCES;
}
</script>

<template>
    <div id="addResourceFormSection" class="form-section">
        <h3 class="ajout__titre">
            <button
                type="button"
                class="ajout__basculer"
                :aria-expanded="ouverte ? 'true' : 'false'"
                aria-controls="addResourceSection"
                @click="ouverte = !ouverte"
            >
                <span id="addResourceSectionIcon" aria-hidden="true">{{ ouverte ? '▼' : '▶' }}</span> Ajouter une
                nouvelle ressource
            </button>
        </h3>
        <div v-show="ouverte" id="addResourceSection" class="ajout__corps">
            <div class="form-row">
                <div class="form-group">
                    <label for="nom">Nom *</label>
                    <input id="nom" v-model="f.nom" type="text" placeholder="Nom" @blur="proposerTrigramme" />
                </div>
                <div class="form-group">
                    <label for="prenom">Prénom *</label>
                    <input id="prenom" v-model="f.prenom" type="text" placeholder="Prénom" @blur="quitterPrenom" />
                </div>
                <div class="form-group">
                    <label for="trigramme">Trigramme *</label>
                    <input id="trigramme" v-model="f.trigramme" type="text" placeholder="XXX" maxlength="3" />
                </div>
                <div v-show="!f.madVolante" id="addTauxGroup" class="form-group">
                    <label for="taux">Taux de MAD (%) *</label>
                    <!-- Texte saisi (v-model convertirait en nombre : un taux de 0 serait refusé) -->
                    <input
                        id="taux"
                        :value="f.taux"
                        type="number"
                        placeholder="100"
                        min="0"
                        max="100"
                        @input="f.taux = ($event.target as HTMLInputElement).value"
                    />
                </div>
                <div v-show="f.madVolante" id="addDateFinMadGroup" class="form-group">
                    <label for="dateFinMad">Date de fin MAD *</label>
                    <input id="dateFinMad" v-model="f.dateFinMad" type="date" />
                </div>
                <div v-show="f.madVolante" id="addJoursMaxGroup" class="form-group">
                    <label for="joursMaxMad">Jours max sur la période *</label>
                    <input
                        id="joursMaxMad"
                        :value="f.joursMaxMad"
                        type="number"
                        placeholder="Ex: 20"
                        min="1"
                        @input="f.joursMaxMad = ($event.target as HTMLInputElement).value"
                    />
                </div>
            </div>
            <div class="ajout__volante">
                <input
                    id="addMadVolante"
                    v-model="f.madVolante"
                    type="checkbox"
                    class="ajout__case"
                    @change="basculerMadVolante"
                />
                <label for="addMadVolante" class="ajout__volante-libelle">
                    <svg class="ajout__avion" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="M22 2 11 13" />
                    </svg>
                    MAD volante
                    <span class="ajout__volante-aide"
                        >(contrat à durée déterminée avec un nombre de jours maximum)</span
                    >
                </label>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="samu">SAMU de rattachement *</label>
                    <select id="samu" v-model="f.samu" @change="choisirSamu">
                        <option value="">-- Choisir un SAMU --</option>
                        <option v-for="s in samus" :key="s" :value="s">{{ s }}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="dateDebut">Date début MAD *</label>
                    <input id="dateDebut" v-model="f.dateDebut" type="date" />
                </div>
                <div class="form-group">
                    <label for="esRattachement">ES de rattachement</label>
                    <input
                        id="esRattachement"
                        v-model="f.es"
                        type="text"
                        readonly
                        placeholder="Auto-rempli selon le SAMU choisi"
                        class="ajout__lecture"
                    />
                </div>
                <div class="form-group">
                    <label for="fonction">Fonction</label>
                    <input id="fonction" v-model="f.fonction" type="text" placeholder="Ex: Médecin, Infirmier..." />
                </div>
            </div>
            <div class="form-row ajout__samus">
                <SaisieSamu
                    v-model="principal"
                    v-model:autres="secondaire"
                    cle="add_principal"
                    role="principal"
                    libelle="🅿️ Expert principal sur le(s) SAMU"
                    :samus="libellesSamu"
                />
                <SaisieSamu
                    v-model="secondaire"
                    v-model:autres="principal"
                    cle="add_secondaire"
                    role="secondaire"
                    libelle="🅢 Expert secondaire sur le(s) SAMU"
                    :samus="libellesSamu"
                />
            </div>
            <div class="ajout__astreintes">
                <div class="ajout__astreintes-titre">🔔 Astreintes (activités à différencier)</div>
                <label class="ajout__astreinte ajout__astreinte--ho">
                    <input id="addAstreinteHo" v-model="f.astreinteHo" type="checkbox" class="ajout__case" />
                    <span
                        ><strong>Astreintes HO</strong>
                        <span class="ajout__astreinte-aide">(jours de la semaine, heures ouvrées)</span></span
                    >
                </label>
                <label class="ajout__astreinte ajout__astreinte--hno">
                    <input
                        id="addAstreinteVolontaire"
                        v-model="f.astreinteHno"
                        type="checkbox"
                        class="ajout__case"
                        @change="basculerHno"
                    />
                    <span
                        ><strong>Astreintes HNO</strong>
                        <span class="ajout__astreinte-aide">(jours et heures non ouvrés)</span></span
                    >
                </label>
                <div v-show="f.astreinteHno" id="addAstreinteDateBlock" class="ajout__date">
                    <label for="addAstreinteDate" class="ajout__date-libelle"
                        >📅 Date de démarrage du régime d'astreintes HNO *</label
                    >
                    <input id="addAstreinteDate" v-model="f.dateAstreinte" type="date" class="ajout__date-champ" />
                </div>
                <label class="ajout__astreinte ajout__astreinte--apd">
                    <input id="addAstreinteApd" v-model="f.astreinteApd" type="checkbox" class="ajout__case" />
                    <span
                        ><strong>Astreintes « Accompagnement post démarrage »</strong>
                        <span class="ajout__astreinte-aide"
                            >(jours et heures non ouvrés, dans le cadre d'un déploiement)</span
                        ></span
                    >
                </label>
            </div>
            <AppAlert v-if="erreur" type="error" :description="erreur" />
            <div class="button-group ajout__boutons">
                <button type="button" @click="ajouter">Ajouter la ressource</button>
                <button type="button" class="export-btn" @click="exporter">Exporter (Excel)</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ajout__titre {
    border-left: none;
    margin: 0;
}
.ajout__basculer,
.ajout__basculer:hover {
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.ajout__corps {
    margin-top: 15px;
}
.ajout__volante {
    margin-bottom: 10px;
    padding: 10px 14px;
    background: #f3e5f5;
    border: 1px solid #ce93d8;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.ajout__case {
    width: 16px;
    height: 16px;
    cursor: pointer;
}
.ajout__volante-libelle {
    font-size: 13px;
    font-weight: bold;
    color: #6a1b9a;
    cursor: pointer;
    margin: 0;
}
.ajout__avion {
    width: 16px;
    height: 16px;
    stroke: #7b1fa2;
    fill: #e1bee7;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -3px;
    margin-right: 6px;
}
.ajout__volante-aide {
    font-weight: normal;
    color: #888;
    font-size: 12px;
}
.ajout__lecture {
    background-color: #f5f5f5;
    cursor: not-allowed;
}
.ajout__samus {
    grid-template-columns: 1fr 1fr;
}
.ajout__astreintes {
    margin-top: 16px;
    padding: 12px;
    background: #fff8e1;
    border: 1px solid #ffe082;
    border-radius: 6px;
}
.ajout__astreintes-titre {
    font-size: 13px;
    font-weight: bold;
    color: #e65100;
    margin-bottom: 8px;
}
.ajout__astreinte {
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    margin-bottom: 6px;
}
.ajout__astreinte--ho {
    color: #33691e;
}
.ajout__astreinte--hno {
    color: #e65100;
}
.ajout__astreinte--apd {
    color: #4a148c;
    margin-bottom: 0;
}
.ajout__astreinte-aide {
    font-size: 11px;
    color: #777;
}
.ajout__date {
    margin: 0 0 8px 26px;
}
.ajout__date-libelle {
    font-size: 12px;
    color: #555;
    display: block;
    margin-bottom: 4px;
}
.ajout__date-champ {
    padding: 6px 10px;
    border: 1px solid #ffe082;
    border-radius: 4px;
    font-size: 13px;
}
.ajout__boutons {
    margin-top: 12px;
}
</style>
