<!-- Formulaire repliable d'ajout ou de modification d'une localisation -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppChampsLocalisation, { type ChampsLocalisation } from '@/composants/AppChampsLocalisation.vue';
import { useLocalisationsStore } from './magasin';

const loc = useLocalisationsStore();

const VIDE: ChampsLocalisation = { long: '', court: '', adresse: '', latitude: '', longitude: '' };
const IDS = { long: 'locLong', court: 'locCourt', adresse: 'locAdresse', latitude: 'locLat', longitude: 'locLng' };
const ouvert = ref(false);
const champs = ref<ChampsLocalisation>({ ...VIDE });
const erreur = ref('');
const zone = ref<HTMLElement | null>(null);
const titre = computed(() => (loc.edition ? 'Modifier la localisation' : 'Ajouter une localisation'));

/** Formulaire vidé et replié, retour au mode ajout */
function reinitialiser() {
    champs.value = { ...VIDE };
    erreur.value = '';
    loc.edition = null;
    ouvert.value = false;
}

// Modification demandée depuis la liste : formulaire rempli, déplié et affiché
watch(
    () => loc.ouvertureFormulaire,
    () => {
        const l = loc.edition;
        if (!l) return;
        champs.value = {
            long: l.libelle_long,
            court: l.libelle_court,
            adresse: l.adresse || '',
            latitude: l.latitude != null ? String(l.latitude) : '',
            longitude: l.longitude != null ? String(l.longitude) : ''
        };
        erreur.value = '';
        ouvert.value = true;
        void nextTick(() => zone.value?.scrollIntoView({ behavior: 'smooth' }));
    }
);

async function enregistrer() {
    erreur.value = '';
    const c = champs.value;
    const long = c.long.trim().toUpperCase();
    const court = c.court.trim().toUpperCase();
    if (!long || !court) {
        erreur.value = 'Le libellé long et le libellé court sont obligatoires.';
        return;
    }
    try {
        await loc.enregistrer({
            libelle_long: long,
            libelle_court: court,
            adresse: c.adresse.trim().toUpperCase() || null,
            latitude: c.latitude || null,
            longitude: c.longitude || null
        });
        reinitialiser();
    } catch (e) {
        erreur.value = `Erreur : ${(e as Error).message}`;
    }
}
</script>

<template>
    <div ref="zone" class="loc-form">
        <button
            type="button"
            class="loc-form__basculer"
            :aria-expanded="ouvert ? 'true' : 'false'"
            aria-controls="localisationFormBody"
            @click="ouvert = !ouvert"
        >
            <span class="loc-form__fleche" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span>
            <h4 id="localisationFormTitle" class="loc-form__titre">{{ titre }}</h4>
        </button>
        <div v-show="ouvert" id="localisationFormBody" class="loc-form__corps">
            <AppChampsLocalisation v-model="champs" :ids="IDS" />
            <AppAlert v-if="erreur" type="error" small :description="erreur" />
            <div class="loc-form__actions">
                <button type="button" class="loc-form__enregistrer" @click="enregistrer">💾 Enregistrer</button>
                <button type="button" class="loc-form__annuler" @click="reinitialiser">🔄 Annuler</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.loc-form {
    background: #c5cae9;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 15px;
}
.loc-form__basculer,
.loc-form__basculer:hover {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
}
.loc-form__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.loc-form__fleche {
    font-size: 13px;
    color: #283593;
}
.loc-form__titre {
    margin: 0;
    color: #283593;
}
.loc-form__corps {
    margin-top: 15px;
}
.loc-form__actions {
    display: flex;
    gap: 10px;
    margin-top: 7px;
}
.loc-form__enregistrer,
.loc-form__annuler {
    color: white;
    padding: 8px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.loc-form__enregistrer,
.loc-form__enregistrer:hover {
    background: #3f51b5;
    font-weight: bold;
}
.loc-form__annuler,
.loc-form__annuler:hover {
    background: #95a5a6;
    font-weight: 400;
}
</style>
