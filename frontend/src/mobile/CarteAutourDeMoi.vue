<!-- Application mobile : carte « Autour de moi » (lieux TripAdVisor et SAMU-SAS autour de la position du téléphone ;
     périmètre 10 / 25 / 50 / 100 km ou France entière). Leaflet installé par npm. -->
<script setup lang="ts">
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { nextTick, ref, watch } from 'vue';
import { appliquerStyles } from '@/outils/styles-en-ligne';
import { decompte, distanceKm } from './planning';

const props = defineProps<{ ouverte: boolean }>();
const emit = defineEmits<{ fermer: [] }>();

interface Lieu {
    name: string;
    category: string;
    latitude: number | null;
    longitude: number | null;
    loc_court: string;
    address: string;
    comment?: string | null;
    creator: string;
    avg_rating: number | null;
    n_ratings: number;
}
interface SamuSas {
    libelle_court: string;
    libelle_long?: string | null;
    adresse?: string | null;
    latitude: number | null;
    longitude: number | null;
    n_poi: number;
}

const CATEGORIES: Record<string, { label: string; color: string; svg: string }> = {
    hebergement: {
        label: 'Hébergement',
        color: '#6a1b9a',
        svg: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>'
    },
    restaurant: {
        label: 'Restaurant',
        color: '#e65100',
        svg: '<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7M6 7h4M17 21V3c-2 1-3.5 4-3.5 8h3.5"/>'
    },
    bar: { label: 'Bar', color: '#1565c0', svg: '<path d="M5 4h14l-7 8zM12 12v8M8 20h8"/>' }
};
const FRANCE: L.LatLngBoundsExpression = [
    [41.2, -5.3],
    [51.2, 9.7]
];
/** Texte inséré dans les marqueurs et les fiches (HTML créé par Leaflet) */
const esc = (t: unknown) =>
    String(t == null ? '' : t).replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );

const rayon = ref('50');
const info = ref('Chargement…');
const zone = ref<HTMLElement | null>(null);

let carte: L.Map | null = null;
let couche: L.LayerGroup | null = null;
let moi: L.Marker | null = null;
let cercle: L.Circle | null = null;
let position: [number, number] | null = null;
let precision = 0;
let lieux: Lieu[] | null = null;
let samus: SamuSas[] = [];

async function ouvrir() {
    await nextTick();
    if (!carte && zone.value) {
        carte = L.map(zone.value, { zoomControl: false }).fitBounds(FRANCE);
    // Couleur des repères (data-style) posée en JavaScript : la CSP bloque les attributs style du HTML des icônes
    carte.on('layeradd', e => appliquerStyles((e.layer as L.Marker).getElement?.()));
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(carte);
        couche = L.layerGroup().addTo(carte);
    }
    setTimeout(() => carte?.invalidateSize(), 50);
    // Lieux relus à chaque ouverture (un lieu créé depuis peu doit apparaître)
    try {
        const r = await fetch('/api/poi', { credentials: 'include' });
        if (!r.ok) throw new Error();
        lieux = ((await r.json()) as { pois: Lieu[] }).pois.filter(p => p.latitude != null && p.longitude != null);
        try {
            const m = await fetch('/api/poi/meta', { credentials: 'include' });
            samus = m.ok
                ? ((await m.json()) as { locations: SamuSas[] }).locations.filter(
                      l => l.latitude != null && l.longitude != null
                  )
                : [];
        } catch {
            samus = [];
        }
    } catch {
        info.value = 'Impossible de charger les lieux.';
        return;
    }
    dessiner();
    localiser();
}

