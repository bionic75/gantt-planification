<!-- Carte des événements (suivi géographique) : filtres, pastilles des lieux et des experts (Leaflet, fonds
     OpenStreetMap), lecture chronologique. Identifiants de l'ancien écran conservés (feuille de style, tests e2e). -->
<script setup lang="ts">
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { apiCarte, type EvenementCarte, type ExpertCarte, type LocalisationCarte } from '@/api/carte';
import AppModal from '@/composants/AppModal.vue';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { bulleExpert, bulleLieu, htmlPastilleLieu, pastilleExpert } from './bulles-carte';
import {
    commencesA,
    compteParLieu,
    dateALaPosition,
    filtrer,
    grouperParLieu,
    libelleParticipant,
    localisationsGeolocalisees,
    placerExperts,
    plageLecture,
    propositions,
    typesProposes,
    type ExpertPlace,
    type ParticipantCarte,
    type PlageLecture
} from './carte';
import { dateFr } from './calculs';
import { useEvenementsStore } from './magasin';

const props = defineProps<{ opened: boolean }>();
const emit = defineEmits<{ close: [] }>();

const ev = useEvenementsStore();

// ---------- Filtres (conservés d'une ouverture à l'autre) ----------

const debutParDefaut = () => `${new Date().getFullYear()}-01-01`;
const debut = ref('');
const fin = ref('');
const localisation = ref('');
const type = ref('');
const participants = ref<ParticipantCarte[]>([]);
const expertsVisibles = ref(true);

const localisations = ref<LocalisationCarte[]>([]);
const optionsLocalisation = computed(() => localisationsGeolocalisees(localisations.value));
/** Types des événements chargés (après le filtre de localisation) */
const types = ref<string[]>([]);
/** Événements affichés (filtres appliqués) et experts placés */
const evenements = ref<EvenementCarte[]>([]);
const experts = ref<ExpertPlace[]>([]);
const charge = ref(false);
const message = ref('');

const compteur = computed(() =>
    !charge.value
        ? ''
        : evenements.value.length > 0
          ? `${evenements.value.length} événement(s)`
          : 'Aucun événement géolocalisé.'
);

// ---------- Carte ----------

const conteneur = ref<HTMLElement | null>(null);
let carte: L.Map | null = null;
let calque: L.LayerGroup | null = null;

