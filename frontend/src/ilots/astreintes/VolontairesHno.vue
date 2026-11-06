<!-- Rubrique HNO : volontaires au dispositif d'astreinte (ressources actives) ; le basculement est enregistré
     aussitôt, la date d'activation par le serveur -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiAstreintesHno } from '@/api/astreintes';
import type { Ressource } from '@/api/ressources';
import AppAlert from '@/composants/AppAlert.vue';
import { ressourcesActives } from './hno';

const props = defineProps<{ ressources: Ressource[] }>();
const emit = defineEmits<{ modifie: [] }>();
const erreur = ref('');

const actives = computed(() => ressourcesActives(props.ressources));
const dateActivation = (r: Ressource) =>
    r.astreinte_date_activation ? new Date(r.astreinte_date_activation).toLocaleDateString('fr-FR') : '-';

async function basculer(r: Ressource, volontaire: boolean) {
    erreur.value = '';
    try {
        await apiAstreintesHno.volontaire(r.id, volontaire);
        emit('modifie');
    } catch {
        erreur.value = 'Erreur lors de la mise à jour';
    }
}
</script>

<template>
    <p class="volontaires__aide">
        Cochez les experts volontaires pour participer au dispositif d'astreinte. La date d'activation est enregistrée
        automatiquement.
    </p>
    <AppAlert v-if="erreur" type="error" :description="erreur" />
    <div id="volontairesListContainer">
        <p v-if="!actives.length" class="volontaires__vide">Aucune ressource active</p>
        <table v-else class="volontaires">
            <thead>
                <tr>
                    <th class="volontaires__gauche">Expert</th>
                    <th>Fonction</th>
                    <th>Taux MAD</th>
                    <th>Volontaire</th>
                    <th>Date activation</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="r in actives" :key="r.id">
                    <td class="volontaires__gauche">
                        <strong>{{ r.nom.toUpperCase() }} {{ r.prenom }}</strong>
                        <br /><small class="volontaires__trigramme">{{ r.trigramme }}</small>
                    </td>
                    <td>{{ r.fonction || '-' }}</td>
                    <td>{{ r.taux || '-' }}%</td>
                    <td>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                :checked="r.astreinte_volontaire === 1"
                                :aria-label="`Volontaire : ${r.nom.toUpperCase()} ${r.prenom}`"
                                @change="basculer(r, ($event.target as HTMLInputElement).checked)"
                            />
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td class="volontaires__date">{{ r.astreinte_volontaire === 1 ? dateActivation(r) : '-' }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.volontaires__aide {
    font-size: 13px;
    color: #666;
}
.volontaires__vide {
    color: #999;
    font-style: italic;
}
.volontaires {
    width: 100%;
    border-collapse: collapse;
}
.volontaires th {
    background-color: #4caf50;
    color: white;
    padding: 10px;
    text-align: center;
}
.volontaires td {
    padding: 10px;
    text-align: center;
}
.volontaires tbody tr {
    border-bottom: 1px solid #eee;
}
.volontaires th.volontaires__gauche,
.volontaires td.volontaires__gauche {
    text-align: left;
}
.volontaires__trigramme {
    color: #666;
}
.volontaires__date {
    font-size: 12px;
}
</style>
