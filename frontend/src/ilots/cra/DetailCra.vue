<!-- Onglet CRA : détail d'un CRA ouvert depuis une carte ou le lien d'une notification — étapes du circuit, signatures,
     lignes du mois, commentaire de l'expert, motifs (refus, modification par un administrateur), actions du circuit
     selon le profil (saisie, soumission, rappel, « Rien à déclarer », visas, refus, correction et renvoi par
     l'administrateur) et document PDF. Message du dernier traitement affiché au-dessus. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiCra, urlPdfEnregistre, type DetailCra, type NiveauVisa } from '@/api/cra';
import { apiParametres } from '@/api/parametrages';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { ecouter, emettre, prendreCraDemande } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import {
    actions as actionsDe,
    configCra,
    dateFr,
    dateHeureFr,
    droits as droitsDe,
    etapes as etapesDe,
    heures,
    libelleMois,
    majuscule,
    messageModifAdmin,
    pdfEnregistre,
    rienADeclarerPropose,
    signatures as signaturesDe,
    typeLigne,
    type ActionCra,
    type ConfigCra
} from './calculs';
import { ouvrirDocument } from './document';
import { useCraStore } from './magasin';
import SaisieCra from './SaisieCra.vue';

const magasin = useCraStore();
const session = useSessionStore();
const { demande, repondre, confirmer } = fournirConfirmation();

const cra = ref<DetailCra | null>(null);
const config = ref<ConfigCra>({});
const commentaire = ref('');
/** Zone du motif de refus (viseur) : niveau refusé, ou null si fermée */
const refus = ref<NiveauVisa | null>(null);
const motif = ref('');
const saisie = ref(false);
const attentePdf = ref(false);
const panneau = ref<HTMLElement | null>(null);
const champMotif = ref<HTMLTextAreaElement | null>(null);

const utilisateur = computed(() => session.session);
const droits = computed(() =>
    cra.value && utilisateur.value ? droitsDe(cra.value, utilisateur.value, config.value) : null
);
const actions = computed(() => (cra.value && droits.value ? actionsDe(cra.value, droits.value) : []));
const rienADeclarer = computed(() => !!cra.value && !!droits.value && rienADeclarerPropose(cra.value, droits.value));
const etapes = computed(() => (cra.value ? etapesDe(cra.value, config.value) : []));
const signatures = computed(() => (cra.value ? signaturesDe(cra.value) : []));
const modifAdmin = computed(() => (cra.value ? messageModifAdmin(cra.value, utilisateur.value?.userId ?? null) : null));
const titre = computed(() =>
    cra.value ? `CRA — ${majuscule(libelleMois(Number(cra.value.mois), Number(cra.value.annee)))}` : ''
);

/** Détail relu (configuration du workflow comprise : noms et identifiants des viseurs) */
async function afficher(id: number, defiler = true) {
    try {
        try {
            config.value = configCra(await apiParametres.lire());
        } catch {
            config.value = {};
        }
        const d = await apiCra.detail(id);
        cra.value = d;
        commentaire.value = d.commentaire_expert || '';
        refus.value = null;
        motif.value = '';
        if (defiler) {
            await nextTick();
            panneau.value?.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (e) {
        console.error('Erreur ouverture CRA:', e);
    }
}

function fermer() {
    cra.value = null;
}

watch(
    () => magasin.demande,
    d => {
        if (d) void afficher(d.id);
    }
);

/** CRA demandé par le lien d'une notification */
function ouvrirDemande() {
    const id = prendreCraDemande();
    if (id) magasin.ouvrir(id);
}
const arreter = ecouter('cra-demande', ouvrirDemande);
onBeforeUnmount(arreter);

onMounted(async () => {
    await session.charger().catch(() => null);
    ouvrirDemande();
});

/** Après un traitement : cartes relues, ancien code prévenu (listes, pastille), détail relu ou fermé */
async function apresTraitement(id: number, rouvrir: boolean) {
    await magasin.charger();
    emettre('cra-modifies');
    if (rouvrir) await afficher(id);
    else fermer();
}

const erreur = (texte: string) => (magasin.message = { type: 'error', texte });

async function executer(a: ActionCra) {
    const c = cra.value;
    if (!c) return;
    magasin.message = null;
    switch (a.cle) {
        case 'completer':
            saisie.value = true;
            return;
        case 'soumettre':
            return soumettre(c.id);
        case 'renvoyer':
            return renvoyer(c.id);
        case 'corriger':
            return corriger(c.id);
        case 'rappeler':
            return rappeler(c.id);
        case 'viser-n1':
            return viser(c.id, 'n1');
        case 'viser-n2':
            return viser(c.id, 'n2');
        case 'refuser-n1':
            return basculerRefus('n1');
        case 'refuser-n2':
            return basculerRefus('n2');
    }
}

async function soumettre(id: number) {
    if (
        !(await confirmer(
            'Confirmer la soumission de votre CRA ? Il sera transmis au viseur de niveau 1.',
            'Confirmer',
            { danger: false }
        ))
    )
        return;
    try {
        await apiCra.soumettre(id, commentaire.value);
        await apresTraitement(id, true);
    } catch (e) {
        erreur(e instanceof ErreurApi ? `Erreur : ${e.message}` : 'Erreur réseau');
    }
}

async function renvoyer(id: number) {
    const ok = await confirmer(
        "Renvoyer ce CRA à l'expert pour vérification ?\n\nIl recevra un email et devra le soumettre lui-même : l'administrateur ne soumet pas à sa place.",
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    try {
        const r = await apiCra.renvoyer(id);
        magasin.message = {
            type: 'success',
            texte: r.mailed
                ? "CRA renvoyé à l'expert : un email lui a été envoyé."
                : "CRA renvoyé à l'expert (aucun email envoyé : adresse absente)."
        };
        await apresTraitement(id, true);
    } catch (e) {
        erreur(`Erreur : ${(e as Error).message}`);
    }
}

async function corriger(id: number) {
    const ok = await confirmer(
        'Corriger ce CRA en tant qu\'administrateur ?\n\nToutes les validations obtenues seront réinitialisées (visas et signatures supprimés) et le CRA repassera au statut "À compléter".\n\nCette action est irréversible.'
    );
    if (!ok) return;
    try {
        await apiCra.corriger(id);
        await apresTraitement(id, true);
    } catch (e) {
        erreur(e instanceof ErreurApi ? e.message : 'Erreur lors de la correction admin du CRA');
    }
}

async function rappeler(id: number) {
    const ok = await confirmer(
        'Retirer votre soumission pour corriger ce CRA ?\n\nIl repassera en statut "À compléter" et vous pourrez le modifier avant de le soumettre à nouveau.',
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    try {
        await apiCra.rappeler(id);
        await apresTraitement(id, true);
    } catch (e) {
        erreur(e instanceof ErreurApi ? e.message : 'Erreur lors du rappel du CRA');
    }
}

async function viser(id: number, niveau: NiveauVisa) {
    const ok = await confirmer(
        `Confirmer le visa de ${niveau === 'n1' ? 'niveau 1' : 'niveau 2'} pour ce CRA ?`,
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    try {
        await apiCra.viser(id, niveau);
        await apresTraitement(id, true);
    } catch (e) {
        erreur(e instanceof ErreurApi ? `Erreur : ${e.message}` : 'Erreur réseau');
    }
}

async function basculerRefus(niveau: NiveauVisa) {
    refus.value = refus.value ? null : niveau;
    if (refus.value) {
        await nextTick();
        champMotif.value?.focus();
    }
}

async function refuser() {
    const c = cra.value;
    if (!c || !refus.value) return;
    magasin.message = null;
    const texte = motif.value.trim();
    if (!texte) {
        erreur('Le motif de refus est obligatoire.');
        return;
    }
    const ok = await confirmer(
        "Confirmer le refus de ce CRA ? Un email sera envoyé à l'expert avec votre commentaire.",
        'Confirmer'
    );
    if (!ok) return;
    try {
        await apiCra.refuser(c.id, refus.value, texte);
        magasin.message = { type: 'success', texte: "✅ CRA refusé — l'expert a été notifié par email." };
        refus.value = null;
        await apresTraitement(c.id, false);
    } catch (e) {
        erreur(`Erreur : ${(e as Error).message}`);
    }
}

async function declarerRien() {
    const c = cra.value;
    if (!c) return;
    magasin.message = null;
    const ok = await confirmer("Confirmer que vous n'avez ni astreinte ni HNO à déclarer pour ce mois ?", 'Confirmer', {
        danger: false
    });
    if (!ok) return;
    try {
        await apiCra.rienADeclarer(c.id);
        await apresTraitement(c.id, false);
    } catch (e) {
        erreur(
            e instanceof ErreurApi ? `Erreur : ${e.message || 'inconnue'}` : `Erreur réseau : ${(e as Error).message}`
        );
    }
}

async function saisieTerminee() {
    const id = cra.value?.id;
    saisie.value = false;
    if (id) await afficher(id);
}

// ---------- Document PDF ----------

async function pdf() {
    const c = cra.value;
    if (!c) return;
    magasin.message = null;
    if (pdfEnregistre(c)) await pdfSigne(c);
    else await documentEnCours(c.id);
}

/** CRA en cours : document produit par le navigateur, d'après le CRA relu */
async function documentEnCours(id: number) {
    let d: DetailCra;
    try {
        d = await apiCra.detail(id);
    } catch {
        erreur('Erreur chargement CRA');
        return;
    }
    if (!ouvrirDocument(d)) erreur('Veuillez autoriser les popups pour télécharger le PDF');
}

/** CRA visé N2 ou diffusé : PDF signé enregistré, créé sur le serveur s'il manque (sauf pour l'expert) */
async function pdfSigne(c: DetailCra) {
    if (c.pdf_filename && (await apiCra.pdfEnregistre(c.pdf_filename).catch(() => false))) {
        window.open(urlPdfEnregistre(c.pdf_filename), '_blank');
        return;
    }
    if (session.profil === 'expert') {
        erreur("Le fichier PDF de ce CRA n'est pas encore disponible. Contactez un administrateur pour le générer.");
        return;
    }
    attentePdf.value = true;
    try {
        const r = await apiCra.preparerPdf(c.id);
        attentePdf.value = false;
        // Nouveau fichier retenu : pas de nouvelle création au clic suivant
        c.pdf_filename = r.pdfFilename;
        window.open(urlPdfEnregistre(r.pdfFilename), '_blank');
    } catch (e) {
        attentePdf.value = false;
        erreur(
            e instanceof ErreurApi
                ? `Erreur lors de la génération du PDF : ${e.message || 'Erreur inconnue'}`
                : `Erreur réseau lors de la génération du PDF : ${(e as Error).message}`
        );
    }
}
</script>

<template>
    <AppAlert
        v-if="magasin.message"
        :type="magasin.message.type"
        class="cra-detail__message"
        :description="magasin.message.texte"
    />
    <section v-if="cra" id="craDetailPanel" ref="panneau" class="cra-detail" aria-labelledby="craDetailTitle">
        <div class="cra-detail__entete">
            <h3 id="craDetailTitle" class="cra-detail__titre">{{ titre }}</h3>
            <button type="button" class="cra-detail__fermer" aria-label="Fermer le détail" @click="fermer">✕</button>
        </div>

        <div id="craStatusTimeline" class="cra-detail__circuit">
            <div class="cra-etapes">
                <div v-for="(e, i) in etapes" :key="i" class="cra-etapes__groupe">
                    <div class="cra-etape" :class="{ 'cra-etape--faite': e.fait, 'cra-etape--courante': e.courante }">
                        <div :key="String(e.fait)" class="cra-etape__rond">{{ e.fait ? '✓' : i + 1 }}</div>
                        <div :key="String(e.courante)" class="cra-etape__libelle">
                            {{ e.libelle }}{{ e.courante ? ' ⏳' : '' }}
                        </div>
                        <div v-if="e.date" class="cra-etape__date">{{ e.date }}</div>
                    </div>
                    <div
                        v-if="i < etapes.length - 1"
                        class="cra-etapes__lien"
                        :class="{ 'cra-etapes__lien--fait': e.fait }"
                    ></div>
                </div>
            </div>
            <div v-if="signatures.length" class="cra-signatures">
                <div class="cra-signatures__titre">✍️ Historique des signatures</div>
                <div v-for="s in signatures" :key="s.role" class="cra-signatures__ligne">
                    <span class="cra-signatures__role" :class="`cra-signatures__role--${s.role}`">{{ s.libelle }}</span>
                    <span class="cra-signatures__nom">{{ s.nom }}</span>
                    <span class="cra-signatures__date">le {{ dateHeureFr(s.date) }}</span>
                </div>
            </div>
        </div>

        <div id="craDataSection" class="cra-detail__donnees">
            <p v-if="!cra.astreintes_hno.length" class="cra-detail__aucune">
                Aucune activité astreinte/HNO enregistrée pour ce mois.
            </p>
            <template v-else>
                <h4 class="cra-detail__sous-titre">📋 Activités enregistrées</h4>
                <table class="cra-lignes">
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
                        <tr v-for="(l, i) in cra.astreintes_hno" :key="l.id" :class="{ 'cra-lignes__impaire': i % 2 }">
                            <td>
                                <span :key="l.type" class="cra-lignes__type" :class="`cra-type--${l.type}`"
                                    >{{ typeLigne(l.type).icone }} {{ typeLigne(l.type).libelle }}</span
                                >
                            </td>
                            <td>{{ dateFr(l.date_debut) }}</td>
                            <td>{{ dateFr(l.date_fin) }}</td>
                            <td>{{ heures(l) }}</td>
                            <td>{{ l.samu || '' }}</td>
                            <td>{{ l.objet || '' }}</td>
                        </tr>
                    </tbody>
                </table>
            </template>
        </div>

        <div class="cra-detail__commentaire">
            <label for="craCommentaire" class="cra-detail__libelle">💬 Commentaire de l'expert</label>
            <textarea
                id="craCommentaire"
                v-model="commentaire"
                rows="3"
                class="cra-detail__texte"
                placeholder="Ajoutez des informations complémentaires si nécessaire..."
                :disabled="cra.statut !== 'a_completer'"
            ></textarea>
        </div>

        <div v-if="modifAdmin" id="craAdminModPanel" class="cra-encart cra-encart--admin">
            <div class="cra-encart__titre">🛠️ CRA modifié par un administrateur</div>
            <div id="craAdminModText" class="cra-encart__texte">{{ modifAdmin }}</div>
        </div>

        <div
            v-if="cra.commentaire_refus && cra.statut === 'a_completer'"
            id="craRefusPanel"
            class="cra-encart cra-encart--refus"
        >
            <div class="cra-encart__titre">⚠️ Motif de refus précédent</div>
            <div id="craRefusCommentaire" class="cra-encart__texte">{{ cra.commentaire_refus }}</div>
        </div>

        <div v-if="refus" id="craRefusViseurPanel" class="cra-detail__refus">
            <label for="craCommentaireRefus" class="cra-detail__libelle cra-detail__libelle--refus"
                >❌ Motif de refus (obligatoire)</label
            >
            <textarea
                id="craCommentaireRefus"
                ref="champMotif"
                v-model="motif"
                rows="3"
                class="cra-detail__texte cra-detail__texte--refus"
                placeholder="Expliquez pourquoi vous refusez ce CRA..."
            ></textarea>
            <button id="craRefusConfirmBtn" type="button" class="cra-detail__confirmer-refus" @click="refuser">
                📨 Confirmer le refus et notifier l'expert
            </button>
        </div>

        <div id="craActionButtons" class="cra-actions">
            <button
                v-for="a in actions"
                :key="a.cle"
                type="button"
                class="cra-action"
                :class="`cra-action--${a.cle}`"
                :title="a.titre"
                @click="executer(a)"
            >
                {{ a.libelle }}
            </button>
            <span v-if="!actions.length" class="cra-actions__aucune">Aucune action disponible pour ce statut.</span>
            <button
                v-if="rienADeclarer"
                id="craRienADeclarerBtn"
                type="button"
                class="cra-action cra-action--rien"
                title="Je n'ai ni astreinte ni HNO à déclarer ce mois"
                @click="declarerRien"
            >
                📭 Rien à déclarer
            </button>
            <button id="craPdfBtn" type="button" class="cra-action cra-action--pdf" @click="pdf">
                📄 Télécharger PDF
            </button>
        </div>
    </section>

    <SaisieCra
        v-if="saisie && cra"
        :id="cra.id"
        :mois="Number(cra.mois)"
        :annee="Number(cra.annee)"
        @fermer="saisie = false"
        @termine="saisieTerminee"
    />

    <Teleport to="body">
        <div v-if="attentePdf" class="cra-attente">
            <div class="cra-attente__boite" role="status">
                <div class="cra-attente__icone">⏳</div>
                <div class="cra-attente__titre">Création du PDF en cours</div>
                <div class="cra-attente__texte">
                    Le fichier PDF n'existe pas sur le serveur et est en cours de création.<br />Veuillez patienter
                    (30-60 secondes)…
                </div>
                <div class="cra-attente__barre"><div class="cra-attente__progression"></div></div>
            </div>
        </div>
    </Teleport>

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

<style scoped>
.cra-detail__message {
    white-space: pre-line;
}
.cra-detail {
    margin-top: 20px;
    padding: 20px;
    background: #f3e5f5;
    border-radius: 8px;
    border: 1px solid #b39ddb;
}
.cra-detail__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}
.cra-detail__titre {
    color: #6a1b9a;
    margin: 0;
}
.cra-detail__fermer,
.cra-detail__fermer:hover {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: inherit;
    padding: 0;
}
.cra-detail__circuit {
    margin-bottom: 20px;
}
.cra-etapes {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: 14px;
}
.cra-etapes__groupe {
    display: flex;
    align-items: flex-start;
}
.cra-etape {
    text-align: center;
    min-width: 110px;
}
.cra-etape__rond {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #e0e0e0;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 4px;
    font-size: 14px;
}
.cra-etape__libelle {
    font-size: 10px;
    color: #999;
    line-height: 1.3;
}
.cra-etape--faite .cra-etape__rond {
    background: #6a1b9a;
}
.cra-etape--faite .cra-etape__libelle {
    color: #6a1b9a;
    font-weight: bold;
}
.cra-etape--courante .cra-etape__rond {
    background: #ff9800;
}
.cra-etape--courante .cra-etape__libelle {
    color: #e65100;
    font-weight: bold;
}
.cra-etape__date {
    font-size: 9px;
    color: #888;
    margin-top: 2px;
}
.cra-etapes__lien {
    flex: 1;
    height: 2px;
    min-width: 16px;
    background: #e0e0e0;
    margin: 14px 3px 0;
}
.cra-etapes__lien--fait {
    background: #6a1b9a;
}
.cra-signatures {
    background: white;
    border: 1px solid #e1bee7;
    border-radius: 6px;
    padding: 10px 14px;
    margin-top: 6px;
    font-size: 12px;
}
.cra-signatures__titre {
    font-weight: bold;
    color: #6a1b9a;
    margin-bottom: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}
.cra-signatures__ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid #f3e5f5;
}
.cra-signatures__role {
    font-weight: bold;
    min-width: 75px;
    font-size: 11px;
}
.cra-signatures__role--expert {
    color: #6a1b9a;
}
.cra-signatures__role--n1 {
    color: #4caf50;
}
.cra-signatures__role--n2 {
    color: #2196f3;
}
.cra-signatures__nom {
    color: #2c3e50;
    flex: 1;
    font-weight: bold;
}
.cra-signatures__date {
    color: #888;
    font-size: 11px;
}
.cra-detail__donnees {
    margin-bottom: 20px;
}
.cra-detail__aucune {
    color: #999;
    font-size: 12px;
    font-style: italic;
    margin: 0;
}
.cra-detail__sous-titre {
    color: #6a1b9a;
    margin: 0 0 10px 0;
    font-size: 13px;
}
.cra-lignes {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.cra-lignes th {
    background: #6a1b9a;
    color: white;
    padding: 8px;
    text-align: left;
}
.cra-lignes td {
    padding: 6px 8px;
}
.cra-lignes tbody tr {
    background: white;
    border-bottom: 1px solid #e1bee7;
}
.cra-lignes tbody tr.cra-lignes__impaire {
    background: #f9f4ff;
}
.cra-lignes__type {
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 11px;
}
.cra-type--astreinte {
    background: #ff980022;
    color: #e65100;
}
.cra-type--activite_courante {
    background: #2e7d3222;
    color: #2e7d32;
}
.cra-type--hno {
    background: #2196f322;
    color: #1565c0;
}
.cra-detail__commentaire {
    margin-bottom: 15px;
}
.cra-detail__libelle {
    font-size: 13px;
    font-weight: bold;
    color: #6a1b9a;
    display: block;
    margin-bottom: 5px;
}
.cra-detail__libelle--refus {
    color: #e65100;
}
.cra-detail__texte {
    width: 100%;
    padding: 8px;
    border: 1px solid #b39ddb;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;
}
.cra-detail__texte--refus {
    border-color: #f39c12;
}
.cra-encart {
    margin-bottom: 15px;
    padding: 10px 14px;
    border-radius: 0 6px 6px 0;
}
.cra-encart--admin {
    background: #e3f2fd;
    border-left: 4px solid #1565c0;
}
.cra-encart--refus {
    background: #fff3cd;
    border-left: 4px solid #f39c12;
}
.cra-encart__titre {
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 4px;
}
.cra-encart--admin .cra-encart__titre {
    color: #0d47a1;
}
.cra-encart--refus .cra-encart__titre {
    color: #e65100;
}
.cra-encart__texte {
    font-size: 12px;
    color: #2c3e50;
}
.cra-detail__refus {
    margin-bottom: 15px;
}
.cra-detail__confirmer-refus,
.cra-detail__confirmer-refus:hover {
    background: #e53935;
    color: white;
    padding: 9px 20px;
    font-weight: bold;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 8px;
}
.cra-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
}
.cra-actions__aucune {
    color: #999;
    font-size: 12px;
    font-style: italic;
}
.cra-action,
.cra-action:hover {
    color: white;
    padding: 10px 20px;
    font-weight: bold;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.cra-action--completer,
.cra-action--completer:hover,
.cra-action--rappeler,
.cra-action--rappeler:hover {
    background-color: #ff9800;
}
.cra-action--renvoyer,
.cra-action--renvoyer:hover {
    background-color: #1565c0;
}
.cra-action--soumettre,
.cra-action--soumettre:hover {
    background-color: #6a1b9a;
}
.cra-action--corriger,
.cra-action--corriger:hover {
    background-color: #e65100;
}
.cra-action--viser-n1,
.cra-action--viser-n1:hover {
    background-color: #4caf50;
}
.cra-action--viser-n2,
.cra-action--viser-n2:hover {
    background-color: #2196f3;
}
.cra-action--refuser-n1,
.cra-action--refuser-n1:hover,
.cra-action--refuser-n2,
.cra-action--refuser-n2:hover {
    background-color: #f39c12;
}
.cra-action--rien,
.cra-action--rien:hover {
    background: #ff9800;
    padding: 10px 18px;
}
.cra-action--pdf,
.cra-action--pdf:hover {
    background: #78909c;
    padding: 10px 18px;
    display: inline-flex;
}
.cra-attente {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}
.cra-attente__boite {
    background: white;
    border-radius: 10px;
    padding: 32px 40px;
    text-align: center;
    max-width: 380px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.cra-attente__icone {
    font-size: 36px;
    margin-bottom: 14px;
}
.cra-attente__titre {
    font-weight: bold;
    font-size: 15px;
    color: #333;
    margin-bottom: 10px;
}
.cra-attente__texte {
    font-size: 13px;
    color: #666;
    line-height: 1.5;
}
.cra-attente__barre {
    margin-top: 18px;
    height: 4px;
    background: #e0e0e0;
    border-radius: 2px;
    overflow: hidden;
}
.cra-attente__progression {
    height: 100%;
    background: #6a1b9a;
    animation: cra-progression 40s linear forwards;
}
@keyframes cra-progression {
    from {
        width: 0%;
    }
    to {
        width: 95%;
    }
}
</style>
