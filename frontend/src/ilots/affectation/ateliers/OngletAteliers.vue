<!-- Aide à l'affectation › onglet « Planification des ateliers métier » : paramétrage (délais), simulation du
     rétroplanning d'un SAMU (calcul par le serveur : MEP ferme, ateliers reculés en évitant week-ends et vacances de
     la zone), contenus, dates planifiées, sondages de date et invitations ; enregistrement (administrateur) ; liste des
     rétroplannings enregistrés -->
<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import {
    apiAteliers,
    type JalonSimule,
    type MetaAteliers,
    type OptionSondage,
    type Retroplanning,
    type ResumeSondage,
    type Simulation,
    type UtilisateurAteliers
} from '@/api/ateliers';
import { useConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { useSessionStore } from '@/stores/session';
import {
    avancement,
    corpsRetroplanning,
    dateCourte,
    dateLongue,
    estAtelier,
    formulaireDuSamu,
    formulaireVide,
    indicationZone,
    libelleBoutonSondage,
    libelleCreneau,
    pastilleDeCourriel,
    pastilleUtilisateur,
    prochainJalon,
    type FormulaireAteliers,
    type Pastille
} from './ateliers';
import FenetreInvitation from './FenetreInvitation.vue';
import FenetreSondage from './FenetreSondage.vue';
import IconeAtelier from './IconeAtelier.vue';
import './ateliers.css';

const sessionStore = useSessionStore();
const admin = computed(() => sessionStore.estAdmin);
const confirmer = useConfirmation();

const meta = ref<MetaAteliers | null>(null);
const liste = ref<Retroplanning[]>([]);
const erreurChargement = ref('');
const f = reactive<FormulaireAteliers>(formulaireVide());
const sim = ref<Simulation | null>(null);
const erreurSimulation = ref('');
const sondages = ref<ResumeSondage[]>([]);
const enregistrement = ref(false);
/** Jalon dont le sondage vient d'être clôturé avec un créneau retenu : « Inviter » mis en avant */
const inviteMisEnAvant = ref<string | null>(null);

// ── Annonces ─────────────────────────────────────────────────────────────────

const annonces = ref<{ n: number; texte: string; classe: string }[]>([]);
let numero = 0;
function annoncer(texte: string, erreur = false, classe = '', duree = erreur ? 7000 : 4500) {
    const n = ++numero;
    annonces.value = [...annonces.value, { n, texte, classe: erreur ? 'err' : classe }];
    setTimeout(() => (annonces.value = annonces.value.filter(a => a.n !== n)), duree);
}
/** Envoi en cours, puis envoyé (bandeau en haut de la page) */
const envoi = ref<{ texte: string; fini: boolean } | null>(null);
let finEnvoi: ReturnType<typeof setTimeout> | undefined;
function etatEnvoi(texte: string, fini: boolean) {
    clearTimeout(finEnvoi);
    envoi.value = { texte, fini };
    if (fini) finEnvoi = setTimeout(() => (envoi.value = null), 3500);
}

// ── Chargement ───────────────────────────────────────────────────────────────

async function lireListes() {
    const [m, l] = await Promise.all([apiAteliers.meta(), apiAteliers.liste()]);
    meta.value = m;
    liste.value = l.retroplannings ?? [];
}

async function ouvrir() {
    meta.value = null;
    try {
        await sessionStore.charger();
        await lireListes();
        erreurChargement.value = '';
    } catch (e) {
        erreurChargement.value = (e as Error).message;
        return;
    }
    void recalculer();
}

const projet = computed(() => meta.value?.samus.find(s => s.samu_name === f.samu));
const zone = computed(() => indicationZone(projet.value, f.zone));
const nombres = computed(() => {
    const l = meta.value?.limites;
    return l ? Array.from({ length: l.max - l.min + 1 }, (_, i) => l.min + i) : [];
});

// ── Simulation ───────────────────────────────────────────────────────────────

let sequence = 0;
async function recalculer() {
    if (!f.mep || !f.zone || !f.nb) {
        sim.value = null;
        erreurSimulation.value = '';
        return;
    }
    const n = ++sequence;
    try {
        const r = await apiAteliers.simuler(corpsRetroplanning(f));
        if (n !== sequence) return;
        sim.value = r;
        erreurSimulation.value = '';
    } catch (e) {
        if (n !== sequence) return;
        sim.value = null;
        erreurSimulation.value = (e as Error).message;
    }
}
let minuterie: ReturnType<typeof setTimeout> | undefined;
function programmer() {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => void recalculer(), 250);
}

