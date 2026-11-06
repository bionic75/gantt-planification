<!-- « Invitations Outlook - Affectations » (enveloppe de l'en-tête) : affectations modifiées dans la grille, en attente
     d'invitation, par expert (nouvelles, modifiées, supprimées) ; experts à notifier, envoi des invitations (fichiers
     ICS) puis message de fin d'envoi. Les affectations en attente sont tenues par l'ancien code (liaison). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiNotifications } from '@/api/notifications';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { surDemande } from '@/ilots/fenetres';
import { usePlanificationStore } from '@/ilots/planification/magasin';
import type { EtatInvitations } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import FenetreMessage from './FenetreMessage.vue';
import {
    ICONES_TYPE,
    compter,
    invitationsDe,
    jourCourt,
    messageFinEnvoi,
    parDate,
    resume,
    typeDe
} from './invitations';

const session = useSessionStore();
const planification = usePlanificationStore();

const ouverte = ref(false);
const etat = shallowRef<EtatInvitations>({ sessionId: null, experts: {} });
const coches = ref<Record<string, boolean>>({});
const tousCoches = ref(true);
const erreur = ref('');
const information = ref('');

/** Message de fin d'envoi (suivi du lot d'e-mails) */
const fin = ref<{ succes: boolean; titre: string; detail: string; echecs: number } | null>(null);
let attente: ReturnType<typeof setTimeout> | null = null;
let releve: ReturnType<typeof setInterval> | null = null;
let fermetureFin: ReturnType<typeof setTimeout> | null = null;

surDemande(() => {
    const e = planification.etatInvitations();
    if (Object.keys(e.experts).length === 0) {
        information.value = "Aucune modification d'affectation à envoyer.";
        return;
    }
    etat.value = e;
    coches.value = Object.fromEntries(Object.keys(e.experts).map(id => [id, true]));
    tousCoches.value = true;
    erreur.value = '';
    ouverte.value = true;
});

const experts = computed(() =>
    Object.entries(etat.value.experts).map(([id, e]) => ({
        id,
        expert: e,
        compteurs: compter(e.assignments),
        lignes: parDate(e.assignments).map(a => ({
            cle: `${a.date}_${a.period}`,
            type: typeDe(a),
            jour: jourCourt(a.date),
            periode: a.period === 'AM' ? 'Matin' : 'Après-midi',
            affectation: a.activity,
            ancienneAffectation: typeDe(a) === 'modified' ? a.oldActivity : null,
            localisation: a.location || '-',
            ancienneLocalisation:
                typeDe(a) === 'modified' && a.oldLocation && a.oldLocation !== a.location ? a.oldLocation : null
        }))
    }))
);

const sommaire = computed(() => resume(Object.values(etat.value.experts)));

/** « Tout sélectionner » : coche ou décoche chaque expert (la case ne suit pas les cases des experts) */
function basculerTous() {
    coches.value = Object.fromEntries(Object.keys(coches.value).map(id => [id, tousCoches.value]));
}

/** Experts notifiés ou abandonnés : retirés des affectations en attente (ancien code) */
const retirer = (ids: number[]) => planification.retirerInvitations(ids);

async function envoyer() {
    erreur.value = '';
    const choisis = Object.keys(coches.value).filter(id => coches.value[id]);
    const invitations = invitationsDe(etat.value.experts, choisis);
    if (invitations.length === 0) {
        erreur.value = 'Aucun expert sélectionné pour la notification.';
        return;
    }
    ouverte.value = false;
    const ids = invitations.map(i => i.resourceId);
    const total = invitations.reduce((n, i) => n + i.assignments.length, 0);
    const s = await session.charger().catch(() => null);
    try {
        const r = await apiNotifications.envoyerInvitations({
            assignments: invitations,
            senderName: s ? `${s.prenom} ${s.nom}` : 'Système',
            senderEmail: s ? s.email : null,
            sessionId: etat.value.sessionId
        });
        if (!r.success) return;
        retirer(ids);
        if (r.batchId) suivreEnvoi(r.batchId, r.enqueued || total, invitations);
    } catch (e) {
        // Passerelle (502 / 504) ou réseau : envoi probablement pris en charge, experts retirés de l'attente ;
        // autre refus du serveur : affectations conservées (sans message, comme l'ancien écran)
        if (!(e instanceof ErreurApi) || e.statut === 502 || e.statut === 504) retirer(ids);
    }
}

function arreterSuivi() {
    if (attente) clearTimeout(attente);
    if (releve) clearInterval(releve);
    attente = releve = null;
}

