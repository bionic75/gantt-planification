<!-- Contenu d'un onglet d'une application : affiché quand l'onglet est actif, composé à sa première ouverture.
     Les réouvertures suivantes (compteur « ouvertures ») sont signalées aux composants de l'onglet (surReouverture),
     qui relisent leurs données comme l'ancien écran à chaque changement d'onglet. -->
<script setup lang="ts">
import { provide, toRef } from 'vue';
import { CLE_ACTIVATIONS } from '@/ilots/activation';

const props = defineProps<{ id: string; actif: boolean; ouvert: boolean; ouvertures: number }>();
provide(CLE_ACTIVATIONS, toRef(props, 'ouvertures'));
</script>

<template>
    <div :id="id" class="tab-content" :class="{ active: actif }">
        <slot v-if="ouvert" />
    </div>
</template>
