<!-- Aide à l'affectation › onglet « Planning des déploiements » : légende (étapes masquables, trigrammes, SAMU déjà en
     service), tri, SAMU affichés, échelle, période affichée, lignes retirées, grille (colonne SAMU redimensionnable,
     affectation au clic sur une étape, rafraîchissement Asana d'une ligne), impression / export. Sous-îlot dans le
     conteneur de l'application, encore construit par l'ancien code. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { ecouter, rafraichirDepuisAsana } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import FenetreAffectation from './FenetreAffectation.vue';
import FenetreImpression from './FenetreImpression.vue';
import FenetreReport from './FenetreReport.vue';
import {
    construireColonnes,
    contenuCellule,
    debutBorne,
    definitionEtape,
    deploiementsTries,
    fondEtape,
    finBorne,
    marqueAsana,
    periodeAffichee,
    periodeAutomatique,
    Trigrammes,
    typeBorne,
    valeurBorne,
    type CleTri
} from './grille';
import { usePlanningAffectationStore } from './magasin';
import { erreurPeriode, esc, ETAPES, JALONS, PHASES, type Echelle } from './outils';
import './grille.css';
import './planning.css';
import './impression.css';

const magasin = usePlanningAffectationStore();
const sessionStore = useSessionStore();
const admin = computed(() => sessionStore.estAdmin);
const message = ref('');
const annonce = ref<{ texte: string; erreur: boolean } | null>(null);

// ── Légende ──────────────────────────────────────────────────────────────────

const masquee = (k: string) => magasin.masquees.has(k);
const libelle = (k: string) => definitionEtape(magasin.contexte, k).label;
const fond = (k: string) => fondEtape(magasin.contexte, k);
const JALONS_LEGENDE = ['mise_en_service', 'mise_en_production', ...JALONS];

// ── Tri, échelle ─────────────────────────────────────────────────────────────

const TRIS: [CleTri, string][] = [
    ['samu', 'SAMU'],
    ['chef', 'Chef de projet'],
    ['mes', 'Mise en service'],
    ['mep', 'Mise en production']
];
const ECHELLES: [Echelle, string, string][] = [
    ['day', 'Jour', 'Afficher à la maille jour'],
    ['week', 'Semaine', 'Afficher à la maille semaine'],
    ['month', 'Mois', 'Afficher à la maille mois']
];

async function changerEchelle(z: Echelle) {
    magasin.zoom = z;
    await nextTick();
    allerAujourdhui();
}

// ── SAMU affichés, lignes retirées ───────────────────────────────────────────

const choixSamuOuvert = ref(false);
const lignesRetireesOuvert = ref(false);
const tousSamu = computed(() =>
    [...magasin.deploiements].sort((a, b) =>
        String(a.samu_name || '').localeCompare(String(b.samu_name || ''), 'fr', { numeric: true })
    )
);
const samuAffiches = computed(() => tousSamu.value.filter(p => !magasin.retirees.has(p.id)).length);
const lignesRetirees = computed(() => magasin.deploiements.filter(p => magasin.retirees.has(p.id)));
const choixSamu = ref<HTMLElement | null>(null);
const listeRetirees = ref<HTMLElement | null>(null);

function clicAilleurs(e: MouseEvent) {
    const cible = e.target as Node;
    if (choixSamuOuvert.value && choixSamu.value && !choixSamu.value.contains(cible)) choixSamuOuvert.value = false;
    if (lignesRetireesOuvert.value && listeRetirees.value && !listeRetirees.value.contains(cible))
        lignesRetireesOuvert.value = false;
}

function retablir(id: number) {
    magasin.retablir(id);
    // La liste reste ouverte tant qu'il reste des lignes à rétablir
    lignesRetireesOuvert.value = lignesRetirees.value.length > 0;
}

// ── Période affichée ─────────────────────────────────────────────────────────

const typeChamp = computed(() => typeBorne(magasin.zoom));
const indication = computed(
    () => ({ date: 'calendrier', week: 'semaine et année', month: 'mois et année' })[typeChamp.value]
);
const auto = computed(() => periodeAutomatique(magasin.deploiements));
const valeurDebut = computed(() => valeurBorne(typeChamp.value, magasin.bornes?.from || auto.value.min));
const valeurFin = computed(() => valeurBorne(typeChamp.value, magasin.bornes?.to || auto.value.max));
const bornesPersonnalisees = computed(() => !!(magasin.bornes?.from || magasin.bornes?.to));
const erreurBornes = ref('');
const champDebut = ref<HTMLInputElement | null>(null);
const champFin = ref<HTMLInputElement | null>(null);

async function changerBornes() {
    const type = typeChamp.value;
    const a = auto.value;
    const vDebut = champDebut.value?.value ?? '';
    const vFin = champFin.value?.value ?? '';
    const from = vDebut === valeurBorne(type, a.min) ? null : debutBorne(type, vDebut);
    const to = vFin === valeurBorne(type, a.max) ? null : finBorne(type, vFin);
    const lo = from || a.min;
    const hi = to || a.max;
    const refus = lo > hi ? 'La borne de fin précède la borne de début.' : erreurPeriode(lo, hi, magasin.zoom);
    if (refus) {
        erreurBornes.value = refus;
        return;
    }
    erreurBornes.value = '';
    magasin.definirBornes(from || to ? { from, to } : null);
    await nextTick();
    if (grille.value) grille.value.scrollLeft = 0;
}

function toutAfficher() {
    erreurBornes.value = '';
    magasin.definirBornes(null);
}

// ── Grille ───────────────────────────────────────────────────────────────────

const grille = ref<HTMLElement | null>(null);

const SVG_ASANA =
    '<svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 16"/><path d="M20 20v-4h-4"/><circle cx="12" cy="9.4" r="1.35" fill="currentColor" stroke="none"/><circle cx="9.9" cy="13.1" r="1.35" fill="currentColor" stroke="none"/><circle cx="14.1" cy="13.1" r="1.35" fill="currentColor" stroke="none"/></svg>';
const POIGNEE = '<span class="aff-rs" title="Glisser pour ajuster la largeur de la colonne"></span>';

/** Tableau de la grille (HTML commun avec les pages imprimées) */
const tableau = computed(() => {
    if (!magasin.charge) return '';
    const ctx = magasin.contexte;
    const { min, max } = periodeAffichee(magasin.deploiements, magasin.bornes);
    const { cols, rows } = construireColonnes(magasin.zoom, min, max);
    const tri = new Trigrammes(cols, magasin.zoom, 44);
    const tete = rows
        .map(
            (r, i) => `<tr>${i === 0 ? `<th class="corner" rowspan="${rows.length}">SAMU${POIGNEE}</th>` : ''}${r}</tr>`
        )
        .join('');
    const tries = deploiementsTries(ctx, magasin.tri, magasin.retirees);
    let corps: string;
    if (!magasin.deploiements.length)
        corps = `<tr><td colspan="${cols.length + 1}" style="height:70px;text-align:center;color:#7a8799;">Aucun déploiement : créez-en dans l'onglet Administration.</td></tr>`;
    else if (!tries.length)
        corps = `<tr><td colspan="${cols.length + 1}" style="height:70px;text-align:center;color:#7a8799;">Toutes les lignes sont retirées de l'affichage : utilisez « Lignes retirées » pour les rétablir.</td></tr>`;
    else
        corps = tries
            .map(
                p =>
                    `<tr data-id="${p.id}"><th class="sam">${admin.value ? `<button type="button" class="aff-rowsync" title="Rafraîchir depuis Asana : reprend les dates nouvelles ou modifiées du projet Asana de ce SAMU" data-asana="${p.id}">${SVG_ASANA}</button>` : ''}<button type="button" class="aff-rowhide" title="Retirer cette ligne de l'affichage (rétablissable en haut du planning)" data-retirer="${p.id}">−</button><div class="n">${esc(p.samu_name)}${marqueAsana(p)}</div><div class="c">${esc(p.chef_projet_nom || 'Chef de projet non défini')}</div>${POIGNEE}</th>${cols.map(c => `<td class="${c.we ? 'we' : ''} ${c.today ? 'today' : ''}" data-k="${c.key}">${contenuCellule(ctx, tri, p, c)}</td>`).join('')}</tr>`
            )
            .join('');
    return `<table class="aff-plan-table"><thead>${tete}</thead><tbody>${corps}</tbody></table>`;
});

/** Position de défilement conservée d'un rendu à l'autre (tri, étape masquée, ligne retirée, rechargement) */
let defilement = { left: 0, top: 0 };
watch(
    tableau,
    () => {
        if (grille.value) defilement = { left: grille.value.scrollLeft, top: grille.value.scrollTop };
    },
    { flush: 'pre' }
);
watch(
    tableau,
    () => {
        const box = grille.value;
        if (!box) return;
        // En-têtes à plusieurs niveaux : position collante propre à chaque ligne
        box.querySelectorAll('thead tr').forEach((tr, i) =>
            tr.querySelectorAll<HTMLElement>('th:not(.corner)').forEach(c => (c.style.top = `${i * 24}px`))
        );
        const coin = box.querySelector<HTMLElement>('th.corner');
        if (coin) coin.style.top = '0px';
        box.scrollLeft = defilement.left;
        box.scrollTop = defilement.top;
    },
    { flush: 'post' }
);

/** Défilement sur la date du jour (centrée) */
function allerAujourdhui() {
    const box = grille.value;
    const cellule = box?.querySelector<HTMLElement>('thead th[data-today]');
    if (!box || !cellule) return;
    box.scrollLeft = Math.max(0, cellule.offsetLeft - box.clientWidth / 2 + cellule.offsetWidth / 2);
}

// Clics dans la grille : affectation (étape), retrait d'une ligne, rafraîchissement depuis Asana
const affectation = ref<{ id: number; etape: string } | null>(null);

function actionGrille(e: Event) {
    const cible = e.target as HTMLElement;
    const etape = cible.closest<HTMLElement>('[data-affecter]');
    if (etape) {
        const [id, k] = (etape.dataset.affecter ?? '').split('|');
        affectation.value = { id: Number(id), etape: k ?? '' };
        return;
    }
    const retrait = cible.closest<HTMLElement>('[data-retirer]');
    if (retrait) {
        magasin.retirer(Number(retrait.dataset.retirer));
        return;
    }
    const asana = cible.closest<HTMLButtonElement>('[data-asana]');
    if (asana) rafraichirDepuisAsana(Number(asana.dataset.asana), asana);
}

function toucheGrille(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest('[data-affecter]')) {
        e.preventDefault();
        actionGrille(e);
    }
}

