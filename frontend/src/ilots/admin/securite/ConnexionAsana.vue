<!-- Connexion Asana : jeton (chiffré sur le serveur, jamais réaffiché), test, espace de travail, équipe, filtre des
     projets -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiAsana, type ConfigAsana, type ElementAsana } from '@/api/securite';
import { useConfirmation } from '@/composants/confirmation';

const confirmer = useConfirmation();
const config = ref<ConfigAsana | null>(null);
const erreurChargement = ref('');
const jeton = ref('');
const filtre = ref('');
const message = ref<{ ok: boolean; texte: string } | null>(null);
/** Après un test réussi : compte connecté et espaces de travail proposés */
const connexion = ref<{ nom: string; espaces: ElementAsana[] } | null>(null);
const espaceChoisi = ref('');
/** Équipes proposées (null : liste non demandée) */
const equipes = ref<ElementAsana[] | null>(null);
const lectureEquipes = ref(false);
const equipeChoisie = ref('');

const jetonEnregistre = computed(() => !!config.value?.tokenSet);
const signaler = (texte: string, ok: boolean) => (message.value = { ok, texte });
const erreurDe = (e: unknown) => (e as Error).message;

/** Configuration relue : message, test et listes de l'affichage précédent effacés */
async function charger() {
    message.value = null;
    connexion.value = null;
    equipes.value = null;
    jeton.value = '';
    try {
        config.value = await apiAsana.config();
        filtre.value = config.value.nameFilter;
        erreurChargement.value = '';
    } catch (e) {
        erreurChargement.value = erreurDe(e);
    }
}
defineExpose({ charger });

async function enregistrerJeton() {
    const v = jeton.value.trim();
    if (!v) {
        signaler("Collez le jeton avant d'enregistrer.", false);
        return;
    }
    try {
        await apiAsana.enregistrer({ token: v });
        await charger();
        signaler('Jeton enregistré (chiffré côté serveur). Testez maintenant la connexion.', true);
    } catch (e) {
        signaler(erreurDe(e), false);
    }
}

async function enregistrerFiltre() {
    try {
        await apiAsana.enregistrer({ nameFilter: filtre.value });
        signaler('Filtre enregistré.', true);
    } catch (e) {
        signaler(erreurDe(e), false);
    }
}

async function supprimerJeton() {
    if (!(await confirmer('Supprimer le jeton Asana enregistré ?', 'Supprimer'))) return;
    try {
        await apiAsana.supprimerJeton();
        await charger();
    } catch (e) {
        signaler(erreurDe(e), false);
    }
}

async function tester() {
    signaler('Connexion à Asana…', true);
    try {
        const d = await apiAsana.tester();
        const actuel = config.value?.workspaceGid || '';
        connexion.value = { nom: d.name, espaces: d.workspaces };
        espaceChoisi.value = d.workspaces.some(w => w.gid === actuel) ? actuel : (d.workspaces[0]?.gid ?? '');
        signaler('Connexion réussie.', true);
        // Espace de travail unique, ou aucun encore choisi : enregistré d'office
        if (d.workspaces.length === 1 || !actuel) await choisirEspace();
    } catch (e) {
        signaler(erreurDe(e), false);
    }
}

async function choisirEspace() {
    const w = connexion.value?.espaces.find(x => x.gid === espaceChoisi.value);
    if (!w || !config.value) return;
    try {
        await apiAsana.enregistrer({ workspaceGid: w.gid, workspaceName: w.name });
        config.value = { ...config.value, workspaceGid: w.gid, workspaceName: w.name };
        signaler(`Espace de travail « ${w.name} » enregistré.`, true);
    } catch (e) {
        signaler(erreurDe(e), false);
    }
}

async function chargerEquipes() {
    lectureEquipes.value = true;
    try {
        equipes.value = (await apiAsana.equipes()).teams;
        equipeChoisie.value = config.value?.teamGid || '';
    } catch (e) {
        equipes.value = null;
        signaler(erreurDe(e), false);
    } finally {
        lectureEquipes.value = false;
    }
}

