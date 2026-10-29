<!-- Vérification / ajustement des coordonnées d'une localisation : repère déplaçable sur la carte -->
<script setup lang="ts">
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconeRepere from 'leaflet/dist/images/marker-icon.png';
import iconeRepere2x from 'leaflet/dist/images/marker-icon-2x.png';
import ombreRepere from 'leaflet/dist/images/marker-shadow.png';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppModal from '@/composants/AppModal.vue';

const props = defineProps<{ latitude: number | null; longitude: number | null }>();
const emit = defineEmits<{ close: []; confirm: [position: { latitude: number; longitude: number }] }>();

const conteneur = ref<HTMLElement | null>(null);
const position = ref({ latitude: props.latitude ?? 46.6, longitude: props.longitude ?? 2.3 });
let carte: L.Map | null = null;

onMounted(async () => {
    await nextTick();
    if (!conteneur.value) return;
    const centre: L.LatLngTuple = [position.value.latitude, position.value.longitude];
    const inconnue = props.latitude == null || props.longitude == null;
    carte = L.map(conteneur.value).setView(centre, inconnue ? 5 : 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(carte);
    const repere = L.marker(centre, {
        draggable: true,
        icon: L.icon({
            iconUrl: iconeRepere,
            iconRetinaUrl: iconeRepere2x,
            shadowUrl: ombreRepere,
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(carte);
    const suivre = (p: L.LatLng) => (position.value = { latitude: p.lat, longitude: p.lng });
    repere.on('drag dragend', () => suivre(repere.getLatLng()));
    // Clic sur la carte : le repère s'y déplace
    carte.on('click', e => {
        repere.setLatLng(e.latlng);
        suivre(e.latlng);
    });
    setTimeout(() => carte?.invalidateSize(), 100);
});

onBeforeUnmount(() => {
    carte?.remove();
    carte = null;
});
</script>

<template>
    <AppModal opened title="🗺️ Vérification / ajustement des coordonnées" @close="emit('close')">
        <div
            ref="conteneur"
            class="ev-verif__carte"
            role="region"
            aria-label="Carte : position de la localisation"
        ></div>
        <div class="ev-verif__pied">
            <span class="ev-verif__aide">Faites glisser le repère pour affiner la position</span>
            <span class="ev-verif__coordonnees"
                >Lat : {{ position.latitude.toFixed(6) }} Lng : {{ position.longitude.toFixed(6) }}</span
            >
            <button type="button" class="ev-verif__confirmer" @click="emit('confirm', position)">✅ Confirmer</button>
            <button type="button" class="ev-verif__annuler" @click="emit('close')">Annuler</button>
        </div>
    </AppModal>
</template>

<style scoped>
.ev-verif__carte {
    height: 380px;
    width: 100%;
    margin-top: 12px;
}
.ev-verif__pied {
    padding: 12px 0 0;
    display: flex;
    align-items: center;
    gap: 16px;
}
.ev-verif__aide {
    font-size: 12px;
    color: #555;
}
.ev-verif__coordonnees {
    font-size: 12px;
    font-family: monospace;
    color: #1565c0;
    flex: 1;
    white-space: pre;
}
.ev-verif__confirmer,
.ev-verif__annuler {
    color: white;
    padding: 7px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.ev-verif__confirmer {
    background: #3f51b5;
    font-weight: bold;
}
.ev-verif__annuler {
    background: #95a5a6;
    padding: 7px 14px;
}
</style>
