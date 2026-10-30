<!-- Administration › Paramétrages divers (sous-îlot) : version, inactivité, favicon, aide en ligne, dump, thèmes, son
     de notification ; paramètres relus à chaque ouverture de l'onglet -->
<script setup lang="ts">
import { onMounted } from 'vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { useParametragesStore } from './magasin';
import ParamAide from './ParamAide.vue';
import ParamDump from './ParamDump.vue';
import ParamFavicon from './ParamFavicon.vue';
import ParamInactivite from './ParamInactivite.vue';
import ParamSon from './ParamSon.vue';
import ParamThemes from './ParamThemes.vue';
import ParamVersion from './ParamVersion.vue';

const store = useParametragesStore();
const { demande, repondre } = fournirConfirmation();

// Comme l'ancien code : paramètres relus à chaque ouverture de l'onglet Administration
onMounted(() => void store.charger());
surReouverture(() => void store.charger());
</script>

<template>
    <AppSectionAdmin titre="Paramétrages divers" id-corps="settingsSection" teinte="lavande">
        <ParamVersion />
        <ParamInactivite />
        <ParamFavicon />
        <ParamAide />
        <ParamDump />
        <ParamThemes />
        <ParamSon />
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </AppSectionAdmin>
</template>
