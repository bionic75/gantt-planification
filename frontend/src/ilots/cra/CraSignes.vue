<!-- Onglet CRA : « CRA signés » (CRA diffusés), filtres expert / mois / année ; archivage par l'administrateur,
     consultation seule pour le profil RH. Liste relue à chaque ouverture de l'onglet et après un traitement. -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { apiCra, type CraListe, type ExpertCra } from '@/api/cra';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/liaison';
import FiltresCra from './FiltresCra.vue';
import { useCraStore } from './magasin';
import SectionCra from './SectionCra.vue';
import TableauCra from './TableauCra.vue';

const props = defineProps<{ rh?: boolean }>();
const magasin = useCraStore();
const confirmer = useConfirmation();

const experts = ref<ExpertCra[]>([]);
const filtres = ref({ user_id: '', mois: '', annee: '' });
const lignes = ref<CraListe[] | null>(null);

async function chargerExperts() {
    try {
        experts.value = await apiCra.experts();
    } catch (e) {
        console.error('Erreur chargement experts CRA:', e);
    }
}

/** « CRA signés » = CRA diffusés uniquement : un CRA en cours ou en attente de diffusion n'y figure pas */
async function rechercher() {
    try {
        lignes.value = await apiCra.liste({ statut: 'diffuse', ...filtres.value });
    } catch (e) {
        console.error('Erreur chargement CRA signés:', e);
    }
}

onMounted(() => {
    void chargerExperts();
    void rechercher();
});
watch(
    () => magasin.version,
    () => {
        void chargerExperts();
        void rechercher();
    }
);

async function archiver(c: CraListe) {
    magasin.messageAdmin = null;
    const ok = await confirmer(
        `Archiver le CRA de ${c.expert_nom} ?\n\nLe CRA sera déplacé dans la section "Archives CRA" et retiré de la vue principale.`,
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    try {
        await apiCra.archiver(c.id);
        await magasin.rafraichir();
        emettre('cra-modifies');
    } catch (e) {
        magasin.messageAdmin = { type: 'error', texte: `Erreur archivage : ${(e as Error).message}` };
    }
}
</script>

<template>
    <SectionCra titre="✅ CRA signés" teinte="vert">
        <FiltresCra
            v-model="filtres"
            :prefixe="props.rh ? 'craRhFilter' : 'craSignFilter'"
            :experts="experts"
            teinte="vert"
            :compact="props.rh"
            @rechercher="rechercher"
        />
        <TableauCra
            :id="props.rh ? 'craRhSignesTable' : 'craSignaturesTable'"
            :lignes="lignes"
            :lecture-seule="props.rh"
            @voir="magasin.visualise = $event"
            @diffuser="magasin.diffuse = $event"
            @statut="(id, bouton) => (magasin.statut = { id, bouton })"
            @archiver="archiver"
        />
    </SectionCra>
</template>
