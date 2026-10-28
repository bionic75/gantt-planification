<!-- Bouton radio avec libellé ; interface de DsfrRadioButton (VueDsfr) : modelValue, value, label, name, id -->
<script setup lang="ts">
defineProps<{ label: string; value: string; name: string; id: string }>();
const choix = defineModel<string>({ default: '' });
</script>

<template>
    <label class="gp-radio" :for="id">
        <input :id="id" v-model="choix" type="radio" class="gp-radio__saisie" :name="name" :value="value" />
        {{ label }}
    </label>
</template>

<style scoped>
.gp-radio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    cursor: pointer;
    font-size: var(--gp-police-m);
    font-weight: 700;
    color: var(--gp-radio-couleur, var(--gp-texte));
}
.gp-radio__saisie {
    width: auto;
    margin: 0;
}
</style>
