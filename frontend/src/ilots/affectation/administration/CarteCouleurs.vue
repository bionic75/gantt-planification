<!-- Couleur et motif de chaque étape : aperçu immédiat (légende, frises), enregistrement pour tous les projets, couleurs
     par défaut rétablies (à enregistrer) -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiAffectation } from '@/api/affectation';
import { fondEtape, MOTIFS } from './administration';
import CarteAdministration from './CarteAdministration.vue';
import IconeAff from './IconeAff.vue';
import { useAdministrationAffectationStore } from './magasin';

const magasin = useAdministrationAffectationStore();
const message = ref<{ texte: string; classe: string } | null>(null);
const etapes = computed(() => magasin.config?.stages ?? []);

const couleur = (k: string) => magasin.couleurs[k] || '#888888';
const motif = (k: string) => magasin.motifs[k] || 'none';

function choisirCouleur(k: string, v: string) {
    magasin.couleurs = { ...magasin.couleurs, [k]: v };
}
function choisirMotif(k: string, v: string) {
    magasin.motifs = { ...magasin.motifs, [k]: v };
}

async function enregistrer() {
    try {
        const d = await apiAffectation.enregistrerCouleurs(magasin.couleurs, magasin.motifs);
        magasin.couleurs = { ...d.colors };
        magasin.motifs = { ...d.patterns };
        message.value = { texte: 'Couleurs et motifs enregistrés.', classe: 'aff-msg-ok' };
    } catch (e) {
        message.value = { texte: (e as Error).message, classe: 'aff-msg-ko' };
    }
}

function parDefaut() {
    const c = { ...magasin.couleurs };
    const m = { ...magasin.motifs };
    for (const st of etapes.value) {
        c[st.key] = st.defaultColor ?? '#888888';
        m[st.key] = st.defaultPattern || 'none';
    }
    magasin.couleurs = c;
    magasin.motifs = m;
    message.value = {
        texte: 'Couleurs et motifs par défaut rétablis : pensez à enregistrer.',
        classe: 'aff-msg-neutre'
    };
}
</script>

<template>
    <CarteAdministration
        id="affCardColors"
        titre="Paramétrer la couleur des étapes"
        icone="palette"
        sous-titre="S'appliquent à tous les projets"
    >
        <div id="affColors" class="aff-colors">
            <div v-for="st in etapes" :key="st.key" class="aff-color-row">
                <input
                    type="color"
                    :data-key="st.key"
                    :value="couleur(st.key)"
                    title="Couleur"
                    @input="choisirCouleur(st.key, ($event.target as HTMLInputElement).value)"
                />
                <span
                    :id="`affPatPrev_${st.key}`"
                    class="aff-pat-prev"
                    :style="fondEtape(magasin.couleurs, magasin.motifs, st.key)"
                    title="Aperçu"
                ></span>
                <span class="lbl">{{ st.label }}</span>
                <select
                    class="aff-pat-sel"
                    title="Motif"
                    :value="motif(st.key)"
                    @change="choisirMotif(st.key, ($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="[v, l] in MOTIFS" :key="v" :value="v">{{ l }}</option>
                </select>
                <span class="aff-tl-scale aff-tl-scale--type">{{
                    st.kind === 'date' || st.kind === 'milestone' ? 'jalon' : 'période'
                }}</span>
            </div>
        </div>
        <div class="aff-actions">
            <button type="button" class="aff-btn aff-btn-primary" @click="enregistrer">
                <IconeAff nom="save" classe="aff-ico-sm" />Enregistrer les couleurs
            </button>
            <button type="button" class="aff-btn" @click="parDefaut">
                <IconeAff nom="reset" classe="aff-ico-sm" />Couleurs par défaut
            </button>
            <span id="affColorsMsg" class="aff-muted" :class="message?.classe">{{ message?.texte }}</span>
        </div>
    </CarteAdministration>
</template>
