<!-- Filtre d'une colonne liste ou énumération : valeurs à inclure (recherche avec sélection multiple), groupes de valeurs
     (OU dans un groupe ; ET / OU entre groupes, à basculer), valeurs déplacées d'un groupe à l'autre par glisser-déposer,
     valeurs à exclure -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    ajouterGroupe,
    ajouterJetons,
    basculerOperateur,
    deplacerJeton,
    estListe,
    exclure,
    normaliser,
    nombreFr,
    retirerExclusion,
    retirerGroupe,
    retirerJeton,
    type Operateur
} from './filtres';
import { useAnalyseStore } from './magasin';

const props = defineProps<{ colonne: string; valeurs: string[] }>();
const magasin = useAnalyseStore();

const MAX_PROPOSEES = 500;
const filtre = computed(() => {
    const f = magasin.filtres[props.colonne];
    return estListe(f) ? f : null;
});
const groupes = computed(() => filtre.value?.groups ?? [{ tokens: [] }]);
const exclues = computed(() => filtre.value?.excluded ?? []);
const avecValeurs = computed(() => groupes.value.some(g => g.tokens.length > 0));
const definir = (f: ReturnType<typeof retirerJeton>) => magasin.definirFiltre(props.colonne, f);
const court = (v: string) => (v.length > 30 ? `${v.substring(0, 28)}…` : v);
const titreRetrait = (v: string) => `Supprimer "${v}"`;

const correspond = (recherche: string) => {
    const q = normaliser(recherche);
    return q ? props.valeurs.filter(v => normaliser(v).includes(q)) : props.valeurs;
};

// ── Valeurs à inclure ─────────────────────────────────────────────────────────

const recherche = ref('');
const ouverte = ref(false);
const selection = ref(new Set<string>());

const disponibles = computed(() => {
    const utilisees = new Set(groupes.value.flatMap(g => g.tokens));
    return correspond(recherche.value).filter(v => !utilisees.has(v) && !exclues.value.includes(v));
});
const proposees = computed(() => disponibles.value.slice(0, MAX_PROPOSEES));
const toutesCochees = computed(() => selection.value.size > 0 && selection.value.size === proposees.value.length);

function ouvrir() {
    ouverte.value = true;
    // Sélection conservée d'une frappe à l'autre, limitée aux valeurs encore proposées
    const visibles = new Set(proposees.value);
    selection.value = new Set([...selection.value].filter(v => visibles.has(v)));
}

let fermeture: ReturnType<typeof setTimeout> | undefined;
function quitter() {
    clearTimeout(fermeture);
    fermeture = setTimeout(() => {
        ouverte.value = false;
        selection.value = new Set();
    }, 150);
}

function cocher(v: string, oui: boolean) {
    const s = new Set(selection.value);
    if (oui) s.add(v);
    else s.delete(v);
    selection.value = s;
}

function toutCocher(oui: boolean) {
    selection.value = oui ? new Set(proposees.value) : new Set();
}

function ajouterSelection() {
    definir(ajouterJetons(filtre.value, selection.value));
    selection.value = new Set();
    recherche.value = '';
    ouverte.value = false;
}

// ── Valeurs à exclure ─────────────────────────────────────────────────────────

const rechercheExclusion = ref('');
const exclusionOuverte = ref(false);
const selectionExclusion = ref(new Set<string>());
const exclusionsProposees = computed(() =>
    correspond(rechercheExclusion.value)
        .filter(v => !exclues.value.includes(v))
        .slice(0, MAX_PROPOSEES)
);
const exclusionsToutesCochees = computed(
    () => selectionExclusion.value.size > 0 && selectionExclusion.value.size === exclusionsProposees.value.length
);

function ouvrirExclusion() {
    exclusionOuverte.value = true;
    selectionExclusion.value = new Set();
}

let fermetureExclusion: ReturnType<typeof setTimeout> | undefined;
function quitterExclusion() {
    clearTimeout(fermetureExclusion);
    fermetureExclusion = setTimeout(() => {
        exclusionOuverte.value = false;
        selectionExclusion.value = new Set();
    }, 150);
}

function cocherExclusion(v: string, oui: boolean) {
    const s = new Set(selectionExclusion.value);
    if (oui) s.add(v);
    else s.delete(v);
    selectionExclusion.value = s;
}

function exclureValeurs(valeurs: Iterable<string>) {
    definir(exclure(filtre.value, valeurs));
    selectionExclusion.value = new Set();
    rechercheExclusion.value = '';
    exclusionOuverte.value = false;
}

