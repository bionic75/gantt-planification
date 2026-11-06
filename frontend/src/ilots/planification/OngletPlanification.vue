<!-- Onglet Planification : options d'affichage (année, mois, filtres), légende, grille des demi-journées (navigation,
     zoom, lignes masquées) et saisie (disponibilité, affectation, localisation, SAMU). Les exports, impressions et le
     menu contextuel des astreintes restent dans l'ancien code (lots 4.5b et 4.6). -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import type { Ressource } from '@/api/ressources';
import AppIcone from '@/composants/AppIcone.vue';
import AppModal from '@/composants/AppModal.vue';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { SAMU_ASTREINTES } from '@/ilots/saisie/astreintes';
import { accesAccueil, ecouter, emettre, imprimerPlanning, telechargerPlanning, type NomFenetre } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import GrillePlanification, { type LigneCellule } from './GrillePlanification.vue';
import {
    LIBELLES_AFFECTATION,
    NOMS_MOIS,
    anneesProposees,
    moisVoisin,
    ressourcesAffichees,
    type JourGrille,
    type Periode
} from './grille';
import { usePlanificationStore } from './magasin';
import {
    MESSAGES,
    basculerDisponibilite,
    changerAffectation,
    choisirLocalisation,
    controlerAffectation,
    ouvrirLocalisation,
    type Cellule,
    type Confirmation,
    type ContexteSaisie,
    type OptionLocalisation,
    type Resultat
} from './saisie';
import { styleZoom, ZOOM } from './zoom';

const p = usePlanificationStore();
const session = useSessionStore();

// ---------- Sections repliables ----------

const optionsOuvertes = ref(false);
const legendeOuverte = ref(false);
const grilleOuverte = ref(true);

// ---------- Mois, filtres ----------

const annees = computed(() => anneesProposees(new Date().getFullYear(), p.annee));
const titre = computed(() => `${NOMS_MOIS[p.mois]} ${p.annee}`);

/** Ressources du filtre : actives, par nom et prénom */
const optionsRessources = computed(() =>
    p.ressources
        .filter(r => r.actif)
        .sort((a, b) => `${a.nom} ${a.prenom}`.toLowerCase().localeCompare(`${b.nom} ${b.prenom}`.toLowerCase()))
);
const fonctions = computed(() =>
    [...new Set(p.ressources.filter(r => r.actif && r.fonction).map(r => r.fonction!))].sort()
);

/** Tri de la colonne « Ressource » (clic sur l'en-tête) : ordre de chargement, puis croissant / décroissant */
const tri = ref<'asc' | 'desc' | null>(null);
const ressources = computed(() => {
    const liste = ressourcesAffichees(p.ressources, p.filtreRessources, p.filtreFonctions);
    if (!tri.value) return liste;
    const nom = (r: Ressource) => `${r.nom} ${r.prenom}`;
    return [...liste].sort((a, b) => (tri.value === 'asc' ? 1 : -1) * nom(a).localeCompare(nom(b)));
});
const trier = () => (tri.value = tri.value === 'asc' ? 'desc' : 'asc');

/** Mise en évidence du jour courant à l'ouverture de l'onglet, jusqu'à la première modification */
const surbrillance = ref(true);

function naviguer(sens: number) {
    ({ annee: p.annee, mois: p.mois } = moisVoisin(p.annee, p.mois, sens));
    surbrillance.value = false;
}
watch(
    [() => p.annee, () => p.mois, () => p.filtreRessources, () => p.filtreFonctions],
    () => (surbrillance.value = false)
);

/** Ouverture de l'onglet : mois courant ; expert : sa ressource seule dans le filtre */
async function ouvrir() {
    const s = await session.charger();
    const maintenant = new Date();
    p.annee = maintenant.getFullYear();
    p.mois = maintenant.getMonth();
    if (s.activeProfile === 'expert' && s.resourceId) p.filtreRessources = [String(s.resourceId)];
    await nextTick();
    surbrillance.value = true;
}

// ---------- Lignes masquées (mémorisées dans le navigateur) ----------

