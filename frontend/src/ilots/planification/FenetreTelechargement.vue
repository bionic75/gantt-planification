<!-- Téléchargement du planning d'un mois au format CSV (douze mois passés, mois courant, trois mois à venir) -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiExports } from '@/api/planification';
import AppModal from '@/composants/AppModal.vue';
import { moisTelechargeables, nomFichierPlanning, telechargerFichier, type MoisTelechargeable } from './exports';

const props = defineProps<{ opened: boolean }>();
const emit = defineEmits<{ fermer: []; message: [texte: string] }>();

const options = ref<MoisTelechargeable[]>([]);
const choix = ref('');

// Liste recalculée à chaque ouverture, mois courant présélectionné
watch(
    () => props.opened,
    ouverte => {
        if (!ouverte) return;
        options.value = moisTelechargeables(new Date());
        choix.value = options.value.find(o => o.courant)?.valeur ?? '';
    },
    { immediate: true }
);

async function telecharger() {
    const [annee, mois] = choix.value.split('-').map(Number) as [number, number];
    const nom = nomFichierPlanning(choix.value, new Date());
    try {
        telechargerFichier(nom, await apiExports.planningCsv(annee, mois - 1, nom));
    } catch (e) {
        console.error('Erreur téléchargement:', e);
        emit('message', 'Erreur lors du téléchargement du fichier');
        return;
    }
    emit('fermer');
}
</script>

<template>
    <AppModal
        id="downloadPlanningModal"
        :opened="opened"
        title="📥 Télécharger le planning"
        class="gp-telechargement"
        @close="emit('fermer')"
    >
        <div class="form-group">
            <label for="downloadMonthSelect">Sélectionner le mois à exporter</label>
            <select id="downloadMonthSelect" v-model="choix" class="gp-telechargement__liste">
                <option v-for="o in options" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
            </select>
        </div>
        <template #footer>
            <button type="button" class="gp-telechargement__annuler" @click="emit('fermer')">Annuler</button>
            <button type="button" class="gp-telechargement__valider" @click="telecharger">
                📥 Télécharger au format CSV
            </button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.gp-telechargement .gp-modale__boite {
    width: min(450px, 100%);
}
.gp-modale.gp-telechargement .gp-modale__titre {
    color: #2c3e50;
}
.gp-telechargement__liste {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}
.gp-telechargement__annuler,
.gp-telechargement__valider {
    padding: 10px 20px;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.gp-telechargement__annuler {
    background-color: #95a5a6;
}
.gp-telechargement__valider {
    background-color: #27ae60;
}
</style>
