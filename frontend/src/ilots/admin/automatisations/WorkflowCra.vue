<!-- Automatisation n°4 : workflow du compte rendu d'activité (jour de déclenchement, viseurs et DRH parmi les comptes
     RH, experts d'astreinte participants) ; test : rappel envoyé maintenant, journal détaillé -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAutomatisations, type ExpertCra } from '@/api/automatisations';
import { ErreurApi } from '@/api/client';
import { apiParametres } from '@/api/parametrages';
import AppModal from '@/composants/AppModal.vue';
import BlocAutomatisation from './BlocAutomatisation.vue';
import {
    configCra,
    couleurJournal,
    formulaireCra,
    JOURS_DECLENCHEMENT,
    libelleRh,
    type CompteRh,
    type FormulaireCra
} from './calculs';
import { useAutomatisationsStore } from './magasin';

const magasin = useAutomatisationsStore();

/** Comptes RH actifs : viseurs et DRH */
const rh = computed<CompteRh[]>(() =>
    magasin.utilisateurs
        .filter(u => u.is_rh === 1 && u.actif === 1)
        .map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email }))
);
const f = ref<FormulaireCra>(formulaireCra({}, []));
const experts = ref<ExpertCra[] | null>(null);

onMounted(async () => {
    try {
        experts.value = await apiAutomatisations.expertsCra();
    } catch {
        /* liste non affichée */
    }
    await magasin.preparer();
    try {
        const parametres = await apiParametres.lire();
        const c = parametres.automation_4_config ? JSON.parse(parametres.automation_4_config) : {};
        f.value = formulaireCra(c, rh.value);
    } catch {
        /* valeurs initiales */
    }
});

async function enregistrer() {
    // Boutons de visa du détail d'un CRA : configuration relue à chaque ouverture (frontend/src/ilots/cra)
    const config = configCra(f.value, rh.value);
    try {
        await apiParametres.enregistrer('automation_4_config', JSON.stringify(config));
    } catch {
        /* configuration non enregistrée (ancien écran : erreur dans la console) */
    }
}

function basculer(actif: boolean) {
    f.value.actif = actif;
    enregistrer();
}

// ---------- Test ----------

const expertTest = ref('');
const resultat = ref<{ etat: 'encours' | 'ok' | 'erreur' | 'reseau'; texte: string } | null>(null);
const journal = ref<string[]>([]);
const journalOuvert = ref(false);

async function tester() {
    resultat.value = { etat: 'encours', texte: '⏳ Test en cours...' };
    try {
        const d = await apiAutomatisations.declencherCra(expertTest.value || null);
        journal.value = d.logs ?? [];
        resultat.value = d.success
            ? { etat: 'ok', texte: `✅ ${d.sent} email(s) mis en queue — ` }
            : { etat: 'erreur', texte: '❌ Erreur — ' };
    } catch (e) {
        if (e instanceof ErreurApi) {
            journal.value = (e.donnees as { logs?: string[] } | null)?.logs ?? [];
            resultat.value = { etat: 'erreur', texte: '❌ Erreur — ' };
        } else resultat.value = { etat: 'reseau', texte: `❌ Erreur réseau : ${(e as Error).message}` };
    }
}

const expertsTest = computed(() => (experts.value ?? []).filter(e => e.user_id));
</script>

