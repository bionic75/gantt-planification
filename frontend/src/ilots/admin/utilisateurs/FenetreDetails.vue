<!-- Détails d'un compte : informations, dernières connexions, modifications de planning, demandes d'affectation ;
     export CSV des journaux et remise à zéro de chacun -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    apiUtilisateurs,
    type ActionCompte,
    type ConnexionsCompte,
    type TypeJournal,
    type Utilisateur
} from '@/api/utilisateurs';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import {
    csvJournaux,
    dateConnexion,
    demandesAffectation,
    MESSAGES_REMISE_A_ZERO,
    modificationsPlanning,
    nomFichierJournaux,
    profilConnexion,
    roles
} from './calculs';
import { useUtilisateursStore } from './magasin';

const props = defineProps<{ utilisateur: Utilisateur | null }>();
const emit = defineEmits<{ fermer: [] }>();
const store = useUtilisateursStore();
const confirmer = useConfirmation();

const connexions = ref<ConnexionsCompte[]>([]);
const actions = ref<ActionCompte[]>([]);
const charge = ref(false);
const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);

/** Journaux du compte (une source indisponible : liste vide, comme l'ancien écran) */
async function charger(u: Utilisateur) {
    const [c, a] = await Promise.all([
        apiUtilisateurs.connexions(u.id).catch(() => ({ rows: [] })),
        apiUtilisateurs.actions(u.id).catch(() => ({ logs: [] }))
    ]);
    connexions.value = c.rows ?? [];
    actions.value = a.logs ?? [];
    charge.value = true;
}

watch(
    () => props.utilisateur,
    u => {
        charge.value = false;
        message.value = null;
        if (u) {
            void store.chargerRessources();
            void charger(u);
        }
    }
);

const modifications = computed(() =>
    props.utilisateur ? modificationsPlanning(props.utilisateur, actions.value, store.ressources) : null
);
const demandes = computed(() =>
    props.utilisateur ? demandesAffectation(props.utilisateur, actions.value, store.ressources) : null
);

function exporter() {
    const u = props.utilisateur;
    if (!u) return;
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(
        new Blob([csvJournaux(u, connexions.value, actions.value)], { type: 'text/csv;charset=utf-8;' })
    );
    lien.download = nomFichierJournaux(u.username);
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
}

async function remiseAZero(type: TypeJournal) {
    const u = props.utilisateur;
    if (!u) return;
    if (!(await confirmer(`${MESSAGES_REMISE_A_ZERO[type]}\n\n⚠️ Cette action est IRRÉVERSIBLE !`))) return;
    try {
        const r = await apiUtilisateurs.remiseAZero(type, u.id);
        message.value = { type: 'success', texte: `✅ ${r.deleted} enregistrement(s) supprimé(s)` };
        await charger(u);
    } catch (e) {
        message.value = { type: 'error', texte: `❌ Erreur lors de la suppression: ${(e as Error).message}` };
    }
}
</script>

