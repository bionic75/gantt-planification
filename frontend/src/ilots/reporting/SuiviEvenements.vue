<!-- Suivi des événements : recherche par période, libellé et participants (tous requis), export CSV -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiReporting, type CompteReporting, type EvenementTrouve } from '@/api/reporting';
import AppButton from '@/composants/AppButton.vue';
import { couleursEvenement, dateFr, libellePeriode, nomAffiche } from './calculs';
import { csvDuTableau, nomFichierDuJour, telechargerCsv } from './export';
import { useReportingStore } from './magasin';
import SaisieParticipants from './SaisieParticipants.vue';

const reporting = useReportingStore();
const debut = ref('');
const fin = ref('');
const libelle = ref('');
const participants = ref<CompteReporting[]>([]);
const etat = ref<'attente' | 'chargement' | 'erreur' | 'vide' | 'resultat'>('attente');
const erreur = ref('');
const evenements = ref<EvenementTrouve[]>([]);
const resultats = ref<HTMLElement | null>(null);

async function generer() {
    etat.value = 'chargement';
    try {
        const { events } = await apiReporting.evenements({
            startDate: debut.value,
            endDate: fin.value,
            label: libelle.value,
            participantIds: participants.value.map(p => p.id)
        });
        evenements.value = events ?? [];
        etat.value = evenements.value.length ? 'resultat' : 'vide';
    } catch (e) {
        erreur.value = (e as Error).message;
        etat.value = 'erreur';
    }
}

function reinitialiser() {
    debut.value = '';
    fin.value = '';
    libelle.value = '';
    participants.value = [];
    etat.value = 'attente';
}

function exporter() {
    const t = resultats.value?.querySelector('table');
    if (t) telechargerCsv(nomFichierDuJour('suivi_evenements'), csvDuTableau(t, true));
}

const createur = (e: EvenementTrouve) => nomAffiche(e.creator_prenom, e.creator_nom) || '—';
const listeParticipants = (e: EvenementTrouve) =>
    (e.participants || []).map(p => nomAffiche(p.prenom, p.nom)).join(', ') || '—';
const styleEtiquette = (e: EvenementTrouve) => {
    const c = couleursEvenement(e);
    return { background: c.fond, color: c.texte, borderColor: c.bordure };
};
</script>

<template>
    <div class="rp-filtres">
        <div>
            <label class="rp-champ__libelle" for="eventsReportingStart">Date de début</label>
            <input id="eventsReportingStart" v-model="debut" type="date" class="rp-date" />
        </div>
        <div>
            <label class="rp-champ__libelle" for="eventsReportingEnd">Date de fin</label>
            <input id="eventsReportingEnd" v-model="fin" type="date" class="rp-date" />
        </div>
        <div>
            <label class="rp-champ__libelle" for="eventsReportingLabel">Libellé</label>
            <input
                id="eventsReportingLabel"
                v-model="libelle"
                type="text"
                class="rp-libelle"
                placeholder="ex: FORMATION..."
            />
        </div>
        <SaisieParticipants v-model="participants" :comptes="reporting.participants" />
        <AppButton size="lg" couleur="#1976d2" label="📊 Générer" @click="generer" />
        <AppButton size="lg" couleur="#78909c" label="🔄 Réinitialiser" @click="reinitialiser" />
    </div>

    <div v-if="etat === 'resultat'" id="eventsReportingExportButtons" class="rp-exports">
        <AppButton couleur="#4caf50" label="📥 Exporter CSV" @click="exporter" />
    </div>

    <div id="eventsReportingResults" ref="resultats" class="rp-resultats">
        <p v-if="etat === 'attente'" class="rp-attente">Définissez vos critères et cliquez sur "Générer"</p>
        <p v-else-if="etat === 'chargement'" class="rp-attente rp-attente--evts">⏳ Chargement...</p>
        <p v-else-if="etat === 'erreur'" class="rp-erreur rp-erreur--evts">Erreur : {{ erreur }}</p>
        <p v-else-if="etat === 'vide'" class="rp-attente">Aucun événement trouvé pour ces critères.</p>
        <template v-else>
            <p class="rp-compte">
                <strong>{{ evenements.length }}</strong> événement(s) trouvé(s)
            </p>
            <table class="rp-tableau rp-evts">
                <thead>
                    <tr>
                        <th class="rp-evts__gauche">Libellé</th>
                        <th>Date début</th>
                        <th>Date fin</th>
                        <th>Période</th>
                        <th class="rp-evts__gauche">Créateur</th>
                        <th class="rp-evts__gauche">Participant(s)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="e in evenements" :key="e.id">
                        <td class="rp-evts__gauche">
                            <span class="rp-evts__etiquette" :style="styleEtiquette(e)">{{ e.label }}</span>
                        </td>
                        <td>{{ dateFr(e.start_date) }}</td>
                        <td>{{ dateFr(e.end_date) }}</td>
                        <td class="rp-evts__periode">
                            {{ e.start_date === e.end_date ? libellePeriode(e.period) : '—' }}
                        </td>
                        <td class="rp-evts__gauche">{{ createur(e) }}</td>
                        <td class="rp-evts__gauche">{{ listeParticipants(e) }}</td>
                    </tr>
                </tbody>
            </table>
        </template>
    </div>
</template>

<style scoped>
.rp-filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-end;
    margin-bottom: 20px;
}
.rp-date,
.rp-libelle {
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    width: auto;
}
.rp-libelle {
    width: 180px;
}
.rp-attente--evts {
    padding: 30px;
}
.rp-erreur--evts {
    padding: 30px;
}
.rp-compte {
    font-size: 12px;
    color: #555;
    margin-bottom: 10px;
}
</style>
