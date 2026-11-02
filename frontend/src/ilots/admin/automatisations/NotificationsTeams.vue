<!-- Automatisation n°3 : notifications envoyées vers un canal Microsoft Teams (adresse e-mail du canal, types de
     notifications), configuration affichée si l'automatisation est active ; historique, message de test -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiAutomatisations } from '@/api/automatisations';
import { ErreurApi } from '@/api/client';
import BlocAutomatisation from './BlocAutomatisation.vue';
import { configTeams, formulaireTeams, NOTIFICATIONS_TEAMS, type FormulaireTeams } from './calculs';
import { useAutomatisationsStore } from './magasin';

const magasin = useAutomatisationsStore();

const f = ref<FormulaireTeams>(formulaireTeams({}));

onMounted(async () => {
    try {
        f.value = formulaireTeams((await apiAutomatisations.config(3)).config ?? {});
    } catch {
        /* valeurs initiales */
    }
});

async function enregistrer() {
    try {
        await apiAutomatisations.enregistrer(3, configTeams(f.value));
    } catch {
        /* configuration non enregistrée (ancien écran : erreur dans la console) */
    }
}

function basculer(actif: boolean) {
    f.value.actif = actif;
    enregistrer();
}

function choisir(type: string, coche: boolean) {
    const autres = f.value.notifications.filter(t => t !== type);
    f.value.notifications = coche ? [...autres, type] : autres;
    enregistrer();
}

// ---------- Test ----------

const resultat = ref<{ texte: string; etat: 'encours' | 'ok' | 'erreur' } | null>(null);

async function tester() {
    if (!f.value.adresse) {
        resultat.value = { texte: "❌ Veuillez renseigner l'adresse email du canal Teams", etat: 'erreur' };
        return;
    }
    resultat.value = { texte: '📤 Envoi du message de test...', etat: 'encours' };
    try {
        await apiAutomatisations.testTeams(f.value.adresse);
        resultat.value = { texte: '✅ Message de test envoyé avec succès ! Vérifiez votre canal Teams.', etat: 'ok' };
    } catch (e) {
        const message =
            e instanceof ErreurApi
                ? ((e.donnees as { error?: string } | null)?.error ?? 'Erreur inconnue')
                : (e as Error).message;
        resultat.value = { texte: `❌ Erreur: ${message}`, etat: 'erreur' };
    }
}
</script>

<template>
    <BlocAutomatisation
        v-model:actif="f.actif"
        :numero="3"
        titre="Automatisation n°3 : Notifications envoyées vers Teams"
        icone='<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'
        @bascule="basculer"
    >
        <p class="teams__aide">
            Envoie automatiquement des notifications par email vers un canal Microsoft Teams lorsque certains événements
            se produisent.
        </p>

        <div v-show="f.actif" id="automation3Config" class="teams__config">
            <div class="teams__groupe">
                <label for="automation3TeamsEmail" class="teams__libelle">Adresse email du canal Teams *</label>
                <input
                    id="automation3TeamsEmail"
                    v-model="f.adresse"
                    type="email"
                    placeholder="xxxxxxxx.domaine.fr@fr.teams.ms"
                    class="teams__adresse"
                    @change="enregistrer"
                />
                <p class="teams__note">
                    Pour obtenir cette adresse : Dans Teams, clic droit sur le canal → "Obtenir l'adresse e-mail"
                </p>
            </div>

            <div class="teams__groupe">
                <span class="teams__libelle teams__libelle--types">Types de notifications à envoyer :</span>
                <div id="automation3NotifList" class="teams__types">
                    <label
                        v-for="t in NOTIFICATIONS_TEAMS"
                        :key="t.valeur"
                        class="teams__type"
                        :class="{ 'teams__type--choisi': f.notifications.includes(t.valeur) }"
                    >
                        <input
                            type="checkbox"
                            :data-value="t.valeur"
                            :checked="f.notifications.includes(t.valeur)"
                            class="teams__case"
                            @change="choisir(t.valeur, ($event.target as HTMLInputElement).checked)"
                        />
                        <!-- Tracés constants des types de notifications -->
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <svg class="teams__icone" viewBox="0 0 24 24" aria-hidden="true" v-html="t.icone" />
                        <span class="teams__nom">{{ t.libelle }}</span>
                    </label>
                </div>
                <p class="teams__note">Cochez les types de notifications à envoyer vers Teams</p>
            </div>

            <div class="teams__outils">
                <button type="button" class="teams__historique" @click="magasin.ouvrirEnvois(3)">
                    📋 Historique des envois
                </button>
            </div>

            <div class="teams__test">
                <span class="teams__test-titre">🧪 Test de la notification Teams</span>
                <p class="teams__test-aide">
                    Envoie un message de test vers le canal Teams configuré pour vérifier que la connexion fonctionne.
                </p>
                <button type="button" class="teams__tester" @click="tester">🔍 Envoyer un test</button>
                <div id="automation3TestResult" role="status" class="teams__resultat">
                    <span v-if="resultat" :key="resultat.texte" :class="`teams__resultat--${resultat.etat}`">{{
                        resultat.texte
                    }}</span>
                </div>
            </div>
        </div>
    </BlocAutomatisation>
</template>

<style scoped>
.teams__aide {
    font-size: 12px;
    color: #666;
    margin: 0 0 15px 0;
    padding-left: 26px;
}
.teams__config {
    padding-left: 26px;
}
.teams__groupe {
    margin-bottom: 15px;
}
.teams__libelle {
    font-size: 12px;
    color: #555;
    display: block;
    margin-bottom: 5px;
    font-weight: normal;
}
.teams__libelle--types {
    margin-bottom: 8px;
}
.teams__adresse {
    width: 100%;
    max-width: 400px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}
.teams__note {
    font-size: 10px;
    color: #999;
    margin: 5px 0 0 0;
}
.teams__types {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 400px;
}
.teams__type {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid #d5dae6;
    background: #fff;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: #2c3e50;
    transition: all 0.15s;
    font-weight: normal;
}
.teams__type--choisi {
    border-color: #3949ab;
    background: #eef0fb;
}
.teams__case {
    width: 16px;
    height: 16px;
    margin: 0;
    flex-shrink: 0;
}
.teams__icone {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    fill: none;
    stroke: #7a8799;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.teams__type--choisi .teams__icone {
    stroke: #3949ab;
}
.teams__type--choisi .teams__nom {
    font-weight: 600;
}
.teams__outils {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 15px;
}
.teams__historique,
.teams__historique:hover {
    background-color: #ff9800;
    color: white;
    white-space: nowrap;
}
.teams__test {
    margin-top: 20px;
    padding: 15px;
    background-color: #fff8e1;
    border-radius: 5px;
    border: 1px dashed #ffcc80;
}
.teams__test-titre {
    font-size: 12px;
    font-weight: bold;
    color: #e65100;
}
.teams__test-aide {
    font-size: 11px;
    color: #666;
    margin: 5px 0 10px 0;
}
.teams__tester,
.teams__tester:hover {
    background-color: #4caf50;
    color: white;
}
.teams__resultat {
    margin-top: 10px;
    font-size: 12px;
}
.teams__resultat--encours {
    color: #2196f3;
}
.teams__resultat--ok {
    color: #4caf50;
}
.teams__resultat--erreur {
    color: #e74c3c;
}
</style>
