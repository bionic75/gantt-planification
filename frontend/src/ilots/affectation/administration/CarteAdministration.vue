<!-- Rubrique de l'administration, repliable d'un clic sur son en-tête (hors boutons) ; état mémorisé dans le navigateur
     (clé « affFolded » de l'ancien écran) -->
<script setup lang="ts">
import { ref } from 'vue';
import IconeAff, { type ICONES } from './IconeAff.vue';

const props = defineProps<{ id: string; titre: string; icone: keyof typeof ICONES; sousTitre?: string }>();

const CLE = 'affFolded';
function lire(): Record<string, boolean> {
    try {
        return JSON.parse(localStorage.getItem(CLE) || '{}') as Record<string, boolean>;
    } catch {
        return {};
    }
}

const repliee = ref(!!lire()[props.id]);

function basculer(e: MouseEvent) {
    // Les boutons de l'en-tête gardent leur action
    if ((e.target as HTMLElement).closest('button, a, input, select')) return;
    repliee.value = !repliee.value;
    const etat = lire();
    etat[props.id] = repliee.value;
    try {
        localStorage.setItem(CLE, JSON.stringify(etat));
    } catch {
        /* stockage indisponible */
    }
}
</script>

<template>
    <section :id="id" class="aff-card" :class="{ folded: repliee }">
        <header class="aff-card-head aff-fold" title="Replier / déplier cette rubrique" @click="basculer">
            <span class="aff-card-title"
                ><span class="aff-fold-chev"
                    ><svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="m6 9 6 6 6-6" /></svg></span
                ><IconeAff :nom="icone" classe="aff-ico" />{{ titre }}</span
            >
            <slot name="actions">
                <span v-if="sousTitre" class="aff-muted aff-sous-titre">{{ sousTitre }}</span>
            </slot>
        </header>
        <div class="aff-card-body">
            <slot />
        </div>
    </section>
</template>
