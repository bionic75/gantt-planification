<!-- Déploiement d'un SAMU, nouveau ou modifié : entité (proposée à la saisie), chef de projet, début du projet, phases
     et étapes de mise en œuvre (périodes avec semaine, nombre de jours et ressources ; dates ; jalons), événements du
     SAMU reliés aux activités ; contrôle précis des oublis avant l'enregistrement -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { apiAffectation, type CandidatsActivite, type DeploiementAdmin } from '@/api/affectation';
import AppModal from '@/composants/AppModal.vue';
import { valeurSemaine } from '../planning/outils';
import {
    ACTIVITES_EVENEMENTS,
    controler,
    corpsDuFormulaire,
    datesActivite,
    debutModifie,
    definition,
    entitesProposees,
    ETAPES_MISE_EN_OEUVRE,
    finModifiee,
    fondEtape,
    formulaireDe,
    joursModifies,
    lignePeriode,
    PHASES_PROJET,
    semaineChoisie,
    type LignePeriode
} from './administration';
import CalendrierSemaines from './CalendrierSemaines.vue';
import IconeAff from './IconeAff.vue';
import LienEvenement from './LienEvenement.vue';
import { useAdministrationAffectationStore } from './magasin';

const props = defineProps<{ deploiement: DeploiementAdmin | null }>();
const emit = defineEmits<{ fermer: []; enregistre: []; annonce: [texte: string] }>();

const magasin = useAdministrationAffectationStore();
const config = magasin.config!;
const f = reactive(formulaireDe(config, props.deploiement));
const corps = ref<HTMLElement | null>(null);
/** Projet repris d'Asana : nom et dates ne se modifient pas ici (seuls chef de projet, gel et ressources) */
const LOGO_ASANA = '/img/asana-logo.png';
const verrou = !!props.deploiement?.from_asana;
const figee = (k: string) => verrou && def(k).kind !== 'periods';
const titre = props.deploiement ? `Modifier : ${props.deploiement.samu_name}` : 'Nouveau déploiement de SAMU';

/** Messages sous le formulaire (oublis, ou erreur) ; champs à corriger */
const erreurs = ref<string[]>([]);
const aCorriger = ref(new Set<string>());
const erreur = (texte: string) => (erreurs.value = texte ? [texte] : []);

const def = (k: string) => definition(config, k);
const fond = (k: string) => fondEtape(magasin.couleurs, magasin.motifs, k);
const NOMBRES = Array.from({ length: 10 }, (_, n) => n + 1);
const val = (e: Event) => (e.target as HTMLInputElement).value;

// ── Entité (SAMU) proposée à la saisie ───────────────────────────────────────

const propositions = ref<{ liste: typeof magasin.entites; index: number } | null>(null);
const listeEntites = ref<HTMLElement | null>(null);

function proposer(saisie: string) {
    propositions.value = { liste: entitesProposees(magasin.entites, saisie), index: -1 };
}

function choisirEntite(i: number) {
    const loc = propositions.value?.liste[i];
    if (!loc) return;
    f.samu_name = loc.libelle_court;
    f.location_id = loc.id;
    propositions.value = null;
}

/** Champ du SAMU focalisé à l'ouverture de la fenêtre : pas de liste ouverte d'office */
let ouverture = true;
function focusEntite() {
    if (!ouverture) proposer(f.samu_name);
}

async function clavierEntite(e: KeyboardEvent) {
    if (e.key === 'Escape' && propositions.value) {
        e.stopPropagation();
        propositions.value = null;
        return;
    }
    const fleche = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    if (!propositions.value && fleche) proposer(f.samu_name);
    const p = propositions.value;
    if (!p?.liste.length) return;
    if (fleche) {
        e.preventDefault();
        p.index = (p.index + (e.key === 'ArrowDown' ? 1 : -1) + p.liste.length) % p.liste.length;
        await nextTick();
        listeEntites.value?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && p.index >= 0) {
        e.preventDefault();
        choisirEntite(p.index);
    }
}

