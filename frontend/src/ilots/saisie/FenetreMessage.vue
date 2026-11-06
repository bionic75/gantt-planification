<!-- Message seul dans une petite fenêtre (remplace une alert() de l'ancien écran) : ouverte tant que le message n'est
     pas vide -->
<script setup lang="ts">
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';

defineProps<{ message: string }>();
const emit = defineEmits<{ fermer: [] }>();
</script>

<template>
    <AppModal :opened="!!message" title="Information" class="gp-message" @close="emit('fermer')">
        <AppAlert type="info" :description="message" class="gp-message__texte" />
        <template #footer>
            <button type="button" @click="emit('fermer')">OK</button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.gp-message .gp-modale__boite {
    width: min(460px, 100%);
    margin-top: 10vh;
}
.gp-message__texte {
    white-space: pre-line;
    color: var(--gp-texte);
}
</style>
