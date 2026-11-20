<!-- Carte des événements (suivi géographique) : filtres, pastilles des lieux et des experts (Leaflet, fonds
     OpenStreetMap), lecture chronologique. Identifiants de l'ancien écran conservés (feuille de style, tests e2e). -->
<script setup lang="ts">
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { apiDeploiements, type DeploiementCarte, type StatutDeploiement } from '@/api/deploiements';
import { ecouter } from '@/evenements';
import { apiCarte, type EvenementCarte, type ExpertCarte, type LocalisationCarte } from '@/api/carte';
import AppModal from '@/composants/AppModal.vue';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { bulleExpert, bulleLieu, htmlPastilleLieu, pastilleExpert } from './bulles-carte';
import {
    dateALaPosition,
    filtrer,
    grouperParLieu,
    libelleParticipant,
    localisationsGeolocalisees,
    placerExperts,
    propositions,
    typesProposes,
    type ExpertPlace,
    type ParticipantCarte,
    type PlageLecture
} from './carte';
import { dateFr } from './calculs';
import { ecrireEtat, FONDS, lireEtat, opaciteDepartements, stockageNavigateur, type Fond } from './calques';
import { centreDe, couleursDepartements, type Contours } from './departements';
import { ENCARTS, rapprocherOutreMer } from './outre-mer';
import {
    genererGif,
    LIBELLE_COMPTEUR_GIF,
    NOM_FICHIER_GIF,
    nomFichierGif,
    telecharger,
    tracerContours,
    type Projection
} from './gif';
import {
    dateALaPositionCompressee,
    datesDeMisesEnService,
    datesDesImages,
    datesDesImagesCompressees,
    misesEnServiceA,
    nbMisesEnService,
    plageMisesEnService
} from './mises-en-service';
import { fondMotif, idMotif, svgMotif } from './motifs';
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
const etatInitialCalques = lireEtat(stockageNavigateur());
const expertsVisibles = ref(etatInitialCalques.experts);
const lieuxVisibles = ref(etatInitialCalques.evenements);
const departementsVisibles = ref(etatInitialCalques.departements);
/** Part d'opacité retirée aux départements (0 à 100) */
const transparence = ref(etatInitialCalques.transparence);
const fond = ref<Fond>(etatInitialCalques.fond);
/** Carte de France seule : sans fond, outre-mer rapprochée de la métropole */
const franceSeule = ref(etatInitialCalques.franceSeule);
/** Noms écrits sur la carte, sur chaque département coloré */
const nomsSamu = ref(etatInitialCalques.nomsSamu);
const nomsDepartements = ref(etatInitialCalques.nomsDepartements);
/** Statuts masqués par un clic sur la légende (libellés) */
const statutsMasques = ref(new Set(etatInitialCalques.statutsMasques));

/** Mémorise l'état des calques dans le navigateur */
const memoriserCalques = () =>
    ecrireEtat(stockageNavigateur(), {
        departements: departementsVisibles.value,
        evenements: lieuxVisibles.value,
        experts: expertsVisibles.value,
        transparence: transparence.value,
        fond: fond.value,
        statutsMasques: [...statutsMasques.value],
        franceSeule: franceSeule.value,
        nomsSamu: nomsSamu.value,
        nomsDepartements: nomsDepartements.value
    });

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
let calqueDepartements: L.GeoJSON | null = null;
/** Noms des SAMU et des départements écrits sur la carte */
let etiquettes: L.LayerGroup | null = null;
/** Rendu SVG des départements : porte les définitions des motifs (<defs>) */
let renduDepartements: L.SVG | null = null;
/** Statuts affichés sur la carte (légende) : couleur, motif, libellé et nombre de départements */
const legende = ref<{ statut: string; couleur: string; motif: string; departements: number; masque: boolean }[]>([]);

const FOND_UNI = '#e6edf3';
const FONDS_CARTE: Record<Fond, { libelle: string }> = {
    plan: { libelle: 'Plan' },
    satellite: { libelle: 'Satellite' },
    administratif: { libelle: 'Administratif (départements, régions)' }
};
/** Fonds en tuiles ; images demandées avec `crossOrigin` pour que le GIF puisse les reprendre */
const TUILES: Record<'plan' | 'satellite', { url: string; attribution: string; maxZoom: number }> = {
    plan: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    },
    satellite: {
        url:
            'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS' +
            '&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
        attribution: '© <a href="https://geoservices.ign.fr/">IGN</a> – Géoplateforme (orthophotographies)',
        maxZoom: 19
    }
};
let tuiles: L.TileLayer | null = null;
let calqueAdministratif: L.LayerGroup | null = null;

