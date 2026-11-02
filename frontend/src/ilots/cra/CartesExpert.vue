<!-- Onglet CRA, profil expert : « Mes CRA en cours de traitement » et « Mes CRA signés » (CRA diffusés).
     Cartes relues à chaque ouverture de l'onglet. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { surReouverture } from '@/ilots/activation';
import { ecouter } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import CarteCra from './CarteCra.vue';
import { cartesExpert, vueCra } from './calculs';
import { useCraStore } from './magasin';
import SectionCra from './SectionCra.vue';

const magasin = useCraStore();
const session = useSessionStore();

const expert = computed(() => !!session.session && vueCra(session.session) === 'expert');
const cartes = computed(() => cartesExpert(magasin.cras));

const recharger = () => {
    if (expert.value) void magasin.charger();
};
surReouverture(recharger);
const arreter = ecouter('cra-recharges', recharger);
onBeforeUnmount(arreter);

onMounted(async () => {
    await session.charger().catch(() => null);
    recharger();
});
</script>

<template>
    <div v-if="expert" id="craExpertSections" class="cra-expert">
        <SectionCra titre="📋 Mes CRA en cours de traitement" teinte="orange" ouverte>
            <div id="craListEnCours">
                <p v-if="!magasin.charge" class="cra-expert__attente">⏳ Chargement...</p>
                <template v-else-if="cartes.enCours.length">
                    <CarteCra
                        v-for="c in cartes.enCours"
                        :key="c.id"
                        :cra="c"
                        teinte="orange"
                        @ouvrir="magasin.ouvrir(c.id)"
                    />
                </template>
                <p v-else class="cra-expert__vide">Aucun CRA en cours.</p>
            </div>
        </SectionCra>
        <SectionCra titre="✅ Mes CRA signés" teinte="vert">
            <div id="craListSignes">
                <p v-if="!magasin.charge" class="cra-expert__attente">⏳ Chargement...</p>
                <template v-else-if="cartes.signes.length">
                    <CarteCra
                        v-for="c in cartes.signes"
                        :key="c.id"
                        :cra="c"
                        teinte="vert"
                        @ouvrir="magasin.ouvrir(c.id)"
                    />
                </template>
                <p v-else class="cra-expert__vide">Aucun CRA signé.</p>
            </div>
        </SectionCra>
    </div>
</template>

<style scoped>
.cra-expert {
    margin-top: 20px;
}
.cra-expert__attente,
.cra-expert__vide {
    color: #999;
    text-align: center;
    padding: 15px;
    margin: 0;
}
.cra-expert__attente {
    padding: 20px;
}
</style>
