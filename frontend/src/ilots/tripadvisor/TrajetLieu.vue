<!-- Trajet du lieu jusqu'à son SAMU-SAS : durée et distance par mode, parcours du mode choisi tracé sur la carte -->
<script setup lang="ts">
import { computed } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import { distanceTrajet, duree, LISTE_MODES, MODES_TRAJET, pluriel } from './format';
import { useLieuxStore } from './magasin';

const lieux = useLieuxStore();
const t = computed(() => lieux.trajet);
const choisi = computed(() => (t.value?.donnees && t.value.mode ? t.value.donnees.modes[t.value.mode] : null));
</script>

<template>
    <div v-if="t" class="tr-trajet">
        <AppAlert v-if="t.erreur" type="error" small :description="t.erreur" />
        <span v-else-if="!t.donnees" class="tr-meta">
            Calcul des trajets… (à pied, voiture, transports en commun)
        </span>
        <template v-else>
            <div class="tr-trajet__aide">
                Du lieu jusqu'au <b>SAMU-SAS {{ t.donnees.samu }}</b> — choisissez un mode pour tracer le parcours sur
                la carte :
            </div>
            <div class="tr-trajet__modes">
                <button
                    v-for="m in LISTE_MODES"
                    :key="m"
                    type="button"
                    class="tr-trajet__mode"
                    :class="[`tr-trajet__mode--${m}`, { 'tr-trajet__mode--choisi': t.mode === m }]"
                    :disabled="!!t.donnees.modes[m]?.error"
                    :aria-pressed="t.mode === m ? 'true' : 'false'"
                    :title="t.donnees.modes[m]?.error || ''"
                    @click="lieux.choisirMode(m)"
                >
                    {{ MODES_TRAJET[m].emoji }} {{ MODES_TRAJET[m].label }} ·
                    <b>{{ t.donnees.modes[m]?.error ? 'indisponible' : duree(t.donnees.modes[m]?.duration ?? 0) }}</b>
                    <template v-if="!t.donnees.modes[m]?.error">{{
                        distanceTrajet(t.donnees.modes[m]?.distance)
                    }}</template>
                </button>
            </div>
            <div v-if="choisi && t.mode" class="tr-trajet__detail">
                <template v-if="t.mode === 'transit'">
                    <b>{{ choisi.transfers ? pluriel(choisi.transfers, 'correspondance') : 'Direct' }}</b> :
                    <template v-for="(etape, i) in choisi.legs" :key="i">
                        <template v-if="i > 0"> › </template>
                        <template v-if="etape.mode === 'WALK'">🚶 {{ duree(etape.duration) }}</template>
                        <template v-else>
                            <b>{{ etape.line || etape.mode }}</b> {{ etape.from || '' }} → {{ etape.to || '' }} ({{
                                duree(etape.duration)
                            }})
                        </template>
                    </template>
                    <br /><i>Horaires réels au moment de la consultation (Transitous / OpenStreetMap).</i>
                </template>
                <template v-else>
                    Parcours {{ MODES_TRAJET[t.mode].label.toLowerCase() }} calculé avec OpenStreetMap.
                </template>
            </div>
        </template>
    </div>
</template>

<style scoped>
.tr-trajet {
    border-top: 1px dashed var(--gp-bordure-tiretee);
    margin-top: 10px;
    padding-top: 10px;
}
.tr-meta {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
}
.tr-trajet__aide {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
    margin-bottom: 6px;
}
.tr-trajet__modes {
    display: flex;
    gap: var(--gp-espace-2);
    flex-wrap: wrap;
}
.tr-trajet__mode {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px var(--gp-espace-3);
    border: 1px solid var(--gp-bordure);
    border-radius: var(--gp-rayon-1);
    background: var(--gp-fond);
    color: var(--gp-texte);
    font-size: var(--gp-police-s);
    font-weight: 600;
    cursor: pointer;
}
.tr-trajet__mode:disabled {
    opacity: 0.55;
    cursor: default;
}
.tr-trajet__mode--choisi {
    color: #fff;
}
.tr-trajet__mode--walk.tr-trajet__mode--choisi {
    background: var(--gp-trajet-walk);
    border-color: var(--gp-trajet-walk);
}
.tr-trajet__mode--car.tr-trajet__mode--choisi {
    background: var(--gp-trajet-car);
    border-color: var(--gp-trajet-car);
}
.tr-trajet__mode--transit.tr-trajet__mode--choisi {
    background: var(--gp-trajet-transit);
    border-color: var(--gp-trajet-transit);
}
.tr-trajet__detail {
    margin-top: var(--gp-espace-2);
    font-size: var(--gp-police-s);
    color: var(--gp-texte-action);
}
</style>
