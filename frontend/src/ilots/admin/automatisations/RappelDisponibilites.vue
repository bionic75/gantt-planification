<!-- Automatisation n°1 : rappel de saisie des disponibilités du mois M+1 (jours avant la fin du mois, compte en copie),
     historique des envois, test : experts sans disponibilités, rappel envoyé aux experts cochés -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAutomatisations, type ExpertSansDisponibilite } from '@/api/automatisations';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import BlocAutomatisation from './BlocAutomatisation.vue';
import { configRappel, formulaireRappel, JOURS_AVANT_FIN, type FormulaireRappel } from './calculs';
import { useAutomatisationsStore } from './magasin';

const magasin = useAutomatisationsStore();
const confirmer = useConfirmation();

const f = ref<FormulaireRappel>(formulaireRappel({}, []));
/** Comptes de la copie : valeurs texte (identifiant enregistré tel quel, comme l'ancien écran) */
const comptesCopie = computed(() => magasin.comptes.map(o => ({ valeur: String(o.valeur), libelle: o.libelle })));

onMounted(async () => {
    await magasin.preparer();
    try {
        f.value = formulaireRappel((await apiAutomatisations.config(1)).config ?? {}, comptesCopie.value);
    } catch {
        /* valeurs initiales */
    }
});

async function enregistrer() {
    try {
        await apiAutomatisations.enregistrer(1, configRappel(f.value));
    } catch {
        /* configuration non enregistrée (ancien écran : erreur dans la console) */
    }
}

function basculer(actif: boolean) {
    f.value.actif = actif;
    enregistrer();
}

// ---------- Test ----------

const resultat = ref<{ texte: string; etat: 'encours' | 'attention' | 'ok' | 'erreur' } | null>(null);

interface FenetreTest {
    experts: ExpertSansDisponibilite[];
    mois: string;
    coches: boolean[];
    /** Envoi : en cours, terminé (envoyés, échecs) ou en erreur */
    envoi: 'encours' | { sent: number; failed: number } | 'erreur' | null;
    actions: boolean;
    message: string;
}
const test = ref<FenetreTest | null>(null);
/** Case « Sélectionner » de l'en-tête : sans effet sur les lignes (anomalie de l'ancien écran, conservée) */
const caseEntete = ref(true);

async function tester() {
    resultat.value = { texte: '🔍 Recherche en cours...', etat: 'encours' };
    try {
        const d = await apiAutomatisations.testRappel();
        const experts = d.expertsWithoutAvailability ?? [];
        if (experts.length) {
            caseEntete.value = true;
            test.value = {
                experts,
                mois: d.targetMonth,
                coches: experts.map(() => true),
                envoi: null,
                actions: true,
                message: ''
            };
            resultat.value = {
                texte: `⚠️ ${experts.length} expert(s) sans disponibilités sur ${d.targetMonth}`,
                etat: 'attention'
            };
        } else {
            resultat.value = {
                texte: `✅ Tous les experts ont renseigné leurs disponibilités pour ${d.targetMonth}`,
                etat: 'ok'
            };
        }
    } catch {
        resultat.value = { texte: '❌ Erreur lors du test', etat: 'erreur' };
    }
}

async function envoyerRappels() {
    const t = test.value;
    if (!t) return;
    const experts = t.experts.filter((_, i) => t.coches[i]);
    t.message = '';
    if (!experts.length) {
        t.message = 'Veuillez sélectionner au moins un expert';
        return;
    }
    if (!(await confirmer(`Envoyer un email de rappel à ${experts.length} expert(s) ?`, 'Envoyer', { danger: false })))
        return;
    t.envoi = 'encours';
    try {
        t.envoi = await apiAutomatisations.envoyerRappels(experts, t.mois);
        t.actions = false;
    } catch {
        t.envoi = 'erreur';
    }
}
</script>

