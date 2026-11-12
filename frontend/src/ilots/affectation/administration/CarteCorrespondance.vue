<!-- Correspondance des activités : tâche Asana reprise (règle usuelle, tâche du projet type, ou code / titre saisi) et
     type d'événement de chaque activité, enregistrés à chaque choix ; projet Asana type -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiAffectation, type CorrespondanceActivites, type TypeEvenementAffectation } from '@/api/affectation';
import { surReouverture } from '@/ilots/activation';
import CartoucheType from '@/ilots/admin/jours-speciaux/CartoucheType.vue';
import { choixRegle } from './administration';
import CarteAdministration from './CarteAdministration.vue';

const donnees = ref<CorrespondanceActivites | null>(null);
const erreur = ref('');
const message = ref<{ texte: string; classe: string }>({ texte: '', classe: '' });
/** Activités pour lesquelles « Autre (code ou titre de tâche)… » est choisi, en attente de saisie */
const autres = ref(new Set<string>());
const saisiesAutres = ref<Record<string, string>>({});
/** Choix du projet type : chargement, liste des projets Asana, erreur */
const choixProjet = ref<{ etat: 'chargement' | 'liste' | 'lecture' | 'erreur'; texte?: string } | null>(null);
const projetsAsana = ref<{ gid: string; name: string }[]>([]);
const projetChoisi = ref('');

const tachesType = () => donnees.value?.asanaTemplate?.tasks ?? [];
const connues = () => [...tachesType(), ...(donnees.value?.asanaActivities ?? [])];
const regle = (k: string) => donnees.value?.asanaRules?.[k] || '';
const choix = (k: string) => (autres.value.has(k) ? '__custom' : choixRegle(regle(k), connues()));
const typeDe = (k: string) => donnees.value?.types.find(t => t.id === donnees.value?.mapping[k]) ?? null;
const couleursDe = (t: TypeEvenementAffectation) => ({ bg: t.bg_color, text: t.text_color, border: t.border_color });

async function charger() {
    try {
        const d = await apiAffectation.correspondance();
        donnees.value = d;
        autres.value = new Set();
        saisiesAutres.value = Object.fromEntries(
            d.stages.map(st => {
                const r = d.asanaRules?.[st.key] || '';
                return [st.key, r && choixRegle(r, connues()) === '__custom' ? r.replace(/^title:/, '') : ''];
            })
        );
        erreur.value = '';
    } catch (e) {
        erreur.value = (e as Error).message;
    }
}

async function enregistrer() {
    const d = donnees.value;
    if (!d) return;
    try {
        const r = await apiAffectation.enregistrerCorrespondance(d.mapping, d.asanaRules || {});
        d.mapping = r.mapping;
        d.asanaRules = r.asanaRules;
        message.value = { texte: 'Correspondance enregistrée.', classe: 'aff-msg-ok2' };
        setTimeout(() => {
            if (message.value.texte === 'Correspondance enregistrée.') message.value = { texte: '', classe: '' };
        }, 3000);
    } catch (e) {
        message.value = { texte: (e as Error).message, classe: 'aff-msg-ko2' };
    }
}

/** Règle Asana d'une activité : valeur de la liste, ou code / titre saisi (« Autre ») */
async function definirRegle(k: string, v: string) {
    const d = donnees.value;
    if (!d) return;
    const regles = { ...(d.asanaRules || {}), [k]: v };
    if (!v) delete regles[k];
    d.asanaRules = regles;
    await enregistrer();
}

function choixListe(k: string, v: string) {
    const s = new Set(autres.value);
    if (v === '__custom') {
        s.add(k);
        autres.value = s;
        const t = (saisiesAutres.value[k] || '').trim();
        if (t) void definirRegle(k, t);
        return;
    }
    s.delete(k);
    autres.value = s;
    void definirRegle(k, v);
}

function choixAutre(k: string) {
    const t = (saisiesAutres.value[k] || '').trim();
    if (t) void definirRegle(k, t);
}

function choixType(k: string, v: string) {
    const d = donnees.value;
    if (!d) return;
    d.mapping = { ...d.mapping, [k]: Number(v) };
    void enregistrer();
}

async function choisirProjetType() {
    choixProjet.value = { etat: 'chargement', texte: 'Chargement des projets Asana…' };
    try {
        projetsAsana.value = (await apiAffectation.projetsTypesAsana()).projects;
        const cur = donnees.value?.asanaTemplate?.gid;
        projetChoisi.value = projetsAsana.value.some(p => p.gid === cur) ? cur! : (projetsAsana.value[0]?.gid ?? '');
        choixProjet.value = { etat: 'liste' };
    } catch (e) {
        choixProjet.value = { etat: 'erreur', texte: (e as Error).message };
    }
}

async function chargerProjetType(gid: string) {
    choixProjet.value = { etat: 'lecture', texte: 'Lecture des tâches du projet…' };
    try {
        const r = await apiAffectation.choisirProjetTypeAsana(gid);
        if (donnees.value) donnees.value = { ...donnees.value, asanaTemplate: r.template };
        choixProjet.value = null;
    } catch (e) {
        choixProjet.value = { etat: 'erreur', texte: (e as Error).message };
    }
}

onMounted(() => void charger());
surReouverture(() => void charger());
</script>