function creerCarte() {
    if (!conteneur.value) return;
    carte = L.map(conteneur.value, { zoomControl: true }).setView([46.6, 2.3], 6);
    carte.createPane('administratif').style.zIndex = '250';
    calque = L.layerGroup().addTo(carte);
    void appliquerFond();
}

/** Fond choisi : tuiles (plan, satellite) ou fond uni avec contours des départements et des régions */
async function appliquerFond() {
    const cible = carte;
    if (!cible) return;
    tuiles?.remove();
    tuiles = null;
    calqueAdministratif?.remove();
    calqueAdministratif = null;
    cible.getContainer().style.background = sansFond() ? FOND_UNI : '';
    if (!sansFond()) {
        const t = fond.value === 'satellite' ? TUILES.satellite : TUILES.plan;
        tuiles = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom, crossOrigin: true }).addTo(cible);
        return;
    }
    try {
        const [regions, departements] = await Promise.all([contoursRegions(), contoursDepartements()]);
        if (carte !== cible || !sansFond()) return;
        const rendu = L.svg({ pane: 'administratif' });
        const trait = (color: string, weight: number) => () => ({
            renderer: rendu,
            color,
            weight,
            fill: false,
            interactive: false
        });
        calqueAdministratif = L.layerGroup([
            L.geoJSON(contoursAffiches(departements) as never, {
                style: () => ({ ...trait('#9fb3c1', 0.8)(), fill: true, fillOpacity: 0, interactive: true }),
                onEachFeature: (f, couche) => {
                    // Nom du département au survol, même sans statut (les départements colorés ont leur propre bulle)
                    const texte = document.createElement('span');
                    texte.textContent = (f.properties as { nom: string }).nom;
                    couche.bindTooltip(texte, { sticky: true });
                }
            }),
            L.geoJSON(regions as never, { style: trait('#4f6d80', 2) }),
            ...(franceSeule.value ? encartsOutreMer(trait) : [])
        ]).addTo(cible);
    } catch (e) {
        console.error('Erreur chargement du fond administratif:', e);
        message.value = 'Le fond administratif n’a pas pu être chargé.';
    }
}

/** Cadres en pointillés des encarts d'outre-mer (mode « France seule ») */
const cadresEncarts = () =>
    Object.values(ENCARTS).map(e => ({
        bas: e.lat - e.cote / 2,
        haut: e.lat + e.cote / 2,
        gauche: e.lng - e.cote / 2,
        droite: e.lng + e.cote / 2
    }));
function encartsOutreMer(trait: (color: string, weight: number) => () => L.PathOptions) {
    return cadresEncarts().map(c =>
        L.rectangle(
            [
                [c.bas, c.gauche],
                [c.haut, c.droite]
            ],
            { ...trait('#90a4ae', 1)(), dashArray: '4 4' }
        )
    );
}

function changerFond() {
    memoriserCalques();
    void appliquerFond();
}

/** « France seule » : sans fond de carte, outre-mer rapprochée de la métropole */
function basculerFranceSeule() {
    franceSeule.value = !franceSeule.value;
    memoriserCalques();
    void appliquerFond();
    peindreDepartements();
    cadrerFrance();
}

function detruireCarte() {
    carte?.remove();
    carte = null;
    calque = null;
    calqueDepartements = null;
    renduDepartements = null;
    tuiles = null;
    calqueAdministratif = null;
}

// ---------- Calque des départements (couleur du statut des déploiements) ----------

const cacheContours = new Map<string, Promise<Contours>>();
/** Contours chargés une seule fois (fichiers de l'application) */
function chargerContours(url: string) {
    let p = cacheContours.get(url);
    if (!p) {
        p = fetch(url)
            .then(r => {
                if (!r.ok) throw new Error(`Erreur ${r.status}`);
                return r.json() as Promise<Contours>;
            })
            .catch(e => {
                cacheContours.delete(url);
                throw e;
            });
        cacheContours.set(url, p);
    }
    return p;
}
/** Départements de métropole et d'outre-mer (deux fichiers de l'application) */
let departementsEnCours: Promise<Contours> | null = null;
const contoursDepartements = () =>
    (departementsEnCours ??= Promise.all([
        chargerContours('/vue/departements.geojson'),
        chargerContours('/vue/departements-outre-mer.geojson')
    ])
        .then(([metropole, outreMer]) => ({ features: [...metropole.features, ...outreMer.features] }))
        .catch(e => {
            departementsEnCours = null;
            throw e;
        }));
/** Contours tels qu'affichés : outre-mer rapprochée de la métropole en mode « France seule » */
const contoursAffiches = (c: Contours) => (franceSeule.value ? rapprocherOutreMer(c) : c);
/** Sans fond de carte : fond uni et contours administratifs */
const sansFond = () => fond.value === 'administratif' || franceSeule.value;
const contoursRegions = () => chargerContours('/vue/regions.geojson');

