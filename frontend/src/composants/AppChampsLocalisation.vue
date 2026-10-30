<!-- Champs d'une localisation : libellés long et court (majuscules), adresse avec suggestions (OpenStreetMap),
     latitude et longitude, vérification / ajustement sur la carte. Identifiants des champs fournis (repères e2e). -->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import AppVerificationCarte from './AppVerificationCarte.vue';

/** Valeurs saisies (coordonnées en texte, comme les champs) */
export interface ChampsLocalisation {
    long: string;
    court: string;
    adresse: string;
    latitude: string;
    longitude: string;
}

defineProps<{ ids: Record<keyof ChampsLocalisation, string> }>();
const valeurs = defineModel<ChampsLocalisation>({ required: true });

const suggestions = ref<Array<{ libelle: string; lat: number; lng: number }>>([]);
const verification = ref(false);
let minuteur: ReturnType<typeof setTimeout> | undefined;

const changer = (champ: keyof ChampsLocalisation, v: string) => (valeurs.value = { ...valeurs.value, [champ]: v });

/** Adresse : suggestions de la base de référence après une pause dans la saisie (5 caractères au moins) */
function adresseSaisie(v: string) {
    changer('adresse', v.toUpperCase());
    clearTimeout(minuteur);
    minuteur = setTimeout(() => void chercher(valeurs.value.adresse.trim()), 800);
}

async function chercher(q: string) {
    if (q.length < 5) {
        suggestions.value = [];
        return;
    }
    try {
        const r = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=0`,
            { headers: { 'Accept-Language': 'fr' } }
        );
        const resultats = (await r.json()) as Array<{ display_name: string; lat: string; lon: string }>;
        suggestions.value = resultats.map(x => ({
            libelle: x.display_name,
            lat: parseFloat(x.lat),
            lng: parseFloat(x.lon)
        }));
    } catch {
        suggestions.value = [];
    }
}

function choisir(s: { libelle: string; lat: number; lng: number }) {
    valeurs.value = {
        ...valeurs.value,
        adresse: s.libelle.trim().toUpperCase(),
        latitude: s.lat.toFixed(6),
        longitude: s.lng.toFixed(6)
    };
    suggestions.value = [];
}

function positionConfirmee(p: { latitude: number; longitude: number }) {
    valeurs.value = { ...valeurs.value, latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) };
    verification.value = false;
}

const nombre = (v: string) => (v === '' ? null : Number(v));
const saisie = (e: Event) => (e.target as HTMLInputElement).value;
onBeforeUnmount(() => clearTimeout(minuteur));
</script>

<template>
    <div class="gp-loc__deux">
        <div>
            <label :for="ids.long" class="gp-loc__libelle">Libellé long *</label>
            <input
                :id="ids.long"
                :value="valeurs.long"
                type="text"
                class="gp-loc__champ gp-loc__majuscules"
                placeholder="Ex: CENTRE HOSPITALIER DE BORDEAUX"
                @input="changer('long', saisie($event).toUpperCase())"
            />
        </div>
        <div>
            <label :for="ids.court" class="gp-loc__libelle">Libellé court *</label>
            <input
                :id="ids.court"
                :value="valeurs.court"
                type="text"
                class="gp-loc__champ gp-loc__majuscules"
                placeholder="Ex: CHB"
                @input="changer('court', saisie($event).toUpperCase())"
            />
        </div>
    </div>
    <div class="gp-loc__adresse">
        <label :for="ids.adresse" class="gp-loc__libelle">Adresse</label>
        <input
            :id="ids.adresse"
            :value="valeurs.adresse"
            type="text"
            class="gp-loc__champ gp-loc__majuscules"
            placeholder="Ex: 1 RUE DE LA PAIX, 75001 PARIS"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            :aria-controls="`${ids.adresse}Suggestions`"
            :aria-expanded="suggestions.length ? 'true' : 'false'"
            @input="adresseSaisie(saisie($event))"
        />
        <ul
            v-show="suggestions.length"
            :id="`${ids.adresse}Suggestions`"
            class="gp-loc__suggestions"
            role="listbox"
            aria-label="Adresses"
        >
            <li v-for="(s, i) in suggestions" :key="i" role="option" aria-selected="false" @click="choisir(s)">
                {{ s.libelle }}
            </li>
        </ul>
    </div>
    <div class="gp-loc__deux">
        <div>
            <label :for="ids.latitude" class="gp-loc__libelle">Latitude</label>
            <input
                :id="ids.latitude"
                :value="valeurs.latitude"
                type="number"
                step="any"
                class="gp-loc__champ"
                placeholder="Ex: 44.8378"
                @input="changer('latitude', saisie($event))"
            />
        </div>
        <div>
            <label :for="ids.longitude" class="gp-loc__libelle">Longitude</label>
            <input
                :id="ids.longitude"
                :value="valeurs.longitude"
                type="number"
                step="any"
                class="gp-loc__champ"
                placeholder="Ex: -0.5792"
                @input="changer('longitude', saisie($event))"
            />
        </div>
    </div>
    <div class="gp-loc__verifier">
        <button type="button" class="gp-loc__bouton-carte" @click="verification = true">
            🗺️ Vérifier sur la carte
        </button>
    </div>
    <AppVerificationCarte
        v-if="verification"
        :latitude="nombre(valeurs.latitude)"
        :longitude="nombre(valeurs.longitude)"
        @close="verification = false"
        @confirm="positionConfirmee"
    />
</template>

<style scoped>
.gp-loc__deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
}
.gp-loc__libelle {
    font-size: 12px;
    color: #283593;
    display: block;
    margin-bottom: 3px;
    font-weight: 400;
}
.gp-loc__champ {
    width: 100%;
    padding: 6px;
    border: 1px solid #9fa8da;
    border-radius: 4px;
    box-sizing: border-box;
}
.gp-loc__majuscules {
    text-transform: uppercase;
}
.gp-loc__adresse {
    margin-bottom: 10px;
    position: relative;
}
.gp-loc__suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    background: white;
    border: 1px solid #9fa8da;
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 5000;
    max-height: 160px;
    overflow-y: auto;
}
.gp-loc__suggestions li {
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    border-bottom: 1px solid #e8eaf6;
    color: #283593;
}
.gp-loc__suggestions li:hover {
    background: #e8eaf6;
}
.gp-loc__verifier {
    margin-bottom: 8px;
}
.gp-loc__bouton-carte,
.gp-loc__bouton-carte:hover {
    background: #1565c0;
    color: white;
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
}
</style>
