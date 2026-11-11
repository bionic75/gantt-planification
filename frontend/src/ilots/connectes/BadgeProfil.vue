<!-- Profil d'un utilisateur connecté (liste des connectés, en-tête d'une conversation) : pastille colorée, icône et
     libellé court ; « sombre » sur le fond foncé de l'en-tête d'une conversation -->
<script setup lang="ts">
import { computed } from 'vue';
import { ICONES_APPLICATION } from '@/composants/icones-application';
import { PROFILS } from './magasin';

const props = defineProps<{ profil: string | null | undefined; sombre?: boolean }>();
const meta = computed(() => (props.profil ? PROFILS[props.profil] : undefined));
</script>

<template>
    <span
        v-if="meta && profil"
        class="gp-badge-profil"
        :class="[`gp-badge-profil--${profil}`, { 'gp-badge-profil--sombre': sombre }]"
        :title="`Profil : ${meta.libelle}`"
        ><!-- eslint-disable vue/no-v-html -- tracés fixes de l'application -->
        <svg
            class="app-ico gp-badge-profil__icone"
            viewBox="0 0 24 24"
            aria-hidden="true"
            v-html="ICONES_APPLICATION[meta.icone] ?? ''"
        ></svg
        ><!-- eslint-enable vue/no-v-html -->{{ meta.libelle }}</span
    >
</template>

<style>
.gp-badge-profil {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: 1px solid;
    border-radius: 10px;
    padding: 1px 7px 1px 5px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    flex-shrink: 0;
}
.gp-badge-profil__icone {
    width: 11px;
    height: 11px;
    stroke: currentColor;
    vertical-align: middle;
}
.gp-badge-profil--admin {
    color: #e74c3c;
    background: #e74c3c1f;
    border-color: #e74c3c66;
}
.gp-badge-profil--user {
    color: #3498db;
    background: #3498db1f;
    border-color: #3498db66;
}
.gp-badge-profil--expert {
    color: #27ae60;
    background: #27ae601f;
    border-color: #27ae6066;
}
.gp-badge-profil--rh {
    color: #8e44ad;
    background: #8e44ad1f;
    border-color: #8e44ad66;
}
.gp-badge-profil.gp-badge-profil--sombre {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.4);
}
</style>
