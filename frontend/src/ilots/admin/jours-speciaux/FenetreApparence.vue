<!-- Apparence des dates d'un fichier sur le planning : libellé, couleurs de fond, de texte et de bordure, aperçu ;
     à l'import (nom du fichier, préréglages) ou en modification d'un fichier existant -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ApparenceDates } from '@/api/joursSpeciaux';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { PREREGLAGES } from './ics';

const props = defineProps<{
    /** Fenêtre ouverte : apparence de départ */
    initiale: ApparenceDates | null;
    /** Import : nom du fichier choisi ; absent en modification */
    fichier?: string;
    /** Préfixe des identifiants des champs (specialDates à l'import, editSpecialDates en modification) */
    prefixe: 'specialDates' | 'editSpecialDates';
    erreur?: string;
}>();
const emit = defineEmits<{ valider: [a: ApparenceDates]; fermer: [] }>();

const a = ref<ApparenceDates>({ label: '', bgColor: '', textColor: '', borderColor: '' });
watch(
    () => props.initiale,
    i => {
        if (i) a.value = { ...i };
    },
    { immediate: true }
);

function prereglage(p: (typeof PREREGLAGES)[number]) {
    a.value = { ...a.value, bgColor: p.bgColor, textColor: p.textColor, borderColor: p.borderColor };
}

const id = (champ: string) => `${props.prefixe}${champ}`;
</script>

<template>
    <AppModal
        :id="prefixe === 'specialDates' ? 'specialDatesConfigModal' : 'editSpecialDatesModal'"
        :opened="!!initiale"
        :title="fichier !== undefined ? '📅 Configuration du fichier ICS' : '✏️ Modifier l\'apparence'"
        class="apparence"
        @close="emit('fermer')"
    >
        <p v-if="fichier !== undefined" class="apparence__aide">
            Configurez l'apparence des dates de ce fichier sur le planning.
        </p>
        <div v-if="fichier !== undefined" class="apparence__groupe">
            <span class="apparence__libelle">Fichier sélectionné :</span>
            <div id="specialDatesFileName" class="apparence__fichier">{{ fichier || '-' }}</div>
        </div>
        <div class="apparence__groupe">
            <label :for="id('Label')" class="apparence__libelle">Libellé :</label>
            <input
                :id="id('Label')"
                v-model="a.label"
                type="text"
                :placeholder="fichier !== undefined ? 'Ex: JF, Férié, Événement' : undefined"
                class="apparence__champ"
            />
            <div v-if="fichier !== undefined" class="apparence__note">
                Ce texte sera affiché dans le cartouche sur le planning
            </div>
        </div>
        <div class="apparence__couleurs">
            <div>
                <label :for="id('BgColor')" class="apparence__libelle">Couleur de fond :</label>
                <input :id="id('BgColor')" v-model="a.bgColor" type="color" class="apparence__couleur" />
            </div>
            <div>
                <label :for="id('TextColor')" class="apparence__libelle">Couleur du texte :</label>
                <input :id="id('TextColor')" v-model="a.textColor" type="color" class="apparence__couleur" />
            </div>
            <div>
                <label :for="id('BorderColor')" class="apparence__libelle">Couleur bordure :</label>
                <input :id="id('BorderColor')" v-model="a.borderColor" type="color" class="apparence__couleur" />
            </div>
        </div>
        <div class="apparence__groupe apparence__groupe--large">
            <span class="apparence__libelle">Prévisualisation :</span>
            <div class="apparence__apercu">
                <!-- Couleurs choisies par l'administrateur -->
                <span
                    :id="id('Preview')"
                    class="apparence__cartouche"
                    :style="{ backgroundColor: a.bgColor, color: a.textColor, borderColor: a.borderColor }"
                >
                    {{ a.label || 'JF' }}
                </span>
            </div>
        </div>
        <div v-if="fichier !== undefined" class="apparence__groupe apparence__groupe--large">
            <span class="apparence__libelle">Présets rapides :</span>
            <div class="apparence__prereglages">
                <button
                    v-for="p in PREREGLAGES"
                    :key="p.nom"
                    type="button"
                    class="apparence__prereglage"
                    :style="{ background: p.bgColor, color: p.textColor, borderColor: p.borderColor }"
                    @click="prereglage(p)"
                >
                    {{ p.nom }}
                </button>
            </div>
        </div>
        <AppAlert v-if="erreur" type="error" :description="erreur" />
        <template #footer>
            <button type="button" class="apparence__valider" @click="emit('valider', { ...a, label: a.label || 'JF' })">
                {{ fichier !== undefined ? '✅ Importer avec cette configuration' : '💾 Enregistrer' }}
            </button>
            <button type="button" class="apparence__annuler" @click="emit('fermer')">Annuler</button>
        </template>
    </AppModal>
</template>

<style scoped>
.apparence__aide {
    font-size: 12px;
    color: #666;
    margin: 15px 0;
}
.apparence__groupe {
    margin-bottom: 15px;
}
.apparence__groupe--large {
    margin-bottom: 20px;
}
.apparence__libelle {
    display: block;
    font-size: 12px;
    font-weight: bold;
    color: #333;
}
.apparence__fichier {
    font-size: 14px;
    color: #e65100;
    margin-top: 5px;
}
.apparence__champ {
    width: 100%;
    padding: 8px;
    margin-top: 5px;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box;
}
.apparence__note {
    font-size: 10px;
    color: #999;
    margin-top: 2px;
}
.apparence__couleurs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
    margin-bottom: 20px;
}
.apparence__couleur {
    width: 100%;
    height: 40px;
    margin-top: 5px;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
}
.apparence__apercu {
    margin-top: 10px;
    padding: 20px;
    background: #f5f5f5;
    border-radius: 4px;
    text-align: center;
}
.apparence__cartouche {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    border: 2px solid;
}
.apparence__prereglages {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
}
.apparence__prereglage {
    padding: 5px 10px;
    border: 2px solid;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
}
.apparence__valider,
.apparence__valider:hover {
    background-color: #4caf50;
    color: white;
    padding: 10px 20px;
}
.apparence__annuler,
.apparence__annuler:hover {
    background-color: #95a5a6;
    color: white;
    padding: 10px 20px;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.apparence .gp-modale__boite {
    width: min(500px, 100%);
}
.gp-modale.apparence .gp-modale__titre {
    color: #e65100;
}
</style>