<template>
    <BlocAutomatisation
        v-model:actif="f.actif"
        :numero="4"
        titre="Automatisation n°4 : Workflow Compte-Rendu d'Activité"
        teinte="violet"
        icone='<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'
        @bascule="basculer"
    >
        <p class="cra__aide">
            Déclenche chaque mois un rappel aux experts astreinte pour compléter leur CRA du mois précédent, puis gère
            le circuit de visa jusqu'à la diffusion auprès des RH.
        </p>
        <div class="cra__contenu">
            <div class="cra__ligne">
                <div class="cra__champ cra__champ--jour">
                    <label for="automation4Day" class="cra__libelle">Jour du mois de déclenchement</label>
                    <select id="automation4Day" v-model="f.jour" class="cra__liste" @change="enregistrer">
                        <option v-for="o in JOURS_DECLENCHEMENT" :key="o.valeur" :value="o.valeur">
                            {{ o.libelle }}
                        </option>
                    </select>
                </div>
                <div class="cra__champ">
                    <label for="automation4AdminN1" class="cra__libelle"
                        >Administrateur niveau 1 (premier viseur)</label
                    >
                    <select id="automation4AdminN1" v-model="f.n1" class="cra__liste" @change="enregistrer">
                        <option value="">-- Choisir --</option>
                        <option v-for="u in rh" :key="u.id" :value="String(u.id)">{{ libelleRh(u) }}</option>
                    </select>
                </div>
                <div class="cra__champ">
                    <label for="automation4AdminN2" class="cra__libelle"
                        >Administrateur niveau 2 (deuxième viseur)</label
                    >
                    <select id="automation4AdminN2" v-model="f.n2" class="cra__liste" @change="enregistrer">
                        <option value="">-- Choisir --</option>
                        <option v-for="u in rh" :key="u.id" :value="String(u.id)">{{ libelleRh(u) }}</option>
                    </select>
                </div>
                <div class="cra__champ cra__champ--drh">
                    <label for="automation4DrhAns" class="cra__libelle">DRH ANS (un ou plusieurs, Ctrl+clic)</label>
                    <select id="automation4DrhAns" v-model="f.drh" multiple class="cra__drh" @change="enregistrer">
                        <option v-for="u in rh" :key="u.id" :value="u.id">{{ libelleRh(u) }}</option>
                    </select>
                </div>
            </div>
            <div>
                <span class="cra__rubrique">👥 Experts participants au workflow CRA (astreinte_volontaire = 1)</span>
                <div id="automation4ExpertsList" class="cra__experts">
                    <template v-if="experts">
                        <p v-if="!experts.length" class="cra__aucun">Aucun expert avec astreinte activée.</p>
                        <div v-for="(e, i) in experts" v-else :key="i" class="cra__expert">
                            <strong class="cra__nom">{{ (e.nom || '').toUpperCase() }} {{ e.prenom || '' }}</strong>
                            <span class="cra__rattachement">{{ e.samu || '' }} — {{ e.es_rattachement || '' }}</span>
                            <span class="cra__contacts">📧 Contacts RH définis dans la fiche ressource</span>
                        </div>
                    </template>
                </div>
            </div>
            <div class="cra__test">
                <span class="cra__test-titre">🧪 Test de l'automatisation</span>
                <p class="cra__test-aide">
                    Envoie immédiatement le rappel CRA à l'expert sélectionné (ou à tous si aucun sélectionné).
                </p>
                <div class="cra__test-ligne">
                    <select
                        id="automation4TestExpert"
                        v-model="expertTest"
                        aria-label="Expert du test"
                        class="cra__test-expert"
                    >
                        <option value="">— Tous les experts éligibles —</option>
                        <option v-for="e in expertsTest" :key="e.user_id!" :value="String(e.user_id)">
                            {{ e.prenom }} {{ e.nom }}
                        </option>
                    </select>
                    <button type="button" class="cra__tester" @click="tester">🔍 Tester maintenant</button>
                </div>
                <div id="automation4TestResult" role="status" class="cra__resultat">
                    <template v-if="resultat">
                        <span :key="resultat.texte">{{ resultat.texte }}</span>
                        <button
                            v-if="resultat.etat === 'ok' || resultat.etat === 'erreur'"
                            type="button"
                            class="cra__logs"
                            :class="{ 'cra__logs--erreur': resultat.etat === 'erreur' }"
                            @click="journalOuvert = true"
                        >
                            <span :key="resultat.etat">{{
                                resultat.etat === 'ok' ? '📋 Voir les logs détaillés' : '📋 Voir les logs'
                            }}</span>
                        </button>
                    </template>
                </div>
            </div>
        </div>
    </BlocAutomatisation>

    <AppModal
        id="craTestLogsModal"
        :opened="journalOuvert"
        title="📋 Logs — Test Automation CRA"
        class="cra-journal"
        @close="journalOuvert = false"
    >
        <div class="cra-journal__lignes">
            <div v-for="(l, i) in journal" :key="i" :class="`cra-journal__ligne--${couleurJournal(l)}`">{{ l }}</div>
        </div>
        <template #footer>
            <button type="button" class="cra-journal__fermer" @click="journalOuvert = false">Fermer</button>
        </template>
    </AppModal>
