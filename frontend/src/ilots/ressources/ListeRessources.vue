<!-- Liste des ressources : identité, taux ou MAD volante, SAMU, affectations principales / secondaires, dates et statut
     de la MAD, astreintes et activation (modifiables, sauf profil RH), fiche (modification ou consultation RH),
     suppression ; tri par colonne sur le texte affiché, comme l'ancien écran -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { apiRessources, type Ressource, type TypeAstreinte } from '@/api/ressources';
import AppAlert from '@/composants/AppAlert.vue';
import AppIcone from '@/composants/AppIcone.vue';
import { useConfirmation } from '@/composants/confirmation';
import { afficherSynchronisation, emettre, rendreColonnesRedimensionnables } from '@/liaison';
import { dateFr, datesMad, ordreAlphabetique, statutMad, trierParTexte } from './calculs';
import { useRessourcesStore } from './magasin';

const props = defineProps<{ rh: boolean }>();
const magasin = useRessourcesStore();
const confirmer = useConfirmation();
const erreur = ref('');

const ASTREINTES: ReadonlyArray<{ type: TypeAstreinte; champ: keyof Ressource; tip: string }> = [
    { type: 'ho', champ: 'astreinte_ho', tip: 'Astreintes HO : jours de la semaine, heures ouvrées' },
    { type: 'hno', champ: 'astreinte_volontaire', tip: 'Astreintes HNO : jours et heures non ouvrés' },
    {
        type: 'apd',
        champ: 'astreinte_apd',
        tip: "Astreintes « Accompagnement post démarrage » : jours et heures non ouvrés, dans le cadre d'un déploiement"
    }
];
const SANS_COMPTE =
    "Astreinte (HO ou HNO) sans compte utilisateur lié : cette ressource ne pourra pas se connecter pour modifier le planning HO et n'apparaîtra pas dans la liste de sélection des CRA.";

const affectation = (r: Ressource, role: 'principal' | 'secondaire') => magasin.affectations[r.id]?.[role] ?? [];
/** Badges par lignes de trois */
const parTrois = (liste: string[]) =>
    Array.from({ length: Math.ceil(liste.length / 3) }, (_, i) => liste.slice(i * 3, i * 3 + 3));
const sansCompte = (r: Ressource) => !!(r.astreinte_volontaire || r.astreinte_ho) && !r.user_id && !props.rh;

/** Texte affiché d'une colonne triable (cellule de l'ancien écran, émojis convertis en icônes) */
function texte(r: Ressource, colonne: number): string {
    const dates = datesMad(r, magasin.historiques[r.id]);
    const badges = (role: 'principal' | 'secondaire') => {
        const l = affectation(r, role);
        return l.length ? l.join(' ') : '-';
    };
    return [
        r.nom,
        r.prenom,
        r.trigramme,
        r.is_mad_volante ? 'MAD volante' : `${r.taux}%`,
        r.samu,
        badges('principal'),
        badges('secondaire'),
        r.es_rattachement || '-',
        r.fonction || '-',
        dateFr(dates.debut),
        dateFr(dates.fin),
        statutMad(r, magasin.historiques[r.id]).texte
    ][colonne]!;
}

const COLONNES_TRIABLES = [
    'Nom',
    'Prénom',
    'Trigramme',
    'Taux MAD',
    'SAMU',
    '🅿️ Affectation(s) SAMU principales',
    '🅢 Affectation(s) SAMU secondaires',
    'ES rattachement',
    'Fonction',
    'Début MAD',
    'Fin MAD',
    'Statut'
];

/** Lignes affichées : ordre alphabétique à chaque rechargement, puis ordre des tris successifs */
const lignes = ref<Ressource[]>([]);
/** Sens du dernier tri par colonne (conservé entre les rechargements, comme l'ancien écran) */
const sens: Record<number, boolean> = {};
watch(
    () => magasin.version,
    () => (lignes.value = [...magasin.ressources].sort(ordreAlphabetique)),
    { immediate: true }
);

