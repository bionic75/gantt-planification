<!-- Champ de saisie avec libellé ; interface de DsfrInput (VueDsfr) : modelValue, label, labelVisible, id, isTextarea,
     hint, required. Autres attributs (placeholder, maxlength, rôle…) transmis au champ. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false });

withDefaults(
    defineProps<{
        modelValue: string;
        label: string;
        id: string;
        labelVisible?: boolean;
        isTextarea?: boolean;
        hint?: string;
        required?: boolean;
        type?: string;
    }>(),
    { labelVisible: true, hint: '', type: 'text' }
);
const emit = defineEmits<{ 'update:modelValue': [valeur: string] }>();

const saisie = (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement | HTMLTextAreaElement).value);
</script>

<template>
    <div class="gp-champ">
        <label class="gp-champ__libelle" :class="{ 'gp-masque': !labelVisible }" :for="id">
            {{ label }}<template v-if="required"> *</template>
            <span v-if="hint" class="gp-champ__aide">{{ hint }}</span>
        </label>
        <slot name="avant-saisie" />
        <textarea
            v-if="isTextarea"
            :id="id"
            v-bind="$attrs"
            class="gp-champ__saisie"
            :value="modelValue"
            :required="required"
            @input="saisie"
        />
        <input
            v-else
            :id="id"
            v-bind="$attrs"
            class="gp-champ__saisie"
            :type="type"
            :value="modelValue"
            :required="required"
            @input="saisie"
        />
        <slot />
    </div>
</template>
