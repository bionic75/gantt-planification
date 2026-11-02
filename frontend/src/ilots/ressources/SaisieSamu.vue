<!-- Saisie des SAMU d'une ressource pour un rôle (expert principal ou secondaire) : étiquettes, suggestions parmi les
     localisations ; un SAMU choisi est retiré de l'autre rôle (un SAMU n'a qu'un rôle). Retour arrière dans le champ
     vide : dernière étiquette retirée ; Échap : suggestions fermées. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { suggestionsSamu } from './calculs';

const props = defineProps<{
    /** Suffixe des identifiants (ex. add_principal) */
    cle: string;
    role: 'principal' | 'secondaire';
    libelle: string;
    /** Libellés courts des localisations */
    samus: ReadonlyArray<string | null>;
    /** Consultation : étiquettes seules, sans saisie ni retrait */
    lectureSeule?: boolean;
}>();
const choisis = defineModel<string[]>({ required: true });
/** SAMU de l'autre rôle */
const autres = defineModel<string[]>('autres', { required: true });

const saisie = ref('');
const ouverte = ref(false);
const champ = ref<HTMLInputElement | null>(null);
const zone = ref<HTMLElement | null>(null);

const suggestions = computed(() => suggestionsSamu(props.samus, [...choisis.value, ...autres.value], saisie.value));

function ajouter(samu: string) {
    if (!choisis.value.includes(samu)) choisis.value = [...choisis.value, samu];
    autres.value = autres.value.filter(s => s !== samu);
    saisie.value = '';
    ouverte.value = false;
    champ.value?.focus();
}

const retirer = (samu: string) => (choisis.value = choisis.value.filter(s => s !== samu));

function clavier(e: KeyboardEvent) {
    if (e.key === 'Backspace' && saisie.value === '' && choisis.value.length)
        choisis.value = choisis.value.slice(0, -1);
    if (e.key === 'Escape') ouverte.value = false;
}

function clicAilleurs(e: MouseEvent) {
    if (ouverte.value && !zone.value?.contains(e.target as Node)) ouverte.value = false;
}
onMounted(() => document.addEventListener('click', clicAilleurs));
onBeforeUnmount(() => document.removeEventListener('click', clicAilleurs));
</script>

<template>
    <div ref="zone" class="form-group samu">
        <label :for="`samuInput_${cle}`">{{ libelle }}</label>
        <div :id="`samuTags_${cle}`" class="samu-tag-box" @click="champ?.focus()">
            <span v-for="s in choisis" :key="s" class="samu-tag" :class="role">
                <span>{{ s }}</span>
                <button
                    v-if="!lectureSeule"
                    type="button"
                    class="samu-tag-remove samu__retirer"
                    title="Retirer"
                    :aria-label="`Retirer ${s}`"
                    @click.stop="retirer(s)"
                >
                    &times;
                </button>
            </span>
            <input
                v-if="!lectureSeule"
                :id="`samuInput_${cle}`"
                ref="champ"
                v-model="saisie"
                type="text"
                placeholder="Taper le nom d'un SAMU..."
                class="samu-tag-input"
                autocomplete="off"
                @input="ouverte = true"
                @focus="ouverte = true"
                @keydown="clavier"
            />
        </div>
        <div
            v-if="!lectureSeule"
            :id="`samuDropdown_${cle}`"
            class="samu-tag-dropdown"
            :class="{ samu__ouverte: ouverte }"
        >
            <template v-if="ouverte">
                <div v-if="!suggestions.length" class="samu-tag-dropdown-empty">Aucun SAMU disponible</div>
                <div
                    v-for="s in suggestions"
                    :key="s"
                    class="samu-tag-dropdown-item"
                    role="option"
                    aria-selected="false"
                    @click.stop="ajouter(s)"
                >
                    {{ s }}
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.samu {
    position: relative;
}
.samu__ouverte {
    display: block;
}
.samu__retirer,
.samu__retirer:hover {
    background: none;
    border: none;
    color: inherit;
    padding: 0;
}
</style>
