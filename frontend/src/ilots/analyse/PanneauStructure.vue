<!-- Structure du fichier : lignes × colonnes, séparateur ou largeur fixe, encodage, ligne d'intitulés (0 : aucune) ; par
     colonne : type détecté, remplissage, valeurs distinctes, plage, valeurs fréquentes, clé potentielle, nom proposé
     (rôle d'après l'intitulé ou le contenu) et renommage -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { nomSeparateur } from './lecture';
import { useAnalyseStore } from './magasin';
import { formaterDate, profilColonne, proposerRole } from './profil';

const magasin = useAnalyseStore();
const nf = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

const meta = computed(() => magasin.meta ?? { kind: 'excel' as const });

const separateur = computed(() => {
    const m = meta.value;
    if (m.kind !== 'txt') return null;
    if (m.delim) return { libelle: 'séparateur : ', valeur: nomSeparateur(m.delim), suite: '' };
    if (m.widths)
        return {
            libelle: 'colonnes à ',
            valeur: 'largeur fixe',
            suite: ` (positions ${m.widths.map(x => x + 1).join(', ')})`
        };
    return { libelle: '', valeur: 'aucun séparateur détecté', suite: ' (une colonne par ligne)' };
});

const precisionEntete = computed(() => {
    const m = meta.value;
    const ligne = m.headerRow ?? 0;
    const s = (m.skipped ?? 0) > 1 ? 's' : '';
    const detail = ligne ? (m.skipped ? ` — ${m.skipped} ligne${s} au-dessus ignorée${s}` : '') : ' — aucun intitulé';
    return `${m.headerAuto ? '(détecté automatiquement' : '(choisi'}${detail}) · 0 = aucun`;
});

interface LigneStructure {
    col: string;
    profil: ReturnType<typeof profilColonne>;
    role: ReturnType<typeof proposerRole>;
    /** Nom retenu par défaut : intitulé existant, sinon rôle proposé (rendu unique) */
    nom: string;
    remplissage: number;
    plage: string;
}

const lignes = computed<LigneStructure[]>(() => {
    const avecEntete = !!meta.value.hasHeader;
    const utilises = new Set<string>();
    return magasin.entetes.map(col => {
        const p = profilColonne(magasin.lignes, col);
        const role = proposerRole(magasin.lignes, col, p, avecEntete);
        const base = avecEntete && !/^Colonne \d+$/.test(col) ? col : role.label;
        let nom = base;
        let k = 2;
        while (utilises.has(nom)) nom = `${base} (${k++})`;
        utilises.add(nom);
        let plage = '';
        if (p.min !== undefined) plage = `min ${nf(p.min)} · max ${nf(p.max ?? 0)} · moy. ${nf(p.avg ?? 0)}`;
        else if (p.dmin) plage = `du ${formaterDate(p.dmin)} au ${formaterDate(p.dmax)}`;
        else if (p.filled) plage = `longueur ${p.minLen}${p.maxLen !== p.minLen ? `–${p.maxLen}` : ''}`;
        return {
            col,
            profil: p,
            role,
            nom,
            remplissage: p.total ? Math.round((p.filled / p.total) * 100) : 0,
            plage
        };
    });
});

/** Noms saisis (colonne → nom) ; repartent des noms proposés à chaque fichier intégré (composant recréé) */
const noms = ref<Record<string, string>>(Object.fromEntries(lignes.value.map(l => [l.col, l.nom])));

function appliquer() {
    const correspondance = new Map<string, string>();
    const utilises = new Set<string>();
    for (const { col } of lignes.value) {
        const base = (noms.value[col] ?? '').trim() || col;
        let nom = base;
        let k = 2;
        while (utilises.has(nom)) nom = `${base} (${k++})`;
        utilises.add(nom);
        correspondance.set(col, nom);
    }
    magasin.renommer(correspondance);
}

const tonRemplissage = (pct: number) => (pct === 100 ? 'plein' : pct > 50 ? 'moyen' : 'faible');
const court = (v: string) => (v.length > 24 ? `${v.slice(0, 24)}…` : v);
</script>

