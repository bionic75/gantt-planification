<!-- Cadre de la session (monté pendant la session dans #cadreConnectes) : relecture des connectés, messages reçus du
     serveur, conversations restaurées, décompte d'inactivité et réveil du poste, pour toutes les applications ; liste des
     connectés, conversations et fenêtre de l'échéance. Fin de la session : conversations effacées. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { ecouter } from '@/liaison';
import BulleConnectes from './BulleConnectes.vue';
import { useDiscussionsStore } from './discussions';
import FenetreInactivite from './FenetreInactivite.vue';
import FenetresDiscussion from './FenetresDiscussion.vue';
import { useInactiviteStore } from './inactivite';
import { useConnectesStore } from './magasin';

const connectes = useConnectesStore();
const discussions = useDiscussionsStore();
const inactivite = useInactiviteStore();

const arrets = [
    // Paramétrage de l'inactivité enregistré dans l'administration (version : paramètres relus, comme l'ancien code)
    ecouter('inactivite-modifiee', d => (d.active ? inactivite.demarrer(d.minutes) : inactivite.arreter())),
    ecouter('version-modifiee', () => void inactivite.configurer())
];

onMounted(() => {
    connectes.suivre();
    discussions.restaurer();
    discussions.ecouterServeur();
    void inactivite.configurer();
    inactivite.surveillerReveil();
});
onBeforeUnmount(() => {
    arrets.forEach(a => a());
    connectes.arreter();
    connectes.fermerBulle();
    discussions.arreterServeur();
    // Démontage à la fin de la session seulement (cadre) : conversations et historiques effacés
    discussions.toutFermer();
    inactivite.arreter();
    inactivite.arreterReveil();
});
</script>

<template>
    <Teleport to="body">
        <BulleConnectes />
        <FenetresDiscussion />
    </Teleport>
    <FenetreInactivite />
</template>
