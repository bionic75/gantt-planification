<!-- Case à cocher avec libellé ; interface de DsfrCheckbox (VueDsfr) : modelValue, label, id, name -->
<script setup lang="ts">
defineProps<{ label: string; id: string; name?: string }>();
const coche = defineModel<boolean>({ default: false });
</script>

<template>
    <label class="gp-case" :for="id">
        <input :id="id" v-model="coche" type="checkbox" class="gp-case__saisie" :name="name" />
        <span class="gp-case__libelle">{{ label }}</span>
    </label>
</template>

<style scoped>
.gp-case {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    cursor: pointer;
    font-weight: 400;
    font-size: var(--gp-police-s);
    color: var(--gp-texte);
}
.gp-case__saisie {
    width: auto;
    margin: 0;
}
.gp-case__libelle {
    white-space: nowrap;
}
</style>
