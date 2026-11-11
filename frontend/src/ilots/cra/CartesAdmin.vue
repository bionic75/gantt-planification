<!-- Onglet CRA, profil administrateur : « CRA en cours de traitement » de tous les experts (les CRA en attente de
     diffusion figurent dans leur propre bloc), archivage d'un CRA -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiCra, type Cra } from '@/api/cra';
import AppAlert from '@/composants/AppAlert.vue';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/evenements';
import CarteCra from './CarteCra.vue';
import { enCoursAdmin } from './calculs';
import { useCraStore } from './magasin';
import SectionCra from './SectionCra.vue';

const magasin = useCraStore();
const confirmer = useConfirmation();

const cartes = computed(() => enCoursAdmin(magasin.cras));
const erreur = ref('');

async function archiver(cra: Cra) {
    erreur.value = '';
    if (!(await confirmer('Archiver ce CRA ?', 'Confirmer', { danger: false }))) return;
    try {
        if ((await apiCra.archiver(cra.id)).success) {
            await magasin.rafraichir();
            emettre('cra-modifies');
        }
    } catch {
        erreur.value = 'Erreur archivage CRA';
    }
}
</script>

<template>
    <SectionCra titre="📋 CRA en cours de traitement" teinte="orange" ouverte>
        <AppAlert v-if="erreur" type="error" :description="erreur" />
        <div id="craAdminEnCours">
            <p v-if="!magasin.charge" class="cra-admin__attente">⏳ Chargement...</p>
            <template v-else-if="cartes.length">
                <CarteCra
                    v-for="c in cartes"
                    :key="c.id"
                    :cra="c"
                    teinte="orange"
                    avec-expert
                    archivable
                    @ouvrir="magasin.ouvrir(c.id)"
                    @archiver="archiver(c)"
                />
            </template>
            <p v-else class="cra-admin__vide">Aucun CRA en cours de traitement.</p>
        </div>
    </SectionCra>
</template>

<style scoped>
.cra-admin__attente,
.cra-admin__vide {
    color: #999;
    text-align: center;
    padding: 15px;
    margin: 0;
}
.cra-admin__attente {
    padding: 20px;
}
</style>
