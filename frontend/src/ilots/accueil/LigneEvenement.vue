<!-- Événement de l'accueil : Localisation | Type | Libellé (début - fin) - Participants -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Evenement } from '@/api/evenements';
import AppIcone from '@/composants/AppIcone.vue';
import { ligneEvenement } from './calculs';

const props = defineProps<{ evenement: Evenement }>();
const ligne = computed(() => ligneEvenement(props.evenement));
</script>

<template>
    <li class="ac-ligne ac-ligne--evenement">
        <AppIcone :name="evenement.type_icon || 'calendar'" class="ac-evt-icone" />
        <span class="ac-evt-texte">
            <template v-if="ligne.localisation"
                ><span class="ac-evt-lieu">{{ ligne.localisation }}</span> | </template
            ><template v-if="ligne.type">{{ ligne.type }} | </template
            ><strong class="ac-nom">{{ ligne.libelle }}</strong> ({{ ligne.dates }})<template v-if="ligne.participants">
                - <span class="ac-evt-participants">{{ ligne.participants }}</span></template
            >
        </span>
    </li>
</template>
