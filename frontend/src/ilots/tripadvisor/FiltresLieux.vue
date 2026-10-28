<!-- Filtres : SAMU-SAS, typologie (avec nombre de lieux), créateur, recherche, réinitialisation -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Categorie } from '@/api/poi';
import AppButton from '@/composants/AppButton.vue';
import AppInput from '@/composants/AppInput.vue';
import AppSelect from '@/composants/AppSelect.vue';
import AppTag from '@/composants/AppTag.vue';
import { CATEGORIES, LISTE_CATEGORIES } from './format';
import { useLieuxStore } from './magasin';

const lieux = useLieuxStore();

const samus = computed(() =>
    (lieux.meta?.locations ?? []).map(l => ({
        value: l.id,
        text: `${l.libelle_court}${l.n_poi ? ` (${l.n_poi})` : ''}`
    }))
);
const createurs = computed(() => (lieux.meta?.creators ?? []).map(c => ({ value: c.id, text: c.name })));
const choisirCategorie = (c: Categorie | '') => void lieux.filtrer('cat', c);
</script>

<template>
    <div class="tr-filtres">
        <AppSelect
            select-id="trLoc"
            label="SAMU-SAS"
            default-unselected-text="— Tous les SAMU-SAS —"
            :options="samus"
            :model-value="lieux.filtres.loc"
            @update:model-value="v => lieux.filtrer('loc', v)"
        />
        <div role="group" aria-labelledby="trCatLibelle">
            <span id="trCatLibelle" class="gp-champ__libelle">Typologie</span>
            <div class="tr-categories">
                <AppTag
                    selectable
                    small
                    :label="`Tout (${lieux.compteurs.total})`"
                    :selected="!lieux.filtres.cat"
                    @select="choisirCategorie('')"
                />
                <AppTag
                    v-for="c in LISTE_CATEGORIES"
                    :key="c"
                    selectable
                    small
                    :icon="CATEGORIES[c].icone"
                    :label="`${CATEGORIES[c].label} (${lieux.compteurs.parCategorie[c]})`"
                    :couleur="`var(--gp-cat-${c})`"
                    :selected="lieux.filtres.cat === c"
                    @select="choisirCategorie(c)"
                />
            </div>
        </div>
        <AppSelect
            select-id="trCreator"
            label="Créateur"
            default-unselected-text="— Tous les créateurs —"
            :options="createurs"
            :model-value="lieux.filtres.creator"
            @update:model-value="v => lieux.filtrer('creator', v)"
        />
        <AppInput
            id="trQ"
            type="search"
            label="Recherche"
            placeholder="Nom, adresse, commentaire…"
            :model-value="lieux.filtres.q"
            @update:model-value="lieux.rechercher"
        />
        <div class="tr-filtres__action">
            <AppButton secondary title="Effacer les filtres" @click="lieux.reinitialiser()">↺ Réinitialiser</AppButton>
        </div>
    </div>
</template>

<style scoped>
.tr-filtres {
    display: grid;
    grid-template-columns: 1.3fr 1.6fr 1.1fr 1.3fr auto;
    gap: 10px;
    align-items: end;
    background: var(--gp-fond);
    border: 1px solid var(--gp-bordure-carte);
    border-radius: var(--gp-rayon-2);
    padding: var(--gp-espace-3);
    margin-bottom: var(--gp-espace-3);
}
.tr-categories {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
@media (max-width: 1000px) {
    .tr-filtres {
        grid-template-columns: 1fr 1fr;
    }
}
@media (max-width: 560px) {
    .tr-filtres {
        grid-template-columns: 1fr;
    }
}
</style>
