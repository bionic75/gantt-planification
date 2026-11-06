<!-- Rubrique HNO : planning d'astreinte enregistré d'un mois, affiché au changement de mois (comme l'ancien écran, le
     mois courant présélectionné n'est pas chargé) -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiAstreintesHno, type CreneauPlanningHno } from '@/api/astreintes';
import type { Ressource } from '@/api/ressources';
import { creneau, moisProposes, nomExpert } from './hno';

const props = defineProps<{ ressources: Ressource[] }>();

const mois = moisProposes();
const moisChoisi = ref(mois[0]!.valeur);
const etat = ref<'invite' | 'chargement' | 'erreur'>('invite');
const erreur = ref('');
const planning = ref<CreneauPlanningHno[] | null>(null);

const nomDe = (id: number | null) => {
    const r = id === null ? undefined : props.ressources.find(x => x.id === id);
    return r ? `${nomExpert(r)} (${r.trigramme})` : null;
};

async function charger() {
    planning.value = null;
    etat.value = 'chargement';
    try {
        planning.value = await apiAstreintesHno.planning(moisChoisi.value);
    } catch (e) {
        etat.value = 'erreur';
        erreur.value = (e as Error).message;
    }
}
</script>

<template>
    <div class="actuel__choix">
        <label for="astreinteMoisAffichage" class="actuel__libelle">Mois à afficher</label>
        <select id="astreinteMoisAffichage" v-model="moisChoisi" @change="charger">
            <option v-for="m in mois" :key="m.valeur" :value="m.valeur">{{ m.libelle }}</option>
        </select>
    </div>
    <div id="astreintePlanningActuelContainer">
        <template v-if="planning">
            <p v-if="!planning.length" class="actuel__info">Aucun planning pour ce mois</p>
            <table v-else class="actuel">
                <thead>
                    <tr>
                        <th class="actuel__gauche">Date</th>
                        <th>Jour</th>
                        <th>Créneau</th>
                        <th class="actuel__gauche">Expert assigné</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in planning" :key="s.id" :class="{ 'actuel__week-end': creneau(s).weekEnd }">
                        <td class="actuel__gauche">{{ creneau(s).date }}</td>
                        <td class="actuel__jour">{{ creneau(s).jour }}</td>
                        <td>{{ creneau(s).libelle }}</td>
                        <td class="actuel__gauche">
                            <template v-if="nomDe(s.resource_id)">{{ nomDe(s.resource_id) }}</template>
                            <span v-else class="actuel__non-assigne">⚠️ Non assigné</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </template>
        <p v-else-if="etat === 'chargement'" class="actuel__info">Chargement...</p>
        <p v-else-if="etat === 'erreur'" class="actuel__erreur">Erreur: {{ erreur }}</p>
        <p v-else class="actuel__info">Sélectionnez un mois pour afficher le planning</p>
    </div>
</template>

<style scoped>
.actuel__choix {
    margin-bottom: 15px;
}
.actuel__libelle {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
}
.actuel__info {
    color: #999;
    font-style: italic;
}
.actuel__erreur {
    color: #e74c3c;
}
.actuel {
    width: 100%;
    border-collapse: collapse;
}
.actuel th {
    background-color: #9c27b0;
    color: white;
    padding: 10px;
    text-align: center;
}
.actuel td {
    padding: 10px;
    text-align: center;
}
.actuel tbody tr {
    border-bottom: 1px solid #eee;
    background-color: white;
}
.actuel tbody tr.actuel__week-end {
    background-color: #f3e5f5;
}
.actuel th.actuel__gauche,
.actuel td.actuel__gauche {
    text-align: left;
}
.actuel__jour {
    text-transform: capitalize;
}
.actuel__non-assigne {
    color: #e74c3c;
}
</style>