// Largeur de la colonne SAMU : poignée glissée à la souris, mémorisée
function redimensionner(ev: PointerEvent) {
    const poignee = (ev.target as HTMLElement).closest('.aff-rs');
    if (!poignee) return;
    ev.preventDefault();
    const x0 = ev.clientX;
    const w0 = magasin.largeurSamu;
    let w = w0;
    document.body.classList.add('aff-resizing');
    const deplacer = (e: PointerEvent) => {
        w = w0 + e.clientX - x0;
        magasin.definirLargeurSamu(w, false);
    };
    const relacher = () => {
        document.removeEventListener('pointermove', deplacer);
        document.removeEventListener('pointerup', relacher);
        document.removeEventListener('pointercancel', relacher);
        document.body.classList.remove('aff-resizing');
        magasin.definirLargeurSamu(w, true);
    };
    document.addEventListener('pointermove', deplacer);
    document.addEventListener('pointerup', relacher);
    document.addEventListener('pointercancel', relacher);
}

// ── Affectation, report, impression ──────────────────────────────────────────

const report = ref<{ id: number; etape: string; auto: boolean } | null>(null);
const impression = ref(false);

function annoncer(texte: string, erreur = false, duree = 6000) {
    annonce.value = { texte, erreur };
    setTimeout(() => {
        if (annonce.value?.texte === texte) annonce.value = null;
    }, duree);
}

