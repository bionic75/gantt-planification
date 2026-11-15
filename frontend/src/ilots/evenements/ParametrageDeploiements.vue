<!-- Rubrique « Paramétrage des déploiements » (administrateur) : statuts colorés et statut de chaque déploiement -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import { useConfirmation } from '@/composants/confirmation';
import type { StatutDeploiement } from '@/api/deploiements';
import { dateFr } from './calculs';
import { useEvenementsStore } from './magasin';
import { useDeploiementsStore } from './magasin-deploiements';
import SelecteurCouleur from './SelecteurCouleur.vue';

const dep = useDeploiementsStore();
const ev = useEvenementsStore();
const confirmer = useConfirmation();
const ouvert = ref(false);
const libelle = ref('');
const couleur = ref('');
const samuAAjouter = ref('');

/** Couleur proposée au départ : la première de la palette */
const couleurNouveau = computed(() => couleur.value || dep.palette[0] || '#9e9e9e');

/** Localisations pas encore dans la liste */
const localisationsLibres = computed(() => {
    const presentes = new Set(dep.deploiements.map(d => d.location_id));
    return [...ev.localisations]
        .filter(l => !presentes.has(l.id))
        .sort((a, b) => a.libelle_court.localeCompare(b.libelle_court, 'fr', { numeric: true }));
});

// Les localisations sont chargées avec l'onglet (magasin des événements)
onMounted(() => void dep.charger());

function basculer() {
    ouvert.value = !ouvert.value;
    if (ouvert.value) void dep.charger();
}

async function ajouter() {
    if (await dep.ajouterStatut(libelle.value, couleurNouveau.value)) libelle.value = '';
}

async function ajouterSamu() {
    if (samuAAjouter.value && (await dep.ajouterSamu(Number(samuAAjouter.value)))) samuAAjouter.value = '';
}

const valeur = (e: Event) => (e.target as HTMLInputElement).value;

function renommer(s: StatutDeploiement, e: Event) {
    const label = valeur(e).trim();
    if (label !== s.label) void dep.modifierStatut(s.id, { label, color: s.color });
}

async function supprimer(s: StatutDeploiement) {
    if (await confirmer(`Supprimer le statut « ${s.label} » ?`, 'Supprimer')) await dep.supprimerStatut(s.id);
}

const estService = (statusId: number | null) => !!dep.statuts.find(s => s.id === statusId)?.is_service;

function changerStatut(projectId: number, e: Event) {
    const v = valeur(e);
    void dep.affecter(projectId, v ? Number(v) : null);
}

function changerDate(projectId: number, statusId: number | null, e: Event) {
    void dep.affecter(projectId, statusId, valeur(e) || null);
}
</script>