<template>
    <AppModal
        id="userDetailsModal"
        :opened="!!utilisateur"
        title="👤 Détails de l'utilisateur"
        class="details"
        @close="emit('fermer')"
    >
        <template v-if="utilisateur">
            <button
                type="button"
                class="details__export"
                title="Télécharger tous les logs de cet utilisateur en CSV"
                @click="exporter"
            >
                📥 Export CSV
            </button>
            <AppAlert v-if="message" :type="message.type" :description="message.texte" />
            <div id="userDetailsContent">
                <div class="details__bloc details__bloc--infos">
                    <h3 class="details__titre">Informations générales</h3>
                    <p><strong>Nom complet:</strong> {{ utilisateur.prenom }} {{ utilisateur.nom }}</p>
                    <p><strong>Login:</strong> {{ utilisateur.username }}</p>
                    <p><strong>Email:</strong> {{ utilisateur.email || '-' }}</p>
                    <p><strong>Téléphone:</strong> {{ utilisateur.telephone || '-' }}</p>
                    <p><strong>Rôles:</strong> {{ roles(utilisateur) }}</p>
                    <p>
                        <strong>Statut:</strong>
                        <span :key="String(utilisateur.actif)">{{
                            utilisateur.actif ? '✅ Actif' : '❌ Inactif'
                        }}</span>
                    </p>
                </div>

                <p v-if="!charge" class="details__vide">Chargement…</p>
                <template v-else>
                    <div class="details__bloc details__bloc--connexions">
                        <div class="details__entete">
                            <h3 class="details__titre">
                                📊 Dernières connexions ({{ Math.min(connexions.length, 10) }})
                            </h3>
                            <button
                                v-if="connexions.length"
                                type="button"
                                class="details__raz"
                                @click="remiseAZero('connexions')"
                            >
                                🗑️ RAZ
                            </button>
                        </div>
                        <table v-if="connexions.length" class="details__tableau details__tableau--connexions">
                            <thead>
                                <tr>
                                    <th>Date et heure</th>
                                    <th>Profil</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(c, i) in connexions.slice(0, 10)" :key="i">
                                    <td>{{ dateConnexion(c) }}</td>
                                    <td>{{ profilConnexion(c.profile) }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-else class="details__vide">Aucune connexion enregistrée</p>
                    </div>

                    <div v-if="modifications" class="details__bloc details__bloc--planning">
                        <div class="details__entete">
                            <h3 class="details__titre details__titre--planning">
                                📝 Dernières modifications de planning ({{ modifications.length }})
                            </h3>
                            <button
                                v-if="modifications.length"
                                type="button"
                                class="details__raz"
                                @click="remiseAZero('planning')"
                            >
                                🗑️ RAZ
                            </button>
                        </div>
                        <div v-if="modifications.length" class="details__defilement">
                            <table class="details__tableau details__tableau--planning">
                                <thead>
                                    <tr>
                                        <th>Détail</th>
                                        <th class="details__colonne-date">Date de modification</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(m, i) in modifications" :key="i">
                                        <td>
                                            <strong>{{ m.jour }} {{ m.periode }}</strong
                                            ><br />
                                            <template v-if="m.expert">Expert: {{ m.expert }}<br /></template>
                                            Affectation: {{ m.affectation }}<br />
                                            Localisation: {{ m.localisation }}
                                        </td>
                                        <td class="details__date">
                                            {{ m.dateModification }}<br />
                                            <span class="details__heure">{{ m.heureModification }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p v-else class="details__vide">Aucune modification de planning</p>
                    </div>

                    <div v-if="demandes" class="details__bloc details__bloc--demandes">
                        <div class="details__entete">
                            <h3 class="details__titre details__titre--demandes">
                                📧 Envoi de demandes d'affectation ({{ demandes.length }})
                            </h3>
                            <button
                                v-if="demandes.length"
                                type="button"
                                class="details__raz"
                                @click="remiseAZero('emails')"
                            >
                                🗑️ RAZ
                            </button>
                        </div>
                        <table v-if="demandes.length" class="details__tableau details__tableau--demandes">
                            <thead>
                                <tr>
                                    <th>Détail</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(d, i) in demandes" :key="i">
                                    <td>{{ d }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-else class="details__vide details__vide--demandes">Aucune demande envoyée</p>
                    </div>
                </template>
            </div>
        </template>
    </AppModal>
</template>

<style scoped>
.details__export,
.details__export:hover {
    padding: 8px 15px;
    background-color: #27ae60;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    margin: 12px 0 8px;
}
.details__export:hover {
    background-color: #229954;
}
.details__bloc {
    padding: 15px;
    border-radius: 5px;
    margin-top: 20px;
}
.details__bloc--infos {
    background-color: #f8f9fa;
}
.details__bloc--connexions {
    background-color: #e8f4f8;
}
.details__bloc--planning {
    background-color: #e8f5e9;
}
.details__bloc--demandes {
    background-color: #fff3cd;
}
.details__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}
.details__titre {
    color: #2c3e50;
    margin: 0 0 10px;
    font-size: 16px;
}
.details__entete .details__titre {
    margin: 0;
}
.details__titre--planning {
    color: #2e7d32;
}
.details__titre--demandes {
    color: #856404;
}
.details__raz,
.details__raz:hover {
    padding: 5px 15px;
    background-color: #e74c3c;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
}
.details__raz:hover {
    background-color: #c0392b;
}
.details__vide {
    color: #7f8c8d;
    font-style: italic;
}
.details__vide--demandes {
    color: #856404;
}
.details__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.details__tableau th,
.details__tableau td {
    padding: 8px;
    text-align: left;
    color: inherit;
}
.details__tableau--connexions th {
    background-color: #d0e8f0;
}
.details__tableau--connexions th,
.details__tableau--connexions td {
    border: 1px solid #b0d8e8;
}
.details__defilement {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #a5d6a7;
    border-radius: 5px;
}
.details__tableau--planning {
    font-size: 12px;
}
.details__tableau--planning thead {
    position: sticky;
    top: 0;
    background-color: #c8e6c9;
    z-index: 1;
}
.details__tableau--planning th,
.details__tableau--planning td {
    border: 1px solid #a5d6a7;
}
.details__tableau--planning td {
    background-color: white;
}
.details__colonne-date {
    width: 150px;
}
.details__date {
    white-space: nowrap;
}
.details__heure {
    color: #666;
    font-size: 11px;
}
.details__tableau--demandes th {
    background-color: #ffe5a0;
}
.details__tableau--demandes th,
.details__tableau--demandes td {
    border: 1px solid #ffd580;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.details .gp-modale__boite {
    width: min(800px, 100%);
}
</style>
