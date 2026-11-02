<!-- Onglet CRA, profil expert : « Mes CRA en cours de traitement » et « Mes CRA signés » (CRA diffusés) -->
<script setup lang="ts">
import { computed } from 'vue';
import CarteCra from './CarteCra.vue';
import { cartesExpert } from './calculs';
import { useCraStore } from './magasin';
import SectionCra from './SectionCra.vue';

const magasin = useCraStore();
const cartes = computed(() => cartesExpert(magasin.cras));
</script>

<template>
    <div id="craExpertSections" class="cra-expert">
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
