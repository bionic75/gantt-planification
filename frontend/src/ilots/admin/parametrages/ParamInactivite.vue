<!-- Compteur d'inactivité : activation et délai, enregistrés pour tous ; compteur de la session relancé par
     l'ancien code -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { emettre } from '@/liaison';
import { DELAIS_INACTIVITE, inactivite } from './calculs';
import { useParametragesStore } from './magasin';

const store = useParametragesStore();
const active = ref(false);
const minutes = ref('15');
const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);

watch(
    () => store.parametres,
    p => {
        const i = inactivite(p);
        active.value = i.active;
        minutes.value = i.minutes;
    },
    { immediate: true }
);

async function enregistrer() {
    message.value = null;
    try {
        await store.enregistrer({ inactivity_enabled: String(active.value), inactivity_timeout: minutes.value });
        message.value = { type: 'success', texte: "✅ Configuration d'inactivité sauvegardée" };
        emettre('inactivite-modifiee', { active: active.value, minutes: parseInt(minutes.value) });
    } catch {
        message.value = { type: 'error', texte: '❌ Erreur lors de la sauvegarde' };
    }
}
</script>

<template>
    <AppSousSectionAdmin titre="Compteur d'inactivité" id-corps="subInactivity">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2 2M9 2h6" />
            </svg>
        </template>
        <div class="param__ligne">
            <div class="param__champ">
                <label class="param__activation">
                    <input id="inactivityEnabled" v-model="active" type="checkbox" />
                    <span>Activer le compteur d'inactivité</span>
                </label>
                <label for="inactivityTimeout" class="param__masque">Délai d'inactivité</label>
                <select id="inactivityTimeout" v-model="minutes">
                    <option v-for="m in DELAIS_INACTIVITE" :key="m" :value="String(m)">{{ m }} minutes</option>
                </select>
            </div>
            <button type="button" class="param__bouton" @click="enregistrer">💾 Sauvegarder</button>
        </div>
        <AppAlert v-if="message" :type="message.type" :description="message.texte" />
    </AppSousSectionAdmin>
</template>

<style scoped>
.param__ligne {
    display: flex;
    align-items: flex-end;
    gap: 10px;
}
.param__champ {
    flex: 1;
}
.param__activation {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 8px;
}
.param__activation input {
    width: auto;
    margin: 0;
}
.param__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.param__bouton {
    white-space: nowrap;
}
</style>
