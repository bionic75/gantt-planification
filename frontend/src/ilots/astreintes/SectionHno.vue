<!-- Section repliable de la rubrique HNO (fermée à l'ouverture) : titre cliquable, état annoncé (aria-expanded) -->
<script setup lang="ts">
import { ref, useId } from 'vue';

defineProps<{ titre: string }>();
const emit = defineEmits<{ ouverture: [] }>();
const ouvert = ref(false);
const idCorps = `section-hno-${useId()}`;

function basculer() {
    ouvert.value = !ouvert.value;
    if (ouvert.value) emit('ouverture');
}
</script>

<template>
    <div class="form-section section-hno">
        <h3 class="section-hno__titre">
            <button
                type="button"
                class="section-hno__bascule"
                :aria-expanded="ouvert"
                :aria-controls="idCorps"
                @click="basculer"
            >
                <span :key="String(ouvert)" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span> {{ titre }}
            </button>
        </h3>
        <div v-show="ouvert" :id="idCorps" class="section-hno__corps">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.section-hno__titre {
    margin: 0;
}
.section-hno__bascule,
.section-hno__bascule:hover {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
.section-hno__corps {
    margin-top: 15px;
}
</style>
