<!-- Visualisation d'un CRA (administrateur, RH) : expert, période, lignes, commentaire, signatures, journal de
     diffusion (renvoi d'un e-mail en échec ou en attente, sauf profil RH), document PDF, renvoi de la diffusion à
     tous ses destinataires (administrateur, CRA diffusé) -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiCra, type DetailCra, type JournalDiffusion } from '@/api/cra';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import { useSessionStore } from '@/stores/session';
import { dateHeure, etatEnvoi, renvoiPossible, typeDestinataire } from './administration';
import AttentePdf from './AttentePdf.vue';
import { dateFr, heures, libelleMois, majuscule, typeLigne } from './calculs';
import { ouvrirPdf } from './pdf';

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ fermer: [] }>();
const session = useSessionStore();
const confirmer = useConfirmation();

const cra = ref<DetailCra | null>(null);
const journal = ref<JournalDiffusion[]>([]);
const message = ref<{ type: 'error' | 'success'; texte: string } | null>(null);
const attentePdf = ref(false);
const renvoi = ref(false);

const mois = computed(() => (cra.value ? majuscule(libelleMois(Number(cra.value.mois), Number(cra.value.annee))) : ''));
const titre = computed(() => (cra.value ? `CRA — ${cra.value.expert_nom || ''} — ${mois.value}` : ''));
const SIGNATAIRES = [
    { rang: 1, libelle: 'Expert', cle: 'expert' },
    { rang: 2, libelle: 'Viseur N1', cle: 'n1' },
    { rang: 3, libelle: 'Viseur N2', cle: 'n2' }
] as const;
const signature = (rang: number) => cra.value?.signatures.find(s => s.rang === rang);

onMounted(async () => {
    try {
        cra.value = await apiCra.detail(props.id);
    } catch (e) {
        message.value = { type: 'error', texte: `Erreur chargement CRA : ${(e as Error).message}` };
        return;
    }
    try {
        journal.value = (await apiCra.journal(props.id)) || [];
    } catch {
        /* journal non critique */
    }
});

async function pdf() {
    if (!cra.value) return;
    message.value = null;
    const echec = await ouvrirPdf(cra.value, session.profil, attentePdf);
    if (echec) message.value = { type: 'error', texte: echec };
}

