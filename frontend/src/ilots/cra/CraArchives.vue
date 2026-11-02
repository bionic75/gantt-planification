<!-- Onglet CRA : « CRA archivés », chargés à l'ouverture de la section ; désarchivage et suppression (corbeille) par
     l'administrateur, consultation seule pour le profil RH (chargés à la première ouverture seulement) -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiCra, type CraListe, type ExpertCra } from '@/api/cra';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/liaison';
import { libelleMois } from './calculs';
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
const ouverte = ref(false);

async function chargerExperts() {
    try {
        experts.value = await apiCra.experts();
    } catch (e) {
        console.error('Erreur chargement experts CRA:', e);
    }
}

async function rechercher() {
    try {
        lignes.value = await apiCra.archives(filtres.value);
    } catch (e) {
        console.error('Erreur chargement archives CRA:', e);
    }
}

function ouverture() {
    ouverte.value = true;
    // Profil RH : liste chargée à la première ouverture seulement
    if (props.rh && lignes.value) return;
    void chargerExperts();
    void rechercher();
}

// Après un traitement : liste relue si la section est ouverte
watch(
    () => magasin.version,
    () => {
        if (ouverte.value && !props.rh) void rechercher();
    }
);

async function desarchiver(c: CraListe) {
    magasin.messageAdmin = null;
    const ok = await confirmer("Désarchiver ce CRA ? Il retournera dans sa catégorie d'origine.", 'Confirmer', {
        danger: false
    });
    if (!ok) return;
    try {
        if ((await apiCra.desarchiver(c.id)).success) {
            await magasin.rafraichir();
            emettre('cra-modifies');
        }
    } catch {
        magasin.messageAdmin = { type: 'error', texte: 'Erreur désarchivage CRA' };
    }
}

async function supprimer(c: CraListe) {
    magasin.messageAdmin = null;
    const ok = await confirmer(
        `Supprimer le CRA de ${c.expert_nom || ''} — ${libelleMois(c.mois, c.annee)} ?\n\nIl sera déplacé dans "CRA supprimés" et pourra être restauré ou purgé définitivement.`
    );
    if (!ok) return;
    try {
        await apiCra.supprimer(c.id);
        await magasin.rafraichir();
    } catch (e) {
        magasin.messageAdmin = { type: 'error', texte: `Erreur : ${(e as Error).message}` };
    }
}
</script>

<template>
    <SectionCra titre="🗄️ CRA archivés" teinte="gris" @ouverture="ouverture" @fermeture="ouverte = false">
        <FiltresCra
            v-model="filtres"
            :prefixe="props.rh ? 'craRhArchiveFilter' : 'craArchiveFilter'"
            :experts="experts"
            teinte="gris"
            :compact="props.rh"
            @rechercher="rechercher"
        />
        <TableauCra
            :id="props.rh ? 'craRhArchivesTable' : 'craArchivesTable'"
            :lignes="lignes"
            archive
            :lecture-seule="props.rh"
            @voir="magasin.visualise = $event"
            @diffuser="magasin.diffuse = $event"
            @statut="(id, bouton) => (magasin.statut = { id, bouton })"
            @desarchiver="desarchiver"
            @supprimer="supprimer"
        />
    </SectionCra>
</template>
