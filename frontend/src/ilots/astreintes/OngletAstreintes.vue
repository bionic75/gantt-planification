<!-- Onglet Astreintes : rubriques « Gestion des astreintes HO » (tous les profils) et « Gestion des astreintes HNO »
     (administrateurs). À chaque réouverture de l'onglet, un autre profil revient sur la rubrique HO et la rubrique HNO
     affichée relit ses ressources. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { surReouverture } from '@/ilots/activation';
import { useSessionStore } from '@/stores/session';
import RubriqueHno from './RubriqueHno.vue';
import RubriqueHo from './RubriqueHo.vue';

const session = useSessionStore();
const rubrique = ref<'ho' | 'hno'>('ho');
const hno = ref<InstanceType<typeof RubriqueHno> | null>(null);

const admin = computed(() => session.profil === 'admin');

onMounted(() => void session.charger().catch(() => null));
surReouverture(() => {
    if (!admin.value) rubrique.value = 'ho';
    else if (rubrique.value === 'hno') void hno.value?.charger();
});
</script>

<template>
    <h2>🔔 Astreintes</h2>
    <div id="astreinteSubTabs" class="astreintes__rubriques">
        <button
            id="astreinteSubTabHo"
            type="button"
            class="astreinte-subtab"
            :class="{ active: rubrique === 'ho' }"
            :aria-pressed="rubrique === 'ho'"
            @click="rubrique = 'ho'"
        >
            🗓️ Gestion des astreintes HO
        </button>
        <button
            v-if="admin"
            id="astreinteSubTabHno"
            type="button"
            class="astreinte-subtab"
            :class="{ active: rubrique === 'hno' }"
            :aria-pressed="rubrique === 'hno'"
            @click="rubrique = 'hno'"
        >
            🌙 Gestion des astreintes HNO
        </button>
    </div>
    <div v-show="rubrique === 'ho'" id="astreintesHoPanel">
        <RubriqueHo />
    </div>
    <div v-if="admin && rubrique === 'hno'" id="astreintesHnoPanel">
        <RubriqueHno ref="hno" />
    </div>
</template>

<style scoped>
.astreintes__rubriques {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 6px 0 18px;
}
</style>
