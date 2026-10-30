<!-- Version de l'application : saisie et enregistrement, affichage de l'en-tête mis à jour par l'ancien code -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { emettre } from '@/liaison';
import { useParametragesStore } from './magasin';

const store = useParametragesStore();
const version = ref('');
const message = ref<{ type: 'success' | 'error' | 'warning'; texte: string } | null>(null);

watch(
    () => store.parametres.app_version,
    v => (version.value = v ?? ''),
    { immediate: true }
);

async function enregistrer() {
    message.value = null;
    if (!version.value) {
        message.value = { type: 'warning', texte: '⚠️ Veuillez saisir une version' };
        return;
    }
    try {
        await store.enregistrer({ app_version: version.value });
        message.value = { type: 'success', texte: '✅ Version sauvegardée' };
        emettre('version-modifiee');
    } catch {
        message.value = { type: 'error', texte: '❌ Erreur lors de la sauvegarde' };
    }
}
</script>

<template>
    <AppSousSectionAdmin titre="Version de l'application" id-corps="subAppVersion">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
                <circle cx="7" cy="7" r="1.2" />
            </svg>
        </template>
        <div class="param__ligne">
            <div class="param__champ">
                <label for="appVersionInput">Version de l'application</label>
                <input id="appVersionInput" v-model="version" type="text" placeholder="Ex: v1.0.0" />
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
.param__bouton {
    white-space: nowrap;
}
</style>
