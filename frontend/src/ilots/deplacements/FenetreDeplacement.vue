<!-- Modification d'un déplacement : AMOA CED, dates, SAMU, ville, bon de commande, commentaire -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AmoaCed, BonCommande, Deplacement } from '@/api/deplacements';
import AppModal from '@/composants/AppModal.vue';
import { LISTE_SAMU } from '@/composants/samu';
import { bonsModifiables, libelleBon, type SaisieDeplacement } from './calculs';

const props = defineProps<{
    deplacement: Deplacement | null;
    amoaCed: AmoaCed[];
    bons: BonCommande[];
    admin: boolean;
}>();
const emit = defineEmits<{ fermer: []; enregistrer: [saisie: SaisieDeplacement] }>();

const saisie = ref<SaisieDeplacement>({ amoa: '', debut: '', fin: '', samu: '', ville: '', bon: '', commentaire: '' });

watch(
    () => props.deplacement,
    d => {
        if (!d) return;
        saisie.value = {
            amoa: d.amoa_ced_id ? String(d.amoa_ced_id) : '',
            debut: d.date_debut,
            fin: d.date_fin,
            samu: d.samu,
            ville: d.ville,
            bon: d.bon_commande_id ? String(d.bon_commande_id) : '',
            commentaire: d.commentaire || ''
        };
    },
    { immediate: true }
);

const bonsProposes = computed(() =>
    bonsModifiables(props.bons, props.admin, props.deplacement?.bon_commande_id ?? null)
);
</script>

<template>
    <AppModal
        id="editDeplacementModal"
        :opened="!!deplacement"
        title="✏️ Modifier le déplacement"
        class="dep-modif"
        @close="emit('fermer')"
    >
        <div class="dep-modif__champ">
            <label for="editDeplacementAmoaCed">AMOA CED *</label>
            <select id="editDeplacementAmoaCed" v-model="saisie.amoa">
                <option value="">-- Sélectionner --</option>
                <option v-for="u in amoaCed" :key="u.id" :value="String(u.id)">
                    {{ u.nom.toUpperCase() }} {{ u.prenom }}
                </option>
            </select>
        </div>
        <div class="dep-modif__ligne">
            <div class="dep-modif__champ">
                <label for="editDeplacementDateDebut">Date de début *</label>
                <input id="editDeplacementDateDebut" v-model="saisie.debut" type="date" />
            </div>
            <div class="dep-modif__champ">
                <label for="editDeplacementDateFin">Date de fin *</label>
                <input id="editDeplacementDateFin" v-model="saisie.fin" type="date" />
            </div>
        </div>
        <div class="dep-modif__ligne">
            <div class="dep-modif__champ">
                <label for="editDeplacementSamu">SAMU *</label>
                <select id="editDeplacementSamu" v-model="saisie.samu">
                    <option value="">-- Sélectionner --</option>
                    <option v-for="s in LISTE_SAMU" :key="s" :value="s">{{ s }}</option>
                </select>
            </div>
            <div class="dep-modif__champ">
                <label for="editDeplacementVille">Ville *</label>
                <input
                    id="editDeplacementVille"
                    :value="saisie.ville"
                    type="text"
                    class="dep-modif__majuscules"
                    @input="saisie.ville = ($event.target as HTMLInputElement).value.toUpperCase()"
                />
            </div>
        </div>
        <div class="dep-modif__champ">
            <label for="editDeplacementBonCommande">Bon de commande *</label>
            <select id="editDeplacementBonCommande" v-model="saisie.bon" size="5">
                <option value="">-- Sélectionner --</option>
                <option v-for="b in bonsProposes" :key="b.id" :value="String(b.id)">{{ libelleBon(b, true) }}</option>
            </select>
        </div>
        <div class="dep-modif__champ">
            <label for="editDeplacementCommentaire">Commentaire</label>
            <textarea
                id="editDeplacementCommentaire"
                v-model="saisie.commentaire"
                placeholder="Commentaire optionnel..."
                rows="5"
            ></textarea>
        </div>
        <template #footer>
            <button type="button" class="dep-modif__enregistrer" @click="emit('enregistrer', { ...saisie })">
                ✅ Enregistrer
            </button>
            <button type="button" class="dep-modif__annuler" @click="emit('fermer')">❌ Annuler</button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.dep-modif .gp-modale__boite {
    width: min(600px, 100%);
}
.dep-modif__ligne {
    display: flex;
    gap: 15px;
}
.dep-modif__ligne > .dep-modif__champ {
    flex: 1;
}
.dep-modif__champ {
    margin-bottom: 15px;
}
.dep-modif__champ label {
    font-weight: bold;
    color: #2c3e50;
    margin-bottom: 5px;
    display: block;
}
.dep-modif__champ input,
.dep-modif__champ select,
.dep-modif__champ textarea {
    width: 100%;
    padding: 10px;
    font-size: 14px;
    box-sizing: border-box;
}
.dep-modif__champ textarea {
    resize: vertical;
    border: 1px solid #ddd;
    border-radius: 4px;
}
.dep-modif__majuscules {
    text-transform: uppercase;
}
.dep-modif__enregistrer,
.dep-modif__annuler {
    padding: 12px 25px;
    font-size: 14px;
}
.dep-modif__annuler {
    background-color: #95a5a6;
}
</style>