/** Suivi du lot d'e-mails : premier relevé après 15 s, puis toutes les 10 s, jusqu'à la fin de l'envoi */
function suivreEnvoi(batchId: string, total: number, invitations: ReturnType<typeof invitationsDe>) {
    arreterSuivi();
    const noms = [
        ...new Set(invitations.map(i => `${i.expertPrenom || ''} ${i.expertNom || ''}`.trim()).filter(Boolean))
    ];
    const relever = async () => {
        try {
            const statut = await apiNotifications.statutEnvoi(batchId);
            if (!statut.isComplete) return;
            arreterSuivi();
            const echecs = statut.failed || 0;
            fin.value = { ...messageFinEnvoi(statut.sent || 0, echecs, total, noms), echecs };
            if (fermetureFin) clearTimeout(fermetureFin);
            fermetureFin = setTimeout(() => (fin.value = null), 12000);
        } catch {
            // Relevé suivant
        }
    };
    attente = setTimeout(() => {
        void relever();
        releve = setInterval(() => void relever(), 10000);
    }, 15000);
}

onBeforeUnmount(() => {
    arreterSuivi();
    if (fermetureFin) clearTimeout(fermetureFin);
});
</script>

<template>
    <AppModal
        id="sendEmailModalContainer"
        :opened="ouverte"
        title="📅 Invitations Outlook - Affectations"
        class="gp-invitations"
        @close="ouverte = false"
    >
        <p id="sendEmailModalSummary" :key="sommaire" class="gp-invitations__resume">{{ sommaire }}</p>
        <p class="gp-invitations__aide">
            📧 Cochez les experts à notifier. Chaque expert recevra des <strong>invitations Outlook</strong> (fichiers
            ICS) :<br />
            <span class="gp-invitations__legende"
                >📅 Nouvelles affectations &nbsp;|&nbsp; 🔄 Modifications &nbsp;|&nbsp; ❌ Suppressions (annulation
                calendrier)</span
            >
        </p>

        <div id="sendEmailModalContent" class="gp-invitations__contenu">
            <div v-for="x in experts" :key="x.id" class="gp-invitations__expert">
                <div class="gp-invitations__entete">
                    <div>
                        <strong class="gp-invitations__nom"
                            >{{ x.expert.expertPrenom }} {{ x.expert.expertNom }}</strong
                        >
                        <br /><span class="gp-invitations__email">{{ x.expert.expertEmail || "Pas d'email" }}</span>
                        <br /><span class="gp-invitations__compteurs"
                            ><span v-if="x.compteurs.nouvelles > 0" class="gp-invitations__compteur--nouvelle"
                                >📅 {{ x.compteurs.nouvelles }} nouvelle(s)</span
                            >
                            <span v-if="x.compteurs.modifications > 0" class="gp-invitations__compteur--modification"
                                >🔄 {{ x.compteurs.modifications }} modification(s)</span
                            >
                            <span v-if="x.compteurs.suppressions > 0" class="gp-invitations__compteur--suppression"
                                >❌ {{ x.compteurs.suppressions }} suppression(s)</span
                            ></span
                        >
                    </div>
                    <label class="gp-invitations__notifier">
                        <input
                            :id="`sendTo_${x.id}`"
                            v-model="coches[x.id]"
                            type="checkbox"
                            class="gp-invitations__case"
                        />
                        <span>Notifier</span>
                    </label>
                </div>
                <table class="gp-invitations__table">
                    <thead>
                        <tr>
                            <th class="gp-invitations__col-type">Type</th>
                            <th>Date</th>
                            <th class="gp-invitations__centre">Période</th>
                            <th>Affectation</th>
                            <th>Localisation</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="l in x.lignes" :key="l.cle" :class="`gp-invitations__ligne--${l.type}`">
                            <td class="gp-invitations__centre" :title="ICONES_TYPE[l.type].titre">
                                {{ ICONES_TYPE[l.type].icone }}
                            </td>
                            <td>{{ l.jour }}</td>
                            <td class="gp-invitations__centre">{{ l.periode }}</td>
                            <td>
                                <span :key="l.affectation">{{ l.affectation }}</span>
                                <template v-if="l.ancienneAffectation"
                                    ><br /><span :key="l.ancienneAffectation" class="gp-invitations__ancien"
                                        >Ancien: {{ l.ancienneAffectation }}</span
                                    ></template
                                >
                            </td>
                            <td>
                                <span :key="l.localisation">{{ l.localisation }}</span>
                                <template v-if="l.ancienneLocalisation"
                                    ><br /><span :key="l.ancienneLocalisation" class="gp-invitations__ancien">{{
                                        l.ancienneLocalisation
                                    }}</span></template
                                >
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <AppAlert v-if="erreur" type="error" :description="erreur" />

        <div class="gp-invitations__pied">
            <label class="gp-invitations__tous">
                <input
                    id="selectAllExperts"
                    v-model="tousCoches"
                    type="checkbox"
                    class="gp-invitations__case"
                    @change="basculerTous"
                />
                <span>Sélectionner/Désélectionner tous</span>
            </label>
            <div class="gp-invitations__actions">
                <button type="button" class="gp-invitations__envoyer" @click="envoyer">
                    📅 Envoyer les invitations Outlook
                </button>
                <button type="button" class="gp-invitations__annuler" @click="ouverte = false">Annuler</button>
            </div>
        </div>
    </AppModal>

    <FenetreMessage :message="information" @fermer="information = ''" />

    <Teleport to="body">
        <div
            v-if="fin"
            class="gp-invitations-fin"
            :class="{ 'gp-invitations-fin--partiel': !fin.succes }"
            role="status"
        >
            <div class="gp-invitations-fin__corps">
                <div>
                    <div class="gp-invitations-fin__titre">
                        <span class="gp-invitations-fin__icone">{{ fin.succes ? '✅' : '⚠️' }}</span>
                        <strong>{{ fin.titre }}</strong>
                    </div>
                    <div class="gp-invitations-fin__detail">{{ fin.detail }}</div>
                    <div v-if="fin.echecs > 0" class="gp-invitations-fin__echecs">
                        ⚠️ {{ fin.echecs }} envoi(s) échoué(s) — voir logs serveur
                    </div>
                </div>
                <button type="button" class="gp-invitations-fin__fermer" aria-label="Fermer" @click="fin = null">
                    ✕
                </button>
            </div>
        </div>
    </Teleport>