const CLE_MASQUEES = 'gp_gantt_hidden';
const lireMasquees = (): number[] => {
    try {
        return JSON.parse(localStorage.getItem(CLE_MASQUEES) || '[]');
    } catch {
        return [];
    }
};
const masquees = ref(new Set<number>(lireMasquees()));
function ecrireMasquees(s: Set<number>) {
    masquees.value = s;
    try {
        localStorage.setItem(CLE_MASQUEES, JSON.stringify([...s]));
    } catch {
        // Stockage indisponible
    }
}
const masquer = (id: number) => ecrireMasquees(new Set([...masquees.value, id]));
function afficher(id: number) {
    const s = new Set(masquees.value);
    s.delete(id);
    ecrireMasquees(s);
}
function toutAfficher() {
    ecrireMasquees(new Set());
    listeMasquees.value = false;
}

const avecLigneConges = computed(
    () =>
        !!(p.conges.zoneA?.length || p.conges.zoneB?.length || p.conges.zoneC?.length) ||
        p.datesParticulieres.length > 0
);
/** Lignes masquées présentes dans la grille (ressources affichées, ligne des congés) */
const lignesMasquees = computed(() => [
    ...(avecLigneConges.value && masquees.value.has(-1)
        ? [{ id: -1, nom: 'Congés scolaires, jours fériés, événements' }]
        : []),
    ...ressources.value.filter(r => masquees.value.has(r.id)).map(r => ({ id: r.id, nom: `${r.nom} ${r.prenom}` }))
]);
const listeMasquees = ref(false);
watch(lignesMasquees, l => {
    if (l.length === 0) listeMasquees.value = false;
});
const zoneMasquees = ref<HTMLElement | null>(null);
function clicDocument(e: MouseEvent) {
    if (zoneMasquees.value && !zoneMasquees.value.contains(e.target as Node)) listeMasquees.value = false;
}

// ---------- Zoom ----------

const zoom = ref(100);
function zoomer(sens: number) {
    const n = zoom.value + sens * ZOOM.pas;
    if (n >= ZOOM.min && n <= ZOOM.max) zoom.value = n;
}
let feuilleZoom: HTMLStyleElement | null = null;
watchEffect(() => {
    feuilleZoom ??= Object.assign(document.createElement('style'), { id: 'ganttZoomStyle' });
    if (!feuilleZoom.isConnected) document.head.appendChild(feuilleZoom);
    feuilleZoom.textContent = styleZoom(zoom.value);
});

// ---------- Boutons de l'en-tête ----------

const acces = ref(accesAccueil());
const libelleAstreintes = computed(() =>
    session.profil === 'expert' ? 'Gérer mes astreintes/HNO' : 'Gérer les astreintes/HNO'
);
const ouvrirFenetre = (fenetre: NomFenetre) => emettre('fenetre-demandee', { fenetre });

// ---------- Saisie ----------

const message = ref('');
const localisation = ref<{ cellule: Cellule; titre: string; options: OptionLocalisation[] } | null>(null);
const samu = ref<{ cellule: Cellule; choix: string } | null>(null);
const confirmation = ref<{ cellule: Cellule; detail: Confirmation } | null>(null);

async function contexte(): Promise<ContexteSaisie> {
    const s = await session.charger();
    return { profil: s.activeProfile, ressourceId: s.resourceId, prenom: s.prenom ?? '', nom: s.nom ?? '' };
}

const cleSession = (c: Cellule) => `${c.ressource.id}_${c.date}_${c.periode}`;

function appliquer(c: Cellule, r: Resultat) {
    if ('ignore' in r) return;
    if ('erreur' in r) {
        message.value = r.erreur;
        return;
    }
    surbrillance.value = false;
    p.saisir(c.ressource, c.date, c.periode, r.changements, r.suivi);
}

/** Changement d'affectation exécuté : la demi-journée ne demande plus de confirmation pendant la session */
async function executerAffectation(c: Cellule) {
    const ctx = await contexte();
    if (ctx.profil === 'admin' || ctx.profil === 'user' || ctx.profil === 'expert') p.modifiees.add(cleSession(c));
    appliquer(c, changerAffectation(ctx, p.planning, c));
}