// ── Groupes et glisser-déposer ───────────────────────────────────────────────

/** Valeur en cours de déplacement */
const glisse = ref<{ gi: number; ti: number } | null>(null);
/** Zone survolée pendant un déplacement : groupe, ou position dans un groupe (« gi:ti » ; « gi:fin ») */
const survol = ref<string | null>(null);

function commencer(e: DragEvent, gi: number, ti: number, jeton: string) {
    glisse.value = { gi, ti };
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', jeton);
    }
}

function terminer() {
    glisse.value = null;
    survol.value = null;
}

/** Dépôt sur la boîte d'un groupe : la valeur passe en fin de groupe (sans effet dans son propre groupe) */
function deposerDansGroupe(gi: number) {
    const g = glisse.value;
    terminer();
    if (!g || g.gi === gi) return;
    definir(deplacerJeton(filtre.value, g, { gi, ti: groupes.value[gi]?.tokens.length ?? 0 }));
}

/** Dépôt à une position : avant une valeur, ou après la dernière */
function deposerA(gi: number, ti: number) {
    const g = glisse.value;
    terminer();
    if (!g) return;
    definir(deplacerJeton(filtre.value, g, { gi, ti }));
}

const ajouterUnGroupe = (op: Operateur) => definir(ajouterGroupe(filtre.value, op));
</script>