</template>

<style>
/* Fenêtre téléportée hors du composant : règles ciblées par sa classe */
.gp-modale.gp-invitations {
    z-index: 10002;
}
.gp-modale.gp-invitations .gp-modale__boite {
    width: min(800px, 95%);
    padding: 30px;
    border-radius: 12px;
}
.gp-modale.gp-invitations .gp-modale__titre {
    color: #27ae60;
    font-size: 1.5em;
}
.gp-invitations__resume {
    color: #7f8c8d;
    font-size: 12px;
    margin: 5px 0 20px 0;
}
.gp-invitations__aide {
    color: #666;
    font-size: 13px;
    margin-bottom: 15px;
    padding: 10px;
    background: #f0f9f0;
    border-radius: 5px;
}
.gp-invitations__legende {
    font-size: 11px;
    color: #555;
}
.gp-invitations__contenu {
    max-height: 50vh;
    overflow-y: auto;
    margin-bottom: 20px;
}
.gp-invitations__expert {
    margin-bottom: 20px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #27ae60;
}
.gp-invitations__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}
.gp-invitations__nom {
    font-size: 14px;
    color: #2c3e50;
}
.gp-invitations__email {
    font-size: 12px;
    color: #7f8c8d;
}
.gp-invitations__compteurs {
    font-size: 11px;
}
.gp-invitations__compteur--nouvelle {
    color: #27ae60;
}
.gp-invitations__compteur--modification {
    color: #ff9800;
}
.gp-invitations__compteur--suppression {
    color: #d60b51;
}
.gp-invitations__notifier,
.gp-invitations__tous {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 12px;
}
.gp-invitations__tous {
    gap: 8px;
    font-size: 13px;
}
.gp-invitations__case {
    width: 18px;
    height: 18px;
}
.gp-invitations__table {
    width: 100%;
    font-size: 11px;
    border-collapse: collapse;
}
.gp-invitations__table thead tr {
    background: #ecf0f1;
}
.gp-invitations__table th,
.gp-invitations__table td {
    padding: 5px;
    text-align: left;
}
.gp-invitations__table th.gp-invitations__centre,
.gp-invitations__table td.gp-invitations__centre,
.gp-invitations__table th.gp-invitations__col-type {
    text-align: center;
}
.gp-invitations__col-type {
    width: 30px;
}
.gp-invitations__table tbody tr {
    border-bottom: 1px solid #ddd;
    background: white;
}
.gp-invitations__table tbody tr.gp-invitations__ligne--modified {
    background: #fff8e1;
}
.gp-invitations__table tbody tr.gp-invitations__ligne--deleted {
    background: #fde8e8;
}
.gp-invitations__ancien {
    font-size: 10px;
    color: #999;
    text-decoration: line-through;
}
.gp-invitations__pied {
    display: flex;
    flex-direction: column;
    gap: 15px;
    border-top: 1px solid #eee;
    padding-top: 15px;
}
.gp-invitations__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
.gp-invitations__envoyer,
.gp-invitations__annuler {
    color: white;
    padding: 12px 25px;
    font-size: 14px;
}
.gp-invitations__envoyer {
    background-color: #27ae60;
}
.gp-invitations__annuler {
    background-color: #95a5a6;
}
@keyframes gp-invitations-entree {
    from {
        transform: translateX(120%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}
.gp-invitations-fin {
    position: fixed;
    bottom: 24px;
    right: 24px;
    min-width: 320px;
    max-width: 420px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    border-left: 5px solid #27ae60;
    z-index: 10050;
    overflow: hidden;
    animation: gp-invitations-entree 0.3s ease;
}
.gp-invitations-fin--partiel {
    border-left-color: #e67e22;
}
.gp-invitations-fin__corps {
    padding: 16px 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
}
.gp-invitations-fin__titre {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 14px;
    color: #2c3e50;
}
.gp-invitations-fin__icone {
    font-size: 20px;
}
.gp-invitations-fin__detail {
    font-size: 12px;
    color: #7f8c8d;
}
.gp-invitations-fin__echecs {
    font-size: 12px;
    color: #e74c3c;
    margin-top: 4px;
}
.gp-invitations-fin__fermer {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #bbb;
    padding: 0;
    flex-shrink: 0;
}
</style>