/** Départements colorés : un par département dont un SAMU a un statut ; sous les pastilles */
function retirerDepartements() {
    calqueDepartements?.remove();
    calqueDepartements = null;
    etiquettes?.remove();
    etiquettes = null;
    legende.value = [];
}

/** Rendu SVG des départements, avec les définitions de motifs de ces couleurs */
function renduAvecMotifs(cible: L.Map, definitions: string) {
    renduDepartements ??= L.svg().addTo(cible);
    const svg = (renduDepartements as unknown as { _container: SVGSVGElement })._container;
    svg.querySelector('defs')?.remove();
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = definitions;
    svg.prepend(defs);
    return renduDepartements;
}

/** Statuts et SAMU suivis, relus quand ils changent ; contours des départements */
let donneesDeploiements: { statuses: StatutDeploiement[]; deployments: DeploiementCarte[] } | null = null;
let contoursCharges: Contours | null = null;

async function chargerDonneesDepartements() {
    const [contours, donnees] = await Promise.all([contoursDepartements(), apiDeploiements.carte()]);
    contoursCharges = contours;
    donneesDeploiements = donnees;
}

/** SAMU montrés : tous ; pendant la lecture, ceux « En service » déjà atteints à la date lue */
function deploiementsAffiches() {
    if (!donneesDeploiements) return [];
    if (lecture.value.active && plage && lecture.value.date)
        return misesEnServiceA(
            donneesDeploiements.deployments,
            donneesDeploiements.statuses,
            plage,
            lecture.value.date
        );
    return donneesDeploiements.deployments;
}

/** Peint les départements d'après les données déjà chargées (statuts masqués par la légende exclus) */
function peindreDepartements() {
    const cible = carte;
    retirerDepartements();
    if (!cible || !departementsVisibles.value || !donneesDeploiements || !contoursCharges) return;
    const contours = contoursCharges;
    const statuts = donneesDeploiements.statuses;
    const affiches = deploiementsAffiches();
    const toutes = couleursDepartements(affiches, statuts, contours);
    const couleurs = statutsMasques.value.size
        ? couleursDepartements(affiches, statuts, contours, statutsMasques.value)
        : toutes;
    const uniques = new Map([...couleurs.values()].map(c => [idMotif(c.couleur, c.motif), c]));
    const rendu = renduAvecMotifs(cible, [...uniques.values()].map(c => svgMotif(c.couleur, c.motif)).join(''));
    const parStatut = new Map<
        string,
        { statut: string; couleur: string; motif: string; departements: number; masque: boolean }
    >();
    for (const c of toutes.values()) {
        const e = parStatut.get(c.statut) ?? {
            statut: c.statut,
            couleur: c.couleur,
            motif: c.motif,
            departements: 0,
            masque: statutsMasques.value.has(c.statut)
        };
        e.departements++;
        parStatut.set(c.statut, e);
    }
    legende.value = [...parStatut.values()];
    calqueDepartements = L.geoJSON(
        {
            type: 'FeatureCollection',
            features: contoursAffiches(contours).features.filter(f => couleurs.has(f.properties.code))
        } as never,
        {
            style: f => {
                const d = couleurs.get((f?.properties as { code: string }).code);
                const c = d?.couleur ?? '#999999';
                const motif = d?.motif ?? 'plein';
                return {
                    renderer: rendu,
                    fillColor: motif === 'plein' ? c : `url(#${idMotif(c, motif)})`,
                    fillOpacity: opaciteDepartements(transparence.value),
                    color: c,
                    weight: 1
                };
            },
            onEachFeature: (f, couche) => {
                const dep = f.properties as { code: string; nom: string };
                const c = couleurs.get(dep.code);
                if (!c) return;
                // Texte et non HTML : statut et noms de SAMU sont saisis dans l'application
                const texte = document.createElement('span');
                texte.textContent = `${dep.nom} : ${c.statut} (${c.samu.join(', ')})`;
                couche.bindTooltip(texte, { sticky: true });
            }
        }
    ).addTo(cible);
    calqueDepartements.bringToBack();
    dessinerEtiquettes(cible, contoursAffiches(contours), couleurs);
}

/** Lignes d'étiquette d'un département coloré : nom du département et/ou noms de ses SAMU */
const lignesEtiquette = (nom: string, samu: string[]) => [
    ...(nomsDepartements.value ? [nom] : []),
    ...(nomsSamu.value ? samu : [])
];

