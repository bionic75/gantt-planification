<!-- Changements constatés entre l'état précédent des déploiements et les dates reprises d'Asana (rafraîchissement,
     import, remplacements), déploiements déjà à jour, sans projet Asana ou en erreur -->
<script setup lang="ts">
import { computed } from 'vue';
import AppModal from '@/composants/AppModal.vue';
import type { Changements } from './magasin';

const props = defineProps<{ changements: Changements }>();
const emit = defineEmits<{ fermer: [] }>();

const total = computed(() => props.changements.items.reduce((n, it) => n + (it.changes || []).length, 0));
</script>

<template>
    <AppModal
        id="affAsanaChgModal"
        opened
        :title="changements.titre || 'Changements issus d\'Asana'"
        class="aff-asana-chg"
        @close="emit('fermer')"
    >
        <div id="affAsanaChgBody">
            <p class="aff-asana-intro">
                <template v-if="changements.items.length"
                    ><b>{{ changements.items.length }}</b> déploiement(s) modifié(s), <b>{{ total }}</b> changement(s)
                    constaté(s) entre l'état précédent et les dates reprises d'Asana.</template
                ><template v-else>Aucune modification : les déploiements sont déjà à jour.</template>
                <span class="aff-muted">(Chaque modification est aussi inscrite dans l'historique du SAMU.)</span>
            </p>
            <div v-for="(it, i) in changements.items" :key="i" class="aff-asana-bloc">
                <div class="aff-asana-bloc__tete">
                    <b>{{ it.samu }}</b>
                    <span class="aff-av-b" :class="it.created ? 'ok' : 'mid'">{{
                        it.created ? 'créé' : 'mis à jour'
                    }}</span
                    ><span v-if="it.asana" class="aff-muted aff-asana-petit">Projet Asana : {{ it.asana }}</span>
                </div>
                <table v-if="it.changes.length" class="aff-asana-table">
                    <thead>
                        <tr>
                            <th class="aff-asana-chg__rubrique">Rubrique</th>
                            <th>Avant</th>
                            <th class="aff-asana-chg__fleche"></th>
                            <th>Après</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(c, j) in it.changes" :key="j">
                            <td class="aff-asana-chg__libelle">{{ c.label }}</td>
                            <td class="aff-asana-chg__avant" :class="{ barre: c.from && c.from !== '—' }">
                                {{ c.from || '—' }}
                            </td>
                            <td class="aff-asana-chg__fleche">→</td>
                            <td class="aff-asana-chg__apres">{{ c.to || '—' }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="aff-muted aff-asana-vide">Aucun détail de changement.</p>
            </div>
            <p v-if="changements.unchanged?.length" class="aff-asana-liste aff-asana-liste--ok">
                <b>Déjà à jour</b> : {{ changements.unchanged.join(', ') }}
            </p>
            <p v-if="changements.noMatch?.length" class="aff-asana-liste aff-asana-liste--sans">
                <b>Sans projet Asana correspondant</b> : {{ changements.noMatch.join(', ') }}
            </p>
            <p v-if="changements.errors?.length" class="aff-asana-liste aff-asana-liste--erreur">
                <b>Erreurs</b> : {{ changements.errors.map(e => `${e.samu} — ${e.error}`).join(' · ') }}
            </p>
        </div>
        <template #footer>
            <button type="button" class="aff-btn aff-btn-primary" @click="emit('fermer')">Fermer</button>
        </template>
    </AppModal>
</template>
