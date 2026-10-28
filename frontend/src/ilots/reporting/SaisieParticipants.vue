<!-- Participants choisis en étiquettes, avec suggestions à la saisie (nom ou email) -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CompteReporting } from '@/api/reporting';
import { avatar, nomAffiche } from './calculs';

const props = defineProps<{ comptes: CompteReporting[] }>();
const choisis = defineModel<CompteReporting[]>({ default: () => [] });

const saisie = ref('');
const ouverte = ref(false);
const actif = ref(-1);
const zone = ref<HTMLElement | null>(null);
const champ = ref<HTMLInputElement | null>(null);

const libelle = (c: CompteReporting) => nomAffiche(c.prenom, c.nom) || c.username || '';

/** Comptes non choisis dont le nom ou l'email contient la saisie (8 au plus) */
const suggestions = computed(() => {
    const q = saisie.value.toLowerCase().trim();
    const deja = new Set(choisis.value.map(c => c.id));
    return props.comptes
        .filter(c => {
            if (deja.has(c.id)) return false;
            if (!q) return true;
            const nom = `${c.prenom || ''} ${c.nom || ''}`.toLowerCase();
            return nom.includes(q) || (c.email || '').toLowerCase().includes(q);
        })
        .slice(0, 8);
});
const listeVisible = computed(() => ouverte.value && suggestions.value.length > 0);

function ouvrir() {
    ouverte.value = true;
    actif.value = -1;
}

function ajouter(c: CompteReporting) {
    if (!choisis.value.some(x => x.id === c.id)) choisis.value = [...choisis.value, c];
    saisie.value = '';
    ouverte.value = false;
    champ.value?.focus();
}

function retirer(id: number) {
    choisis.value = choisis.value.filter(c => c.id !== id);
}

function clavier(e: KeyboardEvent) {
    if (e.key === 'Backspace' && !saisie.value && choisis.value.length) {
        choisis.value = choisis.value.slice(0, -1);
    } else if (e.key === 'Escape') {
        ouverte.value = false;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!listeVisible.value) return ouvrir();
        e.preventDefault();
        const n = suggestions.value.length;
        actif.value = (actif.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (e.key === 'Enter' && listeVisible.value && actif.value >= 0) {
        e.preventDefault();
        const c = suggestions.value[actif.value];
        if (c) ajouter(c);
    }
}

const clicAilleurs = (e: MouseEvent) => {
    if (!zone.value?.contains(e.target as Node)) ouverte.value = false;
};
onMounted(() => document.addEventListener('click', clicAilleurs));
onBeforeUnmount(() => document.removeEventListener('click', clicAilleurs));
</script>

<template>
    <div ref="zone" class="rp-participants">
        <label class="rp-champ__libelle" for="eventsReportingParticipantInput">👥 Participant(s)</label>
        <div id="eventsReportingParticipantsContainer" class="rp-participants__cadre" @click="champ?.focus()">
            <span v-for="c in choisis" :key="c.id" class="rp-participants__etiquette">
                <span
                    class="rp-participants__avatar rp-participants__avatar--petit"
                    :style="{ background: avatar(c.prenom, c.nom, libelle(c)).couleur }"
                    >{{ avatar(c.prenom, c.nom).initiales }}</span
                >
                <span class="rp-participants__nom">{{ libelle(c) }}</span>
                <button
                    type="button"
                    class="rp-participants__retirer"
                    :aria-label="`Retirer ${libelle(c)}`"
                    title="Retirer"
                    @click.stop="retirer(c.id)"
                >
                    &times;
                </button>
            </span>
            <input
                id="eventsReportingParticipantInput"
                ref="champ"
                v-model="saisie"
                type="text"
                class="rp-participants__saisie"
                placeholder="Nom ou email..."
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="eventsReportingParticipantDropdown"
                :aria-expanded="listeVisible ? 'true' : 'false'"
                :aria-activedescendant="actif >= 0 ? `rp-participant-${actif}` : undefined"
                @input="ouvrir"
                @focus="ouvrir"
                @keydown="clavier"
            />
        </div>
        <ul
            v-show="listeVisible"
            id="eventsReportingParticipantDropdown"
            class="rp-participants__liste"
            role="listbox"
            aria-label="Participants"
        >
            <li
                v-for="(c, i) in suggestions"
                :id="`rp-participant-${i}`"
                :key="c.id"
                role="option"
                :aria-selected="i === actif ? 'true' : 'false'"
                :class="{ 'rp-participants__option--active': i === actif }"
                @click.stop="ajouter(c)"
            >
                <span
                    class="rp-participants__avatar"
                    :style="{ background: avatar(c.prenom, c.nom, libelle(c)).couleur }"
                    >{{ avatar(c.prenom, c.nom).initiales }}</span
                >
                <span>{{ libelle(c) }}</span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.rp-participants {
    position: relative;
}
.rp-participants__cadre {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-height: 36px;
    min-width: 220px;
    max-width: 340px;
    align-items: center;
    background: white;
    cursor: text;
    box-sizing: border-box;
}
.rp-participants__saisie {
    border: none;
    outline: none;
    flex: 1;
    min-width: 80px;
    width: auto;
    padding: 2px 0;
    font-size: 12px;
}
.rp-participants__saisie:focus {
    box-shadow: none;
}
.rp-participants__etiquette {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 15px;
    padding: 2px 8px 2px 2px;
    font-size: 11px;
    white-space: nowrap;
}
.rp-participants__nom {
    color: #333;
}
.rp-participants__retirer {
    border: none;
    background: none;
    padding: 0;
    margin-left: 2px;
    color: #999;
    font-size: 14px;
    font-weight: 400;
    line-height: 1;
    cursor: pointer;
}
.rp-participants__retirer:hover {
    background: none;
    color: #555;
}
.rp-participants__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    flex-shrink: 0;
}
.rp-participants__avatar--petit {
    width: 20px;
    height: 20px;
    font-size: 9px;
}
.rp-participants__liste {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
}
.rp-participants__liste li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid #f5f5f5;
    font-size: 13px;
}
.rp-participants__liste li:hover,
.rp-participants__option--active {
    background: #f5f5f5;
}
</style>
