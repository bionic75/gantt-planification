<!-- Liste repliable des localisations : tri, sélection, modification, suppression (usages signalés) -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Localisation } from '@/api/localisations';
import { useConfirmation } from '@/composants/confirmation';
import { rendreColonnesRedimensionnables } from '@/liaison';
import { basculerTri, messageSuppression, trier, type ColonneTri, type Sens } from './calculs';
import { useLocalisationsStore } from './magasin';

const loc = useLocalisationsStore();
const confirmer = useConfirmation();

const ouverte = ref(false);
const tri = ref<{ colonne: ColonneTri; sens: Sens }>({ colonne: 'libelle_long', sens: 'asc' });
const choisies = ref(new Set<number>());
const tableau = ref<HTMLTableElement | null>(null);

const lignes = computed(() => trier(loc.localisations, tri.value.colonne, tri.value.sens));
const toutes = computed(() => loc.localisations.length > 0 && choisies.value.size === loc.localisations.length);
const partielle = computed(() => choisies.value.size > 0 && !toutes.value);

const COLONNES: Array<{ cle: ColonneTri; label: string; centre?: boolean }> = [
    { cle: 'libelle_long', label: 'Libellé long' },
    { cle: 'libelle_court', label: 'Libellé court' },
    { cle: 'adresse', label: 'Adresse' },
    { cle: 'latitude', label: 'Lat.', centre: true },
    { cle: 'longitude', label: 'Lng.', centre: true }
];
const fleche = (c: ColonneTri) => (tri.value.colonne !== c ? '▲▼' : tri.value.sens === 'asc' ? '▲' : '▼');

// Liste rechargée : sélection vidée
watch(
    () => loc.localisations,
    () => (choisies.value = new Set())
);
// Colonnes redimensionnables, comme les autres tableaux de l'application
watch(tableau, t => {
    if (t) void nextTick(() => rendreColonnesRedimensionnables(t));
});

function choisir(id: number, oui: boolean) {
    const s = new Set(choisies.value);
    if (oui) s.add(id);
    else s.delete(id);
    choisies.value = s;
}
function choisirTout(oui: boolean) {
    choisies.value = new Set(oui ? loc.localisations.map(l => l.id) : []);
}

/** Usages vérifiés, confirmation (détaillée si des événements sont rattachés), puis suppression */
async function supprimer(ids: number[]) {
    if (!ids.length) return;
    const usages = await loc.usages(ids);
    if (await confirmer(messageSuppression(usages, ids.length), 'Supprimer')) await loc.supprimer(ids);
}

const valeur = (l: Localisation, c: ColonneTri) => l[c] ?? '-';
</script>