async function clic(ligne: LigneCellule, ressource: Ressource, jour: JourGrille, periode: Periode) {
    const ctx = await contexte();
    const c: Cellule = { ressource, date: jour.date, periode };
    const historique = p.historiqueMad[ressource.id];
    if (ligne === 'disponibilite') {
        appliquer(c, basculerDisponibilite(ctx, p.planning, historique, c));
    } else if (ligne === 'affectation') {
        const controle = controlerAffectation(ctx, p.planning, historique, c, p.modifiees.has(cleSession(c)));
        if ('erreur' in controle) message.value = controle.erreur;
        else if ('confirmation' in controle) confirmation.value = { cellule: c, detail: controle.confirmation };
        else if ('direct' in controle) await executerAffectation(c);
    } else {
        const r = ouvrirLocalisation(ctx, p.planning, historique, c);
        if ('erreur' in r) message.value = r.erreur;
        else if ('titre' in r) localisation.value = { cellule: c, titre: r.titre, options: r.options };
    }
}

function choisir(option: OptionLocalisation) {
    const ouverte = localisation.value;
    if (!ouverte) return;
    if (option.valeur === 'SAMU') {
        samu.value = { cellule: ouverte.cellule, choix: '' };
        return;
    }
    localisation.value = null;
    appliquer(ouverte.cellule, choisirLocalisation(p.planning, ouverte.cellule, option.valeur));
}

function validerSamu() {
    const s = samu.value;
    if (!s) return;
    if (!s.choix) {
        message.value = MESSAGES.samuObligatoire;
        return;
    }
    samu.value = null;
    localisation.value = null;
    appliquer(s.cellule, choisirLocalisation(p.planning, s.cellule, `🚨 ${s.choix}`));
}

/** Confirmation : date longue, demi-journée, expert, affectation, localisation, auteur */
const detailConfirmation = computed(() => {
    const c = confirmation.value;
    if (!c) return null;
    const [a, m, j] = c.cellule.date.split('-').map(Number) as [number, number, number];
    return {
        date: new Date(a, m - 1, j).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        periode: c.cellule.periode === 'AM' ? 'Matin' : 'Après-midi',
        expert: `${c.cellule.ressource.prenom} ${c.cellule.ressource.nom}`,
        affectation: LIBELLES_AFFECTATION[c.detail.affectation] ?? 'Affectation',
        localisation: c.detail.localisation,
        auteur: c.detail.auteur ? c.detail.auteur.replace('.', ' ') : 'Non défini',
        propre: c.detail.propre
    };
});

async function poursuivre() {
    const c = confirmation.value;
    confirmation.value = null;
    if (c) await executerAffectation(c.cellule);
}

// ---------- Montage ----------

const enveloppe = ref<HTMLElement | null>(null);

/** Première présentation : défilement jusqu'au jour courant */
async function centrerAujourdhui() {
    await nextTick();
    const wrapper = enveloppe.value;
    const cellule = wrapper?.querySelector<HTMLElement>('.gantt-cell.today');
    if (!wrapper || !cellule) return;
    wrapper.scrollTo({
        left: Math.max(0, cellule.offsetLeft - wrapper.clientWidth / 2 + cellule.offsetWidth / 2),
        behavior: 'smooth'
    });
}

// Titre du mois pour l'impression A4 (attributs du conteneur de l'onglet, lus par la feuille d'impression)
watchEffect(() => {
    const onglet = document.getElementById('planning');
    onglet?.setAttribute('data-month', NOMS_MOIS[p.mois] ?? '');
    onglet?.setAttribute('data-year', String(p.annee));
});

let arretZoom: () => void = () => {};
onMounted(async () => {
    document.addEventListener('click', clicDocument);
    arretZoom = ecouter('zoom-grille-reinitialise', () => (zoom.value = 100));
    await ouvrir();
    await p.charger();
    await centrerAujourdhui();
});
onBeforeUnmount(() => {
    document.removeEventListener('click', clicDocument);
    arretZoom();
    feuilleZoom?.remove();
});
surReouverture(() => {
    acces.value = accesAccueil();
    void ouvrir();
});
</script>

