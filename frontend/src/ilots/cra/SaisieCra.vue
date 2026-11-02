<!-- Saisie des lignes d'un CRA (astreintes, travail HNO, activités courantes) : ajout, modification, suppression,
     contrôles (champs, dates, heures, chevauchement d'une ligne du même type), collecte depuis la planification (MAD
     volante) ; « Terminer » enregistre les lignes et propose de reporter dans la planification les corrections des
     lignes collectées. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { apiCra, type LigneCra, type OrigineLigne } from '@/api/cra';
import { apiLocalisations, type Localisation } from '@/api/localisations';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import {
    bilanCollecte,
    bilanReport,
    bornesMois,
    collecter,
    controleLigne,
    corrections,
    datesLigne,
    formulaireDe,
    formulaireVide,
    libelleMois,
    ligneDuFormulaire,
    ligneSaisie,
    majuscule,
    optionsSamu,
    questionRemplacement,
    questionReport,
    remplacer,
    trierLignes,
    typeLigne,
    TYPES_SAISIE
} from './calculs';
import { useCraStore } from './magasin';

const props = defineProps<{ id: number; mois: number; annee: number }>();
const emit = defineEmits<{ fermer: []; termine: [] }>();

const magasin = useCraStore();
const confirmer = useConfirmation();

const pret = ref(false);
const lignes = ref<LigneCra[]>([]);
const f = ref(formulaireVide());
const enModification = ref<number | null>(null);
const localisations = ref<Localisation[]>([]);
/** Lignes proposées par la planification (MAD volante) ; null : collecte non proposée */
const collectees = ref<LigneCra[] | null>(null);
const bilan = ref('');
/** Lignes collectées supprimées pendant la saisie (suppression à reporter dans la planification) */
const supprimees: OrigineLigne[] = [];
const erreur = ref('');
const champType = ref<HTMLSelectElement | null>(null);

const titre = computed(() => `📝 Compléter mon CRA — ${majuscule(libelleMois(props.mois, props.annee))}`);
const bornes = computed(() => bornesMois(props.mois, props.annee));
const samus = computed(() => optionsSamu(localisations.value));

onMounted(async () => {
    try {
        localisations.value = (await apiLocalisations.liste()).locations ?? [];
    } catch {
        /* liste des SAMU vide */
    }
    try {
        lignes.value = ((await apiCra.detail(props.id)).astreintes_hno ?? []).map(ligneSaisie);
    } catch {
        lignes.value = [];
    }
    pret.value = true;
    try {
        const d = await apiCra.collecte(props.id);
        if (d.allowed) collectees.value = d.lines ?? [];
    } catch {
        /* collecte indisponible : saisie manuelle uniquement */
    }
});

function reinitialiser() {
    f.value = formulaireVide();
    enModification.value = null;
}

/** Date de début choisie : reprise comme date de fin si celle-ci est vide */
function dateDebutChoisie() {
    if (!f.value.date_fin) f.value.date_fin = f.value.date_debut;
}

async function modifier(i: number) {
    const l = lignes.value[i];
    if (!l) return;
    enModification.value = i;
    f.value = formulaireDe(l);
    await nextTick();
    champType.value?.focus();
}

function ajouter() {
    erreur.value = '';
    const refus = controleLigne(f.value, lignes.value, enModification.value);
    if (refus) {
        erreur.value = refus;
        return;
    }
    if (enModification.value !== null) {
        const i = enModification.value;
        lignes.value[i] = ligneDuFormulaire(f.value, lignes.value[i]);
    } else lignes.value.push(ligneDuFormulaire(f.value, undefined));
    reinitialiser();
}

async function supprimer(i: number) {
    if (!(await confirmer('Supprimer cette ligne ?', 'Supprimer'))) return;
    const origine = lignes.value[i]?.origin;
    if (origine) supprimees.push(origine);
    lignes.value.splice(i, 1);
    if (enModification.value === i) reinitialiser();
}

async function collecterPlanification() {
    const c = collecter(lignes.value, collectees.value ?? []);
    let remplacees = 0;
    let conservees = 0;
    let liste = c.lignes;
    if (c.differentes.length) {
        const choix = await confirmer(questionRemplacement(c.differentes), 'Remplacer', {
            labelAnnuler: 'Conserver',
            danger: false
        });
        if (choix) ({ lignes: liste, remplacees } = remplacer(c));
        else conservees = c.differentes.length;
    }
    lignes.value = trierLignes(liste);
    bilan.value = bilanCollecte({ ajoutees: c.ajoutees, remplacees, doublons: c.doublons, conservees });
}

/** Corrections des lignes collectées : report proposé dans la planification */
async function proposerReport() {
    const liste = corrections(lignes.value, supprimees);
    if (!liste.length) return;
    if (!(await confirmer(questionReport(liste.length, supprimees.length), 'Reporter', { danger: false }))) return;
    try {
        magasin.message = { type: 'success', texte: bilanReport(await apiCra.reporter(props.id, liste)) };
    } catch (e) {
        magasin.message = {
            type: 'error',
            texte: `Report dans la planification impossible : ${(e as Error).message}`
        };
    }
}