function localiser() {
    if (!navigator.geolocation) {
        info.value = 'Géolocalisation non disponible : carte de France.';
        dessiner();
        return;
    }
    info.value = "Localisation en cours… (autorisez l'accès à la position)";
    navigator.geolocation.getCurrentPosition(
        pos => {
            position = [pos.coords.latitude, pos.coords.longitude];
            precision = pos.coords.accuracy;
            dessiner();
        },
        err => {
            position = null;
            dessiner();
            info.value =
                (err && err.code === 1
                    ? 'Position refusée — autorisez la localisation dans les réglages du navigateur. '
                    : 'Position introuvable. ') + info.value;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
}

function dessiner() {
    if (!carte || !couche || !lieux) return;
    const r = Number(rayon.value);
    couche.clearLayers();
    const dist = (la: number, lo: number) => (position ? distanceKm(position[0], position[1], la, lo) : null);
    const tous = lieux.map(p => ({ p, d: dist(p.latitude!, p.longitude!) }));
    const sas = samus.map(l => ({ l, d: dist(l.latitude!, l.longitude!) }));
    const dedans = (x: { d: number | null }) => !position || r === 0 || (x.d ?? 0) <= r;
    const liste = tous.filter(dedans).sort((a, b) => (a.d || 0) - (b.d || 0));
    // SAMU-SAS : toujours visibles, en grand, avec leur nom
    for (const { l, d } of sas) {
        L.marker([l.latitude!, l.longitude!], {
            icon: L.divIcon({
                className: '',
                html: `<div class="near-sas">SAMU-SAS ${esc(l.libelle_court)}${l.n_poi ? ` <span>${l.n_poi}</span>` : ''}</div>`,
                iconSize: [0, 0]
            }),
            zIndexOffset: 500
        })
            .addTo(couche)
            .bindPopup(
                `<div class="near-pop"><b>SAMU-SAS ${esc(l.libelle_court)}</b><br>${esc(l.libelle_long || '')}<br>${esc(l.adresse || '')}${d != null ? `<br>${d.toFixed(1)} km` : ''}<br>${l.n_poi} lieu${l.n_poi > 1 ? 'x' : ''} renseigné${l.n_poi > 1 ? 's' : ''}</div>`
            );
    }
    // Lieux : tous affichés (le périmètre sert au cadrage et au décompte)
    for (const { p, d } of tous) {
        const c = CATEGORIES[p.category] ?? CATEGORIES.hebergement!;
        const etoiles = p.avg_rating == null ? 'Pas encore noté' : `★ ${p.avg_rating}/5 (${p.n_ratings})`;
        L.marker([p.latitude!, p.longitude!], {
            icon: L.divIcon({
                className: '',
                html: `<div class="near-pin" data-style="background:${c.color}"><svg viewBox="0 0 24 24">${c.svg}</svg></div><div class="near-lbl">${esc(p.name)}</div>`,
                iconSize: [46, 46],
                iconAnchor: [23, 23],
                popupAnchor: [0, -26]
            }),
            zIndexOffset: 1000
        })
            .addTo(couche)
            .bindPopup(
                `<div class="near-pop"><b>${esc(p.name)}</b><br>${esc(c.label)} · SAMU-SAS ${esc(p.loc_court)}<br>${esc(p.address)}<br>${etoiles}${d != null ? ` · ${d.toFixed(1)} km` : ''}` +
                    `${p.comment ? `<br><i>${esc(p.comment)}</i>` : ''}<br><small>par ${esc(p.creator)}</small><br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}" target="_blank" rel="noopener">Itinéraire</a></div>`
            );
    }
    if (moi) {
        carte.removeLayer(moi);
        moi = null;
    }
    if (cercle) {
        carte.removeLayer(cercle);
        cercle = null;
    }
    let cadre: L.LatLngBounds | null = null;
    if (position) {
        moi = L.marker(position, {
            icon: L.divIcon({
                className: '',
                html: '<div class="near-me"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            }),
            zIndexOffset: -500
        }).addTo(carte);
        if (r > 0)
            cercle = L.circle(position, { radius: r * 1000, color: '#1D70B7', weight: 1, fillOpacity: 0.05 }).addTo(
                carte
            );
        const points: L.LatLngTuple[] = [position];
        const affiches: L.LatLngTuple[] = [
            ...liste.map(x => [x.p.latitude!, x.p.longitude!] as L.LatLngTuple),
            ...sas.filter(dedans).map(x => [x.l.latitude!, x.l.longitude!] as L.LatLngTuple)
        ];
        if (affiches.length) points.push(...affiches);
        else {
            // Rien dans le périmètre : cadrage sur la position et l'élément le plus proche
            const proche = [
                ...tous.map(x => ({ d: x.d!, ll: [x.p.latitude!, x.p.longitude!] as L.LatLngTuple })),
                ...sas.map(x => ({ d: x.d!, ll: [x.l.latitude!, x.l.longitude!] as L.LatLngTuple }))
            ].sort((a, b) => a.d - b.d)[0];
            if (proche) points.push(proche.ll);
        }
        cadre = L.latLngBounds(points);
        info.value = decompte(
            tous.map(x => x.d!),
            r,
            precision
        );
    } else info.value = decompte(null, r, 0, tous.length);
    carte.invalidateSize();
    if (cadre) carte.fitBounds(cadre, { padding: [60, 60], maxZoom: 15 });
    else carte.fitBounds(FRANCE);
}

watch(
    () => props.ouverte,
    o => {
        if (o) void ouvrir();
    }
);
</script>

<template>
    <div id="nearScreen" :class="{ hidden: !ouverte }">
        <div id="nearBar">
            <button id="nearClose" class="icon-btn" type="button" aria-label="Fermer" @click="emit('fermer')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <h2>Autour de moi</h2>
            <select id="nearRadius" v-model="rayon" aria-label="Périmètre" @change="dessiner">
                <option value="10">10 km</option>
                <option value="25">25 km</option>
                <option value="50">50 km</option>
                <option value="100">100 km</option>
                <option value="0">France</option>
            </select>
            <button id="nearLocate" class="icon-btn" type="button" aria-label="Me localiser" @click="localiser">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
                </svg>
            </button>
        </div>
        <div id="nearMap" ref="zone"></div>
        <div id="nearInfo">{{ info }}</div>
    </div>
</template>