</template>

<style scoped>
.cra__aide {
    font-size: 12px;
    color: #666;
    margin: 0 0 15px 0;
    padding-left: 26px;
}
.cra__contenu {
    padding-left: 26px;
    display: flex;
    flex-direction: column;
    gap: 15px;
}
.cra__ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-start;
}
.cra__champ {
    flex: 0 0 220px;
    display: flex;
    flex-direction: column;
}
.cra__champ--jour {
    flex-basis: 180px;
}
.cra__champ--drh {
    flex-basis: 260px;
}
.cra__libelle {
    font-size: 12px;
    color: #555;
    min-height: 34px;
    display: flex;
    align-items: flex-end;
    padding-bottom: 4px;
    font-weight: normal;
}
.cra__liste {
    width: 100%;
}
.cra__drh {
    width: 100%;
    height: 72px;
    border: 1px solid #b39ddb;
    border-radius: 4px;
    padding: 4px;
}
.cra__rubrique {
    font-size: 12px;
    color: #6a1b9a;
    font-weight: bold;
    display: block;
    margin-bottom: 8px;
}
.cra__experts {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #e1bee7;
    border-radius: 6px;
}
.cra__aucun {
    padding: 15px;
    color: #999;
    font-size: 12px;
}
.cra__expert {
    padding: 10px 15px;
    border-bottom: 1px solid #f3e5f5;
    display: flex;
    align-items: center;
    gap: 10px;
}
.cra__nom {
    font-size: 13px;
    min-width: 180px;
}
.cra__rattachement {
    font-size: 11px;
    color: #666;
}
.cra__contacts {
    font-size: 11px;
    color: #9c27b0;
    margin-left: auto;
}
.cra__test {
    padding: 15px;
    background-color: #f3e5f5;
    border-radius: 5px;
    border: 1px dashed #b39ddb;
}
.cra__test-titre {
    font-size: 12px;
    font-weight: bold;
    color: #6a1b9a;
}
.cra__test-aide {
    font-size: 11px;
    color: #666;
    margin: 5px 0 10px 0;
}
.cra__test-ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
}
.cra__test-expert {
    padding: 6px 10px;
    border: 1px solid #ce93d8;
    border-radius: 4px;
    font-size: 12px;
    min-width: 200px;
}
.cra__tester,
.cra__tester:hover {
    background-color: #9c27b0;
    color: white;
}
.cra__resultat {
    margin-top: 10px;
    font-size: 12px;
}
.cra__logs,
.cra__logs:hover {
    background: none;
    border: none;
    color: #6a1b9a;
    cursor: pointer;
    text-decoration: underline;
    font-size: 12px;
    padding: 0;
}
.cra__logs--erreur,
.cra__logs--erreur:hover {
    color: #e53935;
}
.cra-journal__lignes {
    padding: 16px;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.8;
    background: #1e1e2e;
    color: #cdd6f4;
    white-space: pre-wrap;
}
.cra-journal__ligne--ok {
    color: #a6e3a1;
}
.cra-journal__ligne--erreur {
    color: #f38ba8;
}
.cra-journal__ligne--etape {
    color: #89b4fa;
}
.cra-journal__ligne--detail {
    color: #cba6f7;
}
.cra-journal__fermer,
.cra-journal__fermer:hover {
    background: #6a1b9a;
    color: white;
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.cra-journal .gp-modale__boite {
    width: min(700px, 100%);
}
.gp-modale.cra-journal .gp-modale__entete {
    background: #2c3e50;
    color: white;
}
.gp-modale.cra-journal .gp-modale__titre {
    color: white;
}
</style>
