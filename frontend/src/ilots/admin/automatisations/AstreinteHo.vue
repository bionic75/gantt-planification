<!-- Automatisations n°5 (construction du planning d'astreinte HO de la semaine S+1, envoyé aux experts HO) et n°6
     (communication du planning d'astreinte HO) : jour(s) et heure d'envoi, destinataires, sujet et corps du mail ;
     configuration enregistrée à chaque changement, envoi immédiat -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAutomatisations, type InfosHo } from '@/api/automatisations';
import BlocAutomatisation from './BlocAutomatisation.vue';
import { configHo, formulaireHo, HEURES, JOURS_HO, type FormulaireHo, type Option } from './calculs';
import { useAutomatisationsStore } from './magasin';

const props = defineProps<{ numero: 5 | 6 }>();
const magasin = useAutomatisationsStore();

const infos = ref<InfosHo | null>(null);
const f = ref<FormulaireHo>(formulaireHo(props.numero, {}, { subject: '', body: '' }, []));

/** N°5 : experts HO ayant un compte ; n°6 : tous les comptes actifs */
const destinataires = computed<Option<number>[]>(() =>
    props.numero === 5
        ? (infos.value?.experts ?? [])
              .filter(e => e.user_id)
              .map(e => ({ valeur: e.user_id!, libelle: `${e.prenom} ${e.nom}${e.email ? '' : ' (sans e-mail)'}` }))
        : magasin.utilisateurs.filter(u => u.actif !== 0).map(u => ({ valeur: u.id, libelle: `${u.prenom} ${u.nom}` }))
);

onMounted(async () => {
    const [i] = await Promise.all([magasin.chargerInfosHo(), magasin.preparer()]);
    if (!i) return;
    try {
        const c = (await apiAutomatisations.config(props.numero)).config ?? {};
        infos.value = i;
        f.value = formulaireHo(props.numero, c, i.templates[props.numero], destinataires.value);
    } catch {
        /* écran non rempli (ancien écran : erreur dans la console) */
    }
});

const message = ref<{ texte: string; etat: 'ok' | 'erreur' | 'encours' | 'attention' } | null>(null);

async function enregistrer() {
    try {
        await apiAutomatisations.enregistrer(props.numero, configHo(props.numero, f.value, destinataires.value));
        message.value = { texte: '✔ Configuration enregistrée', etat: 'ok' };
    } catch (e) {
        message.value = { texte: `Erreur : ${(e as Error).message}`, etat: 'erreur' };
    }
}

function basculer(actif: boolean) {
    f.value.actif = actif;
    enregistrer();
}

function choisirJour(jour: string, coche: boolean) {
    const autres = f.value.jours.filter(j => j !== jour);
    f.value.jours = coche ? [...autres, jour] : autres;
    enregistrer();
}

/** Envoi immédiat : configuration enregistrée puis mail envoyé */
async function envoyer() {
    message.value = { texte: 'Envoi en cours…', etat: 'encours' };
    await enregistrer();
    try {
        const r = await apiAutomatisations.envoyerHo(props.numero);
        message.value = r.sent
            ? { texte: `✔ Mail envoyé à ${r.recipients} destinataire(s) — ${r.week}`, etat: 'ok' }
            : { texte: `Aucun envoi : ${r.reason}`, etat: 'attention' };
    } catch (e) {
        message.value = { texte: `Erreur : ${(e as Error).message}`, etat: 'erreur' };
    }
}

const id = (champ: string) => `automation${props.numero}${champ}`;
</script>

<template>
    <BlocAutomatisation
        v-model:actif="f.actif"
        :numero="numero"
        :titre="
            numero === 5
                ? '🗓️ Automatisation n°5 : Construction du planning d\'astreinte HO pour la semaine S+1'
                : '🗓️ Automatisation n°6 : Communication du planning d\'astreinte HO'
        "
        teinte="vert"
        @bascule="basculer"
    >
        <p class="ho__aide">
            {{
                numero === 5
                    ? 'Chaque semaine, envoie aux experts déclarés pour les astreintes HO le planning de la semaine suivante (S+1) à compléter.'
                    : "Communique le planning d'astreinte HO aux destinataires choisis, aux jours et à l'heure paramétrés."
            }}
        </p>
        <div class="ho__contenu">
            <div class="ho__ligne">
                <div v-if="numero === 5" class="ho__champ ho__champ--jour">
                    <label for="automation5WeekDay" class="ho__libelle">Jour d'envoi (semaine)</label>
                    <select id="automation5WeekDay" v-model="f.jour" class="ho__liste" @change="enregistrer">
                        <option v-for="j in infos ? JOURS_HO : []" :key="j.valeur" :value="j.valeur">
                            {{ j.libelle }}
                        </option>
                    </select>
                </div>
                <div v-else class="ho__champ ho__champ--jours">
                    <span class="ho__libelle">Jour(s) d'envoi</span>
                    <div id="automation6WeekDays" class="ho-checks">
                        <label v-for="j in infos ? JOURS_HO : []" :key="j.valeur" class="ho-check">
                            <input
                                type="checkbox"
                                class="automation6Day"
                                :value="j.valeur"
                                :checked="f.jours.includes(j.valeur)"
                                @change="choisirJour(j.valeur, ($event.target as HTMLInputElement).checked)"
                            />
                            {{ j.libelle }}
                        </label>
                    </div>
                </div>
                <div class="ho__champ ho__champ--heure">
                    <label :for="id('Hour')" class="ho__libelle">Heure d'envoi</label>
                    <select :id="id('Hour')" v-model="f.heure" class="ho__liste" @change="enregistrer">
                        <option v-for="h in infos ? HEURES : []" :key="h.valeur" :value="h.valeur">
                            {{ h.libelle }}
                        </option>
                    </select>
                </div>
                <div v-if="numero === 6" class="ho__champ ho__champ--semaine">
                    <label for="automation6Week" class="ho__libelle">Semaine communiquée</label>
                    <select id="automation6Week" v-model="f.semaine" class="ho__liste" @change="enregistrer">
                        <option value="current">Semaine en cours</option>
                        <option value="next">Semaine suivante</option>
                    </select>
                </div>
            </div>

            <div>
                <span class="ho__rubrique">
                    {{
                        numero === 5
                            ? '👥 Destinataires : experts métier déclarés pour les astreintes HO'
                            : "👥 Destinataires : parmi tous les utilisateurs de l'application"
                    }}
                </span>
                <label v-if="numero === 5" class="ho-check ho__tous">
                    <input
                        id="automation5AllExperts"
                        v-model="f.tousLesExperts"
                        type="checkbox"
                        @change="enregistrer"
                    />
                    Tous les experts HO
                </label>
                <div v-else class="ho-checks ho__groupes">
                    <label class="ho-check">
                        <input
                            id="automation6GroupAdmin"
                            v-model="f.groupeAdmin"
                            type="checkbox"
                            @change="enregistrer"
                        />
                        Tous les administrateurs
                    </label>
                    <label class="ho-check">
                        <input
                            id="automation6GroupUser"
                            v-model="f.groupeUtilisateur"
                            type="checkbox"
                            @change="enregistrer"
                        />
                        Tous les utilisateurs
                    </label>
                    <label class="ho-check">
                        <input
                            id="automation6GroupExpert"
                            v-model="f.groupeExpert"
                            type="checkbox"
                            @change="enregistrer"
                        />
                        Tous les experts
                    </label>
                </div>
                <select
                    :id="id('Recipients')"
                    v-model="f.destinataires"
                    multiple
                    :aria-label="numero === 5 ? 'Experts destinataires' : 'Utilisateurs destinataires'"
                    class="ho__destinataires"
                    :class="{ 'ho__destinataires--tous': numero === 6 }"
                    @change="enregistrer"
                >
                    <option v-for="d in infos ? destinataires : []" :key="d.valeur" :value="d.valeur">
                        {{ d.libelle }}
                    </option>
                </select>
                <div class="ho__note">
                    {{
                        numero === 5
                            ? 'Décochez « Tous » pour choisir les destinataires (Ctrl+clic). Seuls les experts ayant un compte avec e-mail sont listés.'
                            : 'Sélection individuelle : Ctrl+clic.'
                    }}
                </div>
            </div>

            <div>
                <label :for="id('Subject')" class="ho__libelle ho__libelle--bloc">Sujet du mail</label>
                <input :id="id('Subject')" v-model="f.sujet" type="text" class="ho__sujet" @change="enregistrer" />
            </div>
            <div>
                <label :for="id('Text')" class="ho__libelle ho__libelle--bloc">Corps du mail</label>
                <textarea
                    :id="id('Text')"
                    v-model="f.corps"
                    rows="8"
                    class="ho__corps"
                    @change="enregistrer"
                ></textarea>
                <div :id="id('Fields')" class="ho__champs">
                    <template v-if="infos">
                        Champs disponibles :
                        <template v-for="(c, i) in infos.fields ?? []" :key="c[0]">
                            <template v-if="i"> · </template><code>{{ c[0] }}</code> {{ c[1] }}
                        </template>
                    </template>
                </div>
            </div>

            <div v-if="numero === 6" class="ho__info">
                ℹ️ <strong>Mise à jour automatique</strong> : si le planning de la <em>semaine en cours</em> est modifié
                (par un expert ou un administrateur), le mail est renvoyé immédiatement aux mêmes destinataires, avec «
                MAJ » en tête du sujet et la liste des modifications dans le corps du mail.
            </div>
            <div class="ho__envoi">
                <span class="ho__envoi-titre">🧪 Envoi immédiat</span>
                <p class="ho__envoi-aide">
                    Envoie le mail maintenant, avec la configuration enregistrée, sans attendre le jour et l'heure
                    choisis.
                </p>
                <button type="button" class="ho__envoyer" @click="envoyer">📨 Envoyer maintenant</button>
                <span :id="id('Msg')" role="status" class="ho__message">
                    <span v-if="message" :key="message.texte" :class="`ho__message--${message.etat}`">{{
                        message.texte
                    }}</span>
                </span>
            </div>
        </div>
    </BlocAutomatisation>
</template>

<style scoped>
.ho__aide {
    font-size: 12px;
    color: #666;
    margin: 0 0 15px 0;
    padding-left: 26px;
}
.ho__contenu {
    padding-left: 26px;
    display: flex;
    flex-direction: column;
    gap: 15px;
}
.ho__ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-start;
}
.ho__champ {
    display: flex;
    flex-direction: column;
}
.ho__champ--jour {
    flex: 0 0 180px;
}
.ho__champ--jours {
    flex: 0 0 300px;
}
.ho__champ--heure {
    flex: 0 0 120px;
}
.ho__champ--semaine {
    flex: 0 0 220px;
}
.ho__libelle {
    font-size: 12px;
    color: #555;
    margin-bottom: 4px;
    font-weight: normal;
}
.ho__libelle--bloc {
    display: block;
}
.ho__liste {
    width: 100%;
}
.ho__rubrique {
    font-size: 12px;
    color: #33691e;
    font-weight: bold;
    display: block;
    margin-bottom: 6px;
}
.ho__tous {
    margin-bottom: 6px;
}
.ho__groupes {
    margin-bottom: 8px;
}
.ho__destinataires {
    width: 100%;
    max-width: 420px;
    height: 96px;
    border: 1px solid #c5e1a5;
    border-radius: 4px;
    padding: 4px;
}
.ho__destinataires--tous {
    height: 110px;
}
.ho__note {
    font-size: 11px;
    color: #777;
    margin-top: 3px;
}
.ho__sujet {
    width: 100%;
    padding: 7px;
    border: 1px solid #c5e1a5;
    border-radius: 4px;
    box-sizing: border-box;
}
.ho__corps {
    width: 100%;
    padding: 8px;
    border: 1px solid #c5e1a5;
    border-radius: 4px;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 13px;
}
.ho__champs {
    font-size: 11px;
    color: #777;
    margin-top: 4px;
}
.ho__info {
    font-size: 12px;
    color: #555;
    background: #fff8e1;
    border-left: 4px solid #ffb300;
    padding: 8px 10px;
    border-radius: 4px;
}
.ho__envoi {
    padding: 15px;
    background-color: #f1f8e9;
    border-radius: 5px;
    border: 1px dashed #aed581;
}
.ho__envoi-titre {
    font-size: 12px;
    font-weight: bold;
    color: #33691e;
}
.ho__envoi-aide {
    font-size: 11px;
    color: #666;
    margin: 5px 0 10px 0;
}
.ho__envoyer,
.ho__envoyer:hover {
    background-color: #558b2f;
    color: white;
}
.ho__message {
    margin-left: 10px;
    font-size: 12px;
}
.ho__message--ok {
    color: #2e7d32;
}
.ho__message--erreur {
    color: #c62828;
}
.ho__message--encours {
    color: #555;
}
.ho__message--attention {
    color: #b26a00;
}
</style>
