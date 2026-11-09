<!-- Modification d'un bon de commande : numéro, titulaire, dates, UO commandées, soldé -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { BonCommandeSuivi } from '@/api/deplacements';
import AppModal from '@/composants/AppModal.vue';
import type { SaisieBon } from './administration';

const props = defineProps<{ bon: BonCommandeSuivi | null }>();
const emit = defineEmits<{ fermer: []; enregistrer: [saisie: SaisieBon] }>();

const saisie = ref<SaisieBon>({ intitule: '', titulaire: '', debut: '', fin: '', uo: '', solde: false });

watch(
    () => props.bon,
    b => {
        if (!b) return;
        saisie.value = {
            intitule: b.intitule,
            titulaire: b.titulaire || '',
            debut: b.date_debut,
            fin: b.date_fin,
            uo: String(b.uo_commandees ?? ''),
            solde: b.solde === 1
        };
    },
    { immediate: true }
);
</script>

<template>
    <AppModal
        id="editBonCommandeModal"
        :opened="!!bon"
        title="✏️ Modifier le bon de commande"
        class="dep-bon"
        @close="emit('fermer')"
    >
        <div class="dep-bon__ligne">
            <div class="dep-bon__champ">
                <label for="editBcIntitule">📋 Numéro de CBDC *</label>
                <input id="editBcIntitule" v-model="saisie.intitule" type="text" />
            </div>
            <div class="dep-bon__champ">
                <label for="editBcTitulaire">👤 Titulaire *</label>
                <input
                    id="editBcTitulaire"
                    :value="saisie.titulaire"
                    type="text"
                    class="dep-bon__majuscules"
                    @input="saisie.titulaire = ($event.target as HTMLInputElement).value.toUpperCase()"
                />
            </div>
        </div>
        <div class="dep-bon__ligne">
            <div class="dep-bon__champ">
                <label for="editBcDateDebut">📅 Date de début *</label>
                <input id="editBcDateDebut" v-model="saisie.debut" type="date" />
            </div>
            <div class="dep-bon__champ">
                <label for="editBcDateFin">📅 Date de fin *</label>
                <input id="editBcDateFin" v-model="saisie.fin" type="date" />
            </div>
        </div>
        <div class="dep-bon__champ">
            <label for="editBcNbUO">🔢 Nombre d'UO commandées *</label>
            <input id="editBcNbUO" v-model="saisie.uo" type="number" min="1" />
        </div>
        <div class="dep-bon__solde">
            <input id="editBcSolde" v-model="saisie.solde" type="checkbox" class="dep-bon__case" />
            <div>
                <label for="editBcSolde" class="dep-bon__solde-libelle">💰 Bon de commande soldé</label>
                <span class="dep-bon__solde-aide">
                    Si coché, ce bon de commande n'apparaîtra plus dans les listes de sélection pour les nouveaux
                    déplacements
                </span>
            </div>
        </div>
        <template #footer>
            <button type="button" class="dep-bon__enregistrer" @click="emit('enregistrer', { ...saisie })">
                ✅ Enregistrer
            </button>
            <button type="button" class="dep-bon__annuler" @click="emit('fermer')">❌ Annuler</button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.dep-bon .gp-modale__boite {
    width: min(750px, 100%);
}
.dep-bon__ligne {
    display: flex;
    gap: 20px;
}
.dep-bon__ligne > .dep-bon__champ {
    flex: 1;
}
.dep-bon__champ {
    margin-bottom: 20px;
}
.dep-bon__champ label {
    font-weight: bold;
    color: #2c3e50;
    margin-bottom: 8px;
    display: block;
    font-size: 14px;
}
.dep-bon__champ input {
    width: 100%;
    padding: 12px 15px;
    font-size: 15px;
    border: 2px solid #ddd;
    border-radius: 8px;
    box-sizing: border-box;
}
.dep-bon__majuscules {
    text-transform: uppercase;
}
.dep-bon__solde {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 20px;
    margin-bottom: 10px;
    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
    border: 2px solid #ff9800;
    border-radius: 10px;
}
.dep-bon__case {
    width: 24px;
    height: 24px;
    cursor: pointer;
    accent-color: #ff9800;
    flex-shrink: 0;
}
.dep-bon__solde-libelle {
    font-weight: bold;
    color: #e65100;
    cursor: pointer;
    margin: 0;
    font-size: 16px;
    display: block;
}
.dep-bon__solde-aide {
    font-size: 12px;
    color: #666;
    margin-top: 5px;
    display: block;
}
.dep-bon__enregistrer,
.dep-bon__annuler {
    padding: 14px 30px;
    font-size: 15px;
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    font-weight: bold;
}
.dep-bon__enregistrer {
    background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
}
.dep-bon__annuler {
    background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
}
</style>
