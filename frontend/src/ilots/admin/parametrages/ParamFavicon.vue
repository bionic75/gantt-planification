<!-- Icône de l'application : choix parmi quatre vignettes, aperçu d'onglet, enregistrement appliqué à la page -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { emettre } from '@/liaison';
import { FAVICONS, imageFavicon } from './calculs';
import { useParametragesStore } from './magasin';

const store = useParametragesStore();
const choisi = ref('calendrier');
const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);

watch(
    () => store.parametres.favicon,
    f => (choisi.value = f || 'calendrier'),
    { immediate: true }
);

/** Choix au clavier : flèches entre les vignettes (groupe de boutons radio) */
function clavier(e: KeyboardEvent, index: number) {
    const pas =
        e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = FAVICONS[(index + pas + FAVICONS.length) % FAVICONS.length];
    if (!suivant) return;
    choisi.value = suivant.id;
    const cible = (e.currentTarget as HTMLElement).parentElement?.children[FAVICONS.indexOf(suivant)];
    (cible as HTMLElement | undefined)?.focus();
}

async function enregistrer() {
    message.value = null;
    try {
        await store.enregistrer({ favicon: choisi.value });
        emettre('favicon-modifie', { favicon: choisi.value });
        message.value = { type: 'success', texte: '✅ Favicon sauvegardé' };
    } catch {
        message.value = { type: 'error', texte: '❌ Erreur lors de la sauvegarde' };
    }
}
</script>

<template>
    <AppSousSectionAdmin titre="Icône de l'application (favicon)" id-corps="subFavicon">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-5-5L5 21" />
            </svg>
        </template>
        <div class="favicon__ligne">
            <div class="favicon__champ">
                <span id="faviconLibelle" class="favicon__libelle">Icône de l'application (favicon)</span>
                <div id="faviconPicker" role="radiogroup" aria-labelledby="faviconLibelle" class="favicon__choix">
                    <div
                        v-for="(f, i) in FAVICONS"
                        :key="f.id"
                        role="radio"
                        :aria-checked="f.id === choisi ? 'true' : 'false'"
                        :tabindex="f.id === choisi ? 0 : -1"
                        class="favicon__carte"
                        :class="{ 'favicon__carte--choisie': f.id === choisi }"
                        @click="choisi = f.id"
                        @keydown.enter.prevent="choisi = f.id"
                        @keydown.space.prevent="choisi = f.id"
                        @keydown="clavier($event, i)"
                    >
                        <span v-if="f.id === choisi" class="favicon__coche" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13"><path d="m5 12 5 5L20 7" /></svg>
                        </span>
                        <img :src="imageFavicon(f.id)" alt="" width="52" height="52" class="favicon__image" />
                        <div class="favicon__nom">{{ f.libelle }}</div>
                        <div class="favicon__indice">{{ f.indice }}</div>
                    </div>
                </div>
                <div id="faviconTabMock" class="favicon__onglet">
                    <img :src="imageFavicon(choisi)" alt="" width="16" height="16" class="favicon__onglet-image" />
                    Plateforme de Planification
                </div>
            </div>
            <button type="button" class="favicon__bouton" @click="enregistrer">💾 Sauvegarder</button>
        </div>
        <AppAlert v-if="message" :type="message.type" :description="message.texte" />
    </AppSousSectionAdmin>
</template>

<style scoped>
.favicon__ligne {
    display: flex;
    align-items: flex-end;
    gap: 10px;
}
.favicon__champ {
    flex: 1;
}
.favicon__libelle {
    display: block;
    margin-bottom: 5px;
    color: #2c3e50;
    font-weight: bold;
    font-size: 13px;
}
.favicon__choix {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
}
.favicon__carte {
    width: 120px;
    padding: 12px 8px 10px;
    border: 2px solid #d5dae6;
    border-radius: 12px;
    background: #fff;
    text-align: center;
    cursor: pointer;
    position: relative;
    transition: all 0.15s;
}
.favicon__carte--choisie {
    border-color: #3949ab;
    background: #eef0fb;
}
.favicon__carte:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 2px;
}
.favicon__coche {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #3949ab;
    display: flex;
    align-items: center;
    justify-content: center;
}
.favicon__coche svg {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.favicon__image {
    display: block;
    margin: 0 auto 8px;
    border-radius: 12px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
}
.favicon__nom {
    font-size: 13px;
    font-weight: bold;
    color: #2c3e50;
}
.favicon__indice {
    font-size: 10.5px;
    color: #7a8799;
    margin-top: 2px;
}
.favicon__onglet {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 6px 14px 6px 10px;
    background: #dfe3ea;
    border-radius: 8px 8px 0 0;
    font-size: 12px;
    color: #33475b;
}
.favicon__onglet-image {
    border-radius: 4px;
}
.favicon__bouton {
    white-space: nowrap;
}
</style>