async function renvoyerTous() {
    message.value = null;
    const ok = await confirmer(
        "Renvoyer l'email avec le CRA en pièce jointe à tous les destinataires précédents ?",
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    renvoi.value = true;
    try {
        const r = await apiCra.renvoyerDiffusion(props.id);
        message.value = { type: 'success', texte: `✅ Email renvoyé à ${r.sent} destinataire(s).` };
    } catch (e) {
        message.value = { type: 'error', texte: `Erreur : ${(e as Error).message || 'inconnue'}` };
    } finally {
        renvoi.value = false;
    }
}

async function renvoyerEmail(l: JournalDiffusion) {
    message.value = null;
    if (!(await confirmer('Renvoyer cet email de diffusion ?', 'Confirmer', { danger: false }))) return;
    try {
        await apiCra.renvoyerEmail(props.id, l.id);
        message.value = { type: 'success', texte: "✅ Email remis en file d'envoi." };
    } catch (e) {
        message.value = { type: 'error', texte: `Erreur : ${(e as Error).message || 'inconnue'}` };
    }
}
</script>

<template>
    <AppModal id="craViewerModal" :opened="!!cra || !!message" :title="titre" class="cra-visu" @close="emit('fermer')">
        <div id="craViewerBody" class="cra-visu__corps">
            <template v-if="cra">
                <table class="cra-visu__infos">
                    <tbody>
                        <tr>
                            <td class="cra-visu__cle">Expert</td>
                            <td>{{ cra.expert_nom || '' }}</td>
                            <td class="cra-visu__cle cra-visu__cle--court">Période</td>
                            <td>{{ mois }}</td>
                        </tr>
                        <tr>
                            <td class="cra-visu__cle">Établissement</td>
                            <td>{{ cra.es_rattachement || '—' }}</td>
                            <td class="cra-visu__cle">SAMU</td>
                            <td>{{ cra.expert_samu || '—' }}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="cra-visu__rubrique">📋 Activités Astreinte / HNO</div>
                <table class="cra-visu__lignes">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Date début</th>
                            <th>Date fin</th>
                            <th>Heures</th>
                            <th>SAMU</th>
                            <th>Objet</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(l, i) in cra.astreintes_hno" :key="l.id" :class="{ 'cra-visu__impaire': i % 2 }">
                            <td>
                                <span :key="l.type" class="cra-visu__type" :class="`cra-type--${l.type}`"
                                    >{{ typeLigne(l.type).icone }} {{ typeLigne(l.type).libelle }}</span
                                >
                            </td>
                            <td>{{ dateFr(l.date_debut) }}</td>
                            <td>{{ dateFr(l.date_fin) }}</td>
                            <td>{{ heures(l) }}</td>
                            <td>{{ l.samu || '' }}</td>
                            <td>{{ l.objet || '' }}</td>
                        </tr>
                        <tr v-if="!cra.astreintes_hno.length">
                            <td colspan="6" class="cra-visu__aucune">Aucune activité enregistrée</td>
                        </tr>
                    </tbody>
                </table>

                <div v-if="cra.commentaire_expert" class="cra-visu__commentaire">
                    <strong>Commentaire :</strong> {{ cra.commentaire_expert }}
                </div>

                <div class="cra-visu__rubrique">✍️ Signatures électroniques</div>
                <table class="cra-visu__signatures">
                    <thead>
                        <tr>
                            <th>Rôle</th>
                            <th>Signataire</th>
                            <th>Date / IP</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="s in SIGNATAIRES" :key="s.rang" :class="{ 'cra-visu__signee': signature(s.rang) }">
                            <td class="cra-visu__role" :class="`cra-visu__role--${s.cle}`">{{ s.libelle }}</td>
                            <template v-if="signature(s.rang)">
                                <td>{{ signature(s.rang)!.signer_name }}</td>
                                <td class="cra-visu__date">
                                    {{ dateHeure(signature(s.rang)!.signed_at) }}<br /><span class="cra-visu__ip"
                                        >IP: {{ signature(s.rang)!.ip_address || 'N/A' }}</span
                                    >
                                </td>
                            </template>
                            <td v-else colspan="2">En attente</td>
                        </tr>
                    </tbody>
                </table>

                <template v-if="journal.length">
                    <div class="cra-visu__rubrique cra-visu__rubrique--diffusion">
                        📨 Diffusion du CRA validé et signé
                    </div>
                    <table class="cra-visu__journal">
                        <thead>
                            <tr>
                                <th>Destinataire</th>
                                <th>Email</th>
                                <th>Type</th>
                                <th>Date d'envoi</th>
                                <th>Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(l, i) in journal" :key="l.id" :class="{ 'cra-visu__impaire--journal': i % 2 }">
                                <td>{{ l.recipient_name || '—' }}</td>
                                <td>{{ l.recipient_email }}</td>
                                <td>
                                    <span
                                        class="cra-visu__destinataire"
                                        :class="`cra-visu__destinataire--${typeDestinataire(l.recipient_type).cle}`"
                                        >{{ typeDestinataire(l.recipient_type).libelle }}</span
                                    >
                                </td>
                                <td class="cra-visu__date">{{ dateHeure(l.sent_at) }}</td>
                                <td>
                                    <span
                                        :key="String(l.email_status)"
                                        class="cra-visu__envoi"
                                        :class="`cra-visu__envoi--${etatEnvoi(l).cle}`"
                                        :title="
                                            l.email_status === 'failed'
                                                ? `Échec : ${l.error_message}`
                                                : etatEnvoi(l).libelle
                                        "
                                        >{{ etatEnvoi(l).icone }}</span
                                    >
                                    <button
                                        v-if="renvoiPossible(l, session.profil)"
                                        type="button"
                                        class="cra-visu__renvoyer"
                                        @click="renvoyerEmail(l)"
                                    >
                                        Renvoyer
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </template>
            </template>
            <AppAlert v-if="message" :type="message.type" :description="message.texte" />
        </div>

        <template #footer>
            <button type="button" class="cra-visu__bouton cra-visu__bouton--pdf" @click="pdf">
                📄 Voir / Télécharger PDF
            </button>
            <button
                v-if="session.profil === 'admin' && cra?.statut === 'diffuse'"
                id="resendCraEmailBtn"
                type="button"
                class="cra-visu__bouton cra-visu__bouton--renvoi"
                :disabled="renvoi"
                @click="renvoyerTous"
            >
                <span :key="String(renvoi)">{{ renvoi ? '⏳ Envoi...' : "📧 Renvoyer l'email" }}</span>
            </button>
            <button type="button" class="cra-visu__bouton cra-visu__bouton--fermer" @click="emit('fermer')">
                Fermer
            </button>
        </template>
    </AppModal>
    <AttentePdf v-if="attentePdf" />
</template>

<style scoped>
.cra-visu__corps {
    padding-top: 16px;
    font-size: 12px;
}
.cra-visu__infos,
.cra-visu__lignes,
.cra-visu__signatures,
.cra-visu__journal {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.cra-visu__infos {
    margin-bottom: 14px;
}
.cra-visu__infos tr {
    background: #f3e5f5;
}
.cra-visu__infos td {
    padding: 6px 10px;
    border: 1px solid #d1b3e0;
}
.cra-visu__cle {
    font-weight: bold;
    width: 130px;
}
.cra-visu__cle--court {
    width: 100px;
}
.cra-visu__rubrique {
    font-size: 11px;
    font-weight: bold;
    color: #6a1b9a;
    text-transform: uppercase;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
}
.cra-visu__rubrique--diffusion {
    color: #1a237e;
    margin: 16px 0 8px;
}
.cra-visu__lignes {
    margin-bottom: 16px;
}
.cra-visu__lignes th {
    background: #6a1b9a;
    color: white;
    padding: 7px 8px;
    text-align: left;
}
.cra-visu__lignes td {
    padding: 6px 8px;
}
.cra-visu__lignes tbody tr {
    background: white;
}
.cra-visu__lignes tbody tr.cra-visu__impaire {
    background: #f9f4ff;
}
.cra-visu__type {
    font-weight: bold;
}
.cra-type--astreinte {
    color: #e65100;
}
.cra-type--activite_courante {
    color: #2e7d32;
}
.cra-type--hno {
    color: #1565c0;
}
.cra-visu__aucune {
    text-align: center;
    color: #999;
}
.cra-visu__commentaire {
    background: #f3e5f5;
    border-left: 4px solid #6a1b9a;
    padding: 10px 14px;
    margin-bottom: 14px;
    border-radius: 0 6px 6px 0;
}
.cra-visu__commentaire strong {
    color: #6a1b9a;
}
.cra-visu__signatures th {
    background: #f3e5f5;
    padding: 6px 10px;
    text-align: left;
    border: 1px solid #d1b3e0;
}
.cra-visu__signatures td {
    padding: 6px 10px;
}
.cra-visu__signee {
    background: #faf5ff;
}
.cra-visu__role {
    font-weight: bold;
}
.cra-visu__role--expert {
    color: #6a1b9a;
}
.cra-visu__role--n1 {
    color: #4caf50;
}
.cra-visu__role--n2 {
    color: #2196f3;
}
.cra-visu__date {
    font-size: 11px;
    color: #888;
}
.cra-visu__ip {
    color: #bbb;
}
.cra-visu__journal th {
    background: #1a237e;
    color: white;
    padding: 7px 10px;
    text-align: left;
}
.cra-visu__journal td {
    padding: 6px 10px;
}
.cra-visu__journal tbody tr {
    background: white;
}
.cra-visu__journal tbody tr.cra-visu__impaire--journal {
    background: #e8eaf6;
}
.cra-visu__destinataire {
    font-weight: bold;
}
.cra-visu__destinataire--drh {
    color: #1a237e;
}
.cra-visu__destinataire--expert {
    color: #e65100;
}
.cra-visu__destinataire--rh {
    color: #2e7d32;
}
.cra-visu__envoi {
    font-size: 14px;
}
.cra-visu__envoi--envoye {
    color: #2e7d32;
}
.cra-visu__envoi--echec {
    color: #c62828;
}
.cra-visu__envoi--attente {
    color: #e65100;
}
.cra-visu__envoi--inconnu {
    color: #999;
}
.cra-visu__renvoyer,
.cra-visu__renvoyer:hover {
    font-size: 10px;
    padding: 2px 6px;
    background: #c62828;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    margin-left: 6px;
}
.cra-visu__bouton,
.cra-visu__bouton:hover {
    color: white;
    padding: 10px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.cra-visu__bouton--pdf,
.cra-visu__bouton--pdf:hover {
    background: #78909c;
    font-weight: bold;
}
.cra-visu__bouton--renvoi,
.cra-visu__bouton--renvoi:hover {
    background: #1565c0;
    font-weight: bold;
}
.cra-visu__bouton--fermer,
.cra-visu__bouton--fermer:hover {
    background: #6a1b9a;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.cra-visu .gp-modale__boite {
    width: min(900px, 100%);
}
.gp-modale.cra-visu .gp-modale__entete {
    background: #6a1b9a;
    margin: -18px -20px 0;
    padding: 15px 20px;
    border-radius: var(--gp-rayon-3) var(--gp-rayon-3) 0 0;
}
.gp-modale.cra-visu .gp-modale__titre {
    color: white;
    font-size: 15px;
}
</style>