<template>
    <h2>Planification des ressources</h2>

    <!-- Options d'affichage -->
    <div class="form-section gp-planif__section gp-planif__section--options">
        <h3 class="gp-planif__titre gp-planif__titre--options">
            <button
                type="button"
                class="gp-planif__bascule"
                :aria-expanded="optionsOuvertes"
                @click="optionsOuvertes = !optionsOuvertes"
            >
                <span :key="String(optionsOuvertes)">{{ optionsOuvertes ? '▼' : '▶' }}</span> Options d'affichage
            </button>
        </h3>
        <div v-show="optionsOuvertes" id="planningControlsSection" class="gp-planif__corps">
            <div class="planif-controls">
                <div class="control-group">
                    <label for="yearSelect">Année</label>
                    <select id="yearSelect" v-model.number="p.annee">
                        <option v-for="a in annees" :key="a" :value="a">{{ a }}</option>
                    </select>
                </div>
                <div class="control-group">
                    <label for="monthSelect">Mois</label>
                    <select id="monthSelect" v-model.number="p.mois">
                        <option v-for="(nom, i) in NOMS_MOIS" :key="nom" :value="i">{{ nom }}</option>
                    </select>
                </div>
                <div class="control-group resource-filter">
                    <label for="resourceFilter">Filtrer ressource(s)</label>
                    <select
                        id="resourceFilter"
                        v-model="p.filtreRessources"
                        multiple
                        size="6"
                        class="gp-planif__filtre"
                    >
                        <option value="">Toutes les ressources</option>
                        <option v-for="r in optionsRessources" :key="r.id" :value="String(r.id)">
                            {{ r.nom.toUpperCase() }} {{ r.prenom }} ({{ r.trigramme }})
                        </option>
                    </select>
                </div>
                <div class="control-group">
                    <label for="fonctionFilter">Filtrer par fonction(s)</label>
                    <select id="fonctionFilter" v-model="p.filtreFonctions" multiple size="4" class="gp-planif__filtre">
                        <option v-for="f in fonctions" :key="f" :value="f">{{ f }}</option>
                    </select>
                    <small class="gp-planif__aide">Ctrl+clic pour sélection multiple</small>
                </div>
                <div class="gp-planif__boutons-options">
                    <button type="button" @click="surbrillance = false">Afficher</button>
                    <button type="button" class="export-btn" @click="telechargerPlanning">📥 Télécharger</button>
                    <button type="button" class="export-btn" @click="imprimerPlanning">Imprimer A4</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Légende -->
    <div class="form-section gp-planif__section gp-planif__section--legende">
        <h3 class="gp-planif__titre gp-planif__titre--legende">
            <button
                type="button"
                class="gp-planif__bascule"
                :aria-expanded="legendeOuverte"
                @click="legendeOuverte = !legendeOuverte"
            >
                <span :key="String(legendeOuverte)">{{ legendeOuverte ? '▼' : '▶' }}</span> Légende
            </button>
        </h3>
        <div v-show="legendeOuverte" id="planningLegendSection" class="gp-planif__corps">
            <!-- Couleurs des pastilles en ligne : lues par la recherche avancée (icônes de ses options,
                 consultation/icones-recherche.ts) -->
            <div class="gp-planif__legende">
                <div class="legend-section">
                    <div class="legend-section-title">DISPONIBILITE</div>
                    <div class="legend-items gp-planif__legende-items">
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert métier n'est pas disponible pour l'ANS mais vous pouvez néanmoins le solliciter en cliquant sur '✉️ Faire une demande'"
                        >
                            <span class="color-code" style="background-color: #95a5a6"></span> 1 - Indisponible
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert métier est disponible pour l'ANS, vous pouvez lui affecter une activité sur le planning"
                        >
                            <span class="color-code" style="background-color: #27ae60"></span> 2 - Disponible pour l'ANS
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert métier n'est absolument pas disponible pour l'ANS"
                        >
                            <span class="color-code" style="background-color: #00bcd4"></span> 3 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 12a9 9 0 0 1 18 0z" />
                                <path d="M12 12v7a2 2 0 0 0 4 0" /></svg
                            >Congés
                        </div>
                    </div>
                </div>
                <div class="legend-section">
                    <div class="legend-section-title">AFFECTATION (1-4)</div>
                    <div class="legend-items gp-planif__legende-items">
                        <div class="legend-item gp-planif__legende-item" title="Pas d'affectation possible">
                            <span class="color-code" style="background-color: #95a5a6"></span> 1 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="m5.6 5.6 12.8 12.8" /></svg
                            >Indisponible
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert attend que vous lui affectiez une activité"
                        >
                            <span class="color-code" style="background-color: #9b59b6"></span> 2 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M6 2h12v4l-6 6 6 6v4H6v-4l6-6-6-6z" /></svg
                            >En attente d'affectation
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert travaille aux activités opérationnelles de déploiement du bandeau de communication"
                        >
                            <span class="color-code" style="background-color: #e67e22"></span> 3 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"
                                /></svg
                            >SAMU (Déploiement)
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert travaille aux activités liées à l'utilisation du bandeau de communication (démonstration, formation, accompagnement post démarrage, visite de site, ...)"
                        >
                            <span class="color-code" style="background-color: #d35400"></span> 4 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"
                                /></svg
                            >SAMU (Dev. usages)
                        </div>
                    </div>
                </div>
                <div class="legend-section">
                    <div class="legend-section-title">AFFECTATION (5-8)</div>
                    <div class="legend-items gp-planif__legende-items">
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert travaille à la réalisation de documents pour le déploiement du SI-SAMU"
                        >
                            <span class="color-code" style="background-color: #3498db"></span> 5 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"
                                />
                                <path
                                    d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"
                                />
                                <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" /></svg
                            >ANS (Déploiement)
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert travaille à des opérations de développement des usages (communication, animation de webinaires, formation EHESP, congrès, ...)"
                        >
                            <span class="color-code" style="background-color: #2980b9"></span> 6 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M12 16v5M8 21h8" />
                                <path d="m7 12 3-3 2 2 4-4" /></svg
                            >ANS (Dev. usages)
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert travaille à la réalisation de VFT métier"
                        >
                            <span class="color-code" style="background-color: #e74c3c"></span> 7 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m9 11 3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg
                            >Qualification
                        </div>
                        <div
                            class="legend-item gp-planif__legende-item"
                            title="L'expert est affecté à des activités relatives aux autres produits du domaine des urgences (SAS, SI-VIC, SICAP, Hub Santé, ...)"
                        >
                            <span class="color-code" style="background-color: #16a085"></span> 8 -
                            <svg class="app-ico gp-planif__legende-icone" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
                                <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></svg
                            >Divers
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Planification -->
    <div class="form-section gp-planif__section gp-planif__section--grille">
        <div class="gp-planif__entete">
            <h3 class="gp-planif__titre gp-planif__titre--grille">
                <button
                    type="button"
                    class="gp-planif__bascule"
                    :aria-expanded="grilleOuverte"
                    @click="grilleOuverte = !grilleOuverte"
                >
                    <span id="ganttDisplaySectionIcon" :key="String(grilleOuverte)">{{
                        grilleOuverte ? '▼' : '▶'
                    }}</span>
                    Planification
                </button>
            </h3>
            <div v-show="grilleOuverte" id="ganttHeaderControls" class="gp-planif__zoom">
                <span class="gp-planif__zoom-titre"><AppIcone name="zoom" :scale="15 / 16" />Zoom</span>
                <button type="button" class="gp-planif__zoom-moins" title="Réduire (zoom arrière)" @click="zoomer(-1)">
                    −
                </button>
                <span id="zoomLevelDisplay" class="gp-planif__zoom-niveau">{{ zoom }}%</span>
                <button type="button" class="gp-planif__zoom-plus" title="Agrandir (zoom avant)" @click="zoomer(1)">
                    +
                </button>
                <button
                    type="button"
                    class="gp-planif__zoom-reset"
                    title="Réinitialiser le zoom à 100%"
                    @click="zoom = 100"
                >
                    <svg class="app-ico gp-planif__zoom-reset-icone" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" /></svg
                    >Reset
                </button>
                <div v-show="lignesMasquees.length > 0" id="ganttHiddenWrap" ref="zoneMasquees">
                    <button
                        id="ganttHiddenBtn"
                        type="button"
                        title="Rétablir l'affichage d'origine : afficher les experts masqués"
                        aria-label="Experts masqués"
                        @click="listeMasquees = !listeMasquees"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"
                            />
                        </svg>
                        <span id="ganttHiddenCount"
                            >{{ lignesMasquees.length }} masqué{{ lignesMasquees.length > 1 ? 's' : '' }}</span
                        >
                    </button>
                    <div v-show="listeMasquees" id="ganttHiddenPop" class="gp-planif__masquees">
                        <div class="ghp-title">Lignes masquées du planning</div>
                        <div v-for="m in lignesMasquees" :key="m.id" class="ghp-row">
                            <span>{{ m.nom }}</span
                            ><button type="button" class="ghp-show" @click="afficher(m.id)">Afficher</button>
                        </div>
                        <button type="button" class="ghp-all" @click="toutAfficher">
                            Rétablir l'affichage d'origine
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div v-show="grilleOuverte" id="ganttHeaderButtons" class="gp-planif__boutons">
            <button type="button" class="gp-planif__mois" title="Mois précédent" @click="naviguer(-1)">
                &lt;&lt; Mois précédent
            </button>
            <button type="button" class="gp-planif__mois" title="Mois suivant" @click="naviguer(1)">
                Mois suivant &gt;&gt;
            </button>
            <button
                type="button"
                class="gp-planif__calendrier"
                title="Vue calendrier mensuel"
                @click="ouvrirFenetre('calendrier-mensuel')"
            >
                <AppIcone name="calendar" :scale="20 / 16" class="gp-planif__icone-blanche" />
            </button>
            <button
                type="button"
                class="gp-planif__evenements"
                title="Visualiser les congés et événements"
                @click="ouvrirFenetre('calendrier-evenements')"
            >
                Visualiser les événements
            </button>
            <button
                v-if="acces?.gestionAstreintes"
                id="astreintesBtn"
                type="button"
                class="gp-planif__astreintes"
                title="Gérer les astreintes et HNO"
                @click="ouvrirFenetre('astreintes-hno')"
            >
                <span id="astreintesBtnText" :key="libelleAstreintes">{{ libelleAstreintes }}</span>
            </button>
            <button
                v-if="acces?.demandeAffectation"
                id="requestBtn"
                type="button"
                class="gp-planif__demande"
                title="Faire une demande d'affectation"
                @click="ouvrirFenetre('demande-affectation')"
            >
                <AppIcone name="mail" class="gp-planif__demande-icone" />Faire une demande
            </button>
            <div id="currentMonthDisplay" class="gp-planif__mois-affiche">{{ titre }}</div>
        </div>
        <div v-show="grilleOuverte" id="ganttDisplaySection" class="gp-planif__grille">
            <div id="ganttWrapper" ref="enveloppe" class="gantt-wrapper">
                <GrillePlanification
                    v-if="p.charge"
                    :ressources="ressources"
                    :masquees="masquees"
                    :surbrillance="surbrillance"
                    @clic="clic"
                    @masquer="masquer"
                    @trier="trier"
                />
                <p v-else class="gp-planif__chargement">Chargement de la planification…</p>
            </div>
        </div>
    </div>

    <!-- Localisation d'une demi-journée -->
    <AppModal
        id="localisationModal"
        :opened="!!localisation && !samu"
        :title="localisation?.titre ?? ''"
        class="gp-planif-localisation"
        @close="localisation = null"
    >
        <span id="localisationModalTitle" class="gp-planif__titre-lu">{{ localisation?.titre }}</span>
        <div id="localisationOptionsContainer" class="gp-planif-localisation__options">
            <button
                v-for="o in localisation?.options ?? []"
                :key="o.valeur"
                type="button"
                class="gp-planif-localisation__option"
                :style="{ backgroundColor: o.couleur }"
                @click="choisir(o)"
            >
                <AppIcone :name="o.icone" :scale="22 / 16" class="gp-planif-localisation__icone" />{{ o.libelle }}
            </button>
        </div>
        <template #footer>
            <button type="button" class="gp-planif__annuler" @click="localisation = null">Annuler</button>
        </template>
    </AppModal>

    <!-- SAMU d'une affectation SAMU -->
    <AppModal id="samuModal" :opened="!!samu" title="Sélectionner le SAMU" class="gp-planif-samu" @close="samu = null">
        <div v-if="samu" class="form-group">
            <label for="samuSelect">SAMU concerné</label>
            <select id="samuSelect" v-model="samu.choix" class="gp-planif-samu__liste">
                <option value="">-- Choisir un SAMU --</option>
                <option v-for="s in SAMU_ASTREINTES" :key="s" :value="s">{{ s }}</option>
            </select>
        </div>
        <template #footer>
            <button type="button" class="gp-planif__annuler" @click="samu = null">Annuler</button>
            <button type="button" @click="validerSamu">Valider</button>
        </template>
    </AppModal>

    <!-- Modification d'une affectation existante -->
    <AppModal
        id="assignmentConfirmModal"
        :opened="!!detailConfirmation"
        title="⚠️ Modification d'une affectation"
        class="gp-planif-confirmation"
        @close="confirmation = null"
    >
        <template v-if="detailConfirmation">
            <div v-if="!detailConfirmation.propre" class="gp-planif-confirmation__alerte">
                <strong>⚠️ Cette affectation a été posée par quelqu'un d'autre.</strong><br />
                <span
                    >Veuillez contacter <strong>{{ detailConfirmation.auteur }}</strong> avant toute modification.</span
                >
            </div>
            <div class="gp-planif-confirmation__detail">
                <p><strong>📅 Date :</strong> {{ detailConfirmation.date }} ({{ detailConfirmation.periode }})</p>
                <p><strong>👤 Expert :</strong> {{ detailConfirmation.expert }}</p>
                <p><strong>📋 Affectation :</strong> {{ detailConfirmation.affectation }}</p>
                <p v-if="detailConfirmation.localisation">
                    <strong>📍 Localisation :</strong> {{ detailConfirmation.localisation }}
                </p>
                <p><strong>✍️ Posée par :</strong> {{ detailConfirmation.auteur }}</p>
            </div>
        </template>
        <template #footer>
            <button type="button" class="gp-planif-confirmation__abandonner" @click="confirmation = null">
                Abandonner
            </button>
            <button type="button" class="gp-planif-confirmation__poursuivre" @click="poursuivre">
                Je veux quand même poursuivre
            </button>
        </template>
    </AppModal>

    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
