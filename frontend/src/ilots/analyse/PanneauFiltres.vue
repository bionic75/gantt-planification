<!-- Filtres par colonne : oui / non (énumération de 2 valeurs au plus), valeurs (listes, énumérations), dates (après,
     avant, entre, égal), texte libre -->
<script setup lang="ts">
import { estDate, type FiltreDate, type ModeDate } from './filtres';
import FiltreTexte from './FiltreTexte.vue';
import FiltreValeurs from './FiltreValeurs.vue';
import { useAnalyseStore } from './magasin';

const magasin = useAnalyseStore();

const MODES: [ModeDate, string][] = [
    ['after', 'Après le'],
    ['before', 'Avant le'],
    ['between', 'Entre'],
    ['exact', 'Égal']
];

const valeurChoisie = (col: string) => {
    const f = magasin.filtres[col];
    return typeof f === 'string' ? f : null;
};

/** Valeur oui / non : un second clic la retire */
function basculerValeur(col: string, v: string) {
    magasin.definirFiltre(col, valeurChoisie(col) === v ? null : v);
}

const filtreDate = (col: string): Partial<FiltreDate> => {
    const f = magasin.filtres[col];
    return estDate(f) ? f : {};
};
const modeDate = (col: string): ModeDate => filtreDate(col).mode ?? 'after';

function changerDate(col: string, champ: 'mode' | 'date' | 'from' | 'to', valeur: string | null) {
    const actuel = magasin.filtres[col];
    const base: FiltreDate = estDate(actuel) ? actuel : { mode: champ === 'mode' ? 'after' : modeDate(col) };
    magasin.definirFiltre(col, { ...base, [champ]: valeur } as FiltreDate);
}

const valeurSaisie = (e: Event) => (e.target as HTMLInputElement).value || null;
</script>

<template>
    <template v-for="col in magasin.entetes" :key="`${magasin.integrations}-${col}`">
        <!-- Oui / non -->
        <div
            v-if="magasin.colonnes[col]?.type === 'enum' && (magasin.colonnes[col]?.valeurs.length ?? 0) <= 2"
            class="ana-filtre"
        >
            <div class="ana-filtre__titre ana-filtre__titre--choix" :title="col">{{ col }}</div>
            <div class="ana-filtre__choix">
                <button
                    type="button"
                    class="ana-filtre__tous"
                    :class="{ 'ana-filtre__tous--actif': !valeurChoisie(col) }"
                    @click="magasin.definirFiltre(col, null)"
                >
                    Tous
                </button>
                <button
                    v-for="v in magasin.colonnes[col]?.valeurs"
                    :key="v"
                    type="button"
                    class="ana-filtre__option"
                    :class="{ 'ana-filtre__option--active': valeurChoisie(col) === v }"
                    @click="basculerValeur(col, v)"
                >
                    {{ v }}
                </button>
            </div>
        </div>

        <!-- Valeurs (liste, énumération) -->
        <div
            v-else-if="magasin.colonnes[col]?.type === 'list' || magasin.colonnes[col]?.type === 'enum'"
            class="ana-filtre ana-filtre--large"
        >
            <FiltreValeurs :colonne="col" :valeurs="magasin.colonnes[col]?.valeurs ?? []" />
        </div>

        <!-- Date -->
        <div v-else-if="magasin.colonnes[col]?.type === 'date'" class="ana-filtre">
            <div class="ana-filtre__titre" :title="col">{{ col }}</div>
            <div class="ana-filtre__date">
                <div class="ana-filtre__modes">
                    <button
                        v-for="[m, libelle] in MODES"
                        :key="m"
                        type="button"
                        class="ana-filtre__mode"
                        :class="{ 'ana-filtre__mode--actif': modeDate(col) === m }"
                        @click="changerDate(col, 'mode', m)"
                    >
                        {{ libelle }}
                    </button>
                </div>
                <template v-if="modeDate(col) === 'between'">
                    <input
                        type="date"
                        class="ana-filtre__jour"
                        :value="filtreDate(col).from ?? ''"
                        :aria-label="`${col} : du`"
                        @input="changerDate(col, 'from', valeurSaisie($event))"
                    />
                    <input
                        type="date"
                        class="ana-filtre__jour"
                        :value="filtreDate(col).to ?? ''"
                        :aria-label="`${col} : au`"
                        @input="changerDate(col, 'to', valeurSaisie($event))"
                    />
                </template>
                <input
                    v-else
                    type="date"
                    class="ana-filtre__jour"
                    :value="filtreDate(col).date ?? ''"
                    :aria-label="`${col} : ${MODES.find(([m]) => m === modeDate(col))?.[1]}`"
                    @input="changerDate(col, 'date', valeurSaisie($event))"
                />
            </div>
        </div>

        <!-- Texte -->
        <div v-else class="ana-filtre">
            <div class="ana-filtre__titre ana-filtre__titre--texte" :title="col">{{ col }}</div>
            <FiltreTexte :colonne="col" :valeurs="magasin.colonnes[col]?.valeurs ?? []" />
        </div>
    </template>
</template>

<style>
.ana-filtre {
    background: #f8f9ff;
    border: 1px solid #e0e4ff;
    border-radius: 8px;
    padding: 8px 10px;
}
.ana-filtre--large {
    background: #f0f2ff;
    border-color: #c5cae9;
    border-radius: 10px;
    padding: 10px 12px;
    grid-column: span 2;
}
.ana-filtre__titre {
    font-size: 10px;
    color: #5c6bc0;
    font-weight: bold;
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ana-filtre__titre--choix {
    margin-bottom: 6px;
}
.ana-filtre__choix {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}
.ana-filtre__tous,
.ana-filtre__option {
    padding: 3px 12px;
    border-radius: 12px;
    font-size: 12px;
    cursor: pointer;
}
.ana-filtre__tous {
    border: 1px solid #bbb;
    background: #eee;
    color: #666;
}
.ana-filtre__tous--actif {
    background: #5c6bc0;
    color: white;
}
.ana-filtre__option {
    border: 1px solid #9fa8da;
    background: white;
    color: #3f51b5;
}
.ana-filtre__option--active {
    background: #3f51b5;
    color: white;
}
.ana-filtre__date {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.ana-filtre__modes {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}
.ana-filtre__mode {
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid #9fa8da;
    font-size: 11px;
    cursor: pointer;
    background: white;
    color: #3f51b5;
    white-space: nowrap;
}
.ana-filtre__mode--actif {
    background: #3f51b5;
    color: white;
}
.ana-filtre__jour {
    width: 100%;
    padding: 3px 5px;
    border: 1px solid #c5cae9;
    border-radius: 4px;
    font-size: 12px;
    box-sizing: border-box;
}
</style>
