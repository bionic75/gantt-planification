<!-- Particularités d'une période de MAD (variations temporaires du taux) : liste, ajout (dates bornées par la période),
     modification (non contrôlée, comme l'ancien écran), suppression -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiRessources, type Particularite, type PeriodeMad } from '@/api/ressources';
import { ErreurApi } from '@/api/client';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import { dateFr } from './calculs';
import { particulariteIncomplete } from './fiche';

const props = defineProps<{ ressource: number; periode: PeriodeMad | null }>();
const emit = defineEmits<{ fermer: [] }>();
const confirmer = useConfirmation();

const liste = ref<Particularite[]>([]);
const message = ref('');
const ajout = ref({ debut: '', fin: '', taux: '', motif: '' });
/** Particularité modifiée */
const edition = ref<{ id: number; debut: string; fin: string; taux: string; motif: string } | null>(null);
const messageEdition = ref('');

const erreurApi = (e: unknown) =>
    `Erreur: ${e instanceof ErreurApi ? (e.donnees as { error?: string } | null)?.error : (e as Error).message}`;

async function charger() {
    if (!props.periode) return;
    try {
        liste.value = await apiRessources.particularites(props.ressource, props.periode.id);
    } catch {
        /* liste inchangée (ancien écran : erreur dans la console) */
    }
}

watch(
    () => props.periode,
    p => {
        message.value = '';
        if (p) void charger();
    },
    { immediate: true }
);

async function ajouter() {
    const a = ajout.value;
    message.value = particulariteIncomplete(a.debut, a.fin, a.taux) ?? '';
    if (message.value || !props.periode) return;
    try {
        await apiRessources.ajouterParticularite(props.ressource, props.periode.id, {
            taux: parseFloat(a.taux),
            date_debut: a.debut,
            date_fin: a.fin,
            motif: a.motif || null
        });
        ajout.value = { debut: '', fin: '', taux: '', motif: '' };
        await charger();
    } catch (e) {
        message.value = erreurApi(e);
    }
}

function modifier(p: Particularite) {
    messageEdition.value = '';
    edition.value = { id: p.id, debut: p.date_debut, fin: p.date_fin, taux: String(p.taux), motif: p.motif || '' };
}

async function enregistrer() {
    const e = edition.value;
    if (!e || !props.periode) return;
    try {
        await apiRessources.modifierParticularite(props.ressource, props.periode.id, e.id, {
            taux: parseFloat(e.taux),
            date_debut: e.debut,
            date_fin: e.fin,
            motif: e.motif || null
        });
        edition.value = null;
        await charger();
    } catch (err) {
        messageEdition.value = erreurApi(err);
    }
}

async function supprimer(p: Particularite) {
    if (!(await confirmer('Confirmer la suppression de cette particularité ?', 'Supprimer'))) return;
    if (!props.periode) return;
    message.value = '';
    try {
        await apiRessources.supprimerParticularite(props.ressource, props.periode.id, p.id);
        await charger();
    } catch (e) {
        message.value = erreurApi(e);
    }
}

/** Texte saisi (v-model convertirait en nombre : un taux de 0 serait refusé) */
const texte = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
    <AppModal
        id="madParticularitesModal"
        :opened="!!periode"
        title="📅 Particularités du taux de MAD"
        class="particularites"
        @close="emit('fermer')"
    >
        <p class="particularites__aide">
            Définissez des variations temporaires du taux de MAD sur cette période (ex: réduction temporaire,
            suspension...).
        </p>
        <div id="particularitesListContainer" class="particularites__liste">
            <p v-if="!liste.length" class="particularites__vide">Aucune particularité définie pour cette période.</p>
            <table v-else class="particularites__tableau">
                <thead>
                    <tr>
                        <th>Période</th>
                        <th>Taux</th>
                        <th>Motif</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="p in liste" :key="p.id">
                        <td>{{ dateFr(p.date_debut) }} - {{ dateFr(p.date_fin) }}</td>
                        <td class="particularites__taux" :class="{ 'particularites__taux--nul': p.taux === 0 }">
                            {{ p.taux }}%
                        </td>
                        <td class="particularites__motif">{{ p.motif || '-' }}</td>
                        <td class="particularites__actions">
                            <button
                                type="button"
                                class="particularites__modifier"
                                :aria-label="`Modifier la particularité du ${dateFr(p.date_debut)}`"
                                @click="modifier(p)"
                            >
                                ✏️
                            </button>
                            <button
                                type="button"
                                class="particularites__supprimer"
                                :aria-label="`Supprimer la particularité du ${dateFr(p.date_debut)}`"
                                @click="supprimer(p)"
                            >
                                🗑️
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="particularites__ajout">
            <h5 class="particularites__ajout-titre">➕ Ajouter une particularité</h5>
            <div class="particularites__grille">
                <div>
                    <label for="particulariteDateDebut" class="particularites__libelle">Date début *</label>
                    <input
                        id="particulariteDateDebut"
                        v-model="ajout.debut"
                        type="date"
                        :min="periode?.date_debut"
                        :max="periode?.date_fin ?? undefined"
                        class="particularites__champ"
                    />
                </div>
                <div>
                    <label for="particulariteDateFin" class="particularites__libelle">Date fin *</label>
                    <input
                        id="particulariteDateFin"
                        v-model="ajout.fin"
                        type="date"
                        :min="periode?.date_debut"
                        :max="periode?.date_fin ?? undefined"
                        class="particularites__champ"
                    />
                </div>
                <div>
                    <label for="particulariteTaux" class="particularites__libelle">Taux (%) *</label>
                    <input
                        id="particulariteTaux"
                        :value="ajout.taux"
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Ex: 0, 50..."
                        class="particularites__champ"
                        @input="ajout.taux = texte($event)"
                    />
                </div>
            </div>
            <div class="particularites__motif-saisie">
                <label for="particulariteMotif" class="particularites__libelle">Motif (optionnel)</label>
                <input
                    id="particulariteMotif"
                    v-model="ajout.motif"
                    type="text"
                    placeholder="Ex: Congé maladie, Mission temporaire..."
                    class="particularites__champ"
                />
            </div>
            <button type="button" class="particularites__ajouter" @click="ajouter">Ajouter</button>
        </div>
        <p v-if="message" :key="message" role="alert" class="particularites__erreur">{{ message }}</p>
        <template #footer>
            <button type="button" class="particularites__fermer" @click="emit('fermer')">Fermer</button>
        </template>
    </AppModal>

    <AppModal
        id="editParticulariteModal"
        :opened="!!edition"
        title="Modifier la particularité"
        class="particularite"
        @close="edition = null"
    >
        <template v-if="edition">
            <div class="form-group">
                <label for="editParticulariteDateDebut">Date de début *</label>
                <input
                    id="editParticulariteDateDebut"
                    v-model="edition.debut"
                    type="date"
                    class="particularite__champ"
                />
            </div>
            <div class="form-group">
                <label for="editParticulariteDateFin">Date de fin *</label>
                <input id="editParticulariteDateFin" v-model="edition.fin" type="date" class="particularite__champ" />
            </div>
            <div class="form-group">
                <label for="editParticulariteTaux">Taux de MAD (%) *</label>
                <input
                    id="editParticulariteTaux"
                    :value="edition.taux"
                    type="number"
                    min="0"
                    max="100"
                    class="particularite__champ"
                    @input="edition.taux = texte($event)"
                />
            </div>
            <div class="form-group">
                <label for="editParticulariteMotif">Motif</label>
                <input id="editParticulariteMotif" v-model="edition.motif" type="text" class="particularite__champ" />
            </div>
            <p v-if="messageEdition" :key="messageEdition" role="alert" class="particularites__erreur">
                {{ messageEdition }}
            </p>
        </template>
        <template #footer>
            <button type="button" class="particularites__fermer" @click="edition = null">Annuler</button>
            <button type="button" @click="enregistrer">Enregistrer</button>
        </template>
    </AppModal>
</template>

<style scoped>
.particularites__aide {
    font-size: 12px;
    color: #666;
    margin-bottom: 15px;
}
.particularites__liste {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 15px;
}
.particularites__vide {
    color: #666;
    font-size: 12px;
    font-style: italic;
}
.particularites__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}
.particularites__tableau thead tr {
    background: #9c27b0;
    color: white;
}
.particularites__tableau th,
.particularites__tableau td {
    padding: 6px;
}
.particularites__tableau tbody tr {
    border-bottom: 1px solid #e0e0e0;
}
.particularites__taux {
    text-align: center;
    font-weight: bold;
    color: #ff9800;
}
.particularites__taux--nul {
    color: #e74c3c;
}
.particularites__motif {
    font-size: 10px;
    color: #666;
}
.particularites__actions {
    text-align: center;
}
.particularites__modifier,
.particularites__modifier:hover,
.particularites__supprimer,
.particularites__supprimer:hover {
    color: white;
    border: none;
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
}
.particularites__modifier,
.particularites__modifier:hover {
    background: #1e88e5;
    margin-right: 2px;
}
.particularites__supprimer,
.particularites__supprimer:hover {
    background: #e53935;
}
.particularites__ajout {
    background: #fff3e0;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 15px;
}
.particularites__ajout-titre {
    margin: 0 0 10px 0;
    color: #e65100;
}
.particularites__grille {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
}
.particularites__libelle {
    font-size: 11px;
}
.particularites__champ {
    width: 100%;
    padding: 6px;
}
.particularites__motif-saisie {
    margin-top: 10px;
}
.particularites__ajouter,
.particularites__ajouter:hover {
    margin-top: 10px;
    background: #ff9800;
    color: white;
    padding: 6px 15px;
    font-size: 12px;
}
.particularites__erreur {
    color: #e74c3c;
    font-size: 12px;
}
.particularites__fermer,
.particularites__fermer:hover {
    background-color: #95a5a6;
}
.particularite__champ {
    width: 100%;
}
</style>

<style>
/* Fenêtres téléportées hors du composant : règles non limitées, ciblées par leur classe */
.gp-modale.particularites .gp-modale__boite {
    width: min(600px, 100%);
}
.gp-modale.particularite .gp-modale__boite {
    width: min(400px, 100%);
}
</style>
