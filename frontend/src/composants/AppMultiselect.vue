<!-- Liste à choix multiple (liste native : clavier, Ctrl+clic) ; interface proche de DsfrMultiselect (VueDsfr) :
     modelValue (valeurs choisies), options, label, id, hint -->
<script setup lang="ts">
import type { OptionSelect } from './AppSelect.vue';

withDefaults(defineProps<{ label: string; id: string; options: OptionSelect[]; hint?: string }>(), {
    hint: 'Ctrl+clic pour sélection multiple'
});
const choix = defineModel<string[]>({ default: () => [] });

const lire = (e: Event) => [...(e.target as HTMLSelectElement).selectedOptions].map(o => o.value);
</script>

<template>
    <div class="gp-multi">
        <label class="gp-multi__libelle" :for="id">{{ label }}</label>
        <select
            :id="id"
            class="gp-multi__liste"
            multiple
            :aria-describedby="`${id}Aide`"
            @change="choix = lire($event)"
        >
            <option
                v-for="o in options"
                :key="o.value"
                :value="String(o.value)"
                :selected="choix.includes(String(o.value))"
            >
                {{ o.text }}
            </option>
        </select>
        <div :id="`${id}Aide`" class="gp-multi__aide">{{ hint }}</div>
    </div>
</template>

<style scoped>
.gp-multi__libelle {
    font-size: var(--gp-police-s);
    color: #555;
    font-weight: 400;
    display: block;
    margin-bottom: 5px;
}
.gp-multi__liste {
    width: var(--gp-multi-largeur, 250px);
    height: 80px;
}
.gp-multi__aide {
    font-size: 10px;
    color: #999;
    margin-top: 2px;
}
</style>
