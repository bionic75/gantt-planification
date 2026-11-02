<!-- Onglet CRA, administrateur : CRA doublement visés en attente de diffusion (bloc affiché s'il y en a), avec leur
     visualisation et la fenêtre de diffusion ; jamais dans « CRA signés » -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { apiCra, type CraListe } from '@/api/cra';
import { dateCourte } from './administration';
import { libelleMois } from './calculs';
import { useCraStore } from './magasin';

const magasin = useCraStore();
const lignes = ref<CraListe[]>([]);

async function charger() {
    try {
        const d = await apiCra.liste({ statut: 'vise_n2' });
        lignes.value = Array.isArray(d) ? d : [];
    } catch (e) {
        console.error('Erreur chargement CRA à diffuser:', e);
    }
}
onMounted(charger);
watch(() => magasin.version, charger);
</script>

<template>
    <div v-if="lignes.length" id="craToDiffuseBox" class="cra-a-diffuser">
        <h3 class="cra-a-diffuser__titre">
            📤 CRA en attente de diffusion
            <span id="craToDiffuseCount" class="cra-a-diffuser__nombre">({{ lignes.length }})</span>
        </h3>
        <div id="craToDiffuseList">
            <div v-for="c in lignes" :key="c.id" class="cra-a-diffuser__ligne">
                <b class="cra-a-diffuser__expert">{{ c.expert_nom || '—' }}</b>
                <span class="cra-a-diffuser__mois">{{ libelleMois(c.mois, c.annee) }}</span>
                <span class="cra-a-diffuser__visas"
                    >Visé N1 : {{ c.vise_n1_nom || '—' }} ({{ dateCourte(c.vise_n1_at) }}) · Visé N2 :
                    {{ c.vise_n2_nom || '—' }} ({{ dateCourte(c.vise_n2_at) }})</span
                >
                <button type="button" class="cra-a-diffuser__voir" @click="magasin.visualise = c.id">Voir</button>
                <button type="button" class="cra-a-diffuser__diffuser" @click="magasin.diffuse = c.id">
                    📤 CRA à diffuser
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cra-a-diffuser {
    background: #fff3e0;
    border: 1px solid #ffb74d;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 16px;
}
.cra-a-diffuser__titre {
    color: #e65100;
    margin: 0 0 10px;
    font-size: 15px;
}
.cra-a-diffuser__nombre {
    font-weight: normal;
    font-size: 12px;
}
.cra-a-diffuser__ligne {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 8px 10px;
    background: #fff;
    border: 1px solid #ffe0b2;
    border-radius: 6px;
    margin-bottom: 6px;
    font-size: 13px;
}
.cra-a-diffuser__expert {
    min-width: 180px;
}
.cra-a-diffuser__mois {
    min-width: 120px;
}
.cra-a-diffuser__visas {
    color: #555;
    flex: 1;
}
.cra-a-diffuser__voir,
.cra-a-diffuser__voir:hover,
.cra-a-diffuser__diffuser,
.cra-a-diffuser__diffuser:hover {
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.cra-a-diffuser__voir,
.cra-a-diffuser__voir:hover {
    font-size: 12px;
    padding: 5px 12px;
    background: #6a1b9a;
}
.cra-a-diffuser__diffuser,
.cra-a-diffuser__diffuser:hover {
    font-size: 13px;
    padding: 6px 16px;
    background: #e65100;
    font-weight: bold;
}
</style>
