<!-- Demande de confirmation d'une action (remplace confirm() du navigateur) : fenêtre d'alerte, Annuler / confirmer -->
<script setup lang="ts">
import AppButton from './AppButton.vue';
import AppModal from './AppModal.vue';

withDefaults(
    defineProps<{ opened: boolean; title?: string; message: string; labelConfirmer?: string; danger?: boolean }>(),
    { title: 'Confirmation', labelConfirmer: 'Confirmer', danger: true }
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
    <AppModal :opened="opened" :title="title" is-alert @close="emit('cancel')">
        <p class="gp-confirmation__message">{{ message }}</p>
        <template #footer>
            <AppButton secondary label="Annuler" @click="emit('cancel')" />
            <AppButton :danger="danger" :label="labelConfirmer" @click="emit('confirm')" />
        </template>
    </AppModal>
</template>

<style scoped>
.gp-confirmation__message {
    margin: var(--gp-espace-3) 0 0;
    font-size: var(--gp-police-l);
}
</style>