<template>
    <div class="ana-val__entete">
        <span class="ana-val__titre" :title="colonne">{{ colonne }}</span>
        <span class="ana-val__badge">multi-valeurs · ET/OU</span>
    </div>

    <!-- Valeurs à inclure -->
    <div class="ana-val__recherche">
        <input
            v-model="recherche"
            type="text"
            class="ana-val__champ"
            placeholder="Rechercher des valeurs à inclure dans le filtre…"
            @focus="ouvrir"
            @input="ouvrir"
            @keydown.escape="ouverte = false"
            @blur="quitter"
        />
        <div v-if="ouverte" class="ana-val__propositions">
            <div v-if="!disponibles.length" class="ana-val__aucune">Aucune valeur disponible</div>
            <template v-else>
                <div class="ana-val__barre">
                    <input
                        type="checkbox"
                        class="ana-val__case"
                        title="Tout cocher / décocher"
                        :checked="toutesCochees"
                        @change="toutCocher(($event.target as HTMLInputElement).checked)"
                    />
                    <span class="ana-val__tout" @mousedown.prevent="toutCocher(!toutesCochees)">{{
                        toutesCochees ? 'Tout désélectionner' : 'Tout sélectionner'
                    }}</span>
                    <button
                        v-if="selection.size > 0"
                        type="button"
                        class="ana-val__ajouter"
                        @mousedown.prevent="ajouterSelection"
                    >
                        Ajouter ({{ selection.size }})
                    </button>
                </div>
                <div
                    v-for="v in proposees"
                    :key="v"
                    class="sug-item ana-val__proposition"
                    @mousedown.prevent="cocher(v, !selection.has(v))"
                >
                    <input
                        type="checkbox"
                        class="ana-val__case"
                        :checked="selection.has(v)"
                        @mousedown.stop
                        @change="cocher(v, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="ana-val__texte">{{ v }}</span>
                </div>
                <div v-if="disponibles.length > MAX_PROPOSEES" class="ana-val__plus">
                    … et {{ nombreFr(disponibles.length - MAX_PROPOSEES) }} autres — affinez la recherche
                </div>
                <div class="ana-val__compteur">{{ nombreFr(disponibles.length) }} valeur(s) disponible(s)</div>
            </template>
        </div>
    </div>

    <!-- Groupes -->
    <div>
        <div v-if="!avecValeurs && groupes.length <= 1" class="ana-val__vide">
            Aucun filtre actif — recherchez une valeur ci-dessus ou glissez-déposez entre groupes
        </div>
        <template v-else>
            <template v-for="(groupe, gi) in groupes" :key="gi">
                <div v-if="gi > 0" class="ana-val__separateur">
                    <div class="ana-val__trait"></div>
                    <div
                        class="ana-val__operateur"
                        :class="
                            (filtre?.ops[gi - 1] || 'AND') === 'AND'
                                ? 'ana-val__operateur--et'
                                : 'ana-val__operateur--ou'
                        "
                        title="Cliquer pour basculer entre ET et OU"
                        role="button"
                        tabindex="0"
                        @click="definir(basculerOperateur(filtre, gi - 1))"
                        @keydown.enter="definir(basculerOperateur(filtre, gi - 1))"
                    >
                        <span class="ana-val__et">ET</span><span class="ana-val__ou">OU</span>
                    </div>
                    <div class="ana-val__trait"></div>
                </div>
                <div class="ana-val__groupe-entete">
                    <span class="ana-val__groupe-titre">Groupe {{ gi + 1 }}</span>
                    <button type="button" class="ana-val__supprimer-groupe" @click="definir(retirerGroupe(filtre, gi))">
                        🗑 Supprimer ce groupe
                    </button>
                </div>
                <div
                    class="ana-val__groupe"
                    :class="{
                        'ana-val__groupe--rempli': groupe.tokens.length > 0,
                        'ana-val__groupe--survol': survol === `${gi}` && glisse && glisse.gi !== gi
                    }"
                    @dragover.prevent="survol = `${gi}`"
                    @dragleave="survol = null"
                    @drop.prevent="deposerDansGroupe(gi)"
                >
                    <template v-for="(jeton, ti) in groupe.tokens" :key="jeton">
                        <span v-if="ti > 0" class="ana-val__ou-interne">OU</span>
                        <div
                            class="ana-val__depot"
                            :class="{ 'ana-val__depot--survol': survol === `${gi}:${ti}` }"
                            @dragover.prevent.stop="survol = `${gi}:${ti}`"
                            @dragleave="survol = null"
                            @drop.prevent.stop="deposerA(gi, ti)"
                        ></div>
                        <div
                            class="ana-val__jeton"
                            :class="{ 'ana-val__jeton--glisse': glisse?.gi === gi && glisse?.ti === ti }"
                            draggable="true"
                            :title="`${jeton}\n(cliquer × pour supprimer, glisser pour déplacer)`"
                            @dragstart="commencer($event, gi, ti, jeton)"
                            @dragend="terminer"
                        >
                            <span>{{ court(jeton) }}</span>
                            <button
                                type="button"
                                class="ana-val__retirer"
                                :title="titreRetrait(jeton)"
                                :aria-label="`Supprimer ${jeton}`"
                                @click.stop="definir(retirerJeton(filtre, gi, ti))"
                            >
                                ×
                            </button>
                        </div>
                    </template>
                    <div
                        class="ana-val__depot ana-val__depot--fin"
                        :class="{ 'ana-val__depot--survol-fin': survol === `${gi}:fin` }"
                        @dragover.prevent.stop="survol = `${gi}:fin`"
                        @dragleave="survol = null"
                        @drop.prevent.stop="deposerA(gi, groupe.tokens.length)"
                    ></div>
                    <span v-if="!groupe.tokens.length" class="ana-val__indice"
                        >Glissez des valeurs ici ou recherchez ci-dessus</span
                    >
                </div>
            </template>
            <div class="ana-val__actions">
                <div class="ana-val__ajout-groupe">
                    <button
                        type="button"
                        class="ana-val__groupe-et"
                        title="Ajouter un groupe lié par ET"
                        @click="ajouterUnGroupe('AND')"
                    >
                        ＋ groupe ET
                    </button>
                    <button
                        type="button"
                        class="ana-val__groupe-ou"
                        title="Ajouter un groupe lié par OU"
                        @click="ajouterUnGroupe('OR')"
                    >
                        ＋ groupe OU
                    </button>
                </div>
                <button type="button" class="ana-val__effacer" @click="definir(null)">✕ Effacer tout</button>
            </div>
        </template>
    </div>

    <!-- Valeurs à exclure -->
    <div class="ana-val__separateur-exclusion">
        <div class="ana-val__trait ana-val__trait--exclusion"></div>
        <span class="ana-val__exclure-titre">⊘ EXCLURE</span>
        <div class="ana-val__trait ana-val__trait--exclusion"></div>
    </div>
    <div class="ana-val__recherche ana-val__recherche--exclusion">
        <input
            v-model="rechercheExclusion"
            type="text"
            class="ana-val__champ ana-val__champ--exclusion"
            placeholder="Rechercher des valeurs à exclure…"
            @focus="ouvrirExclusion"
            @input="ouvrirExclusion"
            @keydown.escape="exclusionOuverte = false"
            @blur="quitterExclusion"
        />
        <div v-if="exclusionOuverte" class="ana-val__propositions ana-val__propositions--exclusion">
            <div v-if="!exclusionsProposees.length" class="ana-val__aucune">Aucune valeur disponible</div>
            <template v-else>
                <div class="ana-val__barre ana-val__barre--exclusion">
                    <input
                        type="checkbox"
                        class="ana-val__case"
                        :checked="exclusionsToutesCochees"
                        @change="
                            selectionExclusion = ($event.target as HTMLInputElement).checked
                                ? new Set(exclusionsProposees)
                                : new Set()
                        "
                    />
                    <span
                        class="ana-val__tout ana-val__tout--exclusion"
                        @mousedown.prevent="
                            selectionExclusion = exclusionsToutesCochees ? new Set() : new Set(exclusionsProposees)
                        "
                        >{{ exclusionsToutesCochees ? 'Tout désélectionner' : 'Tout sélectionner' }}</span
                    >
                    <button
                        v-if="selectionExclusion.size > 0"
                        type="button"
                        class="ana-val__exclure"
                        @mousedown.prevent="exclureValeurs(selectionExclusion)"
                    >
                        Exclure ({{ selectionExclusion.size }})
                    </button>
                </div>
                <div
                    v-for="v in exclusionsProposees"
                    :key="v"
                    class="excl-item ana-val__proposition ana-val__proposition--exclusion"
                    @mousedown.prevent="exclureValeurs([v])"
                >
                    <input
                        type="checkbox"
                        class="ana-val__case"
                        :checked="selectionExclusion.has(v)"
                        @mousedown.stop
                        @change="cocherExclusion(v, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="ana-val__texte">{{ v }}</span>
                </div>
            </template>
        </div>
    </div>
    <div v-if="exclues.length" class="ana-val__exclues">
        <span class="ana-val__exclues-titre">⊘ Exclus :</span>
        <div v-for="(v, ei) in exclues" :key="v" class="ana-val__exclue">
            <span :title="v">{{ court(v) }}</span>
            <button
                type="button"
                class="ana-val__retirer ana-val__retirer--exclusion"
                :aria-label="`Ne plus exclure ${v}`"
                @click="definir(retirerExclusion(filtre, ei))"
            >
                ×
            </button>
        </div>
    </div>