/* Onglet monté dans le conteneur #planning ; classes de l'ancien écran (form-section, planif-controls, legend-*) */
.gp-planif__section--options {
    background-color: #e8f5e9;
    border-left: 4px solid #4caf50;
}
.gp-planif__section--legende {
    background-color: #fff3cd;
    border-left: 4px solid #ffc107;
    margin-top: 20px;
}
.gp-planif__section--grille {
    background-color: #e3f2fd;
    border-left: 4px solid #2196f3;
    margin-top: 20px;
}
.gp-planif__titre {
    border-left: none;
    margin: 0;
}
.gp-planif__titre--options {
    color: #2e7d32;
}
.gp-planif__titre--legende {
    color: #856404;
}
.gp-planif__titre--grille {
    color: #1565c0;
}
/* Titre de section entièrement cliquable, comme l'ancien écran */
.gp-planif__bascule,
.gp-planif__bascule:hover,
.gp-planif__bascule:focus {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
.gp-planif__entete .gp-planif__titre {
    flex: 1;
}
.gp-planif__corps {
    margin-top: 15px;
}
.gp-planif__filtre {
    height: auto;
}
.gp-planif__aide {
    color: #666;
    font-size: 10px;
    margin-top: 3px;
    display: block;
}
.gp-planif__boutons-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;
}
.gp-planif__legende {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
}
.gp-planif__legende-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.gp-planif__legende-item {
    cursor: help;
}
.gp-planif__legende-icone {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    vertical-align: -3px;
    margin-right: 4px;
}
.gp-planif__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.gp-planif__zoom {
    display: flex;
    gap: 0;
    align-items: center;
    background: linear-gradient(145deg, #f0f4f8, #e2e8f0);
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.gp-planif__zoom-titre {
    font-size: 11px;
    color: #64748b;
    margin: 0 10px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.gp-planif__zoom-moins,
.gp-planif__zoom-plus {
    width: 36px;
    height: 36px;
    background: linear-gradient(145deg, #3b82f6, #1d4ed8);
    color: white;
    border: none;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.gp-planif__zoom-moins {
    border-radius: 6px 0 0 6px;
}
.gp-planif__zoom-plus {
    border-radius: 0 6px 6px 0;
}
.gp-planif__zoom-moins:hover,
.gp-planif__zoom-plus:hover {
    background: linear-gradient(145deg, #2563eb, #1e40af);
}
.gp-planif__zoom-niveau {
    font-size: 13px;
    color: #1e40af;
    min-width: 50px;
    text-align: center;
    font-weight: 600;
    background: white;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
}
.gp-planif__zoom-reset {
    height: 36px;
    margin-left: 8px;
    padding: 0 12px;
    background: linear-gradient(145deg, #64748b, #475569);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.2s;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.gp-planif__zoom-reset:hover {
    background: linear-gradient(145deg, #475569, #334155);
}
.gp-planif__zoom-reset-icone {
    width: 13px;
    height: 13px;
    stroke: currentColor;
    margin-right: 5px;
}
.gp-planif__masquees {
    display: block;
}
.gp-planif__boutons {
    display: flex;
    gap: 10px;
    margin-top: 10px;
    align-items: center;
    flex-wrap: wrap;
}
.gp-planif__mois,
.gp-planif__calendrier,
.gp-planif__evenements,
.gp-planif__astreintes,
.gp-planif__demande {
    padding: 8px 15px;
    height: 38px;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    display: flex;
    align-items: center;
}
.gp-planif__mois {
    background-color: #1565c0;
}
.gp-planif__calendrier {
    background-color: #2196f3;
    font-size: 16px;
    justify-content: center;
}
.gp-planif__icone-blanche {
    stroke: white;
}
.gp-planif__evenements {
    background-color: #00bcd4;
}
.gp-planif__astreintes {
    background-color: #9c27b0;
}
.gp-planif__demande {
    background-color: #27ae60;
}
.gp-planif__demande-icone {
    margin-right: 7px;
}
.gp-planif__mois-affiche {
    margin-left: 20px;
    padding: 10px 20px;
    font-weight: bold;
    color: #1565c0;
    font-size: 22px;
    cursor: default;
}
.gp-planif__grille {
    margin-top: 15px;
}
.gp-planif__chargement {
    text-align: center;
    padding: 20px;
    color: #7f8c8d;
}
/* Titre d'une fenêtre repris sous l'identifiant de l'ancien écran (affiché par l'en-tête de la fenêtre) */
.gp-planif__titre-lu {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}
.gp-planif-localisation__options {
    display: grid;
    gap: 10px;
    margin-top: 12px;
}
.gp-planif-localisation__option {
    padding: 15px;
}
.gp-planif-localisation__icone {
    stroke: currentColor;
    margin-right: 8px;
}
.gp-planif__annuler {
    background-color: #95a5a6;
}
.gp-modale.gp-planif-samu .gp-modale__boite {
    width: min(400px, 100%);
}
.gp-planif-samu__liste {
    width: 100%;
    padding: 10px;
    font-size: 14px;
}
.gp-modale.gp-planif-confirmation .gp-modale__boite {
    width: min(500px, 90%);
}
.gp-modale.gp-planif-confirmation .gp-modale__titre {
    color: #e67e22;
}
.gp-planif-confirmation__alerte {
    background-color: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 5px;
    padding: 15px;
    margin: 15px 0;
    color: #856404;
}
.gp-planif-confirmation__detail {
    background-color: #f8f9fa;
    border-radius: 5px;
    padding: 15px;
    margin-bottom: 20px;
}
.gp-planif-confirmation__detail p {
    margin: 5px 0;
}
.gp-planif-confirmation__abandonner {
    background-color: #6c757d;
}
.gp-planif-confirmation__poursuivre {
    background-color: #e67e22;
}
</style>
