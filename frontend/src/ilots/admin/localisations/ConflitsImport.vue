<!-- Fenêtre des conflits d'import : localisations du fichier déjà en base, à conserver, écraser ou saisir -->
<script setup lang="ts">
import { computed } from 'vue';
import AppModal from '@/composants/AppModal.vue';
import { memeCoordonnee, type ActionConflit, type Conflit } from './calculs';
import { useLocalisationsStore } from './magasin';

const loc = useLocalisationsStore();

const ACTIONS: Array<{ valeur: ActionConflit; label: string }> = [
    { valeur: 'keep', label: "Conserver l'existant" },
    { valeur: 'overwrite', label: 'Écraser avec le CSV' },
    { valeur: 'manual', label: 'Saisir manuellement' }
];

const identiques = computed(() => loc.conflits.filter(c => c.identique).length);
const differentes = computed(() => loc.conflits.length - identiques.value);

/** Champs du fichier différents de la base (surlignés) */
const ecarts = (c: Conflit) => ({
    court: c.fichier.libelle_court !== c.existante.libelle_court,
    adresse: (c.fichier.adresse || '') !== (c.existante.adresse || ''),
    latitude: !memeCoordonnee(c.fichier.latitude, c.existante.latitude),
    longitude: !memeCoordonnee(c.fichier.longitude, c.existante.longitude)
});

const tiret = (v: string | number | null | undefined) => (v == null || v === '' ? '-' : v);
const nombre = (v: string) => parseFloat(v) || null;

function toutAppliquer(action: ActionConflit) {
    for (const c of loc.conflits) c.action = action;
}
</script>

<template>
    <AppModal
        id="locConflictModal"
        :opened="loc.conflits.length > 0"
        title="⚠️ Conflits détectés lors de l'import"
        class="loc-conflits"
        @close="loc.fermerConflits()"
    >
        <p class="loc-conflits__intro">Pour chaque localisation en conflit, choisissez l'action à effectuer :</p>
        <div v-if="identiques > 0" class="loc-conflits__resume">
            ℹ️ <strong>{{ identiques }}</strong> entrée(s) avec des données identiques en base (marquées ✅).
            <template v-if="differentes > 0">
                <strong>{{ differentes }}</strong> entrée(s) avec des données différentes (marquées ⚠️).
            </template>
        </div>
        <fieldset
            v-for="(c, i) in loc.conflits"
            :key="c.existante.id"
            class="loc-conflits__carte"
            :class="c.identique ? 'loc-conflits__carte--identique' : 'loc-conflits__carte--differente'"
        >
            <legend class="loc-conflits__entete">
                <span class="loc-conflits__nom">{{ c.fichier.libelle_long }}</span>
                <span v-if="c.identique" class="loc-conflits__badge loc-conflits__badge--identique">
                    ✅ Données identiques
                </span>
                <span v-else class="loc-conflits__badge loc-conflits__badge--differente">⚠️ Données différentes</span>
            </legend>
            <div class="loc-conflits__comparaison">
                <div class="loc-conflits__base">
                    <div class="loc-conflits__source loc-conflits__source--base">Données en base</div>
                    <div>Court : {{ c.existante.libelle_court }}</div>
                    <div>Adresse : {{ tiret(c.existante.adresse) }}</div>
                    <div>Lat : {{ tiret(c.existante.latitude) }} / Lng : {{ tiret(c.existante.longitude) }}</div>
                </div>
                <div class="loc-conflits__fichier">
                    <div class="loc-conflits__source loc-conflits__source--fichier">Données du fichier CSV</div>
                    <div>
                        Court :
                        <strong v-if="ecarts(c).court" class="loc-conflits__ecart">{{ c.fichier.libelle_court }}</strong
                        ><template v-else>{{ c.fichier.libelle_court }}</template>
                    </div>
                    <div>
                        Adresse :
                        <strong v-if="ecarts(c).adresse" class="loc-conflits__ecart">{{
                            tiret(c.fichier.adresse)
                        }}</strong
                        ><template v-else>{{ tiret(c.fichier.adresse) }}</template>
                    </div>
                    <div>
                        Lat :
                        <strong v-if="ecarts(c).latitude" class="loc-conflits__ecart">{{
                            tiret(c.fichier.latitude)
                        }}</strong
                        ><template v-else>{{ tiret(c.fichier.latitude) }}</template>
                        / Lng :
                        <strong v-if="ecarts(c).longitude" class="loc-conflits__ecart">{{
                            tiret(c.fichier.longitude)
                        }}</strong
                        ><template v-else>{{ tiret(c.fichier.longitude) }}</template>
                    </div>
                </div>
            </div>
            <div class="loc-conflits__actions" role="radiogroup" :aria-label="`Action pour ${c.fichier.libelle_long}`">
                <span class="loc-conflits__libelle-action">Action :</span>
                <label v-for="a in ACTIONS" :key="a.valeur" class="loc-conflits__choix">
                    <input v-model="c.action" type="radio" :name="`locConflict_${i}`" :value="a.valeur" />
                    {{ a.label }}
                </label>
            </div>
            <div v-if="c.action === 'manual'" class="loc-conflits__manuel">
                <div class="loc-conflits__grille">
                    <div>
                        <label :for="`manualCourt_${i}`">Libellé court *</label>
                        <input
                            :id="`manualCourt_${i}`"
                            :value="c.manuel.libelle_court"
                            type="text"
                            class="loc-conflits__majuscules"
                            @input="c.manuel.libelle_court = ($event.target as HTMLInputElement).value.toUpperCase()"
                        />
                    </div>
                    <div>
                        <label :for="`manualAdresse_${i}`">Adresse</label>
                        <input
                            :id="`manualAdresse_${i}`"
                            :value="c.manuel.adresse"
                            type="text"
                            class="loc-conflits__majuscules"
                            @input="c.manuel.adresse = ($event.target as HTMLInputElement).value.toUpperCase()"
                        />
                    </div>
                </div>
                <div class="loc-conflits__grille">
                    <div>
                        <label :for="`manualLat_${i}`">Latitude</label>
                        <input
                            :id="`manualLat_${i}`"
                            :value="c.manuel.latitude ?? ''"
                            type="number"
                            step="any"
                            @input="c.manuel.latitude = nombre(($event.target as HTMLInputElement).value)"
                        />
                    </div>
                    <div>
                        <label :for="`manualLng_${i}`">Longitude</label>
                        <input
                            :id="`manualLng_${i}`"
                            :value="c.manuel.longitude ?? ''"
                            type="number"
                            step="any"
                            @input="c.manuel.longitude = nombre(($event.target as HTMLInputElement).value)"
                        />
                    </div>
                </div>
            </div>
        </fieldset>
        <template #footer>
            <button
                type="button"
                class="loc-conflits__bouton loc-conflits__bouton--conserver"
                @click="toutAppliquer('keep')"
            >
                ✅ Tout conserver
            </button>
            <button
                type="button"
                class="loc-conflits__bouton loc-conflits__bouton--ecraser"
                @click="toutAppliquer('overwrite')"
            >
                🔄 Tout écraser
            </button>
            <button
                type="button"
                class="loc-conflits__bouton loc-conflits__bouton--appliquer"
                @click="loc.appliquerConflits()"
            >
                💾 Appliquer les choix
            </button>
        </template>
    </AppModal>