async function terminer() {
    erreur.value = '';
    try {
        await apiCra.enregistrerLignes(props.id, lignes.value);
    } catch (e) {
        erreur.value = `Erreur lors de l'enregistrement : ${(e as Error).message}`;
        return;
    }
    await proposerReport();
    emit('termine');
}
</script>

<template>
    <AppModal id="craSaisieModal" :opened="pret" :title="titre" class="cra-saisie" @close="emit('fermer')">
        <div class="cra-saisie__formulaire">
            <div class="cra-saisie__grille">
                <div>
                    <label for="craSaisieType" class="cra-saisie__libelle">Type *</label>
                    <select id="craSaisieType" ref="champType" v-model="f.type" class="cra-saisie__champ">
                        <option v-for="t in TYPES_SAISIE" :key="t.valeur" :value="t.valeur">{{ t.libelle }}</option>
                    </select>
                </div>
                <div>
                    <label for="craSaisieDateDebut" class="cra-saisie__libelle">Date de début *</label>
                    <input
                        id="craSaisieDateDebut"
                        v-model="f.date_debut"
                        type="date"
                        :min="bornes.min"
                        :max="bornes.max"
                        class="cra-saisie__champ"
                        @change="dateDebutChoisie"
                    />
                </div>
                <div>
                    <label for="craSaisieDateFin" class="cra-saisie__libelle">Date de fin *</label>
                    <input
                        id="craSaisieDateFin"
                        v-model="f.date_fin"
                        type="date"
                        :min="bornes.min"
                        :max="bornes.max"
                        class="cra-saisie__champ"
                    />
                </div>
            </div>
            <div class="cra-saisie__heures">
                <div>
                    <label for="craSaisieHeureDebut" class="cra-saisie__libelle">Heure de début *</label>
                    <input id="craSaisieHeureDebut" v-model="f.heure_debut" type="time" class="cra-saisie__champ" />
                </div>
                <div>
                    <label for="craSaisieHeureFin" class="cra-saisie__libelle">Heure de fin *</label>
                    <input id="craSaisieHeureFin" v-model="f.heure_fin" type="time" class="cra-saisie__champ" />
                </div>
            </div>
            <div class="cra-saisie__ligne">
                <label for="craSaisieSamu" class="cra-saisie__libelle">SAMU *</label>
                <select id="craSaisieSamu" v-model="f.samu" class="cra-saisie__champ">
                    <option value="">-- Sélectionner un SAMU --</option>
                    <option v-for="(s, i) in samus" :key="i" :value="s.valeur">{{ s.libelle }}</option>
                </select>
            </div>
            <div class="cra-saisie__ligne">
                <label for="craSaisieObjet" class="cra-saisie__libelle">Objet *</label>
                <input
                    id="craSaisieObjet"
                    v-model="f.objet"
                    type="text"
                    placeholder="Objet de l'astreinte/HNO"
                    class="cra-saisie__champ"
                />
            </div>
            <AppAlert v-if="erreur" type="error" class="cra-saisie__erreur" :description="erreur" />
            <div class="cra-saisie__boutons">
                <button
                    id="craSaisieAddBtn"
                    type="button"
                    class="cra-saisie__ajouter"
                    :class="{ 'cra-saisie__ajouter--modification': enModification !== null }"
                    @click="ajouter"
                >
                    <span :key="String(enModification !== null)">{{
                        enModification !== null ? '💾 Modifier' : '➕ Ajouter'
                    }}</span>
                </button>
                <button type="button" class="cra-saisie__reinitialiser" @click="reinitialiser">🔄 Réinitialiser</button>
                <button
                    v-if="collectees"
                    id="craSaisieCollectBtn"
                    type="button"
                    class="cra-saisie__collecter"
                    title="Reprend les activités courantes, astreintes et HNO marquées dans la page de planification (jour entier 9h-18h, matin 9h-12h, après-midi 14h-18h)"
                    @click="collecterPlanification"
                >
                    <span :key="collectees.length">📥 Collecter depuis la planification ({{ collectees.length }})</span>
                </button>
                <span id="craSaisieCollectMsg" role="status" class="cra-saisie__bilan">{{ bilan }}</span>
            </div>
        </div>

        <div class="cra-saisie__liste">
            <h4 class="cra-saisie__sous-titre">Liste des astreintes/HNO</h4>
            <div id="craSaisieList" class="cra-saisie__lignes">
                <div
                    v-for="(l, i) in lignes"
                    :key="i"
                    class="cra-saisie__item"
                    :class="{ 'cra-saisie__item--impair': i % 2 }"
                >
                    <span :key="l.type" class="cra-saisie__type" :class="`cra-type--${l.type}`"
                        >{{ typeLigne(l.type).icone }} {{ typeLigne(l.type).libelle }}</span
                    >
                    <span class="cra-saisie__dates">{{ datesLigne(l) }}</span>
                    <span class="cra-saisie__heures-ligne">{{ l.heure_debut }} → {{ l.heure_fin }}</span>
                    <span class="cra-saisie__samu">{{ l.samu }}</span>
                    <span class="cra-saisie__objet">{{ l.objet }}</span>
                    <button type="button" title="Modifier" class="cra-saisie__modifier" @click="modifier(i)">✏️</button>
                    <button type="button" title="Supprimer" class="cra-saisie__supprimer" @click="supprimer(i)">
                        🗑️
                    </button>
                </div>
                <p v-if="!lignes.length" class="cra-saisie__vide">Aucune ligne saisie</p>
            </div>
        </div>

        <template #footer>
            <button type="button" class="cra-saisie__fermer" @click="emit('fermer')">Fermer</button>
            <button type="button" class="cra-saisie__terminer" @click="terminer">✅ Terminer</button>
        </template>
    </AppModal>