/** Noms sur la carte (légende : « Noms des SAMU », « Noms des départements ») */
function dessinerEtiquettes(cible: L.Map, contours: Contours, couleurs: Map<string, { samu: string[] }>) {
    etiquettes?.remove();
    etiquettes = null;
    if (!nomsSamu.value && !nomsDepartements.value) return;
    const groupe = L.layerGroup();
    for (const f of contours.features) {
        const c = couleurs.get(f.properties.code);
        const lignes = c ? lignesEtiquette(f.properties.nom, c.samu) : [];
        if (!lignes.length) continue;
        const [lng, lat] = centreDe(f);
        const el = document.createElement('div');
        el.className = 'ev-carte__etiquette-carte';
        for (const t of lignes) {
            const ligne = document.createElement('span');
            ligne.textContent = t;
            el.appendChild(ligne);
        }
        L.marker([lat, lng], {
            icon: L.divIcon({ className: '', html: el.outerHTML, iconSize: [0, 0] }),
            interactive: false,
            keyboard: false
        }).addTo(groupe);
    }
    etiquettes = groupe.addTo(cible);
}

function changerNoms() {
    memoriserCalques();
    peindreDepartements();
}

async function dessinerDepartements() {
    const cible = carte;
    if (!cible) return;
    if (!departementsVisibles.value) {
        retirerDepartements();
        return;
    }
    try {
        await chargerDonneesDepartements();
    } catch (e) {
        console.error('Erreur chargement des départements:', e);
        message.value = 'Les départements n’ont pas pu être chargés.';
        return;
    }
    if (carte === cible) peindreDepartements();
}

/** Clic sur la légende : le statut est masqué ou ré-affiché sur la carte */
function basculerStatut(libelle: string) {
    const s = new Set(statutsMasques.value);
    if (!s.delete(libelle)) s.add(libelle);
    statutsMasques.value = s;
    memoriserCalques();
    peindreDepartements();
}

/** Curseur : opacité mise à jour sans recharger */
function changerTransparence() {
    calqueDepartements?.setStyle({ fillOpacity: opaciteDepartements(transparence.value) });
    memoriserCalques();
}

function basculerDepartements() {
    departementsVisibles.value = !departementsVisibles.value;
    memoriserCalques();
    void dessinerDepartements();
}

function basculerLieux() {
    lieuxVisibles.value = !lieuxVisibles.value;
    memoriserCalques();
    redessiner();
}

// Statuts ou déploiements modifiés pendant que la carte est ouverte
const arreterEcoute = [
    ecouter('statuts-deploiements-modifies', () => void dessinerDepartements()),
    ecouter('deploiements-modifies', () => void dessinerDepartements())
];

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
    const lieux = lieuxVisibles.value ? grouperParLieu(liste) : [];
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
    void dessinerDepartements();
    setTimeout(() => {
        carte?.invalidateSize();
        if (franceSeule.value) cadrerFrance();
    }, 50);
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

/** Redessine les pastilles (pas pendant la lecture : la carte ne montre alors que les mises en service) */
function redessiner() {
    if (charge.value && !lecture.value.active) dessiner(evenements.value);
}

function basculerExperts() {
    expertsVisibles.value = !expertsVisibles.value;
    memoriserCalques();
    redessiner();
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
    /** SAMU déjà « En service » à la date lue, et total sur la période */
    visibles: 0,
    total: 0
});
let plage: PlageLecture | null = null;
/** Dates distinctes de mise en service de la période (lecture sans les périodes creuses) */
let datesMes: string[] = [];
/** Saute les périodes sans mise en service : chaque date de mise en service occupe la même part de la lecture */
const compresser = ref(false);
let minuterie: ReturnType<typeof setInterval> | null = null;
let depart = 0;
let base = 0;

const libelleLecture = computed(() =>
    lecture.value.enCours ? 'Pause' : lecture.value.position > 0 && lecture.value.position < 1 ? 'Reprendre' : 'Lecture'
);
const dateLecture = computed(() => (lecture.value.date ? dateFr(lecture.value.date) : '—'));
const compteLecture = computed(() =>
    lecture.value.date ? `${lecture.value.visibles} / ${lecture.value.total} mise(s) en service` : ''
);

function arreterMinuterie() {
    if (minuterie) clearInterval(minuterie);
    minuterie = null;
}

/** Retour à l'affichage normal, sans redessiner la carte */
function reinitialiserLecture() {
    arreterMinuterie();
    lecture.value = { active: false, enCours: false, position: 0, date: null, visibles: 0, total: 0 };
    plage = null;
    base = 0;
}