<template>
    <BlocAutomatisation
        v-model:actif="f.actif"
        :numero="1"
        titre="Automatisation n°1 : Rappel de saisie des disponibilités"
        icone='<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'
        @bascule="basculer"
    >
        <p class="auto__aide">
            Envoie automatiquement un email aux experts qui n'ont pas renseigné leurs disponibilités pour le mois M+1, X
            jours avant la fin du mois en cours.
        </p>
        <div class="auto__ligne">
            <div class="auto__jours">
                <label for="automation1Days" class="auto__libelle">Jours avant fin du mois</label>
                <select id="automation1Days" v-model="f.jours" class="auto__liste" @change="enregistrer">
                    <option v-for="o in JOURS_AVANT_FIN" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                </select>
            </div>
            <div class="auto__copie">
                <label for="automation1CopyUser" class="auto__libelle">Mettre en copie (optionnel)</label>
                <select id="automation1CopyUser" v-model="f.copie" class="auto__liste" @change="enregistrer">
                    <option value="">-- Aucun --</option>
                    <option v-for="o in comptesCopie" :key="o.valeur" :value="o.valeur">{{ o.libelle }}</option>
                </select>
            </div>
            <div>
                <button type="button" class="auto__historique" @click="magasin.ouvrirEnvois(1)">
                    📋 Historique des envois
                </button>
            </div>
        </div>

        <div class="auto__test">
            <span class="auto__test-titre">🧪 Test de l'automatisation</span>
            <p class="auto__test-aide">
                Recherche les experts sans disponibilités sur le mois M+1 et propose d'envoyer un email de rappel.
            </p>
            <button type="button" class="auto__tester" @click="tester">🔍 Tester maintenant</button>
            <div id="automation1TestResult" role="status" class="auto__resultat">
                <span v-if="resultat" :key="resultat.texte" :class="`auto__resultat--${resultat.etat}`">{{
                    resultat.texte
                }}</span>
            </div>
        </div>
    </BlocAutomatisation>

    <AppModal
        id="automationTestModal"
        :opened="!!test"
        title="🧪 Test - Experts sans disponibilités M+1"
        class="auto-test"
        @close="test = null"
    >
        <template v-if="test">
            <p v-if="test.envoi === 'encours'" class="auto-test__centre auto-test__encours">
                📧 Envoi des emails en cours...
            </p>
            <div v-else-if="test.envoi && test.envoi !== 'erreur'" class="auto-test__bilan">
                <span class="auto-test__coche" aria-hidden="true">✅</span>
                <p class="auto-test__succes">{{ test.envoi.sent }} email(s) envoyé(s) avec succès</p>
                <p v-if="test.envoi.failed > 0" class="auto-test__echecs">{{ test.envoi.failed }} échec(s)</p>
            </div>
            <p v-else-if="test.envoi === 'erreur'" class="auto-test__centre auto-test__erreur">
                ❌ Erreur lors de l'envoi
            </p>
            <template v-else>
                <p class="auto-test__intro">
                    <strong>{{ test.experts.length }} expert(s)</strong> n'ont pas renseigné leurs disponibilités pour
                    <strong>{{ test.mois }}</strong> :
                </p>
                <div class="auto-test__liste">
                    <table class="auto-test__tableau">
                        <thead>
                            <tr>
                                <th>
                                    <label class="auto-test__tous">
                                        <input v-model="caseEntete" type="checkbox" /> Sélectionner
                                    </label>
                                </th>
                                <th>Expert</th>
                                <th>Email</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(e, i) in test.experts" :key="e.id">
                                <td>
                                    <input
                                        v-model="test.coches[i]"
                                        type="checkbox"
                                        :aria-label="`Envoyer un rappel à ${e.prenom} ${e.nom}`"
                                    />
                                </td>
                                <td>{{ e.prenom }} {{ e.nom }}</td>
                                <td>{{ e.email }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
            <p v-if="test.message" role="alert" class="auto-test__message">{{ test.message }}</p>
        </template>
        <template v-if="test?.actions" #footer>
            <button type="button" class="auto-test__envoyer" @click="envoyerRappels">
                📧 Envoyer un rappel à tous
            </button>
            <button type="button" class="auto-test__fermer" @click="test = null">Fermer</button>
        </template>
    </AppModal>
</template>

<style scoped>
.auto__aide {
    font-size: 12px;
    color: #666;
    margin: 0 0 15px 0;
    padding-left: 26px;
}
.auto__ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    padding-left: 26px;
    align-items: flex-end;
}
.auto__jours {
    flex: 0 0 150px;
}
.auto__copie {
    flex: 1;
    min-width: 200px;
}
.auto__libelle {
    font-size: 12px;
    color: #555;
}
.auto__liste {
    width: 100%;
}
.auto__historique,
.auto__historique:hover {
    background-color: #ff9800;
    color: white;
    white-space: nowrap;
}
.auto__test {
    margin-top: 20px;
    padding: 15px;
    background-color: #fff8e1;
    border-radius: 5px;
    border: 1px dashed #ffcc80;
}
.auto__test-titre {
    font-size: 12px;
    font-weight: bold;
    color: #e65100;
}
.auto__test-aide {
    font-size: 11px;
    color: #666;
    margin: 5px 0 10px 0;
}
.auto__tester,
.auto__tester:hover {
    background-color: #4caf50;
    color: white;
}
.auto__resultat {
    margin-top: 10px;
    font-size: 12px;
}
.auto__resultat--encours {
    color: #2196f3;
}
.auto__resultat--attention {
    color: #f39c12;
}
.auto__resultat--ok {
    color: #4caf50;
}
.auto__resultat--erreur {
    color: #e74c3c;
}
.auto-test__intro {
    margin-bottom: 15px;
}
.auto-test__liste {
    max-height: 300px;
    overflow-y: auto;
}
.auto-test__tableau {
    width: 100%;
    border-collapse: collapse;
}
.auto-test__tableau th {
    padding: 10px;
    text-align: left;
    position: sticky;
    top: 0;
    background: #f5f5f5;
}
.auto-test__tableau td {
    padding: 10px;
}
.auto-test__tableau tbody tr {
    border-bottom: 1px solid #ddd;
}
.auto-test__tous {
    cursor: pointer;
}
.auto-test__centre {
    text-align: center;
}
.auto-test__encours {
    color: #2196f3;
}
.auto-test__erreur {
    color: #e74c3c;
}
.auto-test__bilan {
    text-align: center;
    padding: 20px;
}
.auto-test__coche {
    font-size: 48px;
}
.auto-test__succes {
    color: #4caf50;
    font-weight: bold;
    margin-top: 15px;
}
.auto-test__echecs {
    color: #f39c12;
}
.auto-test__message {
    color: #e74c3c;
}
.auto-test__envoyer,
.auto-test__envoyer:hover {
    background-color: #4caf50;
    color: white;
}
.auto-test__fermer,
.auto-test__fermer:hover {
    background-color: #95a5a6;
    color: white;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.auto-test .gp-modale__boite {
    width: min(700px, 100%);
}
.gp-modale.auto-test .gp-modale__titre {
    color: #4caf50;
}
</style>