function remplacer(nouveau: FormulaireAteliers) {
    Object.assign(f, nouveau);
}

function choisirSamu(nom: string) {
    remplacer(
        formulaireDuSamu(
            f,
            nom,
            liste.value.find(r => r.samu_name === nom),
            meta.value?.samus.find(s => s.samu_name === nom)
        )
    );
    void recalculer();
}

function delai(champ: 'delaiVisite' | 'delaiMep' | 'ecart12' | 'ecartAteliers', v: string) {
    f[champ] = v === '' ? '' : Number(v);
    programmer();
}

function reprendreZone() {
    if (projet.value?.zone) {
        f.zone = projet.value.zone;
        programmer();
    }
}

// ── Lignes du rétroplanning ──────────────────────────────────────────────────

const contenuPersonnalise = (r: JalonSimule) => !meta.value?.contenus.includes(r.contenu) || !!f.custom[r.key];

async function choisirContenu(r: JalonSimule, v: string) {
    if (v === '__perso__') {
        // Personnalisation : le texte actuel sert de point de départ
        f.custom = { ...f.custom, [r.key]: true };
        if (r.contenu) f.contenus = { ...f.contenus, [r.key]: r.contenu };
        programmer();
        await nextTick();
        document.querySelector<HTMLInputElement>(`#atTableBox input.at-perso[data-row="${r.key}"]`)?.focus();
        return;
    }
    const custom = { ...f.custom };
    delete custom[r.key];
    f.custom = custom;
    f.contenus = { ...f.contenus, [r.key]: v };
    programmer();
}

function contenuSaisi(r: JalonSimule, v: string) {
    const t = v.trim();
    const contenus = { ...f.contenus };
    if (t) contenus[r.key] = t;
    else delete contenus[r.key];
    f.contenus = contenus;
    programmer();
}

function datePlanifiee(r: JalonSimule, v: string) {
    const planifiees = { ...f.planifiees };
    const heures = { ...f.heures };
    if (v) planifiees[r.key] = v;
    else {
        delete planifiees[r.key];
        delete heures[r.key];
    }
    f.planifiees = planifiees;
    f.heures = heures;
    programmer();
}

function heurePlanifiee(r: JalonSimule, v: string) {
    const heures = { ...f.heures };
    if (v) heures[r.key] = v;
    else delete heures[r.key];
    f.heures = heures;
    programmer();
}

const sondageDe = (cle: string) =>
    f.id ? sondages.value.find(x => x.retroplanning_id === f.id && x.ligne === cle) : undefined;

async function lireSondages() {
    if (!f.id) {
        sondages.value = [];
        return;
    }
    try {
        sondages.value = (await apiAteliers.sondages()).sondages ?? [];
    } catch {
        sondages.value = [];
    }
}
watch(
    () => f.id,
    () => void lireSondages()
);

const inviteProposee = (r: JalonSimule) =>
    !!r.planifiee && r.key !== 'mep' && r.key !== 'livrables' && /^Planifi/.test(r.statut) && !!f.id;

// ── Enregistrement, liste ────────────────────────────────────────────────────

async function enregistrer() {
    if (!f.samu) {
        annoncer('Choisissez un SAMU parmi les déploiements.', true);
        return;
    }
    enregistrement.value = true;
    try {
        const r = await apiAteliers.enregistrer(corpsRetroplanning(f));
        annoncer(r.created ? 'Rétroplanning enregistré.' : 'Rétroplanning mis à jour.');
        await lireListes();
        f.id = r.id;
        f.savedAt = new Date().toISOString();
    } catch (e) {
        annoncer((e as Error).message, true);
    } finally {
        enregistrement.value = false;
    }
}

