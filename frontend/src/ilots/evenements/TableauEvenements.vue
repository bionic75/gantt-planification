<!-- Événements filtrés sous forme de tableau triable (à la place de l'accordéon année > mois) -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Evenement } from '@/api/evenements';
import AppIcone from '@/composants/AppIcone.vue';
import {
    aUnType,
    couleurs,
    iconeEvenement,
    libelleAffiche,
    libelleCourt,
    nomCreateur,
    nomsParticipants,
    periodeAffichee,
    trierTableau,
    type ColonneTableau,
    type Sens
} from './calculs';
import { useEvenementsStore } from './magasin';

const props = defineProps<{ evenements: Evenement[] }>();
const emit = defineEmits<{ supprimer: [evenement: Evenement] }>();
const ev = useEvenementsStore();

const colonne = ref<ColonneTableau>('debut');
const sens = ref<Sens>('desc');
const lignes = computed(() => trierTableau(props.evenements, ev.localisations, colonne.value, sens.value));

const COLONNES: Array<{ cle: ColonneTableau; titre: string }> = [
    { cle: 'type', titre: 'Événement' },
    { cle: 'libelle', titre: 'Libellé' },
    { cle: 'debut', titre: 'Dates' },
    { cle: 'jours', titre: 'Jours' },
    { cle: 'lieu', titre: 'Localisation' },
    { cle: 'participants', titre: 'Participants' },
    { cle: 'createur', titre: 'Créé par' }
];

function trier(cle: ColonneTableau) {
    if (colonne.value === cle) sens.value = sens.value === 'asc' ? 'desc' : 'asc';
    else {
        colonne.value = cle;
        sens.value = 'asc';
    }
}
const ariaTri = (cle: ColonneTableau) =>
    colonne.value !== cle ? 'none' : sens.value === 'asc' ? 'ascending' : 'descending';
const lieu = (e: Evenement) => ev.localisations.find(l => l.id === e.location_id)?.libelle_court || '—';
const secondaire = (e: Evenement) => (aUnType(e) && e.label && e.label !== libelleCourt(e) ? e.label : '');
</script>

<template>
    <div class="ev-tab">
        <table class="ev-tab__table" data-testid="evenements-tableau">
            <thead>
                <tr>
                    <th v-for="c in COLONNES" :key="c.cle" scope="col" :aria-sort="ariaTri(c.cle)">
                        <button type="button" class="ev-tab__tri" :title="`Trier par ${c.titre}`" @click="trier(c.cle)">
                            {{ c.titre }}
                            <span v-if="colonne === c.cle" aria-hidden="true">{{ sens === 'asc' ? '▲' : '▼' }}</span>
                            <span v-else class="ev-tab__tri-vide" aria-hidden="true">▲▼</span>
                        </button>
                    </th>
                    <th scope="col"><span class="ev-tab__sr">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="e in lignes" :key="e.id">
                    <td>
                        <span
                            class="ev-tab__etiquette"
                            :style="{
                                background: couleurs(e).fond,
                                color: couleurs(e).texte,
                                borderColor: couleurs(e).bordure
                            }"
                            ><AppIcone v-if="iconeEvenement(e)" :name="iconeEvenement(e)" :scale="0.8" />{{
                                libelleAffiche(e, ev.localisations)
                            }}</span
                        >
                    </td>
                    <td>{{ secondaire(e) }}</td>
                    <td class="ev-tab__nowrap">{{ periodeAffichee(e).texte }}</td>
                    <td class="ev-tab__num">{{ periodeAffichee(e).jours }}</td>
                    <td class="ev-tab__nowrap">{{ lieu(e) }}</td>
                    <td :title="nomsParticipants(e).join(', ')">
                        <template v-if="nomsParticipants(e).length"
                            >{{ nomsParticipants(e).length }} · {{ nomsParticipants(e).slice(0, 3).join(', ')
                            }}{{ nomsParticipants(e).length > 3 ? '…' : '' }}</template
                        ><template v-else>—</template>
                    </td>
                    <td>{{ nomCreateur(e) }}</td>
                    <td class="ev-tab__actions">
                        <button
                            type="button"
                            class="ev-tab__bouton ev-tab__bouton--modifier"
                            title="Modifier l'événement"
                            aria-label="Modifier l'événement"
                            @click="ev.modifier(e)"
                        >
                            <AppIcone name="pencil" />
                        </button>
                        <button
                            v-if="ev.profil === 'admin'"
                            type="button"
                            class="ev-tab__bouton ev-tab__bouton--supprimer"
                            title="Supprimer l'événement"
                            aria-label="Supprimer l'événement"
                            @click="emit('supprimer', e)"
                        >
                            <AppIcone name="trash" />
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
        <p v-if="!lignes.length" class="ev-tab__vide">Aucun événement pour ces critères.</p>
    </div>
</template>

<style scoped>
.ev-tab {
    overflow-x: auto;
}
.ev-tab__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    background: white;
}
.ev-tab__table th,
.ev-tab__table td {
    padding: 6px 10px;
    text-align: left;
    border-top: 1px solid #eee;
    vertical-align: middle;
}
.ev-tab__table thead th {
    background: #f57c00;
    color: white;
    border-top: none;
    white-space: nowrap;
}
.ev-tab__tri {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
}
.ev-tab__tri-vide {
    opacity: 0.5;
    font-size: 10px;
}
.ev-tab__etiquette {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 9px;
    border: 1px solid;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
}
.ev-tab__nowrap {
    white-space: nowrap;
}
.ev-tab__num {
    text-align: right !important;
}
.ev-tab__actions {
    white-space: nowrap;
    text-align: right !important;
}
.ev-tab__bouton {
    border: none;
    border-radius: 4px;
    padding: 4px 7px;
    color: white;
    cursor: pointer;
    margin-left: 4px;
}
.ev-tab__bouton--modifier {
    background: #ff9800;
}
.ev-tab__bouton--supprimer {
    background: #e53935;
}
.ev-tab__vide {
    color: #999;
    font-style: italic;
    text-align: center;
    padding: 12px;
}
.ev-tab__sr {
    position: absolute;
    left: -9999px;
}
</style>