<template>
    <div class="pd" data-testid="parametrage-deploiements">
        <h3 class="pd__titre">
            <button
                type="button"
                class="pd__basculer"
                :aria-expanded="ouvert ? 'true' : 'false'"
                aria-controls="parametrageDeploiementsCorps"
                @click="basculer"
            >
                <span class="pd__fleche" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span>
                Paramétrage des déploiements
            </button>
        </h3>
        <div v-show="ouvert" id="parametrageDeploiementsCorps" class="pd__corps">
            <AppAlert v-if="dep.erreur" type="error" :description="dep.erreur" />

            <h4 class="pd__sous-titre">Statuts</h4>
            <ul class="pd__statuts" data-testid="deploiements-statuts">
                <li v-for="(s, i) in dep.statuts" :key="s.id" class="pd__statut">
                    <SelecteurCouleur
                        :model-value="s.color"
                        :palette="dep.palette"
                        :libelle="`Couleur du statut ${s.label}`"
                        @update:model-value="dep.modifierStatut(s.id, { label: s.label, color: $event })"
                    />
                    <span v-if="s.is_service" class="pd__nom">{{ s.label }}</span>
                    <input
                        v-else
                        type="text"
                        class="pd__champ"
                        :value="s.label"
                        :aria-label="`Libellé du statut ${s.label}`"
                        @change="renommer(s, $event)"
                    />
                    <button
                        type="button"
                        class="pd__mini"
                        :disabled="i === 0"
                        aria-label="Monter"
                        @click="dep.deplacerStatut(s.id, -1)"
                    >
                        ▲
                    </button>
                    <button
                        type="button"
                        class="pd__mini"
                        :disabled="i === dep.statuts.length - 1"
                        aria-label="Descendre"
                        @click="dep.deplacerStatut(s.id, 1)"
                    >
                        ▼
                    </button>
                    <button
                        v-if="!s.is_service"
                        type="button"
                        class="pd__mini pd__mini--danger"
                        :aria-label="`Supprimer le statut ${s.label}`"
                        @click="supprimer(s)"
                    >
                        ✕
                    </button>
                </li>
            </ul>
            <form class="pd__ajout" @submit.prevent="ajouter">
                <SelecteurCouleur
                    :model-value="couleurNouveau"
                    :palette="dep.palette"
                    libelle="Couleur du nouveau statut"
                    @update:model-value="couleur = $event"
                />
                <input
                    v-model="libelle"
                    type="text"
                    class="pd__champ"
                    placeholder="Nouveau statut"
                    aria-label="Libellé du nouveau statut"
                />
                <button type="submit" class="pd__bouton" :disabled="!libelle.trim()">Ajouter</button>
            </form>

            <h4 class="pd__sous-titre">SAMU suivis</h4>
            <AppAlert v-if="dep.information" type="success" :description="dep.information" />
            <div class="pd__ajout">
                <select v-model="samuAAjouter" class="pd__champ" aria-label="SAMU à ajouter">
                    <option value="">— Ajouter un SAMU —</option>
                    <option v-for="l in localisationsLibres" :key="l.id" :value="l.id">{{ l.libelle_court }}</option>
                </select>
                <button type="button" class="pd__bouton" :disabled="!samuAAjouter" @click="ajouterSamu">
                    Ajouter à la liste
                </button>
                <button
                    type="button"
                    class="pd__bouton pd__bouton--secondaire"
                    title="Passe « En service » les SAMU sans statut dont la mise en service (événement) est passée"
                    @click="dep.reprendreMisesEnService()"
                >
                    Reprendre les mises en service des événements
                </button>
            </div>
            <p v-if="!dep.deploiements.length" class="pd__vide">Aucun SAMU suivi pour l'instant.</p>
            <table v-else class="pd__table" data-testid="deploiements-tableau">
                <thead>
                    <tr>
                        <th>SAMU</th>
                        <th>Statut</th>
                        <th>Date de mise en service</th>
                        <th><span class="pd__sr">Retirer</span></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="d in dep.deploiements" :key="d.id">
                        <td>{{ d.samu_name }}</td>
                        <td>
                            <select
                                class="pd__champ"
                                :value="d.status_id ?? ''"
                                :aria-label="`Statut de ${d.samu_name}`"
                                @change="changerStatut(d.id, $event)"
                            >
                                <option value="">— Aucun —</option>
                                <option v-for="s in dep.statuts" :key="s.id" :value="s.id">{{ s.label }}</option>
                            </select>
                        </td>
                        <td>
                            <template v-if="estService(d.status_id)">
                                <input
                                    type="date"
                                    class="pd__champ"
                                    :value="d.date_mise_en_service ?? ''"
                                    :aria-label="`Date de mise en service de ${d.samu_name}`"
                                    @change="changerDate(d.id, d.status_id, $event)"
                                />
                                <span
                                    v-if="d.date_suggeree && d.date_suggeree !== d.date_mise_en_service"
                                    class="pd__suggestion"
                                >
                                    Événements : {{ dateFr(d.date_suggeree) }}
                                </span>
                            </template>
                        </td>
                        <td>
                            <button
                                v-if="!d.derive"
                                type="button"
                                class="pd__mini pd__mini--danger"
                                :aria-label="`Retirer ${d.samu_name} de la liste`"
                                @click="dep.retirerSamu(d.id)"
                            >
                                ✕
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
.pd {
    background: #e8eaf6;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
}
.pd__titre {
    margin: 0;
    padding: 0;
    border: none;
    font-size: 14px;
}
.pd__basculer {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: #3f51b5;
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
}
.pd__basculer:hover {
    background: none;
}
.pd__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.pd__fleche {
    font-size: 13px;
}
.pd__corps {
    margin-top: 15px;
}
.pd__sous-titre {
    margin: 15px 0 8px;
    font-size: 13px;
}
.pd__statuts {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.pd__statut,
.pd__ajout {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.pd__nom {
    font-weight: 700;
    min-width: 180px;
}
.pd__champ {
    min-width: 180px;
    padding: 5px 8px;
    border: 1px solid #c5cae9;
    border-radius: 4px;
    font: inherit;
}
.pd__mini {
    padding: 3px 8px;
    border: 1px solid #c5cae9;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
}
.pd__mini:disabled {
    opacity: 0.4;
    cursor: default;
}
.pd__mini--danger {
    color: #c62828;
}
.pd__bouton {
    background: #3f51b5;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-weight: 700;
    cursor: pointer;
}
.pd__bouton:disabled {
    opacity: 0.5;
    cursor: default;
}
.pd__bouton--secondaire {
    background: #fff;
    color: #3f51b5;
    border: 1px solid #3f51b5;
}
.pd__suggestion {
    margin-left: 8px;
    font-size: 12px;
    color: #7f8c8d;
}
.pd__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}
.pd__vide {
    color: #7f8c8d;
    font-size: 12px;
}
.pd__table {
    width: 100%;
    border-collapse: collapse;
}
.pd__table th,
.pd__table td {
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1px solid #c5cae9;
}
</style>