</template>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.loc-conflits .gp-modale__boite {
    width: min(900px, 100%);
}
.gp-modale.loc-conflits .gp-modale__titre {
    color: #c0392b;
}
</style>

<style scoped>
.loc-conflits__intro {
    color: #555;
    font-size: 13px;
    margin: 15px 0 20px;
}
.loc-conflits__resume {
    background: #e3f2fd;
    border: 1px solid #90caf9;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 15px;
    font-size: 12px;
    color: #1565c0;
}
.loc-conflits__carte {
    border-radius: 8px;
    padding: 15px;
    margin: 0 0 15px;
    background: #fafafa;
    min-width: 0;
}
.loc-conflits__carte--identique {
    border: 1px solid #c8e6c9;
}
.loc-conflits__carte--differente {
    border: 1px solid #ffcc80;
}
.loc-conflits__entete {
    display: flex;
    align-items: center;
    gap: 10px;
    float: left;
    width: 100%;
    padding: 0;
    margin-bottom: 10px;
}
.loc-conflits__nom {
    font-weight: bold;
    color: #2c3e50;
}
.loc-conflits__badge {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
}
.loc-conflits__badge--identique {
    background: #e8f5e9;
    color: #2e7d32;
    border: 1px solid #a5d6a7;
}
.loc-conflits__badge--differente {
    background: #fff3e0;
    color: #e65100;
    border: 1px solid #ffcc80;
}
.loc-conflits__comparaison {
    clear: both;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
    font-size: 12px;
}
.loc-conflits__base {
    background: #fff3e0;
    padding: 10px;
    border-radius: 5px;
}
.loc-conflits__fichier {
    background: #e8f5e9;
    padding: 10px;
    border-radius: 5px;
}
.loc-conflits__source {
    font-weight: bold;
    margin-bottom: 5px;
}
.loc-conflits__source--base,
.loc-conflits__ecart {
    color: #e65100;
}
.loc-conflits__source--fichier {
    color: #2e7d32;
}
.loc-conflits__actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
.loc-conflits__libelle-action {
    font-size: 12px;
    font-weight: bold;
    color: #555;
}
.loc-conflits__choix {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 12px;
}
.loc-conflits__manuel {
    margin-top: 10px;
    background: #e3f2fd;
    padding: 10px;
    border-radius: 5px;
}
.loc-conflits__grille {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.loc-conflits__grille + .loc-conflits__grille {
    margin-top: 8px;
}
.loc-conflits__grille label {
    font-size: 11px;
    display: block;
    margin-bottom: 2px;
}
.loc-conflits__grille input {
    width: 100%;
    padding: 5px;
    box-sizing: border-box;
}
.loc-conflits__majuscules {
    text-transform: uppercase;
}
.loc-conflits__bouton {
    color: white;
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.loc-conflits__bouton--conserver,
.loc-conflits__bouton--conserver:hover {
    background: #27ae60;
}
.loc-conflits__bouton--ecraser,
.loc-conflits__bouton--ecraser:hover {
    background: #e74c3c;
}
.loc-conflits__bouton--appliquer,
.loc-conflits__bouton--appliquer:hover {
    background: #3f51b5;
    font-weight: bold;
}
@media (max-width: 600px) {
    .loc-conflits__comparaison,
    .loc-conflits__grille {
        grid-template-columns: 1fr;
    }
}
</style>
