<!-- Automatisation n°2 : sauvegarde des plannings mensuels envoyée aux destinataires choisis (groupes, comptes), selon
     la fréquence choisie ; contenu du fichier (mois, experts, lignes vides, format) ; historique, diagnostic des mois,
     nettoyage des données invalides ; test : récapitulatif puis envoi -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAutomatisations, type ParametresSauvegarde, type RecapitulatifSauvegarde } from '@/api/automatisations';
import AppModal from '@/composants/AppModal.vue';
import AppSaisieParticipants, { type Participant } from '@/composants/AppSaisieParticipants.vue';
import BlocAutomatisation from './BlocAutomatisation.vue';
import {
    configSauvegarde,
    FORMATS,
    formulaireSauvegarde,
    FREQUENCES,
    HEURES,
    JOURS_MOIS,
    JOURS_SEMAINE,
    libelleMois,
    parametresSauvegarde,
    testIncomplet,
    type FormulaireSauvegarde,
    type ListesSauvegarde
} from './calculs';
import { useAutomatisationsStore } from './magasin';

const magasin = useAutomatisationsStore();

const listes = computed<ListesSauvegarde>(() => ({
    comptes: magasin.comptes,
    ressources: magasin.ressources,
    mois: magasin.mois
}));
const f = ref<FormulaireSauvegarde>(formulaireSauvegarde({}, { comptes: [], ressources: [], mois: [] }));

/** Comptes avec e-mail proposés comme destinataires individuels (saisie en étiquettes, comme les participants d'un événement) */
const comptesProposes = computed(() => magasin.utilisateurs.filter(u => u.email));
/** Destinataires individuels choisis, en étiquettes ; la sélection enregistrée reste la liste des identifiants */
const destinatairesChoisis = computed<Participant[]>({
    get: () =>
        f.value.destinataires
            .map(id => comptesProposes.value.find(u => u.id === id))
            .filter((u): u is NonNullable<typeof u> => !!u)
            .map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email })),
    set: v => {
        f.value.destinataires = v.filter(p => !p.external && p.id != null).map(p => p.id as number);
        enregistrer();
    }
});

onMounted(async () => {
    await magasin.preparer();
    try {
        f.value = formulaireSauvegarde((await apiAutomatisations.config(2)).config ?? {}, listes.value);
    } catch {
        /* valeurs initiales */
    }
});

async function enregistrer() {
    try {
        await apiAutomatisations.enregistrer(2, configSauvegarde(f.value, listes.value));
    } catch {
        /* configuration non enregistrée (ancien écran : erreur dans la console) */
    }
}

function basculer(actif: boolean) {
    f.value.actif = actif;
    enregistrer();
}

/** « Toutes les données » / « Tous les experts » cochés : sélection individuelle vidée */
function tousLesMois() {
    if (f.value.tousLesMois) f.value.mois = [];
    enregistrer();
}
function tousLesExperts() {
    if (f.value.tousLesExperts) f.value.experts = [];
    enregistrer();
}

// ---------- Test ----------

const resultat = ref<{ texte: string; etat: 'encours' | 'erreur' } | null>(null);

interface Apercu {
    donnees: RecapitulatifSauvegarde;
    parametres: ParametresSauvegarde;
    envoi: 'encours' | { sent: number; emailsSent: number; failed: number } | 'erreur' | null;
}
const apercu = ref<Apercu | null>(null);
/** Boutons du récapitulatif masqués après un envoi réussi, jusqu'au rechargement de la page (anomalie conservée) */
const boutonsMasques = ref(false);

async function tester() {
    resultat.value = { texte: '🔍 Préparation du récapitulatif...', etat: 'encours' };
    const parametres = parametresSauvegarde(f.value, listes.value);
    const incomplet = testIncomplet(parametres);
    if (incomplet) {
        resultat.value = { texte: incomplet, etat: 'erreur' };
        return;
    }
    try {
        apercu.value = { donnees: await apiAutomatisations.recapitulatif(parametres), parametres, envoi: null };
        resultat.value = null;
    } catch (e) {
        resultat.value = { texte: `❌ ${(e as Error).message || 'Erreur lors du test'}`, etat: 'erreur' };
    }
}