// ── Ouverture ────────────────────────────────────────────────────────────────

async function ouvrir() {
    await sessionStore.charger();
    await magasin.charger();
    await nextTick();
    allerAujourdhui();
}

let arreterEcoute: (() => void) | null = null;
onMounted(() => {
    void ouvrir();
    document.addEventListener('click', clicAilleurs);
    // Déploiements modifiés par l'administration (ancien code) : grille relue
    arreterEcoute = ecouter('deploiements-modifies', () => void magasin.relireDeploiements());
});
onBeforeUnmount(() => {
    document.removeEventListener('click', clicAilleurs);
    arreterEcoute?.();
});
surReouverture(() => void ouvrir());
</script>

<template>
    <div id="affLegendBar" class="aff-legendbar">
        <template v-if="magasin.config">
            <span class="t">Légende</span>
            <button
                v-for="k in PHASES"
                :key="k"
                type="button"
                class="chip"
                :class="{ off: masquee(k) }"
                :title="`${masquee(k) ? 'Afficher' : 'Masquer'} : ${libelle(k)}`"
                @click="magasin.basculerEtape(k)"
            >
                <i :style="fond(k)"></i>{{ libelle(k) }}
            </button>
            <span class="sep"></span>
            <button
                v-for="k in JALONS_LEGENDE"
                :key="k"
                type="button"
                class="chip"
                :class="{ off: masquee(k) }"
                :title="`${masquee(k) ? 'Afficher' : 'Masquer'} : ${libelle(k)}`"
                @click="magasin.basculerEtape(k)"
            >
                <i class="dot" :style="fond(k)"></i>{{ libelle(k) }}
            </button>
            <span class="sep"></span>
            <button
                v-for="k in ETAPES"
                :key="k"
                type="button"
                class="chip"
                :class="{ off: masquee(k) }"
                :title="`${masquee(k) ? 'Afficher' : 'Masquer'} : ${libelle(k)}`"
                @click="magasin.basculerEtape(k)"
            >
                <i :style="fond(k)"></i>{{ libelle(k) }}
            </button>
            <span class="sep"></span>
            <button
                type="button"
                class="chip tri-sw"
                :class="{ off: masquee('_tri') }"
                role="switch"
                :aria-checked="masquee('_tri') ? 'false' : 'true'"
                :title="`${masquee('_tri') ? 'Afficher' : 'Masquer'} les trigrammes des experts dans les étapes (VFT, formation, accompagnement, prérequis, visite métier)`"
                @click="magasin.basculerEtape('_tri')"
            >
                <span class="sw"><i></i></span>Trigrammes des experts
            </button>
            <span class="sep"></span>
            <button
                type="button"
                class="chip"
                :class="{ off: masquee('_past') }"
                :title="`${masquee('_past') ? 'Afficher' : 'Masquer'} les SAMU dont la date de mise en service est passée`"
                @click="magasin.basculerEtape('_past')"
            >
                <i class="dot aff-plan__passe"></i>SAMU déjà en service
            </button>
            <span class="aff-muted aff-plan__aide">Cliquer sur une rubrique pour l'afficher / la masquer</span>
        </template>
    </div>

    <div class="aff-plan-bar">
        <h2 class="aff-plan__titre">Planning des déploiements</h2>
        <div class="aff-plan-ctrl">
            <span class="aff-muted aff-plan__trier">Trier par</span>
            <div class="aff-seg aff-sort" role="group" aria-label="Tri">
                <button
                    v-for="[k, nom] in TRIS"
                    :key="k"
                    type="button"
                    :class="{ on: magasin.tri.key === k }"
                    @click="magasin.trier(k)"
                >
                    {{ nom }}<template v-if="magasin.tri.key === k">{{ magasin.tri.dir > 0 ? ' ▲' : ' ▼' }}</template>
                </button>
            </div>
            <span id="affSamuDd" ref="choixSamu" class="aff-dd">
                <button
                    type="button"
                    class="aff-btn"
                    title="Choisir les SAMU affichés dans le planning"
                    :aria-expanded="choixSamuOuvert"
                    @click.stop="choixSamuOuvert = !choixSamuOuvert"
                >
                    <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                        <path d="M8 14h5M11 18h5" /></svg
                    >SAMU affichés ({{ samuAffiches }}/{{ tousSamu.length }}) ▾
                </button>
                <div v-if="choixSamuOuvert" class="aff-dd-pop">
                    <div class="hd">
                        <button type="button" class="aff-btn" @click="magasin.afficherTous(true)">Tous</button>
                        <button type="button" class="aff-btn" @click="magasin.afficherTous(false)">Aucun</button>
                    </div>
                    <label v-for="p in tousSamu" :key="p.id">
                        <input
                            type="checkbox"
                            :checked="!magasin.retirees.has(p.id)"
                            @change="magasin.afficherSamu(p.id, ($event.target as HTMLInputElement).checked)"
                        />{{ p.samu_name }}
                    </label>
                </div>
            </span>
            <div class="aff-seg" role="group" aria-label="Échelle de temps">
                <button
                    v-for="[z, nom, titre] in ECHELLES"
                    :key="z"
                    type="button"
                    :class="{ on: magasin.zoom === z }"
                    :title="titre"
                    @click="changerEchelle(z)"
                >
                    {{ nom }}
                </button>
            </div>
            <button
                type="button"
                class="aff-btn"
                title="Mettre en page, imprimer ou exporter en PDF / PowerPoint"
                :disabled="!magasin.charge"
                @click="impression = true"
            >
                <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" rx="1" /></svg
                >Imprimer / Exporter
            </button>
            <button type="button" class="aff-btn" title="Se placer sur la date du jour" @click="allerAujourdhui">
                <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="M8 14h5M11 18h5" /></svg
                >Aujourd'hui
            </button>
        </div>
    </div>

    <div id="affRangeCtl" class="aff-range">
        <template v-if="magasin.charge">
            <span class="lbl">Période affichée</span> du
            <input
                id="affRgFrom"
                ref="champDebut"
                :key="`d-${typeChamp}-${valeurDebut}`"
                :type="typeChamp"
                :value="valeurDebut"
                :class="{ bad: !!erreurBornes }"
                :title="`Borne inférieure (${indication})`"
                @change="changerBornes"
            />
            au
            <input
                id="affRgTo"
                ref="champFin"
                :key="`f-${typeChamp}-${valeurFin}`"
                :type="typeChamp"
                :value="valeurFin"
                :class="{ bad: !!erreurBornes }"
                :title="`Borne supérieure (${indication})`"
                @change="changerBornes"
            />
            <span class="aff-muted aff-plan__indication">({{ indication }})</span>
            <button
                v-if="bornesPersonnalisees"
                type="button"
                class="aff-btn"
                title="Revenir à l'affichage automatique de toute la période"
                @click="toutAfficher"
            >
                Tout afficher
            </button>
            <span id="affRgErr" class="aff-error">{{ erreurBornes }}</span>
            <span v-if="lignesRetirees.length" ref="listeRetirees" class="aff-hid-wrap aff-plan__retirees">
                <button
                    type="button"
                    class="aff-btn"
                    title="Rétablir les lignes retirées"
                    :aria-expanded="lignesRetireesOuvert"
                    @click.stop="lignesRetireesOuvert = !lignesRetireesOuvert"
                >
                    <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                        <path d="M8 14h5M11 18h5" /></svg
                    >Lignes retirées ({{ lignesRetirees.length }}) ▾
                </button>
                <div v-if="lignesRetireesOuvert" id="affHidPop" class="aff-hid-pop">
                    <div class="hd">
                        <b>Lignes retirées de l'affichage</b
                        ><button type="button" class="aff-btn" @click="magasin.toutRetablir()">Tout rétablir</button>
                    </div>
                    <div v-for="p in lignesRetirees" :key="p.id" class="row">
                        <span>{{ p.samu_name }}</span
                        ><button type="button" class="aff-btn" @click.stop="retablir(p.id)">Rétablir</button>
                    </div>
                </div>
            </span>
        </template>
    </div>

    <div
        id="affPlan"
        ref="grille"
        class="aff-plan"
        :style="{ '--aff-samw': `${magasin.largeurSamu}px` }"
        @click="actionGrille"
        @keydown="toucheGrille"
        @pointerdown="redimensionner"
    >
        <p v-if="magasin.erreur" class="aff-error aff-plan__erreur">Chargement impossible : {{ magasin.erreur }}</p>
        <p v-else-if="!magasin.charge" class="aff-muted aff-plan__chargement">Chargement…</p>
        <!-- Tableau produit par grille.ts (textes échappés), commun avec les pages imprimées -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="aff-plan__contenu" v-html="tableau"></div>
    </div>

    <div v-if="annonce" class="aff-toast" :class="{ err: annonce.erreur }" role="status">{{ annonce.texte }}</div>

    <FenetreAffectation
        v-if="affectation"
        :deploiement-id="affectation.id"
        :etape="affectation.etape"
        :admin="admin"
        @fermer="affectation = null"
        @annonce="annoncer"
        @message="message = $event"
        @report="(id, etape, auto) => (report = { id, etape, auto })"
    />
    <FenetreReport
        v-if="report"
        :deploiement-id="report.id"
        :etape="report.etape"
        :auto="report.auto"
        @fermer="report = null"
        @message="message = $event"
    />
    <FenetreImpression v-if="impression" @fermer="impression = false" />
    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
.aff-plan__passe {
    background: #7a8799;
}
.aff-plan__aide {
    margin-left: auto;
    font-size: 11px;
}
.aff-plan__titre {
    margin: 0;
}
.aff-plan__trier {
    font-weight: 700;
}
.aff-plan__indication {
    font-size: 12px;
}
.aff-plan__retirees {
    position: relative;
    margin-left: auto;
}
.aff-plan__erreur,
.aff-plan__chargement {
    padding: 18px;
}
</style>
