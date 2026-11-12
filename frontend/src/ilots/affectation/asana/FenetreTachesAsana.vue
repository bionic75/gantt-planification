<!-- Tâches du projet Asana d'un déploiement : pour chaque rubrique, règle, valeur actuelle (et son origine), valeur selon
     la règle, remplacement par une autre tâche du projet (mémorisé pour les prochains rafraîchissements), événement
     associé ; liste de toutes les tâches ; projet à choisir quand plusieurs portent le numéro du SAMU -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAffectation, type CandidatsActivite } from '@/api/affectation';
import { apiAsana, type Remplacement, type RubriqueAsana, type TachesProjet } from '@/api/asana';
import AppModal from '@/composants/AppModal.vue';
import { ACTIVITES_EVENEMENTS } from '../administration/administration';
import IconeAff from '../administration/IconeAff.vue';
import LienEvenement from '../administration/LienEvenement.vue';
import { jourFr } from '../planning/outils';
import {
    apresRemplacement,
    datesRubrique,
    estRemplacee,
    libelleTache,
    origine,
    selonRegle,
    valeurTexte
} from './asana';
import { useAsanaStore } from './magasin';
import AppSablier from '@/composants/AppSablier.vue';

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ fermer: [] }>();

const LOGO_ASANA = '/img/asana-logo.png';
const magasin = useAsanaStore();
const donnees = ref<TachesProjet | null>(null);
const erreurChargement = ref('');
/** Remplacements par rubrique */
const remplacements = ref<Record<string, Remplacement>>({});
/** undefined : recherche en cours ; null : indisponibles */
const candidats = ref<Record<string, CandidatsActivite> | null | undefined>(undefined);
const message = ref<{ texte: string; classe: string }>({ texte: '', classe: '' });
const envoi = ref(false);

/** Interrogation d'Asana en cours */
const interrogation = ref(false);
const dire = (texte: string, classe = 'aff-asana-msg--erreur') => (message.value = { texte, classe });

async function charger(avecAsana = false) {
    donnees.value = null;
    erreurChargement.value = '';
    remplacements.value = {};
    message.value = { texte: '', classe: '' };
    try {
        const d = await apiAsana.taches(props.id, avecAsana);
        remplacements.value = Object.fromEntries(
            d.rubriques.filter(r => r.override).map(r => [r.key, { ...r.override! }])
        );
        candidats.value = undefined;
        donnees.value = d;
        try {
            candidats.value = (await apiAffectation.candidatsEvenements(props.id)).candidates;
        } catch {
            candidats.value = null;
        }
    } catch (e) {
        erreurChargement.value = (e as Error).message;
    }
}

const ov = (k: string) => remplacements.value[k];
const taches = () => donnees.value?.tasks ?? [];
/** Données d'Asana disponibles : lecture en direct ou dernière lecture mémorisée */
const avecDonnees = computed(() => donnees.value?.interroge !== false || !!donnees.value?.cache);

function choisir(r: RubriqueAsana, champ: keyof Remplacement, valeur: string) {
    const o = { ...(remplacements.value[r.key] ?? {}) };
    if (valeur) o[champ] = valeur;
    else delete o[champ];
    const tous = { ...remplacements.value };
    if (Object.keys(o).length) tous[r.key] = o;
    else delete tous[r.key];
    remplacements.value = tous;
}

/** Interroge Asana : tâches du projet, valeurs selon la règle et écarts avec l'application */
async function interroger() {
    interrogation.value = true;
    message.value = { texte: '', classe: '' };
    try {
        const d = await apiAsana.taches(props.id, true);
        donnees.value = d;
        remplacements.value = Object.fromEntries(
            d.rubriques.filter(r => r.override).map(r => [r.key, { ...r.override! }])
        );
    } catch (e) {
        dire((e as Error).message);
    } finally {
        interrogation.value = false;
    }
}

function liaison(k: string, maj: Partial<CandidatsActivite>) {
    const c = candidats.value?.[k];
    if (c) Object.assign(c, maj);
}

async function rechargerCandidats() {
    try {
        candidats.value = (await apiAffectation.candidatsEvenements(props.id)).candidates;
    } catch {
        candidats.value = null;
    }
}

async function appliquer() {
    envoi.value = true;
    message.value = { texte: '', classe: '' };
    try {
        const r = await apiAsana.remplacer(props.id, remplacements.value);
        if (r.unchanged) magasin.annoncer(`${r.samu_name} : remplacements enregistrés, aucune date à modifier.`);
        else {
            magasin.montrerChangements({
                titre: `Remplacements appliqués — ${r.samu_name}`,
                items: [{ samu: r.samu_name, created: false, asana: r.asana, changes: r.changes ?? [] }]
            });
            magasin.deploiementsModifies();
        }
        // La fenêtre reste ouverte et reprend les valeurs mises à jour (Asana relu)
        await interroger();
        await rechargerCandidats();
    } catch (e) {
        dire((e as Error).message);
    } finally {
        envoi.value = false;
    }
}

