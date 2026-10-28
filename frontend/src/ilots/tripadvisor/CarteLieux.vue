<!-- Carte (Leaflet, fonds OpenStreetMap) : SAMU-SAS, lieux affichés, parcours du trajet choisi -->
<script setup lang="ts">
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Lieu, SamuSas } from '@/api/poi';
import { surReouverture } from '@/ilots/activation';
import { svgIcone } from '@/composants/icones';
import { CATEGORIES, echapper, FRANCE, km, note, pluriel } from './format';
import { useLieuxStore } from './magasin';

const lieux = useLieuxStore();
const conteneur = ref<HTMLElement | null>(null);
let carte: L.Map | null = null;
let calque: L.LayerGroup | null = null;
let calqueTrajet: L.LayerGroup | null = null;
let cadrage: ReturnType<typeof setTimeout> | undefined;
const marqueurs = new Map<number, L.Marker>();

/** Couleurs des parcours (variables CSS du thème, lues au tracé) */
const couleur = (variable: string) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

/** Remonte la page jusqu'à la carte (fiche consultée plus bas dans la liste) */
function afficherCarte() {
    const el = conteneur.value;
    if (el)
        window.scrollTo({
            top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 170),
            behavior: 'smooth'
        });
}

/** Contenu d'une bulle : texte (échappé) et lien d'action */
function bulle(html: string, lien: string, action: () => void) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // Largeur des étoiles pleines posée par le DOM (pas d'attribut style dans le HTML)
    for (const el of div.querySelectorAll<HTMLElement>('[data-largeur]')) el.style.width = `${el.dataset.largeur}%`;
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = lien;
    a.addEventListener('click', e => {
        e.preventDefault();
        action();
    });
    div.append(a);
    return div;
}

function marqueurSamu(l: SamuSas & { latitude: number; longitude: number }) {
    const mk = L.marker([l.latitude, l.longitude], {
        icon: L.divIcon({
            className: '',
            html: `<div class="tr-carte-samu">${echapper(l.libelle_court)}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        }),
        zIndexOffset: 500,
        keyboard: true,
        title: l.libelle_court
    });
    mk.bindTooltip(`${echapper(l.libelle_court)} · ${l.n_poi ? pluriel(l.n_poi, 'lieu', 'x') : 'aucun lieu'}`, {
        direction: 'top',
        offset: [0, -14]
    });
    mk.bindPopup(
        bulle(
            `<b>${echapper(l.libelle_court)}</b><br><span class="tr-carte-discret">${echapper(l.libelle_long ?? '')}</span>${l.adresse ? `<br>${echapper(l.adresse)}` : ''}<br>`,
            'Afficher tous les SAMU-SAS',
            () => void lieux.filtrer('loc', '')
        )
    );
    // Premier clic : la carte se centre sur le SAMU-SAS et affiche tous ses lieux ; clic suivant : ses coordonnées
    mk.on('click', () => {
        if (lieux.filtres.loc === String(l.id)) return;
        mk.closePopup();
        void lieux.filtrer('loc', String(l.id));
    });
    return mk;
}

/** Note en étoiles (bulle d'un lieu), remplies à la proportion de la note */
function etoiles(n: number | null) {
    const etoile =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9z"/></svg>';
    const rangee = etoile.repeat(5);
    const largeur = n == null ? 0 : Math.round(Math.max(0, Math.min(100, (n / 5) * 100)));
    return `<span class="tr-carte-etoiles"><span>${rangee}</span><span class="tr-carte-etoiles--pleines" data-largeur="${largeur}">${rangee}</span></span>`;
}

function marqueurLieu(p: Lieu & { latitude: number; longitude: number }) {
    const c = CATEGORIES[p.category];
    const mk = L.marker([p.latitude, p.longitude], {
        icon: L.divIcon({
            className: '',
            html: `<div class="tr-carte-lieu tr-carte-lieu--${p.category}">${c ? svgIcone(c.icone, 15) : ''}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -28]
        }),
        keyboard: true,
        title: p.name
    });
    const moyenne = p.avg_rating != null ? `${note(p.avg_rating)} (${p.n_ratings})` : 'non noté';
    mk.bindPopup(
        bulle(
            `<div class="tr-carte-bulle"><span class="tr-carte-tag tr-carte-tag--${p.category}">${c ? `${svgIcone(c.icone, 12)}${c.label}` : ''}</span>` +
                `<div class="tr-carte-nom">${echapper(p.name)}</div>${etoiles(p.avg_rating)} <span class="tr-carte-discret">${moyenne}</span>` +
                `<div class="tr-carte-adresse">${echapper(p.address ?? '')}</div>` +
                `<div class="tr-carte-discret">${echapper(p.loc_court)}${p.distance_km != null ? ` · ${km(p.distance_km)} km` : ''}</div></div>`,
            'Voir la fiche',
            () => lieux.mettreEnEvidence(p.id)
        )
    );
    mk.on('click', () => lieux.mettreEnEvidence(p.id));
    return mk;
}

