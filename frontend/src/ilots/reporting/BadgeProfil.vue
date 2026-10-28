<!-- Badge d'un profil (Admin, Utilisateur, Expert, RH), comme l'en-tête de l'application -->
<script setup lang="ts">
import { computed } from 'vue';
import AppIcone from '@/composants/AppIcone.vue';
import type { NomIcone } from '@/composants/icones';

const PROFILS: Record<string, { label: string; couleur: string; icone: NomIcone }> = {
    admin: { label: 'Admin', couleur: '#e74c3c', icone: 'couronne' },
    user: { label: 'Utilisateur', couleur: '#3498db', icone: 'utilisateur' },
    expert: { label: 'Expert', couleur: '#27ae60', icone: 'mallette' },
    rh: { label: 'RH', couleur: '#8e44ad', icone: 'utilisateurs' }
};

const props = defineProps<{ profil: string }>();
const meta = computed(() => PROFILS[props.profil]);
const couleurs = computed(() =>
    meta.value
        ? {
              '--rp-badge-fond': `${meta.value.couleur}1f`,
              '--rp-badge-texte': meta.value.couleur,
              '--rp-badge-bordure': `${meta.value.couleur}66`
          }
        : undefined
);
</script>

<template>
    <span v-if="meta" class="rp-badge" :style="couleurs" :title="`Profil : ${meta.label}`">
        <AppIcone :name="meta.icone" :scale="0.7" />{{ meta.label }}
    </span>
    <slot v-else />
</template>

<style scoped>
.rp-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: var(--rp-badge-fond);
    color: var(--rp-badge-texte);
    border: 1px solid var(--rp-badge-bordure);
    border-radius: 10px;
    padding: 1px 7px 1px 5px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    flex-shrink: 0;
}
</style>