<template>
    <CarteAdministration
        id="affCardStageTypes"
        titre="Correspondance activités ASANA - événements - jalons"
        icone="asanasync"
        sous-titre="Type des événements créés par la synchronisation vers la planification"
    >
        <p class="aff-muted aff-aide">
            Chaque activité reprise d'Asana (étapes avec ressources) est reliée à un <b>type d'événement</b>. Lors de la
            synchronisation d'une étape vers la planification, l'événement créé reçoit ce type : icône, libellé court et
            couleurs du type (paramétrés dans l'application principale › Administration › Paramétrage des types
            d'événements).
        </p>
        <div id="affStageTypes">
            <p v-if="erreur" class="aff-error">{{ erreur }}</p>
            <p v-else-if="!donnees" class="aff-muted">Chargement…</p>
            <template v-else>
                <div class="aff-corr-projet">
                    <b>Projet Asana type :</b>
                    <span
                        ><template v-if="donnees.asanaTemplate"
                            >{{ donnees.asanaTemplate.name }} ·
                            {{ donnees.asanaTemplate.tasks.length }} tâche(s)</template
                        ><span v-else class="aff-muted">aucun (règles usuelles seulement)</span></span
                    >
                    <button type="button" class="aff-btn" @click="choisirProjetType">
                        {{ donnees.asanaTemplate ? 'Changer' : 'Choisir' }} le projet type…
                    </button>
                    <button v-if="donnees.asanaTemplate" type="button" class="aff-btn" @click="chargerProjetType('')">
                        Retirer
                    </button>
                    <span id="affTplPick">
                        <span v-if="choixProjet?.etat === 'erreur'" class="aff-error">{{ choixProjet.texte }}</span>
                        <template v-else-if="choixProjet?.etat === 'liste'">
                            <select id="affTplSel" v-model="projetChoisi" aria-label="Projet Asana type">
                                <option v-for="p in projetsAsana" :key="p.gid" :value="p.gid">{{ p.name }}</option>
                            </select>
                            {{ ' ' }}
                            <button
                                type="button"
                                class="aff-btn aff-btn-primary"
                                @click="chargerProjetType(projetChoisi)"
                            >
                                Charger les tâches
                            </button>
                        </template>
                        <template v-else-if="choixProjet">{{ choixProjet.texte }}</template>
                    </span>
                </div>
                <div class="aff-corr-defile">
                    <table class="aff-corr">
                        <thead>
                            <tr>
                                <th>Activité de l'outil de planification</th>
                                <th class="large">Activité Asana</th>
                                <th class="large">Type d'événement</th>
                                <th>Aperçu (planning / carte)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="st in donnees.stages" :key="st.key">
                                <td>
                                    <b>{{ st.label }}</b>
                                </td>
                                <td>
                                    <select
                                        :data-stage="st.key"
                                        :value="choix(st.key)"
                                        :aria-label="`Activité Asana : ${st.label}`"
                                        @change="choixListe(st.key, ($event.target as HTMLSelectElement).value)"
                                    >
                                        <option value="">Par défaut : {{ st.rule }}</option>
                                        <optgroup
                                            v-if="donnees.asanaTemplate"
                                            :label="`Projet type : ${donnees.asanaTemplate.name}`"
                                        >
                                            <option v-for="x in tachesType()" :key="`t${x.value}`" :value="x.value">
                                                {{ x.label }}
                                            </option>
                                        </optgroup>
                                        <optgroup label="Règles usuelles">
                                            <option
                                                v-for="x in donnees.asanaActivities"
                                                :key="`u${x.value}`"
                                                :value="x.value"
                                            >
                                                {{ x.label }}
                                            </option>
                                        </optgroup>
                                        <option value="__custom">Autre (code ou titre de tâche)…</option>
                                    </select>
                                    <input
                                        v-if="choix(st.key) === '__custom'"
                                        v-model="saisiesAutres[st.key]"
                                        type="text"
                                        :data-stage-custom="st.key"
                                        placeholder="ex. 5.4 ou titre de la tâche"
                                        :aria-label="`Code ou titre de la tâche Asana : ${st.label}`"
                                        @change="choixAutre(st.key)"
                                    />
                                </td>
                                <td>
                                    <select
                                        v-if="st.typed"
                                        :data-stage="st.key"
                                        :value="donnees.mapping[st.key] ?? donnees.types[0]?.id"
                                        :aria-label="`Type d'événement : ${st.label}`"
                                        @change="choixType(st.key, ($event.target as HTMLSelectElement).value)"
                                    >
                                        <option v-for="t in donnees.types" :key="t.id" :value="t.id">
                                            {{ t.label_long }}{{ t.label_short ? ` (${t.label_short})` : '' }}
                                        </option>
                                    </select>
                                </td>
                                <td :id="`affStChip_${st.key}`">
                                    <CartoucheType
                                        v-if="st.typed && typeDe(st.key)"
                                        :couleurs="couleursDe(typeDe(st.key)!)"
                                        :icone="typeDe(st.key)!.icon"
                                        :libelle="typeDe(st.key)!.label_short || typeDe(st.key)!.label_long"
                                        petit
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="aff-actions aff-actions--correspondance">
                    <span id="affStageTypesMsg" class="aff-muted" :class="message.classe">{{ message.texte }}</span>
                </div>
            </template>
        </div>
    </CarteAdministration>
</template>