/** Image de la lecture à une position : départements des SAMU déjà mis en service à cette date */
function montrer(position: number) {
    if (!plage || !donneesDeploiements) return;
    const p = Math.max(0, Math.min(1, position));
    lecture.value.position = p;
    const date = compresser.value ? dateALaPositionCompressee(datesMes, p) : dateALaPosition(plage, p);
    if (date === lecture.value.date) return;
    lecture.value.date = date;
    lecture.value.visibles = misesEnServiceA(
        donneesDeploiements.deployments,
        donneesDeploiements.statuses,
        plage,
        date
    ).length;
    peindreDepartements();
}

function image() {
    const f = (base + (performance.now() - depart) / 1000) / duree.value;
    montrer(f);
    if (f >= 1) {
        lecture.value.enCours = false;
        arreterMinuterie();
    }
}

/** Cadrage sur la France métropolitaine (et les encarts d'outre-mer en mode « France seule ») */
function cadrerFrance() {
    carte?.fitBounds(
        franceSeule.value
            ? [
                  [41.8, -13.8],
                  [51.1, 9.6]
              ]
            : [
                  [41.3, -5.2],
                  [51.1, 9.6]
              ],
        { padding: [20, 20] }
    );
}

/** Données et période de la lecture ; false (avec message) s'il n'y a aucune mise en service à animer */
async function preparerLecture() {
    if (!departementsVisibles.value) {
        departementsVisibles.value = true;
        memoriserCalques();
    }
    try {
        await chargerDonneesDepartements();
    } catch (e) {
        console.error('Erreur chargement des départements:', e);
        message.value = 'Les départements n’ont pas pu être chargés.';
        return false;
    }
    const donnees = donneesDeploiements;
    const p = donnees && plageMisesEnService(donnees.deployments, donnees.statuses);
    if (!donnees || !p) {
        message.value =
            'Aucune mise en service à animer : renseignez des SAMU « En service » avec leur date de mise en service.';
        return false;
    }
    plage = p;
    datesMes = datesDeMisesEnService(donnees.deployments, donnees.statuses, p);
    lecture.value.total = nbMisesEnService(donnees.deployments, donnees.statuses, p);
    return true;
}

/** Début d'une lecture : la carte ne montre plus que les départements des SAMU mis en service */
function demarrerAffichage() {
    lecture.value.active = true;
    dessiner([]);
    cadrerFrance();
}

function pause() {
    if (!lecture.value.enCours) return;
    base += (performance.now() - depart) / 1000;
    lecture.value.enCours = false;
    arreterMinuterie();
}

async function lireOuPause() {
    if (lecture.value.enCours) {
        pause();
        return;
    }
    if (!(await preparerLecture())) return;
    if (!lecture.value.active || lecture.value.position >= 1) {
        lecture.value.position = 0;
        lecture.value.date = null;
        base = 0;
        demarrerAffichage();
    } else base = lecture.value.position * duree.value;
    lecture.value.enCours = true;
    depart = performance.now();
    arreterMinuterie();
    minuterie = setInterval(image, 120);
    image();
}