<template>
    <div class="loc-liste">
        <button
            type="button"
            class="loc-liste__basculer"
            :aria-expanded="ouverte ? 'true' : 'false'"
            aria-controls="locListSub"
            @click="ouverte = !ouverte"
        >
            <span aria-hidden="true">{{ ouverte ? '▼' : '▶' }}</span>
            <span class="loc-liste__titre">📋 Liste des localisations renseignées</span>
        </button>
        <div v-show="ouverte" id="locListSub" class="loc-liste__corps">
            <div id="localisationsTableContainer">
                <p v-if="!loc.charge" class="loc-liste__vide">Chargement...</p>
                <p v-else-if="!loc.localisations.length" class="loc-liste__vide">Aucune localisation enregistrée.</p>
                <template v-else>
                    <div class="loc-liste__actions">
                        <button
                            v-if="choisies.size > 0"
                            id="locDeleteSelectedBtn"
                            type="button"
                            class="loc-liste__supprimer-selection"
                            @click="supprimer([...choisies])"
                        >
                            🗑️ Supprimer la sélection (<span id="locSelectedCount">{{ choisies.size }}</span
                            >)
                        </button>
                        <button
                            type="button"
                            class="loc-liste__supprimer-tout"
                            @click="supprimer(loc.localisations.map(l => l.id))"
                        >
                            <!-- Nombre isolé de l'émoji, converti en icône (public/js/ui-icons.js) -->
                            🗑️ Tout supprimer (<span>{{ loc.localisations.length }}</span
                            >)
                        </button>
                    </div>
                    <table ref="tableau" class="loc-liste__tableau">
                        <thead>
                            <tr>
                                <th class="loc-liste__case">
                                    <input
                                        id="locSelectAll"
                                        type="checkbox"
                                        title="Tout sélectionner"
                                        aria-label="Tout sélectionner"
                                        :checked="toutes"
                                        :indeterminate="partielle"
                                        @change="choisirTout(($event.target as HTMLInputElement).checked)"
                                    />
                                </th>
                                <th
                                    v-for="c in COLONNES"
                                    :key="c.cle"
                                    :class="{ 'loc-liste__centre': c.centre }"
                                    :aria-sort="
                                        tri.colonne === c.cle
                                            ? tri.sens === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : 'none'
                                    "
                                    tabindex="0"
                                    @click="tri = basculerTri(tri, c.cle)"
                                    @keydown.enter.prevent="tri = basculerTri(tri, c.cle)"
                                >
                                    {{ c.label
                                    }}<span
                                        class="loc-liste__fleche"
                                        :class="{ 'loc-liste__fleche--inactive': tri.colonne !== c.cle }"
                                        >{{ fleche(c.cle) }}</span
                                    >
                                </th>
                                <th class="no-sort loc-liste__centre">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="l in lignes" :id="`locRow_${l.id}`" :key="l.id">
                                <td class="loc-liste__case">
                                    <input
                                        type="checkbox"
                                        class="locCheckbox"
                                        :aria-label="`Sélectionner ${l.libelle_long}`"
                                        :checked="choisies.has(l.id)"
                                        @change="choisir(l.id, ($event.target as HTMLInputElement).checked)"
                                    />
                                </td>
                                <td v-for="c in COLONNES" :key="c.cle" :class="{ 'loc-liste__centre': c.centre }">
                                    {{ valeur(l, c.cle) }}
                                </td>
                                <td class="loc-liste__centre">
                                    <button
                                        type="button"
                                        class="loc-liste__modifier"
                                        :aria-label="`Modifier ${l.libelle_long}`"
                                        @click="loc.modifier(l)"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        type="button"
                                        class="loc-liste__supprimer"
                                        :aria-label="`Supprimer ${l.libelle_long}`"
                                        @click="supprimer([l.id])"
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped>
.loc-liste {
    background: #e8eaf6;
    border: 1px solid #9fa8da;
    border-radius: 8px;
    overflow: hidden;
}
.loc-liste__basculer,
.loc-liste__basculer:hover {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 15px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    color: #283593;
}
.loc-liste__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: -2px;
}
.loc-liste__titre {
    font-weight: bold;
    font-size: 13px;
}
.loc-liste__corps {
    padding: 0 15px 15px;
}
.loc-liste__vide {
    color: #999;
    font-size: 12px;
    font-style: italic;
}
.loc-liste__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}
.loc-liste__supprimer-selection,
.loc-liste__supprimer-tout {
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
}
.loc-liste__supprimer-selection,
.loc-liste__supprimer-selection:hover {
    background: #e53935;
}
.loc-liste__supprimer-tout,
.loc-liste__supprimer-tout:hover {
    background: #b71c1c;
}
.loc-liste__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.loc-liste__tableau thead th {
    background: #3f51b5;
    color: white;
    padding: 8px;
    text-align: left;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
}
.loc-liste__tableau thead th.loc-liste__case,
.loc-liste__tableau thead th.no-sort {
    cursor: default;
}
.loc-liste__tableau th.loc-liste__centre,
.loc-liste__tableau td.loc-liste__centre,
.loc-liste__tableau .loc-liste__case {
    text-align: center;
}
.loc-liste__tableau thead th.loc-liste__case {
    width: 30px;
}
.loc-liste__tableau input[type='checkbox'] {
    width: 14px;
    height: 14px;
    cursor: pointer;
}
.loc-liste__fleche {
    margin-left: 4px;
}
.loc-liste__fleche--inactive {
    opacity: 0.4;
}
.loc-liste__tableau tbody tr {
    border-bottom: 1px solid #e8eaf6;
}
.loc-liste__tableau tbody td {
    padding: 7px;
}
.loc-liste__modifier,
.loc-liste__supprimer {
    color: white;
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.loc-liste__modifier,
.loc-liste__modifier:hover {
    background: #1e88e5;
    margin-right: 4px;
}
.loc-liste__supprimer,
.loc-liste__supprimer:hover {
    background: #e53935;
}
</style>