async function choisirEquipe() {
    if (!config.value) return;
    const t = equipes.value?.find(x => x.gid === equipeChoisie.value);
    const teamName = t?.name ?? '';
    try {
        await apiAsana.enregistrer({ teamGid: equipeChoisie.value, teamName });
        config.value = { ...config.value, teamGid: equipeChoisie.value, teamName };
        signaler(
            t
                ? `Équipe « ${t.name} » enregistrée : seuls ses projets seront proposés.`
                : "Toutes les équipes de l'espace de travail sont concernées.",
            true
        );
    } catch (e) {
        signaler(erreurDe(e), false);
    }
}
</script>

<template>
    <hr class="asana__separation" />
    <h4 class="asana__titre">Connexion Asana — récupération des dates des déploiements de SAMU (lecture seule)</h4>
    <p class="asana__intro">
        Jeton d'accès personnel créé dans la console développeur d'Asana. Il est chiffré sur le serveur et n'est jamais
        réaffiché. L'utilisation (appairage des projets, récupération) se fait dans l'application « Aide à l'affectation
        opérationnelle ».
    </p>
    <div id="asanaCfgBox">
        <p v-if="erreurChargement" class="asana__erreur">{{ erreurChargement }}</p>
        <p v-else-if="!config" class="asana__attente">Chargement…</p>
        <template v-else>
            <div class="asana__jeton">
                <div class="asana__champ-jeton">
                    <label for="asanaTokenInput" class="asana__libelle">
                        Jeton d'accès personnel
                        <span v-if="jetonEnregistre" class="asana__badge asana__badge--ok">enregistré</span>
                        <span v-else class="asana__badge asana__badge--absent">non configuré</span>
                    </label>
                    <input
                        id="asanaTokenInput"
                        v-model="jeton"
                        type="password"
                        autocomplete="new-password"
                        :placeholder="
                            jetonEnregistre
                                ? 'Laisser vide pour conserver le jeton actuel'
                                : 'Collez ici le jeton Asana'
                        "
                        class="asana__saisie"
                    />
                </div>
                <button type="button" class="asana__enregistrer" @click="enregistrerJeton">Enregistrer</button>
                <button type="button" class="asana__tester" :disabled="!jetonEnregistre" @click="tester">
                    Tester la connexion
                </button>
                <button v-if="jetonEnregistre" type="button" class="asana__supprimer" @click="supprimerJeton">
                    Supprimer le jeton
                </button>
            </div>

            <div id="asanaWsBox" class="asana__ligne">
                <template v-if="connexion">
                    Connecté en tant que <b>{{ connexion.nom }}</b
                    >.
                    <label for="asanaWsSel">Espace de travail :</label>
                    <select id="asanaWsSel" v-model="espaceChoisi" class="asana__liste" @change="choisirEspace">
                        <option v-for="w in connexion.espaces" :key="w.gid" :value="w.gid">{{ w.name }}</option>
                    </select>
                </template>
                <template v-else-if="config.workspaceName">
                    Espace de travail : <b>{{ config.workspaceName }}</b>
                </template>
                <span v-else class="asana__discret">Testez la connexion pour choisir l'espace de travail.</span>
            </div>

            <div id="asanaTeamBox" class="asana__ligne">
                <span v-if="lectureEquipes" class="asana__discret">Lecture des équipes Asana…</span>
                <template v-else-if="equipes">
                    <label for="asanaTeamSel">Équipe :</label>
                    <select
                        id="asanaTeamSel"
                        v-model="equipeChoisie"
                        class="asana__liste asana__liste--equipe"
                        @change="choisirEquipe"
                    >
                        <option value="">— Toutes les équipes de l'espace de travail —</option>
                        <option v-for="t in equipes" :key="t.gid" :value="t.gid">{{ t.name }}</option>
                    </select>
                    <span class="asana__note">
                        Seuls les projets de cette équipe sont proposés dans l'aide à l'affectation.
                    </span>
                </template>
                <template v-else>
                    <template v-if="config.teamName"
                        >Équipe : <b>{{ config.teamName }}</b></template
                    >
                    <span v-else class="asana__discret">Équipe : toutes les équipes de l'espace de travail.</span>
                    <button
                        v-if="jetonEnregistre && config.workspaceGid"
                        type="button"
                        class="asana__equipes"
                        @click="chargerEquipes"
                    >
                        Choisir l'équipe…
                    </button>
                </template>
            </div>

            <div class="asana__filtre">
                <label for="asanaFilterInput" class="asana__libelle">
                    Projets concernés : filtre sur le nom (expression régulière)
                </label>
                <input id="asanaFilterInput" v-model="filtre" type="text" class="asana__saisie asana__saisie--filtre" />
                <button type="button" class="asana__enregistrer-filtre" @click="enregistrerFiltre">
                    Enregistrer le filtre
                </button>
                <div class="asana__aide">
                    Par défaut : les projets dont le nom contient « [SAMU 25] » (numéro entre crochets).
                </div>
            </div>
            <div
                id="asanaCfgMsg"
                role="status"
                class="asana__message"
                :class="message && (message.ok ? 'asana__message--ok' : 'asana__message--erreur')"
            >
                {{ message?.texte }}
            </div>
        </template>
    </div>
