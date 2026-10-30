<!-- Message d'alerte ; interface de DsfrAlert (VueDsfr) : type, title, description, small.
     Les erreurs sont annoncées aux lecteurs d'écran (role="alert"). -->
<script setup lang="ts">
withDefaults(
    defineProps<{
        type?: 'error' | 'success' | 'info' | 'warning';
        title?: string;
        description?: string;
        small?: boolean;
    }>(),
    { type: 'info', title: '', description: '' }
);
</script>

<template>
    <div
        class="gp-alerte"
        :class="[`gp-alerte--${type}`, { 'gp-alerte--sm': small }]"
        :role="type === 'error' ? 'alert' : 'status'"
    >
        <strong v-if="title" class="gp-alerte__titre">{{ title }}</strong>
        <!-- Recréé à chaque message : les émojis du texte sont remplacés par des icônes (public/js/ui-icons.js),
             un nœud texte converti n'est plus mis à jour par Vue -->
        <slot
            ><span :key="description">{{ description }}</span></slot
        >
    </div>
</template>

<style scoped>
.gp-alerte {
    font-size: var(--gp-police-m);
    margin: var(--gp-espace-2) 0;
}
.gp-alerte--sm {
    font-size: var(--gp-police-s);
    margin: var(--gp-espace-1) 0;
}
.gp-alerte--error {
    color: var(--gp-danger);
}
.gp-alerte--success {
    color: var(--gp-succes);
}
.gp-alerte--info,
.gp-alerte--warning {
    color: var(--gp-texte-discret);
}
.gp-alerte__titre {
    display: block;
}
</style>
