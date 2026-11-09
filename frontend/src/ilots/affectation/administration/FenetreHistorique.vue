<!-- Historique d'un déploiement : qui a modifié quoi et quand, du plus récent au plus ancien -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiAffectation, type DeploiementAdmin, type EntreeHistorique } from '@/api/affectation';
import AppModal from '@/composants/AppModal.vue';
import { ACTIONS_HISTORIQUE, dateHistorique } from './administration';

const props = defineProps<{ deploiement: DeploiementAdmin }>();
const emit = defineEmits<{ fermer: [] }>();

const entrees = ref<EntreeHistorique[] | null>(null);
const erreur = ref('');
const action = (h: EntreeHistorique) => ACTIONS_HISTORIQUE[h.action] ?? [h.action, '#6b7a8d'];

onMounted(async () => {
    try {
        entrees.value = (await apiAffectation.historique(props.deploiement.id)).history;
    } catch (e) {
        erreur.value = (e as Error).message;
    }
});
</script>

<template>
    <AppModal
        id="affHistModal"
        opened
        :title="`Historique — ${deploiement.samu_name}`"
        class="aff-historique"
        @close="emit('fermer')"
    >
        <div id="affHistBody">
            <p v-if="erreur" class="aff-error">{{ erreur }}</p>
            <p v-else-if="!entrees" class="aff-muted">Chargement…</p>
            <p v-else-if="!entrees.length" class="aff-muted">
                Aucun événement enregistré pour ce déploiement (l'historique démarre à la mise en service de cette
                fonction).
            </p>
            <template v-else>
                <p class="aff-muted aff-hist-intro">
                    {{ entrees.length }} événement(s), du plus récent au plus ancien.
                </p>
                <div v-for="h in entrees" :key="h.id" class="aff-hist-item" :style="{ borderLeftColor: action(h)[1] }">
                    <div class="top">
                        <span class="aff-hist-tag" :style="{ background: action(h)[1] }">{{ action(h)[0] }}</span
                        ><span class="who">{{ h.user }}</span
                        ><span class="when">{{ dateHistorique(h.at) }}</span>
                    </div>
                    <div v-if="h.note" class="aff-muted aff-hist-note">{{ h.note }}</div>
                    <ul v-if="h.changes.length">
                        <li v-for="(c, i) in h.changes" :key="i">
                            <b>{{ c.label }}</b> : <span class="from">{{ c.from }}</span> →
                            <span class="to">{{ c.to }}</span>
                        </li>
                    </ul>
                </div>
            </template>
        </div>
        <template #footer>
            <button type="button" class="aff-btn" @click="emit('fermer')">Fermer</button>
        </template>
    </AppModal>
</template>