</template>

<style scoped>
.asana__separation {
    border: none;
    border-top: 1px solid #a5d6a7;
    margin: 22px 0 14px;
}
.asana__titre {
    color: #1b5e20;
    margin: 0 0 8px;
    font-size: 14px;
}
.asana__intro {
    color: #555;
    font-size: 13px;
    margin-bottom: 10px;
}
.asana__erreur {
    color: #c62828;
    font-size: 13px;
}
.asana__attente {
    color: #999;
    font-style: italic;
    font-size: 13px;
}
.asana__jeton {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: flex-end;
}
.asana__champ-jeton {
    flex: 1;
    min-width: 260px;
    max-width: 420px;
}
.asana__libelle {
    font-size: 12px;
    font-weight: bold;
    color: #333;
    display: block;
    margin-bottom: 4px;
}
.asana__badge {
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 11px;
}
.asana__badge--ok {
    background: #d7f2e3;
    color: #167a45;
}
.asana__badge--absent {
    background: #fbd9d9;
    color: #b3261e;
}
.asana__saisie {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #a5d6a7;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;
}
.asana__saisie--filtre {
    max-width: 420px;
    font-family: monospace;
}
.asana__enregistrer,
.asana__enregistrer:hover {
    background: #2e7d32;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
}
.asana__tester,
.asana__tester:hover {
    background: #1565c0;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.asana__tester:disabled {
    opacity: 0.5;
    cursor: default;
}
.asana__supprimer,
.asana__supprimer:hover {
    background: #fff;
    color: #c62828;
    border: 1px solid #e57373;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.asana__ligne {
    margin-top: 12px;
    font-size: 13px;
}
.asana__discret {
    color: #888;
}
.asana__liste {
    padding: 5px 8px;
    border: 1px solid #a5d6a7;
    border-radius: 4px;
}
.asana__liste--equipe {
    max-width: 340px;
}
.asana__note {
    color: #777;
    font-size: 11px;
}
.asana__equipes,
.asana__equipes:hover {
    margin-left: 8px;
    background: #fff;
    color: #1565c0;
    border: 1px solid #90caf9;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
.asana__filtre {
    margin-top: 12px;
}
.asana__enregistrer-filtre,
.asana__enregistrer-filtre:hover {
    margin-left: 6px;
    background: #558b2f;
    color: white;
    border: none;
    padding: 7px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
.asana__aide {
    font-size: 11px;
    color: #777;
    margin-top: 3px;
}
.asana__message {
    margin-top: 8px;
    font-size: 12px;
}
.asana__message--ok {
    color: #2e7d32;
}
.asana__message--erreur {
    color: #c62828;
}
</style>
