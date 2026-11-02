<!-- Carte d'un CRA : mois (et expert, pour l'administrateur), viseurs, pastille de statut ; clic : détail du CRA.
     Bouton « Archiver » proposé à l'administrateur (cartes en cours). -->
<script setup lang="ts">
import type { Cra } from '@/api/cra';
import { libelleMois, pastille, viseurs } from './calculs';

defineProps<{ cra: Cra; teinte: 'orange' | 'vert'; avecExpert?: boolean; archivable?: boolean }>();
const emit = defineEmits<{ ouvrir: []; archiver: [] }>();
</script>

<template>
    <div class="cra-carte" :class="`cra-carte--${teinte}`">
        <div
            class="cra-carte__corps"
            role="button"
            tabindex="0"
            @click="emit('ouvrir')"
            @keydown.enter="emit('ouvrir')"
        >
            <strong class="cra-carte__titre"
                >Compte-rendu d'activité de {{ libelleMois(cra.mois, cra.annee)
                }}{{ avecExpert && cra.expert_nom ? ` — ${cra.expert_nom}` : '' }}</strong
            >
            <div class="cra-carte__viseurs">{{ viseurs(cra) }}</div>
        </div>
        <div class="cra-carte__droite">
            <span :key="cra.statut" class="cra-carte__pastille" :class="`cra-pastille--${pastille(cra).cle}`"
                >{{ pastille(cra).icone }} {{ pastille(cra).libelle }}</span
            >
            <button
                v-if="archivable"
                type="button"
                class="cra-carte__archiver"
                title="Archiver ce CRA"
                @click.stop="emit('archiver')"
            >
                🗄️ Archiver
            </button>
        </div>
    </div>
</template>

<style scoped>
.cra-carte {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 20px;
    background: white;
    border-radius: 8px;
    margin-bottom: 10px;
    transition: box-shadow 0.2s;
}
.cra-carte:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.cra-carte--orange {
    border: 1px solid #ffb74d;
}
.cra-carte--vert {
    border: 1px solid #a5d6a7;
}
.cra-carte__corps {
    flex: 1;
    cursor: pointer;
}
.cra-carte__titre {
    font-size: 14px;
    color: #2c3e50;
}
.cra-carte__viseurs {
    font-size: 12px;
    color: #666;
    margin-top: 3px;
}
.cra-carte__droite {
    display: flex;
    align-items: center;
    gap: 8px;
}
.cra-carte__pastille {
    padding: 5px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: bold;
    white-space: nowrap;
}
.cra-pastille--a_completer,
.cra-pastille--modifier {
    background: #ff980022;
    color: #ff9800;
}
.cra-pastille--soumis {
    background: #2196f322;
    color: #2196f3;
}
.cra-pastille--vise_n1 {
    background: #9c27b022;
    color: #9c27b0;
}
.cra-pastille--vise_n2 {
    background: #4caf5022;
    color: #4caf50;
}
.cra-pastille--diffuse {
    background: #607d8b22;
    color: #607d8b;
}
.cra-carte__archiver,
.cra-carte__archiver:hover {
    background: #546e7a;
    color: white;
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
}
</style>