function trier(colonne: number) {
    const croissant = !sens[colonne];
    sens[colonne] = croissant;
    lignes.value = trierParTexte(lignes.value, r => texte(r, colonne), croissant);
}

const tableau = ref<HTMLTableElement | null>(null);
let redimensionnable = false;
watch(
    () => lignes.value.length,
    async n => {
        if (!n || redimensionnable) return;
        await nextTick();
        if (tableau.value) {
            rendreColonnesRedimensionnables(tableau.value);
            redimensionnable = true;
        }
    },
    { immediate: true }
);

/** Modification enregistrée : bandeau, journal, ressources rechargées par l'ancien code puis par l'îlot */
async function modifiees(journal: boolean) {
    if (journal) {
        afficherSynchronisation();
        apiRessources.journaliser('Modification du planning').catch(() => undefined);
    }
    emettre('ressources-modifiees');
    await magasin.charger();
}

async function basculerActif(r: Ressource) {
    erreur.value = '';
    try {
        await apiRessources.basculerActif(r.id);
        await modifiees(true);
    } catch {
        /* état inchangé (ancien écran : erreur dans la console) */
        emettre('ressources-modifiees');
    }
}

async function basculerAstreinte(r: Ressource, type: TypeAstreinte, coche: boolean) {
    erreur.value = '';
    try {
        await apiRessources.astreinte(r.id, coche, type);
    } catch {
        erreur.value = 'Erreur modification accès astreinte';
    }
    await modifiees(false);
}

async function supprimer(r: Ressource) {
    if (!(await confirmer('Confirmer la suppression ?', 'Supprimer'))) return;
    erreur.value = '';
    try {
        await apiRessources.supprimer(r.id);
        await modifiees(true);
    } catch {
        erreur.value = 'Erreur lors de la suppression';
    }
}

const statuts = computed(() =>
    Object.fromEntries(magasin.ressources.map(r => [r.id, statutMad(r, magasin.historiques[r.id])]))
);
</script>

