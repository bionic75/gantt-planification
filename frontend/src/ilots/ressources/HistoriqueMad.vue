<!-- Historique des taux de MAD d'une ressource (fiche) : périodes triées par date de début, ajout et modification d'une
     période, suppression (s'il en reste au moins deux), particularités. Sans historique, rien n'est créé à l'ouverture :
     l'administrateur ajoute la première période. Consultation : sans ajout ni actions. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiRessources, type PeriodeMad, type Ressource } from '@/api/ressources';
import { ErreurApi } from '@/api/client';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/evenements';
import { dateFr } from './calculs';
import FenetreParticularites from './FenetreParticularites.vue';
import { useRessourcesStore } from './magasin';
import { periodeIncomplete } from './fiche';

const props = defineProps<{ ressource: Ressource; consultation: boolean }>();
/** Historique lu (taux enregistré avec la fiche) */
const historique = defineModel<PeriodeMad[]>({ required: true });
const confirmer = useConfirmation();
const magasin = useRessourcesStore();

const etat = ref<'chargement' | 'erreur' | 'charge'>('chargement');
const message = ref('');

const erreurApi = (e: unknown) =>
    `Erreur: ${e instanceof ErreurApi ? (e.donnees as { error?: string } | null)?.error : (e as Error).message}`;

async function charger() {
    etat.value = 'chargement';
    try {
        historique.value = await apiRessources.historiqueMad(props.ressource.id);
        etat.value = 'charge';
    } catch {
        etat.value = 'erreur';
    }
}
onMounted(charger);

const triees = computed(() => [...historique.value].sort((a, b) => a.date_debut.localeCompare(b.date_debut)));

// ---------- Période ----------

/** Période saisie : identifiant (modification) ou null (ajout) */
const saisie = ref<{
    id: number | null;
    debut: string;
    fin: string;
    taux: string;
    volante: boolean;
    joursMax: string;
} | null>(null);
const messagePeriode = ref('');

function ajouter() {
    messagePeriode.value = '';
    saisie.value = { id: null, debut: '', fin: '', taux: '', volante: false, joursMax: '' };
}

function modifier(p: PeriodeMad) {
    messagePeriode.value = '';
    saisie.value = {
        id: p.id,
        debut: p.date_debut || '',
        fin: p.date_fin || '',
        taux: String(p.taux),
        volante: !!p.volante,
        joursMax: p.jours_max ? String(p.jours_max) : ''
    };
}

async function enregistrer() {
    const s = saisie.value;
    if (!s) return;
    messagePeriode.value = periodeIncomplete(s.debut, s.fin, s.taux, s.volante, s.joursMax) ?? '';
    if (messagePeriode.value) return;
    const corps = {
        taux: s.volante ? 0 : parseFloat(s.taux),
        date_debut: s.debut,
        date_fin: s.fin || null,
        volante: s.volante,
        jours_max: s.volante ? parseInt(s.joursMax) : null
    };
    try {
        if (s.id) await apiRessources.modifierPeriode(props.ressource.id, s.id, corps);
        else await apiRessources.ajouterPeriode(props.ressource.id, corps);
        saisie.value = null;
        await charger();
        // Taux et dates de la ressource : liste et planification rechargées
        emettre('ressources-modifiees');
        await magasin.charger();
    } catch (e) {
        messagePeriode.value = erreurApi(e);
    }
}

/** Suppression : historique relu, liste des ressources et planification rechargées */
async function supprimer(p: PeriodeMad) {
    if (!(await confirmer('Confirmer la suppression de cette période de MAD ?', 'Supprimer'))) return;
    message.value = '';
    try {
        await apiRessources.supprimerPeriode(props.ressource.id, p.id);
        await charger();
        emettre('ressources-modifiees');
        await magasin.charger();
    } catch (e) {
        message.value = erreurApi(e);
    }
}

/** Période dont les particularités sont affichées */
const particularites = ref<PeriodeMad | null>(null);

/** Texte saisi (v-model convertirait en nombre : un taux de 0 serait refusé) */
const texte = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
    <div class="historique">
        <h4 class="historique__titre">📊 Historique des taux de MAD</h4>
        <div id="madHistoryContainer" class="historique__liste">
            <p v-if="etat === 'chargement'" class="historique__info">Chargement...</p>
            <p v-else-if="etat === 'erreur'" class="historique__erreur">Erreur de chargement</p>
            <p v-else-if="!triees.length" class="historique__vide">Aucun historique de taux MAD</p>
            <table v-else class="historique__tableau">
                <thead>
                    <tr>
                        <th>Date début</th>
                        <th>Date fin</th>
                        <th class="historique__centre">Type</th>
                        <th class="historique__centre">Taux</th>
                        <th v-if="!consultation" class="historique__centre">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="p in triees" :key="p.id">
                        <td>{{ dateFr(p.date_debut) }}</td>
                        <td>
                            <template v-if="p.date_fin">{{ dateFr(p.date_fin) }}</template>
                            <em v-else class="historique__en-cours">En cours</em>
                        </td>
                        <td class="historique__centre">
                            <span v-if="p.volante" class="historique__type historique__type--volante"
                                >✈️ Volante · {{ p.jours_max }} j max</span
                            >
                            <span v-else class="historique__type">Classique</span>
                        </td>
                        <td class="historique__taux" :class="{ 'historique__taux--nul': p.taux === 0 }">
                            <template v-if="p.volante">–</template>
                            <template v-else>{{ p.taux }}%</template>
                        </td>
                        <td v-if="!consultation" class="historique__centre">
                            <button
                                type="button"
                                class="historique__bouton historique__bouton--particularites"
                                title="Gérer les particularités"
                                @click="particularites = p"
                            >
                                📅
                            </button>
                            <button
                                type="button"
                                class="historique__bouton historique__bouton--modifier"
                                title="Modifier"
                                @click="modifier(p)"
                            >
                                ✏️
                            </button>
                            <button
                                v-if="triees.length > 1"
                                type="button"
                                class="historique__bouton historique__bouton--supprimer"
                                title="Supprimer"
                                @click="supprimer(p)"
                            >
                                🗑️
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p v-if="message" :key="message" role="alert" class="historique__erreur">{{ message }}</p>
        <button v-if="!consultation" type="button" class="historique__ajouter" @click="ajouter">
            ➕ Ajouter une modification
        </button>
    </div>

    <AppModal
        id="madHistoryModal"
        :opened="!!saisie"
        :title="saisie?.id ? 'Modifier la période de MAD' : 'Ajouter une modification'"
        class="periode"
        @close="saisie = null"
    >
        <template v-if="saisie">
            <div class="form-group">
                <label for="madDateDebut">Date de début *</label>
                <input id="madDateDebut" v-model="saisie.debut" type="date" class="periode__champ" />
            </div>
            <div class="form-group">
                <label for="madDateFin"
                    >Date de fin <span class="periode__aide">(laisser vide si en cours)</span></label
                >
                <input id="madDateFin" v-model="saisie.fin" type="date" class="periode__champ" />
            </div>
            <div class="form-group">
                <label for="madType">Type de MAD</label>
                <select id="madType" v-model="saisie.volante" class="periode__champ">
                    <option :value="false">MAD classique (taux)</option>
                    <option :value="true">MAD volante (nombre de jours maximum)</option>
                </select>
            </div>
            <div v-if="saisie.volante" class="form-group">
                <label for="madJoursMax"
                    >Jours max sur la période *
                    <span class="periode__aide">(le quota repart à zéro à chaque période)</span></label
                >
                <input
                    id="madJoursMax"
                    :value="saisie.joursMax"
                    type="number"
                    min="1"
                    placeholder="Ex: 20"
                    class="periode__champ"
                    @input="saisie.joursMax = texte($event)"
                />
            </div>
            <div v-else class="form-group">
                <label for="madTaux">Taux de MAD (%) *</label>
                <input
                    id="madTaux"
                    :value="saisie.taux"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Ex: 50, 80, 100..."
                    class="periode__champ"
                    @input="saisie.taux = texte($event)"
                />
            </div>
            <p v-if="messagePeriode" :key="messagePeriode" role="alert" class="historique__erreur">
                {{ messagePeriode }}
            </p>
        </template>
        <template #footer>
            <button type="button" class="periode__annuler" @click="saisie = null">Annuler</button>
            <button type="button" @click="enregistrer">Enregistrer</button>
        </template>
    </AppModal>

    <FenetreParticularites :ressource="ressource.id" :periode="particularites" @fermer="particularites = null" />
</template>

<style scoped>
.historique {
    margin-top: 20px;
    padding: 15px;
    background: #e3f2fd;
    border-radius: 8px;
}
.historique__titre {
    margin: 0 0 15px 0;
    color: #1565c0;
}
.historique__liste {
    max-height: 250px;
    overflow-y: auto;
}
.historique__info {
    color: #666;
    font-size: 12px;
}
.historique__vide {
    color: #666;
    font-size: 12px;
    font-style: italic;
}
.historique__erreur {
    color: #e74c3c;
    font-size: 12px;
}
.historique__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.historique__tableau thead tr {
    background: #1565c0;
    color: white;
}
.historique__tableau th,
.historique__tableau td {
    padding: 8px;
    text-align: left;
}
.historique__tableau .historique__centre {
    text-align: center;
}
.historique__tableau tbody tr {
    border-bottom: 1px solid #e0e0e0;
}
.historique__en-cours {
    color: #999;
}
.historique__tableau .historique__taux {
    text-align: center;
    font-weight: bold;
    color: #2e7d32;
}
.historique__type {
    font-size: 0.85em;
    white-space: nowrap;
}
.historique__type--volante {
    color: #0d47a1;
    font-weight: 600;
}
.historique__tableau .historique__taux--nul {
    color: #e74c3c;
}
.historique__bouton,
.historique__bouton:hover {
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    margin-right: 3px;
}
.historique__bouton--particularites,
.historique__bouton--particularites:hover {
    background: #9c27b0;
}
.historique__bouton--modifier,
.historique__bouton--modifier:hover {
    background: #1e88e5;
}
.historique__bouton--supprimer,
.historique__bouton--supprimer:hover {
    background: #e53935;
    margin-right: 0;
}
.historique__ajouter,
.historique__ajouter:hover {
    margin-top: 10px;
    background: #4caf50;
    color: white;
    padding: 8px 15px;
    font-size: 12px;
}
.periode__aide {
    font-size: 11px;
    color: #666;
}
.periode__champ {
    width: 100%;
}
.periode__annuler,
.periode__annuler:hover {
    background-color: #95a5a6;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.periode .gp-modale__boite {
    width: min(450px, 100%);
}
</style>