</template>

<style scoped>
.cra-saisie__formulaire {
    margin: 12px -20px 0;
    padding: 20px;
    background: #f3e5f5;
    border-bottom: 1px solid #b39ddb;
}
.cra-saisie__grille {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
}
.cra-saisie__heures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 12px;
}
.cra-saisie__ligne {
    margin-top: 12px;
}
.cra-saisie__libelle {
    display: block;
    margin-bottom: 4px;
    font-weight: bold;
    color: #333;
    font-size: 12px;
}
.cra-saisie__champ {
    width: 100%;
    padding: 8px;
    border: 1px solid #b39ddb;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;
}
.cra-saisie__erreur {
    white-space: pre-line;
}
.cra-saisie__boutons {
    margin-top: 15px;
}
.cra-saisie__boutons button,
.cra-saisie__boutons button:hover {
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.cra-saisie__ajouter,
.cra-saisie__ajouter:hover {
    background: #6a1b9a;
    padding: 9px 22px;
    font-weight: bold;
}
.cra-saisie__ajouter--modification,
.cra-saisie__ajouter--modification:hover {
    background: #e65100;
}
.cra-saisie__reinitialiser,
.cra-saisie__reinitialiser:hover {
    background: #95a5a6;
    padding: 9px 18px;
    margin-left: 8px;
}
.cra-saisie__collecter,
.cra-saisie__collecter:hover {
    background: #1565c0;
    padding: 9px 18px;
    margin-left: 8px;
    font-weight: bold;
}
.cra-saisie__bilan {
    margin-left: 10px;
    font-size: 12px;
    color: #1565c0;
}
.cra-saisie__liste {
    padding: 20px 0 0;
}
.cra-saisie__sous-titre {
    color: #6a1b9a;
    margin: 0 0 12px 0;
    font-size: 13px;
}
.cra-saisie__lignes {
    min-height: 60px;
    max-height: 300px;
    overflow-y: auto;
}
.cra-saisie__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: white;
    border: 1px solid #e1bee7;
    border-radius: 6px;
    margin-bottom: 6px;
    font-size: 12px;
}
.cra-saisie__item--impair {
    background: #f9f4ff;
}
.cra-saisie__type {
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    white-space: nowrap;
}
.cra-type--astreinte {
    background: #ff980022;
    color: #e65100;
}
.cra-type--activite_courante {
    background: #2e7d3222;
    color: #2e7d32;
}
.cra-type--hno {
    background: #2196f322;
    color: #1565c0;
}
.cra-saisie__dates {
    white-space: nowrap;
}
.cra-saisie__heures-ligne {
    white-space: nowrap;
    color: #666;
}
.cra-saisie__samu {
    white-space: nowrap;
    color: #6a1b9a;
    font-weight: bold;
}
.cra-saisie__objet {
    flex: 1;
    color: #444;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cra-saisie__modifier,
.cra-saisie__modifier:hover,
.cra-saisie__supprimer,
.cra-saisie__supprimer:hover {
    color: white;
    border: none;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
}
.cra-saisie__modifier,
.cra-saisie__modifier:hover {
    background: #ff9800;
}
.cra-saisie__supprimer,
.cra-saisie__supprimer:hover {
    background: #e53935;
}
.cra-saisie__vide {
    color: #999;
    text-align: center;
    font-size: 13px;
    padding: 20px 0;
    margin: 0;
}
.cra-saisie__fermer,
.cra-saisie__fermer:hover,
.cra-saisie__terminer,
.cra-saisie__terminer:hover {
    color: white;
    padding: 10px 22px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.cra-saisie__fermer,
.cra-saisie__fermer:hover {
    background: #78909c;
}
.cra-saisie__terminer,
.cra-saisie__terminer:hover {
    background: #27ae60;
    font-weight: bold;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.cra-saisie .gp-modale__boite {
    width: min(750px, 100%);
}
.gp-modale.cra-saisie .gp-modale__entete {
    background: #6a1b9a;
    margin: -18px -20px 0;
    padding: 15px 20px;
    border-radius: var(--gp-rayon-3) var(--gp-rayon-3) 0 0;
}
.gp-modale.cra-saisie .gp-modale__titre {
    color: white;
    font-size: 15px;
}
</style>
