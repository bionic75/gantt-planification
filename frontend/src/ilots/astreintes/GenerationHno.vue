<!-- Rubrique HNO : génération du planning d'astreinte d'un mois (enregistré aussitôt par le serveur, en remplaçant le
     planning existant), avertissements, répartition, changement d'expert d'un créneau (enregistré aussitôt, règles
     FPH contrôlées), export CSV -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiAstreintesHno, type CreneauPlanningHno, type DisponibiliteHno } from '@/api/astreintes';
import type { Ressource } from '@/api/ressources';
import AppAlert from '@/composants/AppAlert.vue';
import { creneau, csvPlanning, expertsDisponibles, moisProposes, nomExpert, refusAttribution } from './hno';

const props = defineProps<{ ressources: Ressource[] }>();

const mois = moisProposes();
/** Mois suivant proposé par défaut */
const moisChoisi = ref(mois[1]!.valeur);
const planning = ref<CreneauPlanningHno[] | null>(null);
const avertissements = ref<string[]>([]);
const repartition = ref<Array<[string, number]>>([]);
const disponibilites = ref<DisponibiliteHno[]>([]);
const message = ref<{ type: 'error' | 'success'; texte: string } | null>(null);

const nomDe = (id: number | null) => {
    const r = id === null ? undefined : props.ressources.find(x => x.id === id);
    return r ? `${nomExpert(r)} (${r.trigramme})` : null;
};

const lignes = computed(() =>
    (planning.value ?? []).map(s => ({
        creneau: s,
        ...creneau(s),
        expert: nomDe(s.resource_id),
        choix: expertsDisponibles(props.ressources, disponibilites.value, s.date, s.resource_id)
    }))
);

async function generer() {
    message.value = null;
    if (!moisChoisi.value) {
        message.value = { type: 'error', texte: 'Veuillez sélectionner un mois' };
        return;
    }
    if (!props.ressources.some(r => r.actif && r.astreinte_volontaire === 1)) {
        message.value = { type: 'error', texte: "Aucun volontaire inscrit au dispositif d'astreinte" };
        return;
    }
    const [annee, numero] = moisChoisi.value.split('-').map(Number);
    try {
        const r = await apiAstreintesHno.generer(annee!, numero!);
        planning.value = r.planning;
        avertissements.value = r.warnings ?? [];
        repartition.value = Object.entries(r.stats ?? {});
        disponibilites.value = r.disponibilites ?? [];
    } catch (e) {
        message.value = { type: 'error', texte: `Erreur: ${(e as Error).message}` };
    }
}

/** Changement d'expert d'un créneau ; la liste revient sur « -- Modifier -- » */
async function attribuer(s: CreneauPlanningHno, liste: HTMLSelectElement) {
    const id = Number(liste.value);
    liste.value = '';
    if (!id) return;
    message.value = null;
    const refus = refusAttribution(planning.value ?? [], id, s.date);
    if (refus.length) {
        message.value = { type: 'error', texte: `⚠️ Impossible d'assigner cet expert :\n\n${refus.join('\n')}` };
        return;
    }
    try {
        await apiAstreintesHno.attribuer(s.id, id);
        s.resource_id = id;
    } catch (e) {
        message.value = {
            type: 'error',
            texte: e instanceof ErreurApi ? `Erreur: ${e.message}` : `Erreur réseau: ${(e as Error).message}`
        };
    }
}

/** Le planning est enregistré à la génération et à chaque changement : simple confirmation (ancien écran) */
function sauvegarder() {
    message.value = { type: 'success', texte: 'Planning sauvegardé avec succès !' };
}

function exporter() {
    message.value = null;
    if (!planning.value || !planning.value.length) {
        message.value = { type: 'error', texte: "Aucun planning à exporter. Veuillez d'abord générer un planning." };
        return;
    }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(
        new Blob([csvPlanning(planning.value, props.ressources)], { type: 'text/csv;charset=utf-8;' })
    );
    lien.download = `planning_astreinte_${moisChoisi.value}.csv`;
    lien.click();
}
</script>