async function envoyer() {
    const a = apercu.value;
    if (!a) return;
    a.envoi = 'encours';
    try {
        a.envoi = await apiAutomatisations.envoyerSauvegarde(a.parametres);
        boutonsMasques.value = true;
    } catch {
        a.envoi = 'erreur';
    }
}

const RECAPITULATIF = (a: Apercu) => [
    {
        titre: 'Destinataires',
        valeur: `${a.donnees.recipientsCount} personne(s)`,
        complement:
            a.donnees.emailsCount !== a.donnees.recipientsCount ? `(${a.donnees.emailsCount} email(s) unique(s))` : ''
    },
    { titre: 'Données incluses', valeur: libelleMois(a.parametres, a.donnees.monthsLabel) },
    {
        titre: 'Experts',
        valeur: `${a.donnees.expertsCount} expert(s) (${a.parametres.allExperts ? 'Tous les experts' : 'Sélection personnalisée'})`
    },
    { titre: 'Exclure lignes vides', valeur: a.parametres.excludeEmpty ? 'Oui' : 'Non' },
    { titre: 'Format', valeur: a.parametres.format.toUpperCase() },
    { titre: 'Nom du fichier', valeur: a.donnees.filename, fichier: true }
];
</script>

<template>
    <BlocAutomatisation
        v-model:actif="f.actif"
        :numero="2"
        titre="Automatisation n°2 : Sauvegarde des plannings mensuels"
        icone='<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>'
        @bascule="basculer"
    >
        <p class="sauv__aide">
            Envoie automatiquement un fichier de sauvegarde du planning aux destinataires sélectionnés selon la
            fréquence choisie.
        </p>

        <!-- Destinataires -->
        <div class="sauv__bloc">
            <span class="sauv__rubrique">📬 Destinataires</span>
            <div class="sauv__colonnes">
                <div class="sauv__colonne">
                    <span class="sauv__petit">Groupes de destinataires</span>
                    <div class="sauv__groupes">
                        <label class="sauv__groupe">
                            <input
                                id="automation2GroupAdmin"
                                v-model="f.groupeAdmin"
                                type="checkbox"
                                @change="enregistrer"
                            />
                            Administrateurs
                        </label>
                        <label class="sauv__groupe">
                            <input
                                id="automation2GroupUser"
                                v-model="f.groupeUtilisateur"
                                type="checkbox"
                                @change="enregistrer"
                            />
                            Utilisateurs
                        </label>
                        <label class="sauv__groupe">
                            <input
                                id="automation2GroupExpert"
                                v-model="f.groupeExpert"
                                type="checkbox"
                                @change="enregistrer"
                            />
                            Experts
                        </label>
                    </div>
                </div>
                <div class="sauv__colonne">
                    <AppSaisieParticipants
                        v-model="destinatairesChoisis"
                        class="sauv__destinataires"
                        label="Destinataires individuels (optionnel)"
                        id-saisie="automation2RecipientsSaisie"
                        id-cadre="automation2Recipients"
                        id-liste="automation2RecipientsListe"
                        :comptes="comptesProposes"
                        detaille
                    />
                    <small class="sauv__note">Tapez un nom ou un e-mail, puis choisissez dans la liste</small>
                </div>
            </div>
        </div>

        <!-- Fréquence -->
        <div class="sauv__bloc">
            <label for="automation2Frequency" class="sauv__rubrique">⏰ Fréquence d'envoi</label>
            <div class="sauv__frequence">
                <div class="sauv__choix">
                    <select id="automation2Frequency" v-model="f.frequence" class="sauv__liste" @change="enregistrer">
                        <option v-for="o in FREQUENCES" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                    </select>
                </div>
                <div v-show="f.frequence === 'weekly'" id="automation2WeeklyOptions" class="sauv__choix">
                    <label for="automation2WeekDay" class="sauv__petit">Jour de la semaine</label>
                    <select id="automation2WeekDay" v-model="f.jourSemaine" class="sauv__liste" @change="enregistrer">
                        <option v-for="o in JOURS_SEMAINE" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                    </select>
                </div>
                <div v-show="f.frequence === 'monthly'" id="automation2MonthlyOptions" class="sauv__choix">
                    <label for="automation2MonthDay" class="sauv__petit">Jour du mois</label>
                    <select id="automation2MonthDay" v-model="f.jourMois" class="sauv__liste" @change="enregistrer">
                        <option v-for="o in JOURS_MOIS" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                    </select>
                </div>
                <div class="sauv__heure">
                    <label for="automation2Hour" class="sauv__petit">Heure d'envoi</label>
                    <select id="automation2Hour" v-model="f.heure" class="sauv__liste" @change="enregistrer">
                        <option v-for="o in HEURES" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Contenu du fichier -->
        <div class="sauv__bloc">
            <span class="sauv__rubrique">📁 Contenu du fichier</span>
            <div class="sauv__contenu">
                <div class="sauv__part">
                    <div class="sauv__petit sauv__entete">Mois à inclure</div>
                    <label class="sauv__tous">
                        <input
                            id="automation2AllMonths"
                            v-model="f.tousLesMois"
                            type="checkbox"
                            @change="tousLesMois"
                        />
                        <strong>Toutes les données</strong>
                    </label>
                    <select
                        id="automation2Months"
                        v-model="f.mois"
                        multiple
                        aria-label="Mois à inclure"
                        class="sauv__multiple"
                        :disabled="f.tousLesMois"
                        @change="enregistrer"
                    >
                        <option v-for="o in magasin.mois" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                        <option v-if="magasin.moisCharges && !magasin.mois.length" value="" disabled>
                            Aucune donnée disponible
                        </option>
                    </select>
                    <div class="sauv__note">Décochez "Toutes" pour sélection manuelle</div>
                </div>
                <div class="sauv__part">
                    <div class="sauv__petit sauv__entete">Experts à inclure</div>
                    <label class="sauv__tous">
                        <input
                            id="automation2AllExperts"
                            v-model="f.tousLesExperts"
                            type="checkbox"
                            @change="tousLesExperts"
                        />
                        <strong>Tous les experts</strong>
                    </label>
                    <select
                        id="automation2ExpertsList"
                        v-model="f.experts"
                        multiple
                        aria-label="Experts à inclure"
                        class="sauv__multiple"
                        :disabled="f.tousLesExperts"
                        @change="enregistrer"
                    >
                        <option
                            v-for="o in magasin.ressources"
                            :key="o.valeur"
                            :value="o.valeur"
                            :class="{ sauv__inactif: o.inactif }"
                        >
                            {{ o.libelle }}
                        </option>
                    </select>
                    <div class="sauv__note">Décochez "Tous" pour sélection manuelle</div>
                </div>
                <div class="sauv__options">
                    <div class="sauv__petit sauv__entete">Options d'export</div>
                    <label class="sauv__tous sauv__vides">
                        <input
                            id="automation2ExcludeEmpty"
                            v-model="f.exclureVides"
                            type="checkbox"
                            @change="enregistrer"
                        />
                        Exclure lignes vides
                    </label>
                    <label for="automation2Format" class="sauv__petit sauv__format">Format du fichier</label>
                    <select id="automation2Format" v-model="f.format" class="sauv__liste" @change="enregistrer">
                        <option v-for="o in FORMATS" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Outils -->
        <div class="sauv__outils">
            <button type="button" class="sauv__historique" @click="magasin.ouvrirEnvois(2)">
                📋 Historique des envois
            </button>
            <button type="button" class="sauv__diagnostic" @click="magasin.ouvrirDiagnostic()">
                🔍 Diagnostic mois
            </button>
            <button type="button" class="sauv__nettoyer" @click="magasin.ouvrirNettoyage()">
                🧹 Nettoyer données invalides
            </button>
        </div>
        <p
            v-if="magasin.messageOutils"
            :key="magasin.messageOutils.texte"
            :role="magasin.messageOutils.erreur ? 'alert' : 'status'"
            class="sauv__message"
            :class="{ 'sauv__message--erreur': magasin.messageOutils.erreur }"
        >
            {{ magasin.messageOutils.texte }}
        </p>

        <div class="sauv__test">
            <span class="sauv__test-titre">🧪 Test de l'automatisation</span>
            <p class="sauv__test-aide">Génère et envoie le fichier de sauvegarde avec la configuration actuelle.</p>
            <button type="button" class="sauv__tester" @click="tester">🔍 Tester maintenant</button>
            <div id="automation2TestResult" role="status" class="sauv__resultat">
                <span v-if="resultat" :key="resultat.texte" :class="`sauv__resultat--${resultat.etat}`">{{
                    resultat.texte
                }}</span>
            </div>
        </div>
    </BlocAutomatisation>

    <AppModal
        id="automation2PreviewModal"
        :opened="!!apercu"
        title="📊 Test - Sauvegarde du planning"
        class="sauv-apercu"
        @close="apercu = null"
    >
        <template v-if="apercu">
            <p v-if="apercu.envoi === 'encours'" class="sauv-apercu__centre sauv-apercu__encours">
                📧 Envoi en cours...
            </p>
            <div v-else-if="apercu.envoi && apercu.envoi !== 'erreur'" class="sauv-apercu__bilan">
                <span class="sauv-apercu__coche" aria-hidden="true">✅</span>
                <p class="sauv-apercu__succes">Email envoyé avec succès à {{ apercu.envoi.sent }} personne(s)</p>
                <p v-if="apercu.envoi.emailsSent !== apercu.envoi.sent" class="sauv-apercu__uniques">
                    ({{ apercu.envoi.emailsSent }} adresse(s) email unique(s))
                </p>
                <p v-if="apercu.envoi.failed > 0" class="sauv-apercu__echecs">{{ apercu.envoi.failed }} échec(s)</p>
            </div>
            <p v-else-if="apercu.envoi === 'erreur'" class="sauv-apercu__centre sauv-apercu__erreur">
                ❌ Erreur lors de l'envoi
            </p>
            <template v-else>
                <div class="sauv-apercu__recap">
                    <h4 class="sauv-apercu__titre">📋 Récapitulatif de l'envoi</h4>
                    <table class="sauv-apercu__tableau">
                        <tbody>
                            <tr v-for="l in RECAPITULATIF(apercu)" :key="l.titre">
                                <td class="sauv-apercu__cle">{{ l.titre }}</td>
                                <td :class="{ 'sauv-apercu__fichier': l.fichier }">
                                    {{ l.valeur }}
                                    <span v-if="l.complement" class="sauv-apercu__complement">{{ l.complement }}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="sauv-apercu__destinataires">
                    <h5 class="sauv-apercu__sous-titre">📬 Liste des destinataires :</h5>
                    <div class="sauv-apercu__liste">
                        <div v-for="(r, i) in apercu.donnees.recipientsList" :key="i" class="sauv-apercu__personne">
                            • {{ r }}
                        </div>
                    </div>
                </div>
            </template>
        </template>
        <template v-if="!boutonsMasques" #footer>
            <button type="button" class="sauv-apercu__envoyer" @click="envoyer">✅ Confirmer et envoyer</button>
            <button type="button" class="sauv-apercu__annuler" @click="apercu = null">Annuler</button>
        </template>
    </AppModal>