function nouvelleSimulation() {
    remplacer(formulaireVide());
    void recalculer();
}

function modifier(r: Retroplanning) {
    choisirSamu(r.samu_name);
    document.getElementById('atCardSim')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function supprimer(r: Retroplanning) {
    if (!(await confirmer(`Supprimer le rétroplanning des ateliers métier de ${r.samu_name} ?`, 'Supprimer'))) return;
    try {
        await apiAteliers.supprimer(r.id);
        annoncer('Rétroplanning supprimé.');
        if (f.id === r.id) f.id = null;
        await ouvrir();
    } catch (e) {
        annoncer((e as Error).message, true);
    }
}

// ── Invitation, sondage ──────────────────────────────────────────────────────

let utilisateurs: UtilisateurAteliers[] | null = null;
async function lireUtilisateurs() {
    if (!utilisateurs) {
        const tous = await apiAteliers.utilisateurs();
        utilisateurs = (Array.isArray(tous) ? tous : (tous.users ?? [])).filter(u => u.actif !== 0);
    }
    return utilisateurs;
}

const invitation = ref<{
    ligne: JalonSimule;
    utilisateurs: UtilisateurAteliers[];
    destinataires: Pastille[];
    repris: boolean;
} | null>(null);

async function ouvrirInvitation(r: JalonSimule) {
    if (!r.planifiee || !f.id) return;
    let tous: UtilisateurAteliers[];
    try {
        tous = await lireUtilisateurs();
    } catch (e) {
        annoncer((e as Error).message, true);
        return;
    }
    // Sans destinataires déjà retenus pour les invitations, reprise de ceux du dernier sondage de ce SAMU
    let dest = f.destinataires;
    if (!dest.userIds.length && !dest.emails.length) {
        try {
            const got = await apiAteliers.sondage(f.id, r.key);
            const m = got.modele || got.sondage;
            if (m) dest = { userIds: [], emails: m.destinataires || [] };
        } catch {
            /* aucun destinataire proposé */
        }
    }
    const pastilles = [
        ...dest.userIds
            .map(id => tous.find(u => u.id === id))
            .filter((u): u is UtilisateurAteliers => !!u)
            .map(pastilleUtilisateur),
        ...dest.emails.map(e => pastilleDeCourriel(tous, e))
    ].filter((it, i, all) => all.findIndex(x => x.id === it.id) === i);
    invitation.value = {
        ligne: r,
        utilisateurs: tous,
        destinataires: pastilles,
        repris: !!(dest.userIds.length || dest.emails.length)
    };
}

async function invitationEnvoyee(n: number) {
    invitation.value = null;
    etatEnvoi(`Invitation envoyée (${n} destinataire${n > 1 ? 's' : ''})`, true);
    liste.value = (await apiAteliers.liste()).retroplannings ?? [];
    const enregistre = liste.value.find(x => x.id === f.id);
    if (enregistre) {
        f.teams = enregistre.lignes.teams || '';
        f.invites = { ...(enregistre.lignes.invites || {}) };
        f.destinataires = { userIds: [], emails: [], ...(enregistre.lignes.destinataires || {}) };
    }
}

function invitationRefusee(message: string) {
    envoi.value = null;
    annoncer(message, true);
}

const sondage = ref<{ ligne: JalonSimule; utilisateurs: UtilisateurAteliers[] } | null>(null);

async function ouvrirSondage(r: JalonSimule) {
    if (!f.id) return;
    try {
        sondage.value = { ligne: r, utilisateurs: await lireUtilisateurs() };
    } catch (e) {
        annoncer((e as Error).message, true);
    }
}

/** Clôture ou réouverture : dates planifiées relues, sondages relus, simulation recalculée */
async function sondageClos(retenu: OptionSondage | null, reouvert: boolean) {
    const cle = sondage.value?.ligne.key ?? null;
    if (!reouvert) inviteMisEnAvant.value = retenu ? cle : null;
    try {
        liste.value = (await apiAteliers.liste()).retroplannings ?? [];
        const r = liste.value.find(x => x.id === f.id);
        if (r) {
            f.planifiees = { ...(r.lignes.planifiees || {}) };
            f.heures = { ...(r.lignes.heures || {}) };
        }
        sondage.value = null;
        await lireSondages();
        await recalculer();
    } catch (e) {
        annoncer((e as Error).message, true);
    }
    if (reouvert) return;
    if (retenu)
        annoncer(
            `Sondage terminé : ${libelleCreneau(retenu)}. Continuez en cliquant sur « Inviter » pour envoyer l’invitation.`,
            false,
            'hint',
            8000
        );
    else annoncer('Sondage clôturé.');
}

onMounted(() => void ouvrir());
surReouverture(() => void ouvrir());
</script>

<template>
    <div id="atelierRoot">
        <p v-if="erreurChargement" class="at-erreur">{{ erreurChargement }}</p>
        <p v-else-if="!meta" class="aff-muted">Chargement…</p>
        <template v-else>
            <h2 class="at-titre">Planification des ateliers métier</h2>
            <p class="aff-muted at-intro">
                Rétroplanning automatisé : à partir de la date de mise en production (MEP) ferme, les ateliers métier
                sont reculés en évitant les week-ends et les vacances scolaires de la zone du SAMU.
            </p>

            <section id="atCardParams" class="aff-card">
                <header class="aff-card-head">
                    <span class="at-card-title"><IconeAtelier nom="sliders" />Paramétrage</span>
                </header>
                <div class="at-grid">
                    <div class="at-field">
                        <label for="atDelaiVisite">Délai visite métier → atelier 1 (jours)</label>
                        <input
                            id="atDelaiVisite"
                            type="number"
                            min="0"
                            max="365"
                            :value="f.delaiVisite"
                            @input="delai('delaiVisite', ($event.target as HTMLInputElement).value)"
                        />
                        <div class="at-hint">Par défaut 14 jours.</div>
                    </div>
                    <div class="at-field">
                        <label for="atDelaiMep">Délai minimal avant la MEP (jours)</label>
                        <input
                            id="atDelaiMep"
                            type="number"
                            min="0"
                            max="365"
                            :value="f.delaiMep"
                            @input="delai('delaiMep', ($event.target as HTMLInputElement).value)"
                        />
                        <div class="at-hint">
                            Par défaut 28 jours : le dernier atelier a lieu au plus tard 28 jours avant la MEP.
                        </div>
                    </div>
                    <div class="at-field">
                        <label for="atEcart12">Écart atelier 1 → atelier 2 (jours)</label>
                        <input
                            id="atEcart12"
                            type="number"
                            min="0"
                            max="365"
                            :value="f.ecart12"
                            @input="delai('ecart12', ($event.target as HTMLInputElement).value)"
                        />
                        <div class="at-hint">Par défaut 7 jours (règle du classeur de référence).</div>
                    </div>
                    <div class="at-field">
                        <label for="atEcartAteliers">Écart entre les ateliers suivants (jours)</label>
                        <input
                            id="atEcartAteliers"
                            type="number"
                            min="0"
                            max="365"
                            :value="f.ecartAteliers"
                            @input="delai('ecartAteliers', ($event.target as HTMLInputElement).value)"
                        />
                        <div class="at-hint">Par défaut 14 jours.</div>
                    </div>
                </div>
            </section>

            <section id="atCardSim" class="aff-card">
                <header class="aff-card-head">
                    <span class="at-card-title"><IconeAtelier nom="flask" />Simulation</span>
                    <span id="atSavedBadge"
                        ><span v-if="f.id" class="at-badge ok"
                            >Rétroplanning enregistré{{
                                f.savedAt ? ` le ${dateCourte(f.savedAt.slice(0, 10))}` : ''
                            }}</span
                        ><span v-else-if="f.samu" class="at-badge info">Non enregistré</span></span
                    >
                </header>
                <div class="at-grid at-grid--simulation">
                    <div class="at-field">
                        <label for="atSamu2">SAMU (déploiements)</label>
                        <select
                            id="atSamu2"
                            :value="f.samu"
                            @change="choisirSamu(($event.target as HTMLSelectElement).value)"
                        >
                            <option value="">— Choisir un SAMU —</option>
                            <option v-for="s in meta.samus" :key="s.samu_name" :value="s.samu_name">
                                {{ s.samu_name }}{{ s.saved ? ' ✔' : '' }}
                            </option>
                        </select>
                        <div class="at-hint">
                            {{
                                meta.samus.length
                                    ? '✔ = rétroplanning déjà enregistré.'
                                    : 'Aucun déploiement : créez d’abord un déploiement de SAMU.'
                            }}
                        </div>
                    </div>
                    <div class="at-field">
                        <label for="atMep2">Date de MEP</label>
                        <input
                            id="atMep2"
                            type="date"
                            :value="f.mep"
                            @change="
                                f.mep = ($event.target as HTMLInputElement).value;
                                programmer();
                            "
                        />
                        <div class="at-hint">
                            {{
                                projet?.mep && projet.mep === f.mep
                                    ? 'Reprise du déploiement.'
                                    : 'Date ferme de mise en production.'
                            }}
                        </div>
                    </div>
                    <div class="at-field">
                        <label for="atNb2">Nombre d’ateliers</label>
                        <select
                            id="atNb2"
                            :value="String(f.nb)"
                            @change="
                                f.nb = Number(($event.target as HTMLSelectElement).value);
                                programmer();
                            "
                        >
                            <option v-for="n in nombres" :key="n" :value="String(n)">{{ n }} ateliers</option>
                        </select>
                    </div>
                    <div class="at-field">
                        <label for="atZone2">Zone de vacances scolaires</label>
                        <select
                            id="atZone2"
                            :value="f.zone"
                            @change="
                                f.zone = ($event.target as HTMLSelectElement).value;
                                programmer();
                            "
                        >
                            <option value="">— Zone —</option>
                            <option v-for="z in meta.zones" :key="z" :value="z">Zone {{ z }}</option>
                        </select>
                        <div id="atZoneHint" class="at-hint">
                            {{ zone.texte }}
                            <button v-if="zone.reprendre" type="button" @click="reprendreZone">↺ la reprendre</button>
                        </div>
                    </div>
                </div>
                <div id="atWarnings">
                    <template v-if="sim && f.mep && f.zone && f.nb">
                        <div v-for="(w, i) in sim.warnings" :key="i" class="at-warn">⚠ {{ w }}</div>
                    </template>
                </div>
                <div id="atTableBox" class="at-defile">
                    <div v-if="!f.mep || !f.zone || !f.nb" class="at-empty">
                        Choisissez un SAMU, une date de MEP et une zone pour simuler le rétroplanning.
                    </div>
                    <div v-else-if="erreurSimulation" class="at-empty at-empty--erreur">{{ erreurSimulation }}</div>
                    <table v-else-if="sim" class="at-table">
                        <thead>
                            <tr>
                                <th>Jalon</th>
                                <th>Contenu / objectifs</th>
                                <th>Date cible théorique</th>
                                <th>Date proposée</th>
                                <th>Sondage</th>
                                <th>Date réellement planifiée</th>
                                <th>Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="r in sim.rows"
                                :key="r.key"
                                :class="{ 'at-mep': r.key === 'mep', 'at-fixed': r.key === 'livrables' }"
                            >
                                <td>
                                    <span class="at-jalon">{{ r.jalon }}</span>
                                </td>
                                <td>
                                    <template v-if="estAtelier(r.key)">
                                        <select
                                            :data-row="r.key"
                                            :aria-label="`Contenu : ${r.jalon}`"
                                            :value="contenuPersonnalise(r) ? '__perso__' : r.contenu"
                                            @change="choisirContenu(r, ($event.target as HTMLSelectElement).value)"
                                        >
                                            <option v-for="x in meta.contenus" :key="x" :value="x">{{ x }}</option>
                                            <option value="__perso__">✎ Personnalisé…</option>
                                        </select>
                                        <input
                                            v-if="contenuPersonnalise(r)"
                                            type="text"
                                            class="at-perso"
                                            :data-row="r.key"
                                            maxlength="200"
                                            :value="r.contenu"
                                            placeholder="Titre / objectif de l’atelier (repris dans les e-mails)"
                                            :aria-label="`Contenu personnalisé : ${r.jalon}`"
                                            @change="contenuSaisi(r, ($event.target as HTMLInputElement).value)"
                                        />
                                    </template>
                                    <template v-else>{{ r.contenu }}</template>
                                </td>
                                <td>{{ dateLongue(r.cible) }}</td>
                                <td
                                    class="at-proposee"
                                    :class="{ 'at-proposee--decalee': r.proposee && r.cible && r.proposee !== r.cible }"
                                >
                                    {{ dateLongue(r.proposee) }}
                                </td>
                                <td>
                                    <span v-if="r.key === 'mep' || r.key === 'livrables'" class="aff-muted">—</span>
                                    <button
                                        v-else
                                        type="button"
                                        class="at-sd"
                                        :class="sondageDe(r.key)?.statut"
                                        :disabled="!f.id || (!sondageDe(r.key) && !admin)"
                                        :title="
                                            f.id
                                                ? 'Concevoir ou suivre le sondage de date de ce jalon'
                                                : 'Enregistrez d’abord le rétroplanning'
                                        "
                                        @click="ouvrirSondage(r)"
                                    >
                                        {{ libelleBoutonSondage(sondageDe(r.key)) }}
                                    </button>
                                </td>
                                <td>
                                    <div class="at-planifiee">
                                        <input
                                            type="date"
                                            :data-row="r.key"
                                            :value="r.planifiee || ''"
                                            :disabled="!admin"
                                            :aria-label="`Date réellement planifiée : ${r.jalon}`"
                                            @change="datePlanifiee(r, ($event.target as HTMLInputElement).value)"
                                        />
                                        <input
                                            type="time"
                                            :data-row="r.key"
                                            :value="(r.planifiee && f.heures[r.key]) || ''"
                                            title="Heure retenue (facultative)"
                                            :disabled="!admin || !r.planifiee"
                                            :aria-label="`Heure retenue : ${r.jalon}`"
                                            @change="heurePlanifiee(r, ($event.target as HTMLInputElement).value)"
                                        />
                                    </div>
                                </td>
                                <td>
                                    <div class="at-statut">
                                        <span class="at-badge" :class="r.niveau">{{ r.statut }}</span>
                                        <button
                                            v-if="inviteProposee(r)"
                                            type="button"
                                            class="at-sd"
                                            :class="
                                                f.invites[r.key] ? 'reponses' : inviteMisEnAvant === r.key ? 'cta' : ''
                                            "
                                            :disabled="!admin"
                                            :title="
                                                f.invites[r.key]
                                                    ? `Invitation déjà envoyée le ${dateCourte(f.invites[r.key]!.slice(0, 10))} : renvoyer`
                                                    : 'Envoyer l’invitation (ics avec lien Teams)'
                                            "
                                            @click="ouvrirInvitation(r)"
                                        >
                                            <IconeAtelier nom="calendar" classe="at-ico-sm" />
                                            {{ f.invites[r.key] ? 'Invitation envoyée' : 'Inviter' }}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="at-bar">
                    <button
                        v-if="admin"
                        id="atSaveBtn"
                        type="button"
                        class="aff-btn aff-btn-primary"
                        :disabled="enregistrement"
                        @click="enregistrer"
                    >
                        <IconeAtelier nom="save" classe="at-ico-sm" />Enregistrer le rétroplanning
                    </button>
                    <button type="button" class="aff-btn" @click="nouvelleSimulation">
                        <IconeAtelier nom="undo" classe="at-ico-sm" />Nouvelle simulation
                    </button>
                    <span v-if="!admin" class="aff-muted"
                        >Seuls les administrateurs enregistrent un rétroplanning.</span
                    >
                </div>
            </section>

            <section id="atCardList" class="aff-card">
                <header class="aff-card-head">
                    <span class="at-card-title"><IconeAtelier nom="list" />Rétroplanning</span
                    ><span id="atListCount" class="aff-muted">{{ liste.length ? `${liste.length} SAMU` : '' }}</span>
                </header>
                <div id="atList">
                    <div v-if="!liste.length" class="at-empty">
                        Aucun rétroplanning enregistré. Simulez puis enregistrez un rétroplanning pour un SAMU.
                    </div>
                    <div v-else class="at-defile">
                        <table class="at-table">
                            <thead>
                                <tr>
                                    <th>SAMU</th>
                                    <th>MEP</th>
                                    <th>Zone</th>
                                    <th>Ateliers</th>
                                    <th>Avancement</th>
                                    <th>Prochain jalon</th>
                                    <th>Dernière diffusion</th>
                                    <th :class="admin ? 'at-col-actions' : 'at-col-actions--etroite'">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in liste" :key="r.id">
                                    <td>
                                        <strong>{{ r.samu_name }}</strong>
                                    </td>
                                    <td>{{ dateLongue(r.mep_date) }}</td>
                                    <td>{{ r.zone }}</td>
                                    <td>{{ r.nb_ateliers }}</td>
                                    <td>
                                        <span class="at-badge" :class="avancement(r).niveau">{{
                                            avancement(r).texte
                                        }}</span
                                        ><template v-if="r.warnings.length">
                                            <span :title="r.warnings.join(' ')" class="at-avertissement"
                                                >⚠️</span
                                            ></template
                                        >
                                    </td>
                                    <td>{{ prochainJalon(r) }}</td>
                                    <td>
                                        <template v-if="r.last_sent_at">{{
                                            dateCourte(r.last_sent_at.slice(0, 10))
                                        }}</template
                                        ><span v-else class="aff-muted">jamais</span>
                                    </td>
                                    <td>
                                        <div class="at-actions">
                                            <button
                                                type="button"
                                                class="at-icon-btn edit"
                                                title="Modifier : ouvrir dans la simulation"
                                                aria-label="Modifier"
                                                @click="modifier(r)"
                                            >
                                                <IconeAtelier nom="edit" classe="at-ico-sm" />
                                            </button>
                                            <button
                                                v-if="admin"
                                                type="button"
                                                class="at-icon-btn del"
                                                title="Supprimer ce rétroplanning"
                                                aria-label="Supprimer"
                                                @click="supprimer(r)"
                                            >
                                                <IconeAtelier nom="trash" classe="at-ico-sm" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </template>
    </div>

    <FenetreInvitation
        v-if="invitation && f.id"
        :retroplanning-id="f.id"
        :ligne="invitation.ligne"
        :samu="f.samu"
        :heure="f.heures[invitation.ligne.key] || ''"
        :teams="f.teams"
        :utilisateurs="invitation.utilisateurs"
        :destinataires="invitation.destinataires"
        :repris="invitation.repris"
        :organisateur="sessionStore.session?.userId ?? null"
        @fermer="invitation = null"
        @envoi="etatEnvoi('Envoi en cours…', false)"
        @envoye="invitationEnvoyee"
        @erreur="invitationRefusee"
    />
    <FenetreSondage
        v-if="sondage && f.id"
        :retroplanning-id="f.id"
        :ligne="sondage.ligne"
        :samu="f.samu"
        :admin="admin"
        :utilisateurs="sondage.utilisateurs"
        :moi="sessionStore.session?.userId ?? null"
        @fermer="sondage = null"
        @sondages="lireSondages"
        @clos="sondageClos"
        @annonce="(t, e) => annoncer(t, !!e)"
    />

    <div v-for="a in annonces" :key="a.n" class="at-toast" :class="a.classe" role="status">{{ a.texte }}</div>
    <div v-if="envoi" id="atSendStatus" class="at-envoi" :class="{ 'at-envoi--fini': envoi.fini }" role="status">
        <span v-if="envoi.fini">✔</span><span v-else class="at-envoi__roue"></span> {{ envoi.texte }}
    </div>
</template>
