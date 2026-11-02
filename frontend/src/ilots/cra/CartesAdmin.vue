<!-- Onglet CRA, profil administrateur : « CRA en cours de traitement » de tous les experts (les CRA en attente de
     diffusion figurent dans leur propre bloc, servi par l'ancien code), archivage d'un CRA.
     Cartes relues à chaque ouverture de l'onglet et quand l'ancien code lance, désarchive ou restaure un CRA. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiCra, type Cra } from '@/api/cra';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { ecouter, emettre } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import CarteCra from './CarteCra.vue';
import { enCoursAdmin, vueCra } from './calculs';
import { useCraStore } from './magasin';
import SectionCra from './SectionCra.vue';

const magasin = useCraStore();
const session = useSessionStore();
const { demande, repondre, confirmer } = fournirConfirmation();

const admin = computed(() => !!session.session && vueCra(session.session) === 'admin');
const cartes = computed(() => enCoursAdmin(magasin.cras));
const erreur = ref('');

const recharger = () => {
    if (admin.value) void magasin.charger();
};
surReouverture(recharger);
const arreter = ecouter('cra-recharges', recharger);
onBeforeUnmount(arreter);

onMounted(async () => {
    await session.charger().catch(() => null);
    recharger();
});

async function archiver(cra: Cra) {
    erreur.value = '';
    if (!(await confirmer('Archiver ce CRA ?', 'Confirmer', { danger: false }))) return;
    try {
        if ((await apiCra.archiver(cra.id)).success) {
            await magasin.charger();
            emettre('cra-modifies');
        }
    } catch {
        erreur.value = 'Erreur archivage CRA';
    }
}
</script>

<template>
    <template v-if="admin">
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
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            :label-annuler="demande?.labelAnnuler"
            :danger="demande?.danger"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </template>
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