/** Marqueurs des SAMU-SAS (celui choisi, ou tous) et des lieux affichés, puis cadrage */
function dessiner() {
    if (!carte || !calque) return;
    calque.clearLayers();
    marqueurs.clear();
    const points: L.LatLngTuple[] = [];
    for (const l of lieux.meta?.locations ?? []) {
        if (l.latitude == null || l.longitude == null) continue;
        if (lieux.filtres.loc && String(l.id) !== lieux.filtres.loc) continue;
        marqueurSamu({ ...l, latitude: l.latitude, longitude: l.longitude }).addTo(calque);
        points.push([l.latitude, l.longitude]);
    }
    for (const p of lieux.lieux) {
        if (p.latitude == null || p.longitude == null) continue;
        const mk = marqueurLieu({ ...p, latitude: p.latitude, longitude: p.longitude }).addTo(calque);
        marqueurs.set(p.id, mk);
        points.push([p.latitude, p.longitude]);
    }
    // Sans filtre : vue d'ensemble de la France métropolitaine ; avec un filtre : cadrage sur les points affichés
    clearTimeout(cadrage);
    cadrage = setTimeout(() => {
        if (!carte) return;
        carte.invalidateSize();
        if (lieux.sansFiltre || !points.length) carte.fitBounds(FRANCE, { padding: [8, 8] });
        else if (points.length === 1 && points[0]) carte.setView(points[0], 14);
        else carte.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    }, 80);
}

/** Parcours du mode choisi, du lieu (couleur du mode) au SAMU-SAS */
function tracerTrajet() {
    if (!carte) return;
    calqueTrajet?.remove();
    calqueTrajet = null;
    const t = lieux.trajet;
    const r = t?.donnees && t.mode ? t.donnees.modes[t.mode] : null;
    if (!t?.donnees || !t.mode || !r || r.error) return;
    const groupe = (calqueTrajet = L.layerGroup().addTo(carte));
    const col = couleur(`--gp-trajet-${t.mode}`);
    if (t.mode === 'transit') {
        for (const etape of r.legs) {
            if (!etape.path.length) continue;
            const aPied = etape.mode === 'WALK';
            L.polyline(etape.path, {
                color: aPied ? '#607d8b' : col,
                weight: aPied ? 4 : 6,
                opacity: 0.9,
                dashArray: aPied ? '2 9' : undefined,
                lineCap: 'round'
            }).addTo(groupe);
        }
    } else {
        L.polyline(r.path, {
            color: col,
            weight: 6,
            opacity: 0.85,
            dashArray: t.mode === 'walk' ? '2 10' : undefined,
            lineCap: 'round'
        }).addTo(groupe);
    }
    const style = { radius: 7, color: '#fff', weight: 3, fillOpacity: 1 };
    L.circleMarker(t.donnees.from, { ...style, fillColor: col }).addTo(groupe);
    L.circleMarker(t.donnees.to, { ...style, fillColor: couleur('--gp-samu') }).addTo(groupe);
    carte.fitBounds(L.latLngBounds(r.path.length ? r.path : [t.donnees.from, t.donnees.to]), { padding: [50, 50] });
    afficherCarte();
}