function compressionChangee() {
    if (!lecture.value.active) return;
    lecture.value.date = null;
    montrer(lecture.value.position);
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
async function curseur(valeur: number) {
    if (!lecture.value.active) {
        if (!(await preparerLecture())) return;
        demarrerAffichage();
    }
    base = (valeur / 1000) * duree.value;
    depart = performance.now();
    montrer(valeur / 1000);
}

/** ■ : fin de la lecture, tous les événements réaffichés */
function arreter() {
    reinitialiserLecture();
    dessiner(evenements.value);
    peindreDepartements();
}

// ---------- Export GIF ----------

const exportGif = ref({ enCours: false, texte: '' });
/** Titre inscrit en haut du GIF (facultatif) */
const titreGif = ref('');
/** Texte après « n / total » sous la date du GIF, et nom du fichier téléchargé */
const libelleCompteurGif = ref(LIBELLE_COMPTEUR_GIF);
const nomFichier = ref('');
const IMAGES_GIF = 30;
const LARGEUR_GIF = 800;

/** Fond du GIF : tuiles affichées si leur serveur autorise la capture, sinon fond uni et contours des départements */
function fondDuGif(
    cible: L.Map,
    largeur: number,
    hauteur: number,
    echelle: number,
    projeter: Projection,
    contours: Contours,
    regions: Contours | null
) {
    const nouveau = () => {
        const c = document.createElement('canvas');
        c.width = largeur;
        c.height = hauteur;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas indisponible');
        ctx.fillStyle = FOND_UNI;
        ctx.fillRect(0, 0, largeur, hauteur);
        return { c, ctx };
    };
    const contoursSeuls = () => {
        const { c, ctx } = nouveau();
        tracerContours(ctx, contoursAffiches(contours), projeter, { trait: '#9fb3c1', epaisseur: 1 });
        if (regions) tracerContours(ctx, regions, projeter, { trait: '#4f6d80', epaisseur: 2.5 });
        if (franceSeule.value) {
            ctx.save();
            ctx.strokeStyle = '#90a4ae';
            ctx.setLineDash([6, 6]);
            for (const e of cadresEncarts()) {
                const [x0 = 0, y0 = 0] = projeter(e.gauche, e.haut);
                const [x1 = 0, y1 = 0] = projeter(e.droite, e.bas);
                ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
            }
            ctx.restore();
        }
        return c;
    };
    if (sansFond()) return contoursSeuls();
    const { c, ctx } = nouveau();
    const cadre = cible.getContainer().getBoundingClientRect();
    for (const img of cible.getContainer().querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded')) {
        const r = img.getBoundingClientRect();
        ctx.drawImage(
            img,
            (r.left - cadre.left) * echelle,
            (r.top - cadre.top) * echelle,
            r.width * echelle,
            r.height * echelle
        );
    }
    try {
        ctx.getImageData(0, 0, 1, 1);
        return c;
    } catch {
        // tuiles d'un serveur qui n'autorise pas la capture : repli sur le fond uni
        return contoursSeuls();
    }
}

/** Noms des départements et des SAMU écrits sur l'image (halo blanc pour rester lisibles sur le fond) */
function etiquettesGif(
    ctx: CanvasRenderingContext2D,
    hauteur: number,
    contours: Contours,
    projeter: Projection,
    couleurs: Map<string, { samu: string[] }>
) {
    if (!nomsSamu.value && !nomsDepartements.value) return;
    const taille = Math.max(10, Math.round(hauteur * 0.022));
    ctx.save();
    ctx.font = `bold ${taille}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    for (const f of contours.features) {
        const c = couleurs.get(f.properties.code);
        const lignes = c ? lignesEtiquette(f.properties.nom, c.samu) : [];
        const [x, y] = projeter(...centreDe(f));
        lignes.forEach((t, i) => {
            const yl = y + (i - (lignes.length - 1) / 2) * taille * 1.15;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeText(t, x, yl);
            ctx.fillStyle = '#1a237e';
            ctx.fillText(t, x, yl);
        });
    }
    ctx.restore();
}

/** Titre (facultatif) en haut de l'image, date et compteur en haut à gauche */
function bandeauGif(
    ctx: CanvasRenderingContext2D,
    largeur: number,
    hauteur: number,
    date: string,
    nb: number,
    total: number,
    titre: string,
    libelle: string
) {
    const taille = Math.round(hauteur * 0.05);
    const marge = Math.round(taille * 0.5);
    ctx.save();
    ctx.textBaseline = 'top';
    let haut = marge;
    if (titre) {
        const tailleTitre = Math.round(taille * 1.1);
        ctx.font = `bold ${tailleTitre}px sans-serif`;
        const bandeau = tailleTitre + marge * 1.6;
        ctx.fillStyle = 'rgba(26,35,126,0.92)';
        ctx.fillRect(0, 0, largeur, bandeau);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(titre, largeur / 2, marge * 0.8, largeur - marge * 2);
        ctx.textAlign = 'left';
        haut = bandeau + marge;
    }
    ctx.font = `bold ${taille}px sans-serif`;
    const texte1 = dateFr(date);
    const texte2 = `${nb} / ${total} ${libelle}`;
    const largeurBandeau = Math.max(ctx.measureText(texte1).width, ctx.measureText(texte2).width * 0.6) + marge * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(marge, haut, largeurBandeau, taille * 2.1 + marge);
    ctx.fillStyle = '#1a237e';
    ctx.fillText(texte1, marge * 2, haut + marge * 0.5);
    ctx.font = `${Math.round(taille * 0.6)}px sans-serif`;
    ctx.fillStyle = '#37474f';
    ctx.fillText(texte2, marge * 2, haut + marge * 0.5 + taille * 1.2);
    ctx.restore();
}

/** GIF animé de la progression des mises en service, d'après la vue actuelle de la carte */
async function exporterGif() {
    const cible = carte;
    if (!cible || exportGif.value.enCours) return;
    pause();
    exportGif.value = { enCours: true, texte: 'GIF : préparation…' };
    try {
        if (!(await preparerLecture())) return;
        const donnees = donneesDeploiements;
        const contours = contoursCharges;
        const periode = plage;
        if (!donnees || !contours || !periode) return;
        const regions = sansFond() ? await contoursRegions() : null;
        const conteneurCarte = cible.getContainer();
        const echelle = LARGEUR_GIF / conteneurCarte.clientWidth;
        const hauteur = Math.round(conteneurCarte.clientHeight * echelle);
        const projeter: Projection = (lng, lat) => {
            const pt = cible.latLngToContainerPoint([lat, lng]);
            return [pt.x * echelle, pt.y * echelle];
        };
        const contoursDuGif = contoursAffiches(contours);
        const base = fondDuGif(cible, LARGEUR_GIF, hauteur, echelle, projeter, contours, regions);
        const dates = compresser.value
            ? datesDesImagesCompressees(datesMes, IMAGES_GIF)
            : datesDesImages(periode, IMAGES_GIF);
        const opacite = opaciteDepartements(transparence.value);
        const blob = await genererGif({
            largeur: LARGEUR_GIF,
            hauteur,
            images: dates.length,
            delaiMs: 250,
            pauseFinMs: 2000,
            dessiner: (i, ctx) => {
                const date = dates[i] ?? periode.fin;
                const affiches = misesEnServiceA(donnees.deployments, donnees.statuses, periode, date);
                ctx.drawImage(base, 0, 0);
                const couleursDuJour = couleursDepartements(affiches, donnees.statuses, contours, statutsMasques.value);
                for (const [code, c] of couleursDuJour)
                    tracerContours(
                        ctx,
                        contoursDuGif,
                        projeter,
                        { trait: c.couleur, epaisseur: 1, remplissage: c.couleur, opacite },
                        new Set([code])
                    );
                etiquettesGif(ctx, hauteur, contoursDuGif, projeter, couleursDuJour);
                bandeauGif(
                    ctx,
                    LARGEUR_GIF,
                    hauteur,
                    date,
                    affiches.length,
                    lecture.value.total,
                    titreGif.value.trim(),
                    libelleCompteurGif.value.trim() || LIBELLE_COMPTEUR_GIF
                );
            },
            progression: (i, total) => (exportGif.value.texte = `GIF : image ${i} / ${total}`)
        });
        telecharger(blob, nomFichierGif(nomFichier.value));
    } catch (e) {
        console.error('Erreur génération du GIF:', e);
        message.value = 'Le GIF n’a pas pu être généré.';
    } finally {
        exportGif.value = { enCours: false, texte: '' };
    }
}

onBeforeUnmount(() => {
    arreterEcoute.forEach(a => a());
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
                <button
                    id="toggleEventsMapBtn"
                    type="button"
                    class="ev-carte__experts"
                    :class="{ 'ev-carte__experts--masques': !lieuxVisibles }"
                    title="Afficher/masquer les pastilles des événements et déplacements"
                    @click="basculerLieux"
                >
                    📅 Événements : {{ lieuxVisibles ? 'ON' : 'OFF' }}
                </button>
                <button
                    id="toggleFranceMapBtn"
                    type="button"
                    class="ev-carte__experts"
                    :class="{ 'ev-carte__experts--masques': !franceSeule }"
                    :aria-pressed="franceSeule"
                    title="Carte de France seule, sans fond : la Corse reste en place, les départements d'outre-mer sont rapprochés"
                    @click="basculerFranceSeule"
                >
                    🇫🇷 France seule : {{ franceSeule ? 'ON' : 'OFF' }}
                </button>
                <button
                    id="toggleDepartementsMapBtn"
                    type="button"
                    class="ev-carte__experts"
                    :class="{ 'ev-carte__experts--masques': !departementsVisibles }"
                    title="Afficher/masquer les départements colorés selon le statut des déploiements"
                    @click="basculerDepartements"
                >
                    🗺️ Départements : {{ departementsVisibles ? 'ON' : 'OFF' }}
                </button>
                <span
                    v-if="departementsVisibles && legende.length"
                    class="ev-carte__legende"
                    data-testid="carte-legende"
                >
                    <button
                        v-for="l in legende"
                        :key="l.statut"
                        type="button"
                        class="ev-carte__legende-item"
                        :class="{ 'ev-carte__legende-item--masque': l.masque }"
                        :aria-pressed="!l.masque"
                        :title="
                            l.masque
                                ? `Afficher les départements « ${l.statut} »`
                                : `Masquer les départements « ${l.statut} »`
                        "
                        @click="basculerStatut(l.statut)"
                    >
                        <span class="ev-carte__puce" :style="{ background: fondMotif(l.couleur, l.motif) }"></span>
                        {{ l.statut }} ({{ l.departements }})
                    </button>
                    <label class="ev-carte__noms">
                        <input v-model="nomsSamu" type="checkbox" @change="changerNoms" />
                        Noms des SAMU
                    </label>
                    <label class="ev-carte__noms">
                        <input v-model="nomsDepartements" type="checkbox" @change="changerNoms" />
                        Noms des départements
                    </label>
                </span>
                <label class="ev-carte__transparence">
                    Fond de carte
                    <select
                        id="mapBaseSelect"
                        v-model="fond"
                        class="ev-carte__fond"
                        aria-label="Fond de carte"
                        :disabled="franceSeule"
                        :title="franceSeule ? 'Désactivé : la carte de France seule n’a pas de fond' : ''"
                        @change="changerFond"
                    >
                        <option v-for="f in FONDS" :key="f" :value="f">{{ FONDS_CARTE[f].libelle }}</option>
                    </select>
                </label>
                <label v-if="departementsVisibles" class="ev-carte__transparence" data-testid="carte-calques">
                    Transparence
                    <input
                        v-model.number="transparence"
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        aria-label="Transparence des départements"
                        @input="changerTransparence"
                    />
                    {{ transparence }} %
                </label>
            </div>
            <div id="modalMapEventCount" class="ev-carte__compteur">{{ compteur }}</div>
        </div>

        <!-- Lecture chronologique -->
        <div id="mapPlayBar" class="ev-carte__lecture">
            <button
                id="mapPlayBtn"
                type="button"
                class="ev-carte__lire"
                title="Lire la progression des mises en service des SAMU"
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
            <label
                class="ev-carte__vitesse ev-carte__compression"
                title="Saute les périodes sans mise en service : chaque mise en service occupe la même part du défilement"
                ><input v-model="compresser" type="checkbox" @change="compressionChangee" /> Sans les périodes
                creuses</label
            >
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
            <details class="ev-carte__options-gif">
                <summary>Options du GIF</summary>
                <div class="ev-carte__options-gif-champs">
                    <label
                        >Titre (en haut de l'image)
                        <input
                            id="mapGifTitle"
                            v-model="titreGif"
                            type="text"
                            maxlength="80"
                            placeholder="Facultatif"
                        />
                    </label>
                    <label
                        >Texte du compteur
                        <input id="mapGifCounter" v-model="libelleCompteurGif" type="text" maxlength="40" />
                    </label>
                    <label
                        >Nom du fichier
                        <input
                            id="mapGifFileName"
                            v-model="nomFichier"
                            type="text"
                            maxlength="80"
                            :placeholder="NOM_FICHIER_GIF"
                        />
                    </label>
                </div>
            </details>
            <button
                id="mapGifBtn"
                type="button"
                class="ev-carte__gif"
                :disabled="exportGif.enCours"
                title="Générer et télécharger l'animation des mises en service au format GIF"
                @click="exporterGif"
            >
                🎞️ {{ exportGif.enCours ? exportGif.texte : 'GIF' }}
            </button>
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
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
}
/* Boutons de la barre : même hauteur, libellé sur une seule ligne (icône à gauche du texte) */
.ev-carte__actions > button,
.ev-carte__actions > button:hover {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-sizing: border-box;
    height: 38px;
    padding: 0 14px;
    white-space: nowrap;
    line-height: 1;
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
.ev-carte__legende {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 12px;
    color: #555;
}
.ev-carte__legende-item,
.ev-carte__legende-item:hover {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    color: #555;
    font-size: 12px;
    padding: 2px 5px;
    border-radius: 4px;
    cursor: pointer;
}
.ev-carte__legende-item:hover {
    background: #eceff1;
}
.ev-carte__legende-item--masque {
    opacity: 0.5;
    text-decoration: line-through;
}
.ev-carte__noms {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #555;
    cursor: pointer;
}
.ev-carte__noms input,
.ev-carte__compression input {
    width: auto;
    margin: 0;
}
.ev-carte__options-gif {
    position: relative;
    font-size: 12px;
    color: #555;
}
.ev-carte__options-gif summary {
    cursor: pointer;
    padding: 6px 8px;
}
.ev-carte__options-gif-champs {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 280px;
    padding: 10px;
    background: #fff;
    border: 1px solid #9fb3c1;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
.ev-carte__options-gif-champs label {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.ev-carte__etiquette-carte {
    /* Le repère Leaflet fait 0 × 0 : sans largeur propre, l'étiquette aurait une emprise vide (invisible pour les tests) */
    width: max-content;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translate(-50%, -50%);
    white-space: nowrap;
    pointer-events: none;
    font-size: 11px;
    font-weight: bold;
    line-height: 1.15;
    color: #1a237e;
    text-shadow:
        0 0 3px #fff,
        0 0 3px #fff,
        0 0 3px #fff;
}
.ev-carte__fond {
    width: auto;
    padding: 4px 6px;
    font-size: 12px;
}
.ev-carte__gif,
.ev-carte__gif:hover {
    background: #00897b;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
}
.ev-carte__gif:disabled {
    background: #90a4ae;
    cursor: progress;
}
.ev-carte__puce {
    width: 14px;
    height: 14px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 3px;
}
.ev-carte__transparence {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #555;
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