function creerCarte() {
    if (!conteneur.value) return;
    carte = L.map(conteneur.value, { zoomControl: true }).setView([46.6, 2.3], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(carte);
    calque = L.layerGroup().addTo(carte);
}

function detruireCarte() {
    carte?.remove();
    carte = null;
    calque = null;
}

/** Pastilles des experts (sous celles des événements), puis des lieux ; cadrage sauf pendant la lecture */
function dessiner(liste: EvenementCarte[], options: { cadrer?: boolean; animes?: Set<string> } = {}) {
    if (!carte || !calque) return;
    calque.clearLayers();
    if (expertsVisibles.value) {
        for (const x of experts.value) {
            L.marker([x.lat, x.lng], {
                icon: L.divIcon({
                    className: '',
                    html: pastilleExpert(x).outerHTML,
                    iconSize: [40, 56],
                    iconAnchor: [20, 20],
                    popupAnchor: [0, -24]
                }),
                zIndexOffset: -100
            })
                .bindPopup(() => bulleExpert(x), { maxWidth: 220 })
                .addTo(calque);
        }
    }
    const lieux = grouperParLieu(liste);
    for (const lieu of lieux) {
        L.marker([lieu.lat, lieu.lng], {
            icon: L.divIcon({
                className: '',
                html: htmlPastilleLieu(lieu.evenements.length, !!options.animes?.has(lieu.cle)),
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                popupAnchor: [0, -18]
            }),
            title: lieu.libelle
        })
            .bindPopup(() => bulleLieu(lieu), { maxWidth: 300 })
            .addTo(calque);
    }
    if (options.cadrer && lieux.length)
        carte.fitBounds(
            lieux.map(l => [l.lat, l.lng] as L.LatLngTuple),
            { padding: [40, 40], maxZoom: 13 }
        );
}

// ---------- Chargement ----------

/** « Afficher » : événements de la période, experts relus, filtres appliqués */
async function afficher() {
    reinitialiserLecture();
    let liste: EvenementCarte[];
    let listeExperts: ExpertCarte[] | null;
    try {
        [liste, listeExperts] = await Promise.all([
            apiCarte.evenements(debut.value, fin.value).then(r => r.events ?? []),
            apiCarte.experts().catch(() => null)
        ]);
    } catch (e) {
        console.error('Erreur chargement carte modale:', e);
        return;
    }
    if (listeExperts) experts.value = placerExperts(listeExperts, localisations.value);
    const duLieu = filtrer(liste, { localisation: localisation.value, type: '', participants: [] });
    types.value = typesProposes(duLieu);
    if (type.value && !types.value.includes(type.value)) type.value = '';
    evenements.value = filtrer(duLieu, { localisation: '', type: type.value, participants: participants.value });
    charge.value = true;
    dessiner(evenements.value, { cadrer: true });
    setTimeout(() => carte?.invalidateSize(), 50);
}

async function ouvrir() {
    if (!debut.value) debut.value = debutParDefaut();
    localisations.value = (await apiCarte.localisations().catch(() => ({ locations: [] }))).locations ?? [];
    await nextTick();
    if (!carte) creerCarte();
    else carte.invalidateSize();
    await afficher();
}

function fermer() {
    reinitialiserLecture();
    emit('close');
}

watch(
    () => props.opened,
    async ouverte => {
        if (ouverte) await ouvrir();
        else detruireCarte();
    },
    { immediate: true }
);

/** 🔄 : filtres d'origine, puis nouvel affichage */
function reinitialiserFiltres() {
    debut.value = debutParDefaut();
    fin.value = '';
    localisation.value = '';
    type.value = '';
    participants.value = [];
    if (carte) void afficher();
}

function basculerExperts() {
    expertsVisibles.value = !expertsVisibles.value;
    if (charge.value)
        dessiner(
            lecture.value.active && lecture.value.date
                ? commencesA(evenements.value, lecture.value.date)
                : evenements.value
        );
}

// ---------- Participants ----------

const saisie = ref('');
const listeOuverte = ref(false);
const zoneParticipants = ref<HTMLElement | null>(null);
const champParticipant = ref<HTMLInputElement | null>(null);
const suggestions = computed(() =>
    listeOuverte.value ? propositions(saisie.value, ev.comptes, evenements.value, participants.value) : []
);

function choisirParticipant(p: ParticipantCarte) {
    participants.value = [...participants.value, p];
    saisie.value = '';
    listeOuverte.value = false;
}

function retirerParticipant(i: number) {
    participants.value = participants.value.filter((_, j) => j !== i);
}

function clavierParticipant(e: KeyboardEvent) {
    if (e.key === 'Backspace' && !saisie.value && participants.value.length) {
        participants.value = participants.value.slice(0, -1);
    } else if (e.key === 'Escape' && listeOuverte.value) {
        // Liste des propositions fermée, sans fermer la fenêtre
        e.stopPropagation();
        listeOuverte.value = false;
    }
}

function clicDocument(e: MouseEvent) {
    if (zoneParticipants.value && !zoneParticipants.value.contains(e.target as Node)) listeOuverte.value = false;
}
document.addEventListener('click', clicDocument);

// ---------- Lecture chronologique ----------

const VITESSES = [
    { valeur: 120, libelle: 'Très lente (2 min)' },
    { valeur: 60, libelle: 'Lente (1 min)' },
    { valeur: 30, libelle: 'Normale (30 s)' },
    { valeur: 15, libelle: 'Rapide (15 s)' },
    { valeur: 6, libelle: 'Très rapide (6 s)' }
];
const duree = ref(30);
const lecture = ref({
    active: false,
    enCours: false,
    position: 0,
    date: null as string | null,
    visibles: 0
});
let plage: PlageLecture | null = null;
let minuterie: ReturnType<typeof setInterval> | null = null;
let depart = 0;
let base = 0;
let comptes: Record<string, number> = {};

const libelleLecture = computed(() =>
    lecture.value.enCours ? 'Pause' : lecture.value.position > 0 && lecture.value.position < 1 ? 'Reprendre' : 'Lecture'
);
const dateLecture = computed(() => (lecture.value.date ? dateFr(lecture.value.date) : '—'));
const compteLecture = computed(() =>
    lecture.value.date ? `${lecture.value.visibles} / ${evenements.value.length} événement(s)` : ''
);

function arreterMinuterie() {
    if (minuterie) clearInterval(minuterie);
    minuterie = null;
}

/** Retour à l'affichage normal, sans redessiner la carte */
function reinitialiserLecture() {
    arreterMinuterie();
    lecture.value = { active: false, enCours: false, position: 0, date: null, visibles: 0 };
    plage = null;
    base = 0;
    comptes = {};
}

/** Image de la lecture à une position : événements déjà commencés, pastilles nouvelles animées */
function montrer(position: number) {
    if (!plage) return;
    const p = Math.max(0, Math.min(1, position));
    lecture.value.position = p;
    const date = dateALaPosition(plage, p);
    if (date === lecture.value.date) return;
    lecture.value.date = date;
    const visibles = commencesA(evenements.value, date);
    const nouveaux = compteParLieu(visibles);
    const animes = new Set(Object.keys(nouveaux).filter(k => nouveaux[k] !== comptes[k]));
    comptes = nouveaux;
    lecture.value.visibles = visibles.length;
    dessiner(visibles, { animes });
}

function image() {
    const f = (base + (performance.now() - depart) / 1000) / duree.value;
    montrer(f);
    if (f >= 1) {
        lecture.value.enCours = false;
        arreterMinuterie();
    }
}

/** Tous les événements visibles : cadrage sur leurs lieux */
function cadrerTout() {
    const points = evenements.value.map(e => [e.latitude, e.longitude] as L.LatLngTuple);
    if (points.length && carte) carte.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
}

function pause() {
    if (!lecture.value.enCours) return;
    base += (performance.now() - depart) / 1000;
    lecture.value.enCours = false;
    arreterMinuterie();
}

function lireOuPause() {
    if (lecture.value.enCours) {
        pause();
        return;
    }
    const p = plageLecture(evenements.value, debut.value, fin.value);
    if (!p) {
        message.value = 'Aucun événement à lire : renseignez une date de début (et de fin) ou affichez des événements.';
        return;
    }
    plage = p;
    if (!lecture.value.active || lecture.value.position >= 1) {
        lecture.value.position = 0;
        lecture.value.date = null;
        base = 0;
        comptes = {};
        cadrerTout();
    } else base = lecture.value.position * duree.value;
    lecture.value.active = true;
    lecture.value.enCours = true;
    depart = performance.now();
    arreterMinuterie();
    minuterie = setInterval(image, 120);
    image();
}

function vitesseChangee() {
    if (!lecture.value.active) return;
    const enCours = lecture.value.enCours;
    arreterMinuterie();
    base = lecture.value.position * duree.value;
    depart = performance.now();
    if (enCours) minuterie = setInterval(image, 120);
}

/** Curseur : position choisie (lecture initialisée au premier déplacement) */
function curseur(valeur: number) {
    if (!lecture.value.active) {
        const p = plageLecture(evenements.value, debut.value, fin.value);
        if (!p) return;
        plage = p;
        lecture.value.active = true;
        comptes = {};
        cadrerTout();
    }
    base = (valeur / 1000) * duree.value;
    depart = performance.now();
    montrer(valeur / 1000);
}

/** ■ : fin de la lecture, tous les événements réaffichés */
function arreter() {
    reinitialiserLecture();
    dessiner(evenements.value);
}

onBeforeUnmount(() => {
    arreterMinuterie();
    document.removeEventListener('click', clicDocument);
    detruireCarte();
});
</script>

<template>
    <AppModal
        id="eventMapModal"
        :opened="opened"
        title="🗺️ Suivi géographique des événements / déplacements"
        class="ev-carte"
        @close="fermer"
    >
        <!-- Filtres -->
        <div class="ev-carte__filtres">
            <div class="ev-carte__champ">
                <label for="modalMapStartDate">Date de début</label>
                <input id="modalMapStartDate" v-model="debut" type="date" />
            </div>
            <div class="ev-carte__champ">
                <label for="modalMapEndDate">Date de fin</label>
                <input id="modalMapEndDate" v-model="fin" type="date" />
            </div>
            <div class="ev-carte__champ">
                <label for="modalMapLocationFilter">Localisation</label>
                <select id="modalMapLocationFilter" v-model="localisation" class="ev-carte__localisation">
                    <option value="">— Toutes les localisations —</option>
                    <option v-for="l in optionsLocalisation" :key="l.id" :value="String(l.id)">
                        {{ l.libelle_court }} – {{ l.libelle_long }}
                    </option>
                </select>
            </div>
            <div ref="zoneParticipants" class="ev-carte__champ ev-carte__participants">
                <label for="modalMapParticipantInput">👥 Participants</label>
                <div id="modalMapParticipantsContainer" class="ev-carte__etiquettes" @click="champParticipant?.focus()">
                    <span
                        v-for="(p, i) in participants"
                        :key="`${p.external ? 'x' : 'u'}${p.id ?? p.email ?? p.nom}`"
                        class="modal-map-tag ev-carte__etiquette"
                        :class="{ 'ev-carte__etiquette--externe': p.external }"
                        >{{ p.external ? '✉ ' : '' }}{{ libelleParticipant(p) }}
                        <button
                            type="button"
                            class="ev-carte__retirer"
                            :aria-label="`Retirer ${libelleParticipant(p)}`"
                            @click.stop="retirerParticipant(i)"
                        >
                            &times;
                        </button>
                    </span>
                    <input
                        id="modalMapParticipantInput"
                        ref="champParticipant"
                        v-model="saisie"
                        type="text"
                        placeholder="Nom ou prénom…"
                        autocomplete="off"
                        class="ev-carte__saisie"
                        @input="listeOuverte = true"
                        @focus="listeOuverte = true"
                        @keydown="clavierParticipant"
                    />
                </div>
                <div v-show="suggestions.length" id="modalMapParticipantDropdown" class="ev-carte__propositions">
                    <button
                        v-for="s in suggestions"
                        :key="`${s.external ? 'x' : 'u'}${s.id ?? s.email ?? s.nom}`"
                        type="button"
                        class="ev-carte__proposition"
                        :class="{ 'ev-carte__proposition--externe': s.external }"
                        @click.stop="choisirParticipant(s)"
                    >
                        <span class="ev-carte__avatar" :class="{ 'ev-carte__avatar--externe': s.external }">{{
                            s.external ? '✉' : `${(s.prenom[0] || '').toUpperCase()}${(s.nom[0] || '').toUpperCase()}`
                        }}</span>
                        {{ libelleParticipant(s) }}
                    </button>
                </div>
            </div>
            <div class="ev-carte__champ">
                <label for="modalMapLabelFilter">Type</label>
                <select id="modalMapLabelFilter" v-model="type" class="ev-carte__type">
                    <option value="">— Tous les types —</option>
                    <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
                </select>
            </div>
            <div class="ev-carte__actions">
                <button type="button" class="ev-carte__afficher" @click="afficher">🗺️ Afficher</button>
                <button
                    type="button"
                    class="ev-carte__reinitialiser"
                    title="Réinitialiser les filtres"
                    aria-label="Réinitialiser les filtres"
                    @click="reinitialiserFiltres"
                >
                    🔄
                </button>
                <button
                    id="toggleExpertsMapBtn"
                    type="button"
                    class="ev-carte__experts"
                    :class="{ 'ev-carte__experts--masques': !expertsVisibles }"
                    title="Afficher/masquer les pastilles experts"
                    @click="basculerExperts"
                >
                    <span :key="String(expertsVisibles)">👤 Experts : {{ expertsVisibles ? 'ON' : 'OFF' }}</span>
                </button>
            </div>
            <div id="modalMapEventCount" class="ev-carte__compteur">{{ compteur }}</div>
        </div>

        <!-- Lecture chronologique -->
        <div id="mapPlayBar" class="ev-carte__lecture">
            <button
                id="mapPlayBtn"
                type="button"
                class="ev-carte__lire"
                title="Lire la progression des événements entre la date de début et la date de fin"
                @click="lireOuPause"
            >
                <svg v-if="lecture.enCours" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <rect x="6" y="4" width="4.5" height="16" rx="1.2" />
                    <rect x="13.5" y="4" width="4.5" height="16" rx="1.2" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" />
                </svg>
                {{ libelleLecture }}
            </button>
            <button
                type="button"
                class="ev-carte__arreter"
                title="Arrêter et réafficher tous les événements"
                aria-label="Arrêter et réafficher tous les événements"
                @click="arreter"
            >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
            </button>
            <label class="ev-carte__vitesse"
                >Durée du défilement
                <select id="mapPlaySpeed" v-model.number="duree" @change="vitesseChangee">
                    <option v-for="v in VITESSES" :key="v.valeur" :value="v.valeur">{{ v.libelle }}</option>
                </select>
            </label>
            <input
                id="mapPlaySlider"
                type="range"
                min="0"
                max="1000"
                :value="Math.round(lecture.position * 1000)"
                class="ev-carte__curseur"
                aria-label="Position dans le temps"
                @input="curseur(Number(($event.target as HTMLInputElement).value))"
            />
            <span id="mapPlayDate" class="ev-carte__date">{{ dateLecture }}</span>
            <span id="mapPlayCount" class="ev-carte__compte">{{ compteLecture }}</span>
        </div>

        <!-- Carte -->
        <div class="ev-carte__cadre">
            <div
                id="eventMapModalContainer"
                ref="conteneur"
                role="region"
                aria-label="Carte des événements et des experts"
            ></div>
        </div>
    </AppModal>
    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
/* Fenêtre plein écran (contenu monté dans la fenêtre commune) */
.gp-modale.ev-carte {
    padding: 1vh 1%;
}
.gp-modale.ev-carte .gp-modale__boite {
    width: min(1600px, 100%);
    max-height: 97vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
}
.gp-modale.ev-carte .gp-modale__entete {
    padding: 18px 24px;
    border-bottom: 2px solid #3f51b5;
}
.gp-modale.ev-carte .gp-modale__titre {
    color: #283593;
}
.ev-carte__filtres {
    padding: 14px 24px;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
}
.ev-carte__champ label {
    font-size: 12px;
    color: #555;
    display: block;
    margin-bottom: 4px;
}
.ev-carte__champ input[type='date'],
.ev-carte__champ select {
    padding: 7px;
    border: 1px solid #9fa8da;
    border-radius: 4px;
}
.ev-carte__localisation {
    min-width: 200px;
}
.ev-carte__type {
    min-width: 180px;
}
.ev-carte__participants {
    position: relative;
}
.ev-carte__etiquettes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 6px;
    border: 1px solid #9fa8da;
    border-radius: 4px;
    min-height: 36px;
    min-width: 200px;
    max-width: 300px;
    align-items: center;
    background: white;
    cursor: text;
}
.ev-carte__etiquette {
    background: #3f51b5;
    color: white;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
}
.ev-carte__etiquette--externe {
    background: #78909c;
}
.ev-carte__retirer,
.ev-carte__retirer:hover {
    background: none;
    border: none;
    color: inherit;
    padding: 0;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
}
.ev-carte__saisie {
    border: none;
    outline: none;
    flex: 1;
    min-width: 80px;
    padding: 2px 0;
    font-size: 12px;
}
.ev-carte__propositions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 180px;
    overflow-y: auto;
    z-index: 1100;
}
.ev-carte__proposition,
.ev-carte__proposition:hover {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    font-size: 12px;
    background: white;
    color: #222;
    border: none;
    border-radius: 0;
    text-align: left;
    cursor: pointer;
}
.ev-carte__proposition:hover,
.ev-carte__proposition:focus {
    background: #f5f5f5;
}
.ev-carte__proposition--externe {
    border-top: 1px dashed #e0e0e0;
    color: #546e7a;
}
.ev-carte__avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #3f51b5;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    flex-shrink: 0;
}
.ev-carte__avatar--externe {
    background: #78909c;
    font-size: 11px;
}
.ev-carte__actions {
    display: flex;
    gap: 8px;
    align-items: flex-end;
}
.ev-carte__afficher,
.ev-carte__afficher:hover {
    background: #3f51b5;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.ev-carte__reinitialiser,
.ev-carte__reinitialiser:hover {
    background: #78909c;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
}
.ev-carte__experts,
.ev-carte__experts:hover {
    background: #6a1b9a;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.ev-carte__experts--masques,
.ev-carte__experts--masques:hover {
    background: #90a4ae;
}
.ev-carte__compteur {
    font-size: 12px;
    color: #555;
    padding: 8px 0;
}
.ev-carte__lecture {
    padding: 10px 24px;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    background: #f7f9fd;
}
.ev-carte__lire,
.ev-carte__lire:hover {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #3f51b5;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
}
.ev-carte__arreter,
.ev-carte__arreter:hover {
    display: inline-flex;
    align-items: center;
    background: #78909c;
    color: white;
    border: none;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
}
.ev-carte__lire svg,
.ev-carte__arreter svg {
    fill: currentColor;
    stroke: none;
}
.ev-carte__vitesse {
    font-size: 12px;
    color: #555;
    display: flex;
    align-items: center;
    gap: 6px;
}
.ev-carte__vitesse select {
    padding: 6px;
    border: 1px solid #9fa8da;
    border-radius: 4px;
}
.ev-carte__curseur {
    flex: 1;
    min-width: 220px;
}
.ev-carte__date {
    font-weight: bold;
    color: #283593;
    min-width: 92px;
    text-align: right;
}
.ev-carte__compte {
    font-size: 12px;
    color: #555;
    min-width: 110px;
}
.ev-carte__cadre {
    flex: 1;
    padding: 16px 24px 8px;
    overflow: hidden;
}

/* Pastilles et bulles : contenu créé par Leaflet hors des composants */
@keyframes ev-carte-apparition {
    0% {
        transform: scale(0.15);
        opacity: 0;
    }
    55% {
        transform: scale(1.4);
        opacity: 1;
    }
    100% {
        transform: scale(1);
    }
}
.ev-carte-pastille {
    background: #3f51b5;
    color: white;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: bold;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    box-sizing: border-box;
}
.ev-carte-pastille--apparition {
    animation: ev-carte-apparition 0.7s ease-out;
}
.ev-carte-bulle {
    max-height: 280px;
    overflow-y: auto;
}
.ev-carte-bulle__lieu {
    font-weight: bold;
    color: #283593;
    font-size: 13px;
    margin-bottom: 6px;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 4px;
}
.ev-carte-bulle__adresse {
    color: #555;
    font-size: 11px;
    margin-bottom: 8px;
}
.ev-carte-bulle__nombre {
    font-size: 11px;
    color: #3f51b5;
    font-weight: bold;
    margin-bottom: 6px;
}
.ev-carte-bulle__evenement {
    border: 1px solid #e8eaf6;
    border-radius: 5px;
    padding: 7px;
    margin-bottom: 6px;
    background: #fafafa;
    display: flex;
    gap: 7px;
    align-items: flex-start;
}
.ev-carte-bulle__repere {
    flex-shrink: 0;
    width: 12px;
    border-radius: 3px;
    border: 2px solid;
    align-self: stretch;
}
.ev-carte-bulle__corps {
    flex: 1;
}
.ev-carte-bulle__titre {
    font-weight: bold;
}
.ev-carte-bulle__icone {
    margin-right: 5px;
}
.ev-carte-bulle__libelle {
    font-size: 11px;
    color: #555;
}
.ev-carte-bulle__dates {
    color: #555;
    margin-top: 2px;
    font-size: 11px;
}
.ev-carte-bulle__participants {
    color: #777;
    margin-top: 2px;
    font-size: 10px;
}
.ev-carte-expert {
    position: relative;
    cursor: pointer;
}
.ev-carte-expert__cadre {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    border: 3px solid #6a1b9a;
    background: white;
    box-sizing: border-box;
}
.ev-carte-expert__photo {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid white;
}
.ev-carte-expert__initiales {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #6a1b9a;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: bold;
    border: 2px solid white;
    box-sizing: border-box;
}
.ev-carte-expert__trigramme {
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    background: #6a1b9a;
    color: white;
    font-size: 9px;
    font-weight: bold;
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
}
.ev-carte-bulle-expert {
    min-width: 160px;
}
.ev-carte-bulle-expert__nom {
    font-weight: bold;
    color: #6a1b9a;
    font-size: 13px;
    margin-bottom: 4px;
}
.ev-carte-bulle-expert__detail {
    font-size: 11px;
    color: #555;
}
</style>