onMounted(() => {
    if (!conteneur.value) return;
    carte = L.map(conteneur.value, { zoomControl: true }).fitBounds(FRANCE);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(carte);
    calque = L.layerGroup().addTo(carte);
    dessiner();
});

onBeforeUnmount(() => {
    clearTimeout(cadrage);
    carte?.remove();
    carte = null;
});

// Liste rechargée (filtres, ajout, suppression…) : marqueurs redessinés, parcours effacé
watch(() => lieux.version, dessiner);
watch(() => [lieux.trajet?.id, lieux.trajet?.donnees, lieux.trajet?.mode], tracerTrajet);
// Bouton « Carte » d'une fiche : centrage sur le lieu et bulle ouverte
watch(
    () => lieux.focus,
    f => {
        const mk = f && marqueurs.get(f.id);
        afficherCarte();
        if (mk && carte) {
            carte.setView(mk.getLatLng(), Math.max(carte.getZoom(), 15));
            mk.openPopup();
        }
    }
);
// Onglet rouvert : la carte, masquée entre-temps, reprend ses dimensions
surReouverture(() => setTimeout(() => carte?.invalidateSize(), 0));
</script>

<template>
    <div class="tr-carte-cadre">
        <div ref="conteneur" class="tr-carte" role="region" aria-label="Carte des lieux et des SAMU-SAS"></div>
    </div>
</template>

<style scoped>
.tr-carte-cadre {
    position: sticky;
    top: 150px;
    z-index: 1;
}
.tr-carte {
    height: calc(100vh - 290px);
    min-height: 420px;
    border-radius: var(--gp-rayon-2);
    border: 1px solid var(--gp-bordure-carte);
}
@media (max-width: 1000px) {
    .tr-carte-cadre {
        position: static;
    }
    .tr-carte {
        height: 340px;
        min-height: 300px;
    }
}
</style>

<!-- Marqueurs et bulles : contenu créé par Leaflet hors des composants -->
<style>
.tr-carte-lieu {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    background: var(--gp-cat-aucune);
    color: #fff;
}
.tr-carte-lieu > svg {
    transform: rotate(45deg);
}
.tr-carte-lieu--hebergement,
.tr-carte-tag--hebergement {
    background: var(--gp-cat-hebergement);
}
.tr-carte-lieu--restaurant,
.tr-carte-tag--restaurant {
    background: var(--gp-cat-restaurant);
}
.tr-carte-lieu--bar,
.tr-carte-tag--bar {
    background: var(--gp-cat-bar);
}
.tr-carte-samu {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 9px;
    border-radius: var(--gp-rayon-2);
    background: var(--gp-primaire);
    color: #fff;
    font-size: var(--gp-police-xs);
    font-weight: 800;
    letter-spacing: 0.2px;
    white-space: nowrap;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}
.tr-carte-bulle {
    min-width: 190px;
}
.tr-carte-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px;
    border-radius: var(--gp-rayon-2);
    font-size: var(--gp-police-xs);
    font-weight: 700;
    color: #fff;
}
.tr-carte-nom {
    font-size: 15px;
    font-weight: 700;
    margin: 4px 0 2px;
}
.tr-carte-adresse {
    font-size: var(--gp-police-s);
    color: #556;
    margin-top: 3px;
}
.tr-carte-discret {
    font-size: var(--gp-police-xs);
    color: #778;
}
.tr-carte-etoiles {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
}
.tr-carte-etoiles > span {
    display: inline-flex;
}
.tr-carte-etoiles svg {
    flex: none;
    width: 14px;
    height: 14px;
    fill: var(--gp-etoile-vide);
    stroke: var(--gp-etoile-vide);
    stroke-width: 1.2;
    stroke-linejoin: round;
}
.tr-carte-etoiles .tr-carte-etoiles--pleines {
    position: absolute;
    left: 0;
    top: 0;
    overflow: hidden;
    white-space: nowrap;
}
.tr-carte-etoiles--pleines svg {
    fill: var(--gp-etoile);
    stroke: var(--gp-etoile);
}
</style>