function appuiAilleurs(e: MouseEvent) {
    if (propositions.value && !(e.target as HTMLElement).closest('.aff-field')) propositions.value = null;
}

// ── Périodes ─────────────────────────────────────────────────────────────────

function ajouterPeriode(k: string) {
    (f.periodes[k] ??= []).push(lignePeriode());
}

function effacerPeriode(k: string, i: number) {
    const liste = f.periodes[k] ?? [];
    liste.splice(i, 1);
    if (!liste.length) liste.push(lignePeriode());
}

const debut = (l: LignePeriode, e: Event) => {
    l.start = val(e);
};

// ── Événements reliés aux activités ──────────────────────────────────────────

/** undefined : recherche en cours ; null : indisponibles */
const candidats = ref<Record<string, CandidatsActivite> | null | undefined>(undefined);

async function chargerCandidats() {
    if (!f.id) return;
    try {
        candidats.value = (await apiAffectation.candidatsEvenements(f.id)).candidates;
    } catch {
        candidats.value = null;
    }
}

function liaison(k: string, maj: Partial<CandidatsActivite>) {
    const c = candidats.value?.[k];
    if (c) Object.assign(c, maj);
}

const candidatsDe = (k: string) => (candidats.value === undefined ? undefined : (candidats.value?.[k] ?? null));

// ── Enregistrement ───────────────────────────────────────────────────────────

const lignes = computed(() => [
    { titre: 'Phases du projet', cles: PHASES_PROJET },
    { titre: 'Étapes de mise en œuvre', cles: ETAPES_MISE_EN_OEUVRE }
]);

async function enregistrer() {
    const oublis = controler(f, config);
    aCorriger.value = new Set(oublis.map(o => o.champ));
    if (oublis.length) {
        erreurs.value = oublis.map(o => `• ${o.message}`);
        await nextTick();
        const premier = corps.value?.querySelector<HTMLElement>(`[data-champ="${oublis[0]!.champ}"]`);
        premier?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        premier?.focus({ preventScroll: true });
        return;
    }
    erreurs.value = [];
    try {
        const c = corpsDuFormulaire(f, magasin.entites);
        if (f.id) await apiAffectation.modifierDeploiement(f.id, c);
        else await apiAffectation.creerDeploiement(c);
        emit('enregistre');
    } catch (e) {
        erreur((e as Error).message);
    }
}

const mauvais = (champ: string) => ({ 'aff-bad': aCorriger.value.has(champ) });

onMounted(() => {
    // La fenêtre place le focus dans son premier champ juste après son affichage
    setTimeout(() => (ouverture = false));
    document.addEventListener('mousedown', appuiAilleurs);
    void chargerCandidats();
});
onBeforeUnmount(() => document.removeEventListener('mousedown', appuiAilleurs));
</script>

