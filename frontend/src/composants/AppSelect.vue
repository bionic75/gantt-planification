<!-- Liste déroulante avec libellé ; interface de DsfrSelect (VueDsfr) : modelValue, label, options, selectId,
     required, hint, defaultUnselectedText (ici une option sélectionnable de valeur vide). -->
<script setup lang="ts">
export interface OptionSelect {
    value: string | number;
    text: string;
}

withDefaults(
    defineProps<{
        modelValue: string | number;
        label: string;
        options: OptionSelect[];
        selectId: string;
        required?: boolean;
        hint?: string;
        defaultUnselectedText?: string;
    }>(),
    { hint: '', defaultUnselectedText: '' }
);
const emit = defineEmits<{ 'update:modelValue': [valeur: string] }>();
</script>

<template>
    <div class="gp-champ">
        <label class="gp-champ__libelle" :for="selectId">
            {{ label }}<template v-if="required"> *</template>
            <span v-if="hint" class="gp-champ__aide">{{ hint }}</span>
        </label>
        <select
            :id="selectId"
            class="gp-champ__saisie"
            :value="String(modelValue)"
            :required="required"
            @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
        >
            <option v-if="defaultUnselectedText" value="">{{ defaultUnselectedText }}</option>
            <option v-for="o in options" :key="o.value" :value="String(o.value)">{{ o.text }}</option>
        </select>
    </div>
</template>