onMounted(() => void charger());
</script>

<template>
    <AppModal
        id="affAsanaTasksModal"
        opened
        :title="donnees ? `Tâches du projet Asana — ${donnees.samu}` : 'Tâches du projet Asana'"
        class="aff-asana-taches"
        @close="emit('fermer')"
    >
        <div id="affAsanaTasksBody">
            <p v-if="erreurChargement" class="aff-error">{{ erreurChargement }}</p>
            <p v-else-if="!donnees" class="aff-muted"><AppSablier texte="Chargement des tâches depuis Asana…" /></p>
            <template v-else>
                <p class="aff-asana-taches__intro">
                    <b>{{ donnees.samu }}</b>
                    <button
                        type="button"
                        class="aff-icon-btn aff-asyn aff-icon-btn--asana aff-asana-taches__sync"
                        :class="{ 'aff-busy': interrogation }"
                        title="Interroger Asana et afficher les écarts avec l'application"
                        aria-label="Interroger Asana"
                        :disabled="interrogation"
                        @click="interroger"
                    >
                        <IconeAff nom="asanasync" classe="aff-ico-sm" />
                    </button>
                    <AppSablier v-if="interrogation" texte="Interrogation d'Asana…" />
                    <template v-else-if="avecDonnees">
                        · projet Asana :
                        <a v-if="donnees.url" :href="donnees.url" target="_blank" rel="noopener">{{ donnees.asana }}</a
                        ><template v-else>{{ donnees.asana }}</template> · {{ donnees.tasks.length }} tâche(s). Pour
                        chaque rubrique, la <b>règle automatique</b> choisit la tâche ; vous pouvez la
                        <b>remplacer</b> par n'importe quelle autre tâche du projet (liste avec échéances). Le
                        remplacement est mémorisé : il s'applique aussi aux prochains rafraîchissements.
                        <i v-if="donnees.interroge === false && donnees.cache" class="aff-muted"
                            >Dernière lecture d'Asana : {{ new Date(donnees.cache).toLocaleString('fr-FR') }} — cliquez
                            sur l'icône pour actualiser.</i
                        >
                    </template>
                    <template v-else>
                        · Données de l'application. Cliquez sur l'icône pour interroger Asana et afficher les écarts.
                    </template>
                </p>
                <div class="aff-asana-defile">
                    <table class="aff-asana-table aff-asana-taches__table">
                        <thead>
                            <tr>
                                <th>Rubrique</th>
                                <th>Valeur actuelle</th>
                                <th>Selon la règle</th>
                                <th class="aff-asana-taches__choix">Remplacer par la tâche…</th>
                                <th>Après remplacement</th>
                                <th class="aff-asana-taches__evenement">Événement associé (SAMU + type)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="r in donnees.rubriques"
                                :key="r.key"
                                :class="{ 'aff-asana-taches__remplacee': estRemplacee(r, ov(r.key)) }"
                            >
                                <td>
                                    <b>{{ r.label }}</b
                                    ><template v-if="estRemplacee(r, ov(r.key))">
                                        <span class="aff-av-b mid">remplacé</span></template
                                    >
                                </td>
                                <td>
                                    <span class="aff-asana-nowrap">{{ valeurTexte(r.current) }}</span>
                                    <div
                                        v-if="avecDonnees && origine(r, ov(r.key), taches()) === 'asana'"
                                        class="aff-asana-origine aff-asana-origine--asana"
                                    >
                                        <img
                                            :src="LOGO_ASANA"
                                            alt="Asana"
                                            title="Donnée Asana originelle"
                                            class="aff-asana-logo"
                                        />
                                        Asana (origine)
                                    </div>
                                    <div
                                        v-else-if="avecDonnees && origine(r, ov(r.key), taches()) === 'tool'"
                                        class="aff-asana-origine aff-asana-origine--outil"
                                        title="Cette valeur diffère de celle d'Asana : elle a été modifiée dans l'outil de planification"
                                    >
                                        ✎ modifiée dans l'outil
                                    </div>
                                </td>
                                <td>
                                    <div
                                        v-for="n in selonRegle(r, ov(r.key), taches()).noms"
                                        :key="n"
                                        class="aff-muted aff-asana-taches__sources"
                                    >
                                        {{ String(n).slice(0, 90) }}
                                    </div>
                                    <div class="aff-asana-nowrap">
                                        {{ selonRegle(r, ov(r.key), taches()).dates }}
                                    </div>
                                </td>
                                <td>
                                    <select
                                        v-if="r.kind === 'date'"
                                        :disabled="!avecDonnees"
                                        :value="ov(r.key)?.task ?? ''"
                                        :aria-label="`Tâche remplaçante : ${r.label}`"
                                        @change="choisir(r, 'task', ($event.target as HTMLSelectElement).value)"
                                    >
                                        <option value="">— règle automatique —</option>
                                        <option v-if="!avecDonnees && ov(r.key)?.task" :value="ov(r.key)!.task">
                                            Tâche mémorisée (interrogez Asana pour la voir)
                                        </option>
                                        <option
                                            v-for="t in donnees.tasks"
                                            :key="t.gid"
                                            :value="t.gid"
                                            :disabled="!t.eff"
                                        >
                                            {{ libelleTache(t) }}
                                        </option>
                                    </select>
                                    <div v-else class="aff-asana-taches__periode">
                                        <template v-for="champ in ['start', 'end'] as const" :key="champ">
                                            <span class="aff-muted aff-asana-petit">{{
                                                champ === 'start' ? 'Début' : 'Fin'
                                            }}</span>
                                            <select
                                                :disabled="!avecDonnees"
                                                :value="ov(r.key)?.[champ] ?? ''"
                                                :aria-label="`Tâche de ${champ === 'start' ? 'début' : 'fin'} : ${r.label}`"
                                                @change="choisir(r, champ, ($event.target as HTMLSelectElement).value)"
                                            >
                                                <option value="">— règle automatique —</option>
                                                <option
                                                    v-if="!avecDonnees && ov(r.key)?.[champ]"
                                                    :value="ov(r.key)![champ]"
                                                >
                                                    Tâche mémorisée (interrogez Asana pour la voir)
                                                </option>
                                                <option
                                                    v-for="t in donnees.tasks"
                                                    :key="t.gid"
                                                    :value="t.gid"
                                                    :disabled="!t.eff"
                                                >
                                                    {{ libelleTache(t) }}
                                                </option>
                                            </select>
                                        </template>
                                    </div>
                                </td>
                                <td class="aff-asana-taches__apres">{{ apresRemplacement(r, ov(r.key), taches()) }}</td>
                                <td>
                                    <LienEvenement
                                        v-if="ACTIVITES_EVENEMENTS.includes(r.key)"
                                        compact
                                        :projet-id="id"
                                        :cle="r.key"
                                        :libelle="r.label"
                                        :samu="donnees.samu"
                                        :candidats="candidats === undefined ? undefined : (candidats?.[r.key] ?? null)"
                                        :dates="datesRubrique(r, ov(r.key), taches())"
                                        :message-sans-date="`${r.label} : aucune date connue pour cette activité ; renseignez-la dans le déploiement ou choisissez une tâche à reprendre.`"
                                        @liaison="maj => liaison(r.key, maj)"
                                        @recharger="rechargerCandidats"
                                        @erreur="t => dire(t)"
                                        @annonce="t => dire(t, 'aff-asana-msg--ok')"
                                    />
                                    <span v-else class="aff-muted">—</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <details class="aff-asana-taches__toutes">
                    <summary>Toutes les tâches du projet Asana ({{ donnees.tasks.length }})</summary>
                    <div class="aff-asana-taches__liste">
                        <table>
                            <thead>
                                <tr>
                                    <th>N°</th>
                                    <th>Tâche</th>
                                    <th>Tâche parente</th>
                                    <th>Début</th>
                                    <th>Échéance</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="t in donnees.tasks" :key="t.gid">
                                    <td class="aff-asana-nowrap">{{ t.code || '' }}</td>
                                    <td>{{ t.name }}</td>
                                    <td class="aff-asana-taches__parent">{{ t.parent || '' }}</td>
                                    <td class="aff-asana-nowrap">
                                        {{ t.start || t.eff?.start ? jourFr((t.start || t.eff?.start)!) : '' }}
                                    </td>
                                    <td class="aff-asana-nowrap aff-asana-taches__echeance">
                                        <template v-if="t.due || t.eff?.end">{{
                                            jourFr((t.due || t.eff?.end)!)
                                        }}</template
                                        ><span v-else class="aff-muted">non datée</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </details>
            </template>
        </div>
        <template #footer>
            <span id="affAsanaTasksMsg" class="aff-error" :class="message.classe">{{ message.texte }}</span>
            <AppSablier v-if="envoi" texte="Prise en compte des remplacements…" />
            <button
                type="button"
                class="aff-btn"
                title="Remet toutes les rubriques sur la règle automatique"
                @click="remplacements = {}"
            >
                Tout remettre à la règle
            </button>
            <button type="button" class="aff-btn" @click="emit('fermer')">Fermer</button>
            <button
                id="affAsanaTasksApply"
                type="button"
                class="aff-btn aff-btn-primary"
                :disabled="envoi"
                @click="appliquer"
            >
                <IconeAff nom="save" classe="aff-ico-sm" />Appliquer les remplacements
            </button>
        </template>
    </AppModal>
</template>
