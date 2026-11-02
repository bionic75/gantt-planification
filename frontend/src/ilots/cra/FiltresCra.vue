<!-- Filtres d'une liste de CRA (expert, mois, année) et bouton « Rechercher » ; identifiants des listes préfixés
     (ex. « craSignFilter » → craSignFilterExpert, craSignFilterMois, craSignFilterAnnee) -->
<script setup lang="ts">
import type { ExpertCra } from '@/api/cra';
import { annees, MOIS } from './administration';

defineProps<{ prefixe: string; experts: ExpertCra[]; teinte: 'vert' | 'gris'; compact?: boolean }>();
const filtres = defineModel<{ user_id: string; mois: string; annee: string }>({ required: true });
const emit = defineEmits<{ rechercher: [] }>();
const listeAnnees = annees();
</script>

<template>
    <div class="cra-filtres" :class="{ 'cra-filtres--compact': compact }">
        <div>
            <label :for="`${prefixe}Expert`" class="cra-filtres__libelle">Expert</label>
            <select :id="`${prefixe}Expert`" v-model="filtres.user_id" class="cra-filtres__expert">
                <option value="">Tous les experts</option>
                <option v-for="e in experts" :key="e.user_id" :value="String(e.user_id)">
                    {{ (e.nom || '').toUpperCase() }} {{ e.prenom || '' }}
                </option>
            </select>
        </div>
        <div>
            <label :for="`${prefixe}Mois`" class="cra-filtres__libelle">Mois</label>
            <select :id="`${prefixe}Mois`" v-model="filtres.mois" class="cra-filtres__mois">
                <option value="">Tous</option>
                <option v-for="(m, i) in MOIS" :key="m" :value="String(i + 1)">{{ m }}</option>
            </select>
        </div>
        <div>
            <label :for="`${prefixe}Annee`" class="cra-filtres__libelle">Année</label>
            <select :id="`${prefixe}Annee`" v-model="filtres.annee" class="cra-filtres__annee">
                <option value="">Toutes</option>
                <option v-for="a in listeAnnees" :key="a" :value="String(a)">{{ a }}</option>
            </select>
        </div>
        <button
            type="button"
            class="cra-filtres__rechercher"
            :class="`cra-filtres__rechercher--${teinte}`"
            @click="emit('rechercher')"
        >
            🔍 Rechercher
        </button>
    </div>
</template>

<style scoped>
.cra-filtres {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    align-items: flex-end;
}
.cra-filtres--compact {
    gap: 12px;
    margin-bottom: 10px;
}
.cra-filtres__libelle {
    font-size: 12px;
    color: #555;
    font-weight: normal;
}
.cra-filtres--compact .cra-filtres__libelle {
    font-size: 11px;
    display: block;
    margin-bottom: 3px;
}
.cra-filtres__expert {
    width: 200px;
}
.cra-filtres__mois {
    width: 130px;
}
.cra-filtres__annee {
    width: 100px;
}
.cra-filtres--compact select {
    width: auto;
    font-size: 12px;
    padding: 4px;
    border: 1px solid #ccc;
    border-radius: 4px;
}
.cra-filtres--compact .cra-filtres__expert {
    width: 200px;
}
.cra-filtres__rechercher,
.cra-filtres__rechercher:hover {
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.cra-filtres--compact .cra-filtres__rechercher {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: normal;
}
.cra-filtres__rechercher--vert,
.cra-filtres__rechercher--vert:hover {
    background: #2e7d32;
}
.cra-filtres__rechercher--gris,
.cra-filtres__rechercher--gris:hover {
    background: #546e7a;
}
</style>
