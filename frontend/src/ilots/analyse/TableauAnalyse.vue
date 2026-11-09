<!-- Résultats : nombre de lignes retenues, pagination (aller à une page, lignes par page), tableau des colonnes affichées
     (valeurs longues tronquées, texte complet en infobulle ; lignes en doublon mises en évidence) -->
<script setup lang="ts">
import { ref } from 'vue';
import { nombreFr } from './filtres';
import { TAILLES_PAGE, useAnalyseStore } from './magasin';

const magasin = useAnalyseStore();
const aller = ref('');

function allerA() {
    const n = parseInt(aller.value);
    if (!n || isNaN(n)) return;
    magasin.allerPage(n);
    aller.value = '';
}

const valeur = (v: unknown) => (v || '').toString();
const court = (v: string) => (v.length > 120 ? `${v.substring(0, 120)}…` : v);
</script>

<template>
    <div class="ana-tab">
        <div class="ana-tab__barre">
            <span id="analyseResultCount" class="ana-tab__compte"
                >{{ nombreFr(magasin.filtrees.length) }} résultat(s) sur
                {{ nombreFr(magasin.lignes.length) }} lignes</span
            >
            <span class="ana-tab__pages">
                Page <strong id="analysePage">{{ magasin.page }}</strong> /
                <strong id="analysePageTotal">{{ magasin.pages }}</strong>
                <input
                    id="analysePageJump"
                    v-model="aller"
                    type="number"
                    min="1"
                    placeholder="n°"
                    title="Aller à la page"
                    class="ana-tab__aller"
                    @keydown.enter="allerA"
                />
            </span>
            <button
                type="button"
                class="ana-tab__fleche"
                aria-label="Page précédente"
                @click="magasin.allerPage(magasin.page - 1)"
            >
                ◀
            </button>
            <button
                type="button"
                class="ana-tab__fleche"
                aria-label="Page suivante"
                @click="magasin.allerPage(magasin.page + 1)"
            >
                ▶
            </button>
            <select
                id="analysePageSizeSelect"
                class="ana-tab__taille"
                :value="String(magasin.taillePage)"
                aria-label="Lignes par page"
                @change="magasin.changerTaillePage(parseInt(($event.target as HTMLSelectElement).value))"
            >
                <option v-for="t in TAILLES_PAGE" :key="t" :value="String(t)">{{ t }} / page</option>
            </select>
        </div>
        <div class="ana-tab__defilement">
            <table id="analyseTable" class="ana-tab__tableau">
                <thead id="analyseTableHead">
                    <tr>
                        <th v-for="c in magasin.affichees" :key="c" :title="c">{{ c }}</th>
                    </tr>
                </thead>
                <tbody id="analyseTableBody">
                    <tr v-if="!magasin.lignesDeLaPage.length">
                        <td :colspan="magasin.affichees.length" class="ana-tab__aucun">Aucun résultat</td>
                    </tr>
                    <tr
                        v-for="(l, i) in magasin.lignesDeLaPage"
                        :key="i"
                        :class="
                            magasin.enDoublon(l)
                                ? 'ana-tab__doublon'
                                : i % 2 === 0
                                  ? 'ana-tab__paire'
                                  : 'ana-tab__impaire'
                        "
                        :title="magasin.enDoublon(l) ? 'Ligne en doublon' : undefined"
                    >
                        <td v-for="c in magasin.affichees" :key="c" :title="valeur(l[c])">{{ court(valeur(l[c])) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style>
.ana-tab {
    background: white;
    border-radius: 10px;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
    overflow: hidden;
}
.ana-tab__barre {
    padding: 10px 16px;
    background: #e8eaf6;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.ana-tab__compte {
    font-size: 13px;
    font-weight: bold;
    color: #1a237e;
}
.ana-tab__pages {
    font-size: 12px;
    color: #666;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
}
.ana-tab__aller {
    width: 54px;
    padding: 2px 5px;
    border: 1px solid #9fa8da;
    border-radius: 4px;
    font-size: 12px;
    text-align: center;
}
.ana-tab__fleche {
    background: #5c6bc0;
    color: white;
    border: none;
    padding: 3px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
.ana-tab__taille {
    padding: 3px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 12px;
}
.ana-tab__defilement {
    overflow-x: auto;
}
.ana-tab__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.ana-tab__tableau thead {
    background: #3f51b5;
    color: white;
    position: sticky;
    top: 0;
}
.ana-tab__tableau th {
    padding: 8px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    min-width: 80px;
    border-right: 1px solid rgba(255, 255, 255, 0.2);
}
.ana-tab__tableau td {
    padding: 6px 10px;
    border-bottom: 1px solid #f0f0f0;
    border-right: 1px solid #f0f0f0;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}
#analyseTable tr.ana-tab__paire,
#analyseTable tr.ana-tab__paire:nth-child(n) {
    background: white;
}
#analyseTable tr.ana-tab__impaire,
#analyseTable tr.ana-tab__impaire:nth-child(n) {
    background: #f8f9ff;
}
#analyseTable tr.ana-tab__doublon,
#analyseTable tr.ana-tab__doublon:nth-child(n) {
    background: #fce4ec;
}
#analyseTable tr.ana-tab__doublon td {
    border-bottom-color: #f48fb1;
}
#analyseTable tr.ana-tab__paire:hover,
#analyseTable tr.ana-tab__impaire:hover {
    background: #fffde7;
}
#analyseTable tr.ana-tab__doublon:hover {
    background: #f8bbd0;
}
.ana-tab__aucun {
    padding: 40px;
    text-align: center;
    color: #999;
    font-style: italic;
}
</style>