<template>
    <AppAlert v-if="erreur" type="error" :description="erreur" />
    <div class="table-container">
        <table id="resourcesTable" ref="tableau">
            <thead>
                <tr>
                    <th v-for="(c, i) in COLONNES_TRIABLES" :key="c" @click="trier(i)">{{ c }}</th>
                    <th class="no-sort" title="Astreintes HO : jours de la semaine, heures ouvrées">Astreintes HO</th>
                    <th class="no-sort" title="Astreintes HNO : jours et heures non ouvrés">Astreintes HNO</th>
                    <th
                        class="no-sort"
                        title="Astreintes d'accompagnement post démarrage : jours et heures non ouvrés, dans le cadre d'un déploiement"
                    >
                        Astreintes APD
                    </th>
                    <th class="no-sort">Actif</th>
                    <th class="no-sort liste__actions">Actions</th>
                </tr>
            </thead>
            <tbody id="resourcesList">
                <tr v-for="r in lignes" :key="r.id">
                    <td :title="sansCompte(r) ? SANS_COMPTE : undefined">
                        {{ r.nom }}<span v-if="sansCompte(r)" class="liste__sans-compte">⚠️</span>
                    </td>
                    <td>{{ r.prenom }}</td>
                    <td>{{ r.trigramme }}</td>
                    <td>
                        <span v-if="r.is_mad_volante" class="liste__volante">
                            <svg class="liste__avion" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m22 2-7 20-4-9-9-4z" />
                                <path d="M22 2 11 13" />
                            </svg>
                            MAD volante
                        </span>
                        <template v-else>{{ r.taux }}%</template>
                    </td>
                    <td>{{ r.samu }}</td>
                    <td v-for="role in ['principal', 'secondaire'] as const" :key="role">
                        <span v-if="!affectation(r, role).length" class="liste__aucun">-</span>
                        <div v-else class="liste__badges">
                            <div v-for="(groupe, i) in parTrois(affectation(r, role))" :key="i" class="liste__groupe">
                                <span v-for="s in groupe" :key="s" class="liste__badge" :class="`liste__badge--${role}`"
                                    >{{ role === 'principal' ? '🅿️' : '🅢' }} {{ s }}</span
                                >
                            </div>
                        </div>
                    </td>
                    <td>{{ r.es_rattachement || '-' }}</td>
                    <td>{{ r.fonction || '-' }}</td>
                    <td>{{ dateFr(datesMad(r, magasin.historiques[r.id]).debut) }}</td>
                    <td>{{ dateFr(datesMad(r, magasin.historiques[r.id]).fin) }}</td>
                    <td>
                        <span class="date-badge" :class="statuts[r.id]?.classe">{{ statuts[r.id]?.texte }}</span>
                    </td>
                    <td v-for="a in ASTREINTES" :key="a.type" class="liste__centre">
                        <input
                            type="checkbox"
                            :checked="!!r[a.champ]"
                            :disabled="rh"
                            class="liste__astreinte"
                            :class="{ 'liste__astreinte--lecture': rh }"
                            :title="a.tip"
                            :aria-label="a.tip"
                            @change="basculerAstreinte(r, a.type, ($event.target as HTMLInputElement).checked)"
                        />
                    </td>
                    <td v-if="!rh">
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                :checked="!!r.actif"
                                :aria-label="`Ressource ${r.nom} ${r.prenom} active`"
                                @change="basculerActif(r)"
                            /><span class="slider"></span>
                        </label>
                    </td>
                    <td v-else class="liste__centre">
                        <span class="liste__etat" :class="r.actif ? 'liste__etat--actif' : 'liste__etat--inactif'">{{
                            r.actif ? 'Actif' : 'Inactif'
                        }}</span>
                    </td>
                    <td>
                        <div class="icon-actions">
                            <button
                                v-if="rh"
                                type="button"
                                class="icon-btn liste__voir"
                                title="Voir la ressource"
                                aria-label="Voir la ressource"
                                @click="magasin.fiche = { id: r.id, consultation: true }"
                            >
                                <AppIcone name="eye" />
                            </button>
                            <template v-else>
                                <button
                                    type="button"
                                    class="icon-btn liste__modifier"
                                    title="Modifier la ressource"
                                    aria-label="Modifier la ressource"
                                    @click="magasin.fiche = { id: r.id, consultation: false }"
                                >
                                    <AppIcone name="pencil" />
                                </button>
                                <button
                                    type="button"
                                    class="icon-btn liste__supprimer"
                                    title="Supprimer la ressource"
                                    aria-label="Supprimer la ressource"
                                    @click="supprimer(r)"
                                >
                                    <AppIcone name="trash" />
                                </button>
                            </template>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.liste__actions {
    width: 84px;
    min-width: 84px;
}
.liste__sans-compte {
    color: #f9a825;
    margin-left: 6px;
    cursor: help;
}
.liste__volante {
    background: #f3e5f5;
    color: #6a1b9a;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.liste__avion {
    width: 14px;
    height: 14px;
    stroke: #7b1fa2;
    fill: #e1bee7;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -2px;
}
.liste__aucun {
    color: #bbb;
    font-size: 11px;
}
.liste__badges {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.liste__groupe {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
}
.liste__badge {
    color: white;
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 8px;
}
.liste__badge--principal {
    background: #1565c0;
}
.liste__badge--secondaire {
    background: #78909c;
}
.liste__centre {
    text-align: center;
}
.liste__astreinte {
    width: 18px;
    height: 18px;
    cursor: pointer;
}
.liste__astreinte--lecture {
    opacity: 0.5;
    cursor: not-allowed;
}
.liste__etat {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: bold;
}
.liste__etat--actif {
    background: #e8f5e9;
    color: #2e7d32;
}
.liste__etat--inactif {
    background: #ffebee;
    color: #c62828;
}
.liste__voir,
.liste__modifier {
    background-color: #f39c12;
}
.liste__supprimer {
    background-color: #d60b51;
}
</style>
