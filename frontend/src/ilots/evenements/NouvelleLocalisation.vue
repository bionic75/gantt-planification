<!-- Nouvelle localisation, créée depuis le formulaire d'un événement : libellés, adresse avec suggestions
     (OpenStreetMap), coordonnées vérifiables sur la carte -->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { apiEvenements } from '@/api/evenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import VerificationCarte from './VerificationCarte.vue';

const emit = defineEmits<{ close: []; created: [id: number] }>();

const long = ref('');
const court = ref('');
const adresse = ref('');
const latitude = ref('');
const longitude = ref('');
const erreur = ref('');
const suggestions = ref<Array<{ libelle: string; lat: number; lng: number }>>([]);
const verification = ref(false);
let minuteur: ReturnType<typeof setTimeout> | undefined;

/** Adresse : suggestions de la base de référence après une pause dans la saisie (5 caractères au moins) */
function adresseSaisie(v: string) {
    adresse.value = v.toUpperCase();
    clearTimeout(minuteur);
    minuteur = setTimeout(() => void chercher(adresse.value.trim()), 800);
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
    adresse.value = s.libelle.trim().toUpperCase();
    latitude.value = s.lat.toFixed(6);
    longitude.value = s.lng.toFixed(6);
    suggestions.value = [];
}

function positionConfirmee(p: { latitude: number; longitude: number }) {
    latitude.value = p.latitude.toFixed(6);
    longitude.value = p.longitude.toFixed(6);
    verification.value = false;
}

async function creer() {
    erreur.value = '';
    const libelleLong = long.value.trim().toUpperCase();
    const libelleCourt = court.value.trim().toUpperCase();
    if (!libelleLong || !libelleCourt) {
        erreur.value = 'Le libellé long et le libellé court sont obligatoires.';
        return;
    }
    try {
        const { id } = await apiEvenements.creerLocalisation({
            libelle_long: libelleLong,
            libelle_court: libelleCourt,
            adresse: adresse.value.trim().toUpperCase() || null,
            latitude: latitude.value || null,
            longitude: longitude.value || null
        });
        emit('created', id);
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    }
}

onBeforeUnmount(() => clearTimeout(minuteur));
const nombre = (v: string) => (v === '' ? null : Number(v));
</script>

<template>
    <AppModal opened title="📍 Nouvelle localisation" class="ev-loc" @close="emit('close')">
        <div class="ev-loc__deux">
            <div>
                <label for="evLocLong" class="ev-loc__libelle">Libellé long *</label>
                <input
                    id="evLocLong"
                    :value="long"
                    type="text"
                    class="ev-loc__champ ev-loc__majuscules"
                    placeholder="Ex: CENTRE HOSPITALIER DE BORDEAUX"
                    @input="long = ($event.target as HTMLInputElement).value.toUpperCase()"
                />
            </div>
            <div>
                <label for="evLocCourt" class="ev-loc__libelle">Libellé court *</label>
                <input
                    id="evLocCourt"
                    :value="court"
                    type="text"
                    class="ev-loc__champ ev-loc__majuscules"
                    placeholder="Ex: CHB"
                    @input="court = ($event.target as HTMLInputElement).value.toUpperCase()"
                />
            </div>
        </div>
        <div class="ev-loc__adresse">
            <label for="evLocAdresse" class="ev-loc__libelle">Adresse</label>
            <input
                id="evLocAdresse"
                :value="adresse"
                type="text"
                class="ev-loc__champ ev-loc__majuscules"
                placeholder="Ex: 1 RUE DE LA PAIX, 75001 PARIS"
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="evLocSuggestions"
                :aria-expanded="suggestions.length ? 'true' : 'false'"
                @input="adresseSaisie(($event.target as HTMLInputElement).value)"
            />
            <ul
                v-show="suggestions.length"
                id="evLocSuggestions"
                class="ev-loc__suggestions"
                role="listbox"
                aria-label="Adresses"
            >
                <li v-for="(s, i) in suggestions" :key="i" role="option" aria-selected="false" @click="choisir(s)">
                    {{ s.libelle }}
                </li>
            </ul>
        </div>
        <div class="ev-loc__deux">
            <div>
                <label for="evLocLat" class="ev-loc__libelle">Latitude</label>
                <input
                    id="evLocLat"
                    v-model="latitude"
                    type="number"
                    step="any"
                    class="ev-loc__champ"
                    placeholder="Ex: 44.8378"
                />
            </div>
            <div>
                <label for="evLocLng" class="ev-loc__libelle">Longitude</label>
                <input
                    id="evLocLng"
                    v-model="longitude"
                    type="number"
                    step="any"
                    class="ev-loc__champ"
                    placeholder="Ex: -0.5792"
                />
            </div>
        </div>
        <div class="ev-loc__verifier">
            <button type="button" class="ev-loc__bouton-carte" @click="verification = true">
                🗺️ Vérifier sur la carte
            </button>
        </div>
        <AppAlert v-if="erreur" type="error" small :description="erreur" />
        <template #footer>
            <button type="button" class="ev-loc__annuler" @click="emit('close')">Annuler</button>
            <button type="button" class="ev-loc__creer" @click="creer">💾 Créer</button>
        </template>
    </AppModal>
    <VerificationCarte
        v-if="verification"
        :latitude="nombre(String(latitude))"
        :longitude="nombre(String(longitude))"
        @close="verification = false"
        @confirm="positionConfirmee"
    />
</template>

<style scoped>
.ev-loc__deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 12px 0 10px;
}
.ev-loc__libelle {
    font-size: 12px;
    color: #283593;
    display: block;
    margin-bottom: 3px;
    font-weight: 400;
}
.ev-loc__champ {
    width: 100%;
    padding: 6px;
    border: 1px solid #9fa8da;
    border-radius: 4px;
    box-sizing: border-box;
}
.ev-loc__majuscules {
    text-transform: uppercase;
}
.ev-loc__adresse {
    margin-bottom: 10px;
    position: relative;
}
.ev-loc__suggestions {
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
.ev-loc__suggestions li {
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    border-bottom: 1px solid #e8eaf6;
    color: #283593;
}
.ev-loc__suggestions li:hover {
    background: #e8eaf6;
}
.ev-loc__verifier {
    margin-bottom: 8px;
}
.ev-loc__bouton-carte {
    background: #1565c0;
    color: white;
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
.ev-loc__annuler,
.ev-loc__creer {
    color: white;
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.ev-loc__annuler {
    background: #95a5a6;
}
.ev-loc__creer {
    background: #3f51b5;
    font-weight: bold;
}
</style>