</template>

<style>
.ana-val__entete {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}
.ana-val__titre {
    font-size: 10px;
    color: #3f51b5;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}
.ana-val__badge {
    font-size: 10px;
    background: #7986cb;
    color: white;
    padding: 1px 7px;
    border-radius: 10px;
    white-space: nowrap;
}
.ana-val__recherche {
    position: relative;
    margin-bottom: 10px;
}
.ana-val__recherche--exclusion {
    margin-bottom: 6px;
}
.ana-val__champ {
    width: 100%;
    padding: 5px 10px;
    border: 1.5px solid #9fa8da;
    border-radius: 6px;
    font-size: 12px;
    box-sizing: border-box;
    outline: none;
}
.ana-val__champ--exclusion {
    border-color: #ef9a9a;
}
.ana-val__propositions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #9fa8da;
    border-top: none;
    border-radius: 0 0 8px 8px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 200;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}
.ana-val__propositions--exclusion {
    border-color: #ef9a9a;
    max-height: 240px;
}
.ana-val__aucune {
    padding: 8px 12px;
    color: #999;
    font-size: 12px;
    font-style: italic;
}
.ana-val__barre {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: #f0f2ff;
    border-bottom: 1px solid #c5cae9;
    position: sticky;
    top: 0;
    z-index: 1;
    box-sizing: border-box;
}
.ana-val__barre--exclusion {
    background: #ffebee;
    border-bottom-color: #ef9a9a;
}
.ana-val__case {
    cursor: pointer;
    flex-shrink: 0;
    width: 14px;
    height: 14px;
}
.ana-val__tout {
    font-size: 11px;
    color: #3f51b5;
    cursor: pointer;
    flex: 1;
    white-space: nowrap;
}
.ana-val__tout--exclusion {
    color: #c62828;
}
.ana-val__ajouter,
.ana-val__exclure {
    background: #3f51b5;
    color: white;
    border: none;
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
}
.ana-val__exclure {
    background: #c62828;
}
.ana-val__proposition {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    box-sizing: border-box;
}
.ana-val__proposition:hover {
    background: #e8eaf6;
}
.ana-val__proposition--exclusion:hover {
    background: #ffebee;
}
.ana-val__texte {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ana-val__plus {
    padding: 6px 12px;
    font-size: 11px;
    color: #9fa8da;
    font-style: italic;
    background: #f8f9ff;
}
.ana-val__compteur {
    padding: 4px 12px;
    font-size: 10px;
    color: #bbb;
    background: #fafafa;
    border-top: 1px solid #eee;
    text-align: right;
}
.ana-val__vide {
    font-size: 11px;
    color: #9fa8da;
    padding: 4px 2px;
    font-style: italic;
}
.ana-val__separateur,
.ana-val__separateur-exclusion {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0;
}
.ana-val__separateur-exclusion {
    gap: 8px;
    margin: 10px 0 6px;
}
.ana-val__trait {
    flex: 1;
    height: 1px;
    background: #c5cae9;
}
.ana-val__trait--exclusion {
    background: #ffcdd2;
}
.ana-val__exclure-titre {
    font-size: 10px;
    color: #c62828;
    font-weight: bold;
    letter-spacing: 0.5px;
    white-space: nowrap;
}
.ana-val__operateur {
    display: flex;
    border-radius: 16px;
    overflow: hidden;
    border: 2px solid #283593;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
}
.ana-val__operateur--ou {
    border-color: #6a1b9a;
}
.ana-val__et,
.ana-val__ou {
    padding: 3px 14px;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 1px;
    background: white;
    transition: background 0.15s;
}
.ana-val__et {
    color: #283593;
}
.ana-val__ou {
    color: #6a1b9a;
}
.ana-val__operateur--et .ana-val__et {
    background: #283593;
    color: white;
}
.ana-val__operateur--ou .ana-val__ou {
    background: #6a1b9a;
    color: white;
}
.ana-val__groupe-entete {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
}
.ana-val__groupe-titre {
    font-size: 10px;
    color: #7986cb;
    font-weight: bold;
}
.ana-val__supprimer-groupe {
    background: none;
    border: none;
    color: #e53935;
    font-size: 10px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.7;
}
.ana-val__supprimer-groupe:hover {
    opacity: 1;
}
.ana-val__groupe {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: 38px;
    padding: 6px 8px;
    background: #f5f5ff;
    border: 2px dashed #c5cae9;
    border-radius: 8px;
    transition:
        border-color 0.15s,
        background 0.15s;
    margin-bottom: 2px;
}
.ana-val__groupe--rempli {
    background: #e8eaf6;
    border-color: #9fa8da;
}
.ana-val__groupe--survol {
    background: #c5cae9;
    border-color: #3f51b5;
}
.ana-val__ou-interne {
    font-size: 10px;
    color: #7986cb;
    font-weight: bold;
    padding: 0 2px;
    user-select: none;
}
.ana-val__depot {
    width: 4px;
    min-height: 24px;
    border-radius: 2px;
    transition:
        width 0.15s,
        background 0.15s;
}
.ana-val__depot--survol {
    width: 3px;
    background: #3f51b5;
}
.ana-val__depot--fin {
    flex: 1;
    min-width: 4px;
}
.ana-val__depot--survol-fin {
    background: #3f51b5;
    min-width: 20px;
}
.ana-val__jeton {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #3f51b5;
    color: white;
    padding: 4px 10px;
    border-radius: 14px;
    font-size: 11px;
    cursor: grab;
    user-select: none;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: opacity 0.15s;
}
.ana-val__jeton--glisse {
    opacity: 0.4;
}
.ana-val__retirer {
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    opacity: 0.7;
    padding: 0 2px;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.3);
    margin-left: 3px;
    background: none;
    color: inherit;
}
.ana-val__retirer:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
}
.ana-val__retirer--exclusion {
    font-size: 14px;
    border-left: none;
    margin-left: 0;
}
.ana-val__retirer--exclusion:hover {
    background: none;
}
.ana-val__indice {
    font-size: 11px;
    color: #bbb;
    font-style: italic;
    pointer-events: none;
}
.ana-val__actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
    align-items: center;
}
.ana-val__ajout-groupe {
    display: flex;
    border-radius: 16px;
    overflow: hidden;
    border: 1.5px solid #3f51b5;
}
.ana-val__groupe-et,
.ana-val__groupe-ou {
    background: white;
    border: none;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
}
.ana-val__groupe-et {
    color: #283593;
}
.ana-val__groupe-ou {
    color: #6a1b9a;
    border-left: 1px solid #c5cae9;
}
.ana-val__effacer {
    background: none;
    border: 1.5px solid #e53935;
    color: #e53935;
    padding: 4px 12px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 11px;
    margin-left: auto;
}
.ana-val__exclues {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
}
.ana-val__exclues-titre {
    font-size: 10px;
    color: #c62828;
    font-weight: bold;
    white-space: nowrap;
}
.ana-val__exclue {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #ffebee;
    color: #c62828;
    border: 1px solid #ef9a9a;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 11px;
    white-space: nowrap;
}
</style>
