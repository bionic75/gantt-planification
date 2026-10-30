<!-- Nouvelle localisation, créée depuis le formulaire d'un événement -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiEvenements } from '@/api/evenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppChampsLocalisation, { type ChampsLocalisation } from '@/composants/AppChampsLocalisation.vue';
import AppModal from '@/composants/AppModal.vue';

const emit = defineEmits<{ close: []; created: [id: number] }>();

const champs = ref<ChampsLocalisation>({ long: '', court: '', adresse: '', latitude: '', longitude: '' });
const erreur = ref('');
const IDS = {
    long: 'evLocLong',
    court: 'evLocCourt',
    adresse: 'evLocAdresse',
    latitude: 'evLocLat',
    longitude: 'evLocLng'
};

async function creer() {
    erreur.value = '';
    const c = champs.value;
    const libelleLong = c.long.trim().toUpperCase();
    const libelleCourt = c.court.trim().toUpperCase();
    if (!libelleLong || !libelleCourt) {
        erreur.value = 'Le libellé long et le libellé court sont obligatoires.';
        return;
    }
    try {
        const { id } = await apiEvenements.creerLocalisation({
            libelle_long: libelleLong,
            libelle_court: libelleCourt,
            adresse: c.adresse.trim().toUpperCase() || null,
            latitude: c.latitude || null,
            longitude: c.longitude || null
        });
        emit('created', id);
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    }
}
</script>

<template>
    <AppModal opened title="📍 Nouvelle localisation" class="ev-loc" @close="emit('close')">
        <div class="ev-loc__champs">
            <AppChampsLocalisation v-model="champs" :ids="IDS" />
        </div>
        <AppAlert v-if="erreur" type="error" small :description="erreur" />
        <template #footer>
            <button type="button" class="ev-loc__annuler" @click="emit('close')">Annuler</button>
            <button type="button" class="ev-loc__creer" @click="creer">💾 Créer</button>
        </template>
    </AppModal>
</template>

<style scoped>
.ev-loc__champs {
    margin-top: 12px;
}
.ev-loc__annuler,
.ev-loc__creer {
    color: white;
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.ev-loc__annuler {
    background: #95a5a6;
}
.ev-loc__creer {
    background: #3f51b5;
    font-weight: bold;
}
</style>
