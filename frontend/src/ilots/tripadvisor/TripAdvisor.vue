<!-- Onglet SAMU-SAS TripAdVisor : bonnes adresses (hébergements, restaurants, bars) autour des SAMU-SAS -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Lieu } from '@/api/poi';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppIcone from '@/composants/AppIcone.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import '@/composants/champs.css';
import { surReouverture } from '@/ilots/activation';
import CarteLieux from './CarteLieux.vue';
import FicheLieu from './FicheLieu.vue';
import FiltresLieux from './FiltresLieux.vue';
import { pluriel } from './format';
import FormulaireLieu from './FormulaireLieu.vue';
import { useLieuxStore } from './magasin';

const lieux = useLieuxStore();
const { demande, repondre } = fournirConfirmation();

/** Fenêtre ouverte : lieu à modifier, ou null pour un ajout */
const formulaire = ref<{ lieu: Lieu | null } | null>(null);

onMounted(() => void lieux.charger());
// Comme à chaque ouverture de l'onglet dans l'ancien code : données rechargées
surReouverture(() => void lieux.charger());
</script>

<template>
    <div class="tr-racine">
        <div class="tr-barre">
            <h2 class="tr-titre">
                <AppIcone name="repere" :scale="1.6" class="tr-titre__icone" />SAMU-SAS TripAdVisor
            </h2>
            <AppButton icon="plus" label="Ajouter un lieu" @click="formulaire = { lieu: null }" />
        </div>
        <p class="tr-intro">
            Les bonnes adresses (hébergements, restaurants, bars) partagées par les équipes autour de chaque SAMU-SAS :
            notez, commentez et ajoutez vos adresses.
        </p>
        <FiltresLieux />
        <div id="trCount" class="tr-compteur" aria-live="polite">{{ pluriel(lieux.lieux.length, 'lieu', 'x') }}</div>
        <div class="tr-grille">
            <CarteLieux />
            <div id="trList" class="tr-liste">
                <AppAlert v-if="lieux.erreur" type="error" :description="lieux.erreur" />
                <template v-else-if="lieux.lieux.length">
                    <FicheLieu
                        v-for="p in lieux.lieux"
                        :key="p.id"
                        :lieu="p"
                        @modifier="l => (formulaire = { lieu: l })"
                        @carte="lieux.centrerSur(p.id)"
                    />
                </template>
                <div v-else class="tr-vide">
                    Aucun lieu pour ces critères.<br />
                    <AppButton
                        icon="plus"
                        label="Ajouter le premier"
                        class="tr-vide__bouton"
                        @click="formulaire = { lieu: null }"
                    />
                </div>
            </div>
        </div>
        <FormulaireLieu v-if="formulaire" :lieu="formulaire.lieu" @close="formulaire = null" />
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </div>
</template>

<style scoped>
.tr-barre {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gp-espace-3);
    flex-wrap: wrap;
    margin-bottom: var(--gp-espace-3);
}
.tr-titre {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}
.tr-titre__icone {
    color: var(--gp-accent);
}
.tr-intro {
    margin: -4px 0 var(--gp-espace-3);
    font-size: var(--gp-police-m);
    color: var(--gp-texte-doux);
}
.tr-compteur {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
    margin-bottom: var(--gp-espace-2);
}
.tr-grille {
    display: grid;
    grid-template-columns: minmax(320px, 5fr) 6fr;
    gap: var(--gp-espace-4);
    align-items: start;
}
.tr-liste {
    display: flex;
    flex-direction: column;
    gap: var(--gp-espace-3);
}
.tr-vide {
    padding: 30px;
    text-align: center;
    color: var(--gp-texte-discret);
    background: var(--gp-fond);
    border: 1px dashed var(--gp-bordure);
    border-radius: var(--gp-rayon-2);
}
.tr-vide__bouton {
    margin-top: 10px;
}
@media (max-width: 1000px) {
    .tr-grille {
        grid-template-columns: 1fr;
    }
}
</style>