<template>
    <div class="generation__choix">
        <div>
            <label for="astreinteMoisGeneration" class="generation__libelle">Mois à planifier</label>
            <select id="astreinteMoisGeneration" v-model="moisChoisi">
                <option v-for="m in mois" :key="m.valeur" :value="m.valeur">{{ m.libelle }}</option>
            </select>
        </div>
        <button type="button" class="generation__generer" @click="generer">🔄 Générer le planning</button>
        <button type="button" class="generation__exporter" @click="exporter">📥 Exporter CSV</button>
    </div>
    <div class="generation__regles">
        <strong>📋 Règles FPH appliquées (Décret n°2002-9 du 4 janvier 2002) :</strong>
        <ul>
            <li>Maximum 72h d'astreinte par période de 15 jours</li>
            <li>Maximum 1 samedi, 1 dimanche et 1 jour férié par mois</li>
            <li>Repos de 12h consécutives minimum entre deux périodes de travail</li>
            <li>Pas d'astreinte si déplacement/bascule le lendemain</li>
        </ul>
    </div>
    <AppAlert v-if="message" :type="message.type" class="generation__message" :description="message.texte" />

    <div v-if="planning" id="astreintePlanningResult">
        <h4 class="generation__titre">📅 Planning généré</h4>
        <div id="astreintePlanningTable">
            <div v-if="avertissements.length" class="generation__avertissements">
                <strong>⚠️ Avertissements :</strong>
                <ul>
                    <li v-for="(a, i) in avertissements" :key="i">{{ a }}</li>
                </ul>
            </div>
            <div v-if="repartition.length" class="generation__repartition">
                <strong>📊 Répartition :</strong>
                <div class="generation__experts">
                    <span v-for="[nom, n] in repartition" :key="nom" class="generation__expert"
                        >{{ nom }}: <strong>{{ n }}</strong> astreinte(s)</span
                    >
                </div>
            </div>
            <table class="planning-hno">
                <thead>
                    <tr>
                        <th class="planning-hno__gauche">Date</th>
                        <th>Jour</th>
                        <th>Créneau</th>
                        <th class="planning-hno__gauche">Expert assigné</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="l in lignes" :key="l.creneau.id" :class="{ 'planning-hno__week-end': l.weekEnd }">
                        <td class="planning-hno__gauche">{{ l.date }}</td>
                        <td class="planning-hno__jour">{{ l.jour }}</td>
                        <td>{{ l.libelle }}</td>
                        <td class="planning-hno__gauche">
                            <span v-if="l.expert" :key="l.expert">{{ l.expert }}</span>
                            <span v-else class="planning-hno__non-assigne">⚠️ Non assigné</span>
                        </td>
                        <td>
                            <select
                                :aria-label="`Modifier l'expert du ${l.date}`"
                                @change="attribuer(l.creneau, $event.target as HTMLSelectElement)"
                            >
                                <option value="">-- Modifier --</option>
                                <option v-for="r in l.choix" :key="r.id" :value="String(r.id)">
                                    {{ r.nom.toUpperCase() }} {{ r.prenom }}
                                </option>
                            </select>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div class="generation__sauvegarde">
                <button type="button" class="generation__sauvegarder" @click="sauvegarder">
                    💾 Sauvegarder le planning
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.generation__choix {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-bottom: 15px;
}
.generation__libelle {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
}
.generation__generer,
.generation__generer:hover {
    background-color: #1565c0;
    color: white;
}
.generation__exporter,
.generation__exporter:hover {
    background-color: #27ae60;
    color: white;
}
.generation__regles {
    background: #e3f2fd;
    padding: 10px 15px;
    border-radius: 5px;
    font-size: 12px;
    margin-bottom: 15px;
}
.generation__regles ul {
    margin: 5px 0 0 20px;
}
.generation__message {
    white-space: pre-line;
}
.generation__titre {
    color: #1565c0;
}
.generation__avertissements {
    background: #ffebee;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    color: #c62828;
}
.generation__avertissements ul {
    margin: 5px 0 0 20px;
    font-size: 12px;
}
.generation__repartition {
    background: #e8f5e9;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    color: #2e7d32;
}
.generation__experts {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    margin-top: 10px;
}
.generation__expert {
    background: white;
    padding: 5px 10px;
    border-radius: 15px;
    font-size: 12px;
    color: #333;
}
.planning-hno {
    width: 100%;
    border-collapse: collapse;
}
.planning-hno th {
    background-color: #1565c0;
    color: white;
    padding: 10px;
    text-align: center;
}
.planning-hno td {
    padding: 10px;
    text-align: center;
}
.planning-hno tbody tr {
    border-bottom: 1px solid #eee;
    background-color: white;
}
.planning-hno tbody tr.planning-hno__week-end {
    background-color: #fff3e0;
}
.planning-hno th.planning-hno__gauche,
.planning-hno td.planning-hno__gauche {
    text-align: left;
}
.planning-hno__jour {
    text-transform: capitalize;
}
.planning-hno__non-assigne {
    color: #e74c3c;
}
.planning-hno select {
    padding: 4px;
    width: auto;
}
.generation__sauvegarde {
    margin-top: 15px;
    text-align: center;
}
.generation__sauvegarder,
.generation__sauvegarder:hover {
    background-color: #27ae60;
    color: white;
    padding: 10px 30px;
    font-size: 14px;
}
</style>
