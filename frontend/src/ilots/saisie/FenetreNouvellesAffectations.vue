<!-- Nouvelles affectations de l'expert (pastille de la photo de profil) : affectations notifiées depuis la dernière
     connexion, marquées lues à l'ouverture ; à la fermeture, l'ancien code relit la pastille. -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiNotifications, type NotificationExpert } from '@/api/notifications';
import AppModal from '@/composants/AppModal.vue';
import { surDemande } from '@/ilots/fenetres';
import { emettre } from '@/liaison';

const ouverte = ref(false);
const notifications = ref<NotificationExpert[]>([]);

surDemande(() => void ouvrir());

/** Notifications marquées lues avant et après l'affichage (comme l'ancien écran) */
async function ouvrir() {
    try {
        const { notifications: liste } = await apiNotifications.nouvellesAffectations();
        await marquerLues();
        notifications.value = liste;
        ouverte.value = true;
        await marquerLues();
    } catch {
        // Fenêtre non ouverte
    }
}

async function marquerLues() {
    try {
        await apiNotifications.marquerLues();
    } catch {
        // Relu à la prochaine ouverture
    }
}

function fermer() {
    ouverte.value = false;
    emettre('notifications-lues');
}

/** Date AAAA-MM-JJ → JJ/MM/AAAA */
const dateFr = (date: string) => {
    const [a, m, j] = date.split('-').map(Number) as [number, number, number];
    return new Date(a, m - 1, j).toLocaleDateString('fr-FR');
};
</script>

<template>
    <AppModal
        id="newAssignmentsModal"
        :opened="ouverte"
        title="🔔 Nouvelles affectations depuis votre dernière connexion"
        class="gp-nouvelles"
        @close="fermer"
    >
        <div id="newAssignmentsContent" class="gp-nouvelles__contenu">
            <p v-if="notifications.length === 0" class="gp-nouvelles__vide">Aucune nouvelle affectation</p>
            <table v-else class="gp-nouvelles__table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Période</th>
                        <th>Affectation</th>
                        <th>Localisation</th>
                        <th>Auteur</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="n in notifications" :key="n.id">
                        <td>{{ dateFr(n.date) }}</td>
                        <td>{{ n.period }}</td>
                        <td>{{ n.activity_name || 'Non défini' }}</td>
                        <td>{{ n.localisation || '-' }}</td>
                        <td>{{ n.requester_name || 'Système' }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </AppModal>
</template>

<style>
/* Fenêtre téléportée hors du composant : règles ciblées par sa classe */
.gp-modale.gp-nouvelles .gp-modale__boite {
    width: min(800px, 100%);
}
.gp-modale.gp-nouvelles .gp-modale__titre {
    color: #2c3e50;
    font-size: 1.5em;
}
.gp-nouvelles__contenu {
    margin-top: 20px;
}
.gp-nouvelles__vide {
    text-align: center;
    color: #7f8c8d;
}
.gp-nouvelles__table {
    width: 100%;
    border-collapse: collapse;
}
.gp-nouvelles__table th {
    background-color: #34495e;
    color: white;
    padding: 10px;
    border: 1px solid #bdc3c7;
}
.gp-nouvelles__table td {
    padding: 8px;
    border: 1px solid #bdc3c7;
    background-color: white;
}
</style>