</template>

<style scoped>
.sauv__aide {
    font-size: 12px;
    color: #666;
    margin: 0 0 15px 0;
    padding-left: 26px;
}
.sauv__bloc {
    padding-left: 26px;
    margin-bottom: 15px;
}
.sauv__rubrique {
    font-size: 12px;
    color: #555;
    font-weight: bold;
    display: block;
    margin-bottom: 8px;
}
.sauv__colonnes {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-start;
}
.sauv__colonne {
    flex: 1;
    min-width: 250px;
}
.sauv__petit {
    font-size: 11px;
    color: #777;
    font-weight: normal;
}
.sauv__groupes {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 5px;
}
.sauv__groupe {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    cursor: pointer;
    font-weight: normal;
}
.sauv__multiple {
    width: 100%;
    height: 100px;
    font-size: 12px;
}
.sauv__destinataires :deep(.gp-participants__cadre) {
    max-width: none;
    min-height: 60px;
    align-items: flex-start;
    align-content: flex-start;
}
.sauv__note {
    color: #999;
    font-size: 10px;
}
.sauv__frequence {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-end;
}
.sauv__choix {
    flex: 0 0 150px;
}
.sauv__heure {
    flex: 0 0 100px;
}
.sauv__liste {
    width: 100%;
}
.sauv__contenu {
    display: flex;
    gap: 15px;
    align-items: flex-start;
}
.sauv__part {
    width: 33%;
}
.sauv__options {
    width: 200px;
}
.sauv__entete {
    margin-bottom: 5px;
}
.sauv__tous {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    margin-bottom: 5px;
    font-weight: normal;
}
.sauv__tous input {
    margin: 0;
}
.sauv__vides {
    margin-bottom: 12px;
}
.sauv__format {
    display: block;
    margin-bottom: 3px;
}
.sauv__inactif {
    color: #999;
}
.sauv__outils {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-left: 26px;
    align-items: center;
}
.sauv__historique,
.sauv__historique:hover,
.sauv__diagnostic,
.sauv__diagnostic:hover,
.sauv__nettoyer,
.sauv__nettoyer:hover {
    color: white;
    white-space: nowrap;
}
.sauv__historique,
.sauv__historique:hover {
    background-color: #ff9800;
}
.sauv__diagnostic,
.sauv__diagnostic:hover {
    background-color: #9c27b0;
}
.sauv__nettoyer,
.sauv__nettoyer:hover {
    background-color: #f44336;
}
.sauv__message {
    padding-left: 26px;
    font-size: 12px;
    color: #2e7d32;
    white-space: pre-line;
}
.sauv__message--erreur {
    color: #e74c3c;
}
.sauv__test {
    margin-top: 20px;
    padding: 15px;
    background-color: #fff8e1;
    border-radius: 5px;
    border: 1px dashed #ffcc80;
}
.sauv__test-titre {
    font-size: 12px;
    font-weight: bold;
    color: #e65100;
}
.sauv__test-aide {
    font-size: 11px;
    color: #666;
    margin: 5px 0 10px 0;
}
.sauv__tester,
.sauv__tester:hover {
    background-color: #4caf50;
    color: white;
}
.sauv__resultat {
    margin-top: 10px;
    font-size: 12px;
}
.sauv__resultat--encours {
    color: #2196f3;
}
.sauv__resultat--erreur {
    color: #e74c3c;
}
.sauv-apercu__recap {
    margin-bottom: 20px;
}
.sauv-apercu__titre {
    color: #e65100;
    margin: 0 0 15px 0;
}
.sauv-apercu__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.sauv-apercu__tableau td {
    padding: 8px;
    border: 1px solid #ddd;
}
.sauv-apercu__tableau td.sauv-apercu__cle {
    background-color: #fff3e0;
    font-weight: bold;
    width: 150px;
}
.sauv-apercu__tableau td.sauv-apercu__fichier {
    font-family: monospace;
    font-size: 11px;
}
.sauv-apercu__complement {
    color: #666;
    font-size: 11px;
}
.sauv-apercu__destinataires {
    margin-bottom: 15px;
}
.sauv-apercu__sous-titre {
    color: #555;
    margin: 0 0 10px 0;
}
.sauv-apercu__liste {
    max-height: 150px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 10px;
    font-size: 12px;
}
.sauv-apercu__personne {
    padding: 3px 0;
}
.sauv-apercu__centre {
    text-align: center;
}
.sauv-apercu__encours {
    color: #2196f3;
}
.sauv-apercu__erreur {
    color: #e74c3c;
}
.sauv-apercu__bilan {
    text-align: center;
    padding: 20px;
}
.sauv-apercu__coche {
    font-size: 48px;
}
.sauv-apercu__succes {
    color: #4caf50;
    font-weight: bold;
    margin-top: 15px;
}
.sauv-apercu__uniques {
    color: #666;
    font-size: 12px;
}
.sauv-apercu__echecs {
    color: #f39c12;
}
.sauv-apercu__envoyer,
.sauv-apercu__envoyer:hover {
    background-color: #4caf50;
    color: white;
}
.sauv-apercu__annuler,
.sauv-apercu__annuler:hover {
    background-color: #95a5a6;
    color: white;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.sauv-apercu .gp-modale__boite {
    width: min(700px, 100%);
}
.gp-modale.sauv-apercu .gp-modale__titre {
    color: #e65100;
}
</style>