<template>
    <AppModal id="affProjectModal" opened :title="titre" class="aff-deploiement" @close="emit('fermer')">
        <div id="affModalBody" ref="corps">
            <div class="aff-form-grid">
                <div class="aff-field aff-champ-samu">
                    <label class="lbl" for="affSamu">Nom du SAMU *</label>
                    <input
                        id="affSamu"
                        type="text"
                        autocomplete="off"
                        placeholder="Tapez pour rechercher une entité…"
                        data-champ="samu"
                        :disabled="verrou"
                        :class="mauvais('samu')"
                        :value="f.samu_name"
                        @input="
                            f.samu_name = val($event);
                            proposer(f.samu_name);
                        "
                        @focus="focusEntite"
                        @keydown="clavierEntite"
                    />
                    <div id="affSug" ref="listeEntites" class="aff-sug" :class="{ ouverte: propositions }">
                        <template v-if="propositions">
                            <div v-if="!propositions.liste.length" class="cnt">Aucune entité correspondante</div>
                            <template v-else>
                                <div class="cnt">
                                    {{ propositions.liste.length }} entité{{ propositions.liste.length > 1 ? 's' : '' }}
                                    — ↑ ↓ pour parcourir, Entrée pour choisir
                                </div>
                                <div
                                    v-for="(l, i) in propositions.liste"
                                    :key="l.id"
                                    :data-i="i"
                                    :class="{ on: i === propositions.index }"
                                    @mousedown.prevent="choisirEntite(i)"
                                >
                                    {{ l.libelle_long }}
                                </div>
                            </template>
                        </template>
                    </div>
                </div>
                <div class="aff-field">
                    <label class="lbl" for="affChef">Chef de projet</label>
                    <select id="affChef" v-model="f.chef">
                        <option value="">— Choisir —</option>
                        <option v-for="u in magasin.utilisateurs" :key="u.id" :value="String(u.id)">
                            {{ (u.nom || '').toUpperCase() }} {{ u.prenom || '' }}
                        </option>
                    </select>
                </div>
                <div class="aff-field">
                    <label class="lbl" for="affDebut">Date de début du projet *</label>
                    <input
                        id="affDebut"
                        type="date"
                        data-champ="debut"
                        :disabled="verrou"
                        :class="mauvais('debut')"
                        :value="f.date_debut"
                        @input="f.date_debut = val($event)"
                    />
                </div>
            </div>
            <p v-if="verrou" class="aff-muted aff-note-debut">
                <img :src="LOGO_ASANA" alt="" class="aff-asana-logo" /> Projet repris d'Asana : le nom et les dates
                viennent d'Asana et ne se modifient pas ici. Restent modifiables : le chef de projet, les périodes de
                gel et le nombre de ressources.
            </p>
            <p v-else class="aff-muted aff-note-debut">
                Toutes les autres dates doivent être postérieures ou égales à la date de début du projet.
            </p>
            <template v-for="groupe in lignes" :key="groupe.titre">
                <div class="aff-section-title">{{ groupe.titre }}</div>
                <div v-for="k in groupe.cles" :key="k" class="aff-stage">
                    <div class="name">
                        <i :style="fond(k)"></i>{{ def(k).label
                        }}<template v-if="def(k).kind === 'periods'">
                            <span class="aff-muted">(optionnel)</span></template
                        >
                    </div>
                    <div class="dates">
                        <div v-if="def(k).kind === 'date'" class="pr">
                            <input
                                type="date"
                                :data-df="k"
                                :disabled="figee(k)"
                                :data-champ="`date:${k}`"
                                :class="mauvais(`date:${k}`)"
                                :value="f.dates[k]"
                                :min="f.date_debut || undefined"
                                :aria-label="def(k).label"
                                @input="f.dates[k] = val($event)"
                            />
                        </div>
                        <div v-else-if="def(k).kind === 'milestone'" class="pr">
                            <input
                                type="date"
                                :data-mk="k"
                                :disabled="figee(k)"
                                :data-champ="`jalon:${k}`"
                                :class="mauvais(`jalon:${k}`)"
                                :value="f.jalons[k]"
                                :min="f.date_debut || undefined"
                                :aria-label="def(k).label"
                                @input="f.jalons[k] = val($event)"
                            />
                        </div>
                        <template v-else>
                            <div v-for="(l, i) in f.periodes[k]" :key="i" class="pr">
                                <input
                                    v-if="def(k).resources"
                                    type="week"
                                    class="aff-wk"
                                    :data-wk="k"
                                    :data-wi="i"
                                    :disabled="figee(k)"
                                    :value="valeurSemaine(l.start)"
                                    title="Choisir une semaine (SXX année) : la période commence le lundi de cette semaine"
                                    :aria-label="`Semaine de début ${def(k).label}`"
                                    @change="semaineChoisie(l, val($event))"
                                />
                                <input
                                    type="date"
                                    :data-pk="k"
                                    :data-pi="i"
                                    data-pf="start"
                                    :disabled="figee(k)"
                                    :data-champ="`${k}:${i}:start`"
                                    :class="mauvais(`${k}:${i}:start`)"
                                    :value="l.start"
                                    :min="f.date_debut || undefined"
                                    :aria-label="`Début ${def(k).label}`"
                                    @input="debut(l, $event)"
                                    @change="debutModifie(l)"
                                />
                                <span class="aff-muted">→</span>
                                <input
                                    type="date"
                                    :data-pk="k"
                                    :data-pi="i"
                                    data-pf="end"
                                    :disabled="figee(k)"
                                    :data-champ="`${k}:${i}:end`"
                                    :class="mauvais(`${k}:${i}:end`)"
                                    :value="l.end"
                                    :min="l.start || f.date_debut || undefined"
                                    :aria-label="`Fin ${def(k).label}`"
                                    @input="l.end = val($event)"
                                    @change="finModifiee(l)"
                                />
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    class="aff-days"
                                    :data-dk="k"
                                    :data-di="i"
                                    :disabled="figee(k)"
                                    :value="l.jours"
                                    placeholder="jours"
                                    title="Nombre de jours (calendaires, début et fin inclus) : la date de fin se calcule automatiquement"
                                    :aria-label="`Nombre de jours ${def(k).label}`"
                                    @input="
                                        l.jours = val($event);
                                        joursModifies(l);
                                    "
                                />
                                <select
                                    v-if="def(k).resources"
                                    v-model="l.needed"
                                    class="aff-need"
                                    :data-nk="k"
                                    :data-ni="i"
                                    :data-champ="`${k}:${i}:needed`"
                                    :class="mauvais(`${k}:${i}:needed`)"
                                    title="Nombre de ressources nécessaires"
                                    :aria-label="`Ressources nécessaires ${def(k).label}`"
                                >
                                    <option value="">Ressources…</option>
                                    <option v-for="n in NOMBRES" :key="n" :value="String(n)">
                                        {{ n }} ressource{{ n > 1 ? 's' : '' }}
                                    </option>
                                </select>
                                <button
                                    v-if="!figee(k)"
                                    type="button"
                                    class="aff-x"
                                    title="Effacer cette période"
                                    @click="effacerPeriode(k, i)"
                                >
                                    <IconeAff nom="x" classe="aff-ico-sm" />
                                </button>
                            </div>
                            <button
                                v-if="def(k).kind === 'periods'"
                                type="button"
                                class="aff-btn aff-btn-periode"
                                @click="ajouterPeriode(k)"
                            >
                                <IconeAff nom="plus" classe="aff-ico-sm" />Ajouter une période
                            </button>
                        </template>
                        <LienEvenement
                            v-if="ACTIVITES_EVENEMENTS.includes(k)"
                            :projet-id="f.id"
                            :cle="k"
                            :libelle="def(k).label"
                            :samu="f.samu_name"
                            :candidats="candidatsDe(k)"
                            :dates="datesActivite(f, k)"
                            @liaison="maj => liaison(k, maj)"
                            @recharger="chargerCandidats"
                            @erreur="erreur"
                            @annonce="texte => emit('annonce', texte)"
                        />
                    </div>
                    <span></span>
                </div>
            </template>
        </div>
        <CalendrierSemaines :zone="corps" />
        <template #footer>
            <span id="affModalError" class="aff-error"
                ><template v-for="(t, i) in erreurs" :key="i"><br v-if="i" />{{ t }}</template></span
            >
            <button type="button" class="aff-btn" @click="emit('fermer')">Annuler</button>
            <button type="button" class="aff-btn aff-btn-primary" @click="enregistrer">
                <IconeAff nom="save" classe="aff-ico-sm" />Enregistrer
            </button>
        </template>
    </AppModal>
</template>
