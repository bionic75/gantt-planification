<!-- Tableau des CRA signés ou archivés : tri par colonne, colonnes redimensionnables et masquables ; actions selon
     la liste (diffusion d'un CRA visé N2, statut de diffusion, visualisation, archivage, désarchivage, suppression) ;
     consultation seule pour le profil RH -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { CraListe } from '@/api/cra';
import { rendreColonnesRedimensionnables } from '@/outils/colonnes';
import { COLONNES_TABLEAU, dateCourte, statutTableau, trier } from './administration';
import { libelleMois } from './calculs';

const props = defineProps<{ id: string; lignes: CraListe[] | null; archive?: boolean; lectureSeule?: boolean }>();
const emit = defineEmits<{
    voir: [id: number];
    diffuser: [id: number];
    statut: [id: number, bouton: HTMLElement];
    archiver: [cra: CraListe];
    desarchiver: [cra: CraListe];
    supprimer: [cra: CraListe];
}>();

const tri = ref<{ colonne: number; croissant: boolean } | null>(null);
const tableau = ref<HTMLTableElement | null>(null);

// Nouvelle liste : ordre du serveur, comme l'ancien écran qui recréait le tableau
watch(
    () => props.lignes,
    async () => {
        tri.value = null;
        await nextTick();
        if (tableau.value) rendreColonnesRedimensionnables(tableau.value);
    }
);

const affichees = computed(() =>
    props.lignes && tri.value ? trier(props.lignes, tri.value.colonne, tri.value.croissant) : (props.lignes ?? [])
);

function trierPar(colonne: number) {
    tri.value = { colonne, croissant: tri.value?.colonne === colonne ? !tri.value.croissant : true };
}
</script>

<template>
    <div :id="id">
        <p v-if="!lignes" class="cra-tableau__attente">⏳ Chargement...</p>
        <p v-else-if="!lignes.length" class="cra-tableau__vide">Aucun CRA trouvé.</p>
        <table v-else ref="tableau" class="cra-tableau" :class="{ 'cra-tableau--archive': archive }">
            <thead>
                <tr>
                    <th
                        v-for="(c, i) in COLONNES_TABLEAU"
                        :key="c"
                        class="sortable"
                        :class="tri?.colonne === i ? (tri.croissant ? 'asc' : 'desc') : ''"
                        @click="trierPar(i)"
                    >
                        {{ c }}
                    </th>
                    <th class="no-sort">Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(c, i) in affichees" :key="c.id" :class="{ 'cra-tableau__impaire': i % 2 }">
                    <td>{{ c.expert_nom || '—' }}</td>
                    <td>{{ libelleMois(c.mois, c.annee) }}</td>
                    <td>
                        <span :key="c.statut">{{ statutTableau(c.statut) }}</span>
                    </td>
                    <td>{{ dateCourte(c.submitted_at) }}</td>
                    <td>
                        <template v-if="c.vise_n1_nom"
                            >{{ dateCourte(c.vise_n1_at) }}<br /><small>{{ c.vise_n1_nom }}</small></template
                        >
                        <template v-else>—</template>
                    </td>
                    <td>
                        <template v-if="c.vise_n2_nom"
                            >{{ dateCourte(c.vise_n2_at) }}<br /><small>{{ c.vise_n2_nom }}</small></template
                        >
                        <template v-else>—</template>
                    </td>
                    <td>
                        <button
                            v-if="c.statut === 'vise_n2'"
                            type="button"
                            class="cra-tableau__diffuser"
                            @click="emit('diffuser', c.id)"
                        >
                            📤 A diffuser
                        </button>
                        <template v-else>
                            {{ dateCourte(c.diffuse_at) }}<br />
                            <button
                                type="button"
                                class="cra-tableau__statut"
                                @click="emit('statut', c.id, $event.currentTarget as HTMLElement)"
                            >
                                📧 Statut
                            </button>
                        </template>
                    </td>
                    <td class="cra-tableau__lignes" title="Lignes renseignées dans le CRA (astreintes, HNO, activités)">
                        {{ c.nb_lignes || 0 }}
                    </td>
                    <td class="cra-tableau__actions">
                        <button type="button" class="cra-tableau__voir" @click="emit('voir', c.id)">Voir</button>
                        <template v-if="!lectureSeule && archive">
                            <button type="button" class="cra-tableau__desarchiver" @click="emit('desarchiver', c)">
                                ↩️ Désarchiver
                            </button>
                            <button type="button" class="cra-tableau__supprimer" @click="emit('supprimer', c)">
                                🗑️ Supprimer
                            </button>
                        </template>
                        <button
                            v-else-if="!lectureSeule"
                            type="button"
                            class="cra-tableau__archiver"
                            @click="emit('archiver', c)"
                        >
                            🗄️ Archiver
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.cra-tableau__attente,
.cra-tableau__vide {
    color: #999;
    text-align: center;
    padding: 20px;
    margin: 0;
}
.cra-tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.cra-tableau th {
    background: #6a1b9a;
    color: white;
    padding: 8px;
    text-align: left;
    user-select: none;
}
.cra-tableau th.sortable {
    cursor: pointer;
}
.cra-tableau--archive th {
    background: #546e7a;
}
.cra-tableau td {
    padding: 6px 8px;
}
.cra-tableau tbody tr {
    background: white;
    border-bottom: 1px solid #e1bee7;
}
.cra-tableau tbody tr.cra-tableau__impaire {
    background: #f9f4ff;
}
.cra-tableau--archive tbody tr {
    border-bottom-color: #cfd8dc;
}
.cra-tableau--archive tbody tr.cra-tableau__impaire {
    background: #f5f7f7;
}
.cra-tableau__lignes {
    text-align: center;
}
.cra-tableau__actions {
    white-space: nowrap;
}
.cra-tableau button,
.cra-tableau button:hover {
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    padding: 3px 8px;
}
.cra-tableau__diffuser,
.cra-tableau__diffuser:hover {
    background: #e65100;
    padding: 3px 10px;
    font-weight: bold;
}
.cra-tableau__statut,
.cra-tableau__statut:hover {
    background: #1a237e;
    margin-top: 3px;
}
.cra-tableau .cra-tableau__statut {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
}
.cra-tableau__voir,
.cra-tableau__voir:hover {
    background: #6a1b9a;
    margin-right: 4px;
    height: 26px;
    box-sizing: border-box;
}
.cra-tableau__desarchiver,
.cra-tableau__desarchiver:hover {
    background: #ff9800;
    margin-right: 4px;
}
.cra-tableau__supprimer,
.cra-tableau__supprimer:hover {
    background: #b71c1c;
}
.cra-tableau__archiver,
.cra-tableau__archiver:hover {
    background: #546e7a;
    height: 26px;
    box-sizing: border-box;
}
</style>