<template>
    <div class="ana-struct__entete">
        <span class="ana-struct__info">
            <strong>{{ nf(magasin.lignes.length) }}</strong> lignes ×
            <strong>{{ magasin.entetes.length }}</strong> colonnes<template v-if="separateur">
                — fichier texte, {{ separateur.libelle }}<strong>{{ separateur.valeur }}</strong
                >{{ separateur.suite }}</template
            ><template v-if="magasin.encodage">
                — encodage <strong>{{ magasin.encodage }}</strong></template
            >
        </span>
        <label v-if="magasin.lu" class="ana-struct__ligne-entete">
            Intitulés des colonnes en ligne n°
            <input
                type="number"
                min="0"
                max="50"
                class="ana-struct__numero"
                :value="meta.headerRow ?? 0"
                title="0 = pas d'intitulés ; les lignes au-dessus sont ignorées"
                @change="magasin.changerLigneEntete(($event.target as HTMLInputElement).value)"
            />
            <span class="ana-struct__precision">{{ precisionEntete }}</span>
        </label>
    </div>
    <div class="ana-struct__defilement">
        <table class="ana-struct__tableau">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Colonne</th>
                    <th>Mapping proposé</th>
                    <th>Type détecté</th>
                    <th>Remplissage</th>
                    <th class="ana-struct__droite">Distinctes</th>
                    <th>Plage / longueur</th>
                    <th>Valeurs les plus fréquentes</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(l, i) in lignes" :key="l.col">
                    <td class="ana-struct__rang">{{ i + 1 }}</td>
                    <td class="ana-struct__colonne">
                        {{ l.col
                        }}<span
                            v-if="l.profil.unique"
                            class="ana-struct__cle"
                            title="Toutes les valeurs sont renseignées et distinctes : clé potentielle"
                        >
                            🔑</span
                        >
                    </td>
                    <td class="ana-struct__mapping">
                        <input
                            v-model="noms[l.col]"
                            type="text"
                            class="ana-struct__nom"
                            :aria-label="`Nom de ${l.col}`"
                        />
                        <span
                            class="ana-struct__confiance"
                            :class="`ana-struct__confiance--${l.role.conf}`"
                            :title="`Rôle proposé d'après ${l.role.source}`"
                        >
                            ● {{ l.role.conf }}</span
                        >
                        <button
                            v-if="l.nom !== l.role.label && l.role.label !== l.col"
                            type="button"
                            class="ana-struct__adopter"
                            title="Adopter ce nom"
                            @click="noms[l.col] = l.role.label"
                        >
                            → {{ l.role.label }}
                        </button>
                        <div v-if="l.role.warn" class="ana-struct__alerte">⚠ {{ l.role.warn }}</div>
                    </td>
                    <td>{{ l.profil.label }}</td>
                    <td class="ana-struct__sans-retour">
                        <span class="ana-struct__jauge"
                            ><span
                                class="ana-struct__barre"
                                :class="`ana-struct__barre--${tonRemplissage(l.remplissage)}`"
                                :style="{ width: `${l.remplissage}%` }"
                            ></span
                        ></span>
                        {{ l.remplissage }}% <span class="ana-struct__vides">({{ nf(l.profil.empty) }} vides)</span>
                    </td>
                    <td class="ana-struct__droite">{{ nf(l.profil.distinct) }}</td>
                    <td>{{ l.plage }}</td>
                    <td>
                        <span v-for="[v, n] in l.profil.top" :key="v" class="ana-struct__frequente" :title="`${n} fois`"
                            >{{ court(v) }} <span class="ana-struct__nombre">×{{ nf(n) }}</span></span
                        >
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <div class="ana-struct__pied">
        <button type="button" class="ana-struct__appliquer" @click="appliquer">✔ Appliquer les noms de colonnes</button>
        <span class="ana-struct__aide"
            >Modifiez un nom ou cliquez sur « → … » pour adopter le rôle proposé. ● confiance : haute / moyenne /
            faible.</span
        >
    </div>
</template>

<style>
.ana-struct__entete {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
}
.ana-struct__info {
    font-size: 13px;
    color: #004d40;
}
.ana-struct__ligne-entete {
    margin-left: auto;
    font-size: 12px;
    color: #004d40;
    display: flex;
    align-items: center;
    gap: 6px;
}
.ana-struct__numero {
    width: 56px;
    padding: 2px 5px;
    border: 1px solid #80cbc4;
    border-radius: 4px;
    font-size: 12px;
    text-align: center;
}
.ana-struct__precision {
    color: #546e7a;
}
.ana-struct__defilement {
    overflow: auto;
    max-height: 420px;
}
.ana-struct__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    background: #f1f8f7;
}
.ana-struct__tableau thead {
    position: sticky;
    top: 0;
    background: #00897b;
    color: #fff;
}
.ana-struct__tableau th {
    padding: 5px 8px;
    text-align: left;
}
.ana-struct__tableau td {
    padding: 4px 8px;
}
.ana-struct__tableau tbody tr {
    border-top: 1px solid #b2dfdb;
}
.ana-struct__tableau .ana-struct__droite {
    text-align: right;
}
.ana-struct__rang {
    color: #607d8b;
}
.ana-struct__colonne {
    font-weight: 600;
}
.ana-struct__cle {
    color: #f9a825;
}
.ana-struct__mapping,
.ana-struct__sans-retour {
    white-space: nowrap;
}
.ana-struct__nom {
    width: 150px;
    padding: 2px 5px;
    border: 1px solid #80cbc4;
    border-radius: 4px;
    font-size: 12px;
}
.ana-struct__confiance {
    font-size: 11px;
}
.ana-struct__confiance--haute {
    color: #2e7d32;
}
.ana-struct__confiance--moyenne {
    color: #f9a825;
}
.ana-struct__confiance--faible {
    color: #e53935;
}
.ana-struct__adopter {
    border: 1px solid #80cbc4;
    background: #fff;
    color: #00695c;
    border-radius: 10px;
    font-size: 11px;
    cursor: pointer;
    padding: 0 7px;
}
.ana-struct__alerte {
    color: #e65100;
    font-size: 11px;
    white-space: normal;
}
.ana-struct__jauge {
    display: inline-block;
    width: 60px;
    height: 7px;
    background: #cfd8dc;
    border-radius: 4px;
    vertical-align: middle;
}
.ana-struct__barre {
    display: block;
    height: 100%;
    border-radius: 4px;
}
.ana-struct__barre--plein {
    background: #43a047;
}
.ana-struct__barre--moyen {
    background: #fbc02d;
}
.ana-struct__barre--faible {
    background: #e53935;
}
.ana-struct__vides {
    color: #90a4ae;
}
.ana-struct__frequente {
    background: #fff;
    border: 1px solid #b2dfdb;
    border-radius: 10px;
    padding: 0 6px;
    margin-right: 3px;
    white-space: nowrap;
}
.ana-struct__nombre {
    color: #00897b;
}
.ana-struct__pied {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.ana-struct__appliquer {
    background: #00897b;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 5px 14px;
    cursor: pointer;
    font-size: 12px;
}
.ana-struct__aide {
    font-size: 11px;
    color: #546e7a;
}
</style>
