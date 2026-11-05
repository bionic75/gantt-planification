<!-- Onglet Astreintes, rubrique « Gestion des astreintes HO » : planning du mois, du lundi au vendredi, demi-journée
     par demi-journée (plusieurs experts possibles), et astreinte HO ANS (un ou plusieurs utilisateurs par jour). Les modifications
     sont préparées à l'écran puis enregistrées après confirmation ; relu à chaque ouverture de l'onglet. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiAstreintesHo, type MoisHo, type PeriodeHo } from '@/api/astreintes';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import ChoixHo from './ChoixHo.vue';
import FenetreEnregistrementHo from './FenetreEnregistrementHo.vue';
import {
    basculer,
    basculerAns,
    choixAns,
    dateFr,
    decalerMois,
    demiJourneeModifiable,
    definirTitulaires,
    droits as droitsDe,
    inscriptions,
    JOURS,
    jourAnsModifiable,
    libelleMois,
    messageResultat,
    modifications,
    modificationsAns,
    moisCourant,
    nombreEnAttente,
    nomAns,
    nomExpert,
    nomJour,
    occupation,
    PERIODES,
    semaineIso,
    titreAns,
    titreDemiJournee,
    titulaires,
    titulairesEnregistres,
    type EnAttente,
    type EnAttenteAns
} from './ho';

const { demande, repondre, confirmer } = fournirConfirmation();

const mois = ref(moisCourant());
const donnees = ref<MoisHo | null>(null);
const erreurChargement = ref('');
const attente = ref<EnAttente>(new Map());
const attenteAns = ref<EnAttenteAns>(new Map());
const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);
/** Fenêtre contextuelle ouverte : case d'origine, jour et demi-journée (null : ligne ANS) */
const choix = ref<{ ancre: HTMLElement; date: string; periode: PeriodeHo | null } | null>(null);
const enregistrement = ref(false);
const enCours = ref(false);
const erreurEnregistrement = ref('');

const nombre = computed(() => nombreEnAttente(attente.value, attenteAns.value));
const droits = computed(() => (donnees.value ? droitsDe(donnees.value) : null));

const LEGENDE = [
    { classes: 'ho-empty', libelle: 'Demi-journée vide / astreinte ANS à pourvoir' },
    { classes: 'ho-one', libelle: '1 expert / astreinte ANS pourvue' },
    { classes: 'ho-multi', libelle: '2 experts ou plus' },
    { classes: 'ho-pending', libelle: 'Modification non enregistrée' },
    { classes: 'ho-one ho-past', libelle: 'Semaine passée' },
    { classes: null, libelle: 'Semaine en cours' }
];

async function charger() {
    try {
        donnees.value = await apiAstreintesHo.mois(mois.value);
        erreurChargement.value = '';
    } catch (e) {
        erreurChargement.value = `Planning indisponible : ${(e as Error).message}`;
    }
}
onMounted(charger);
surReouverture(charger);

// Modifications non enregistrées : avertissement en quittant la page
function avantDeQuitter(e: BeforeUnloadEvent) {
    if (!nombre.value) return;
    e.preventDefault();
    e.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', avantDeQuitter));
onBeforeUnmount(() => window.removeEventListener('beforeunload', avantDeQuitter));

function abandonner() {
    attente.value.clear();
    attenteAns.value.clear();
    choix.value = null;
}

/** Changement de mois ; les modifications non enregistrées sont abandonnées après confirmation */
async function allerA(cible: string) {
    if (cible === mois.value) return;
    if (
        nombre.value &&
        !(await confirmer(
            'Des modifications ne sont pas enregistrées. Changer de mois les annule. Continuer ?',
            'Confirmer',
            { danger: false }
        ))
    )
        return;
    abandonner();
    message.value = null;
    mois.value = cible;
    await charger();
}

// ---------- Grille ----------

function demiJournee(date: string, periode: PeriodeHo) {
    const d = donnees.value!;
    const liste = inscriptions(d, attente.value, date, periode);
    const presents = liste.filter(i => i.etat !== 'retrait');
    return {
        modifiable: demiJourneeModifiable(d, date),
        classes: [occupation(presents.length), { 'ho-pending': liste.some(i => i.etat !== 'enregistre') }],
        titre: titreDemiJournee(d, attente.value, date, periode),
        experts: liste.map(i => {
            const n = nomExpert(d, i.rid);
            return {
                rid: i.rid,
                trigramme: n.trigramme,
                nom: `${n.prenom} ${n.nom}`,
                classes: {
                    'ho-me': i.rid === d.me.resourceId,
                    'ho-add': i.etat === 'ajout',
                    'ho-del': i.etat === 'retrait'
                }
            };
        })
    };
}

function jourAns(date: string) {
    const d = donnees.value!;
    const liste = titulaires(d, attenteAns.value, date);
    const enregistres = titulairesEnregistres(d, date);
    return {
        modifiable: jourAnsModifiable(d, date),
        classes: [occupation(liste.length), { 'ho-pending': attenteAns.value.has(date) }],
        titre: titreAns(d, attenteAns.value, date),
        personnes: liste.map(id => {
            const n = nomAns(d, id);
            return {
                id,
                texte: n.trigramme || `${n.prenom} ${n.nom}`,
                nom: `${n.prenom} ${n.nom}`,
                classes: { 'ho-me': id === d.ans.me.userId, 'ho-add': !enregistres.includes(id) }
            };
        })
    };
}

const semaines = computed(() => {
    const d = donnees.value;
    if (!d) return [];
    return d.weeks.map(w => ({
        lundi: w.monday,
        numero: semaineIso(w.monday),
        passee: w.monday < d.me.currentWeek,
        courante: w.monday === d.me.currentWeek,
        jours: w.days.map(date => ({
            date,
            dansLeMois: date.slice(0, 7) === mois.value,
            demiJournees: PERIODES.map(p => ({ periode: p.cle, ...demiJournee(date, p.cle) })),
            ans: jourAns(date)
        }))
    }));
});

// ---------- Modifications ----------

/** Clic sur une demi-journée : choix des experts (administrateur) ou inscription / retrait de l'expert HO */
function clicDemiJournee(e: Event, date: string, periode: PeriodeHo) {
    const d = donnees.value!;
    if (!d.me.canEdit) return;
    message.value = null;
    if (!d.me.isAdmin) {
        const refus = basculer(d, attente.value, date, periode, d.me.resourceId!);
        if (refus) message.value = { type: 'error', texte: refus };
        return;
    }
    choix.value = { ancre: e.currentTarget as HTMLElement, date, periode };
}

/** Clic sur un jour HO ANS : choix des utilisateurs (administrateur) ou ajout / retrait de l'utilisateur ANS */
function clicAns(e: Event, date: string) {
    const d = donnees.value!;
    if (!jourAnsModifiable(d, date)) return;
    message.value = null;
    if (!d.ans.me.isAdmin) {
        basculerAns(d, attenteAns.value, date);
        return;
    }
    choix.value = { ancre: e.currentTarget as HTMLElement, date, periode: null };
}

const expertsChoix = computed(() => {
    const c = choix.value;
    const d = donnees.value;
    if (!c || !c.periode || !d) return [];
    const presents = new Set(
        inscriptions(d, attente.value, c.date, c.periode)
            .filter(i => i.etat !== 'retrait')
            .map(i => i.rid)
    );
    return d.experts.map(e => ({ ...e, present: presents.has(e.resource_id) }));
});

function cocher(rid: number, voulu: boolean) {
    const c = choix.value;
    const d = donnees.value;
    if (!c || !c.periode || !d) return;
    const present = inscriptions(d, attente.value, c.date, c.periode).some(i => i.rid === rid && i.etat !== 'retrait');
    if (voulu !== present) {
        const refus = basculer(d, attente.value, c.date, c.periode, rid);
        if (refus) message.value = { type: 'error', texte: refus };
    }
}

const ansChoix = computed(() =>
    choix.value && choix.value.periode === null && donnees.value
        ? choixAns(donnees.value, attenteAns.value, choix.value.date)
        : null
);

function cocherAns(uid: number, voulu: boolean) {
    const c = choix.value;
    const d = donnees.value;
    if (!c || c.periode !== null || !d) return;
    const liste = titulaires(d, attenteAns.value, c.date).filter(id => id !== uid);
    definirTitulaires(d, attenteAns.value, c.date, voulu ? [...liste, uid] : liste);
}

const titreChoix = computed(() => {
    const c = choix.value;
    if (!c) return '';
    const jour = `${nomJour(c.date)} ${dateFr(c.date)}`;
    return c.periode === null
        ? `Astreinte HO ANS — ${jour}`
        : `${jour} — ${c.periode === 'AM' ? 'matin' : 'après-midi'}`;
});

function annulerModifications() {
    abandonner();
}

// ---------- Enregistrement ----------

const listeModifications = computed(() => modifications(attente.value));
const listeModificationsAns = computed(() => modificationsAns(attenteAns.value));

function ouvrirEnregistrement() {
    if (!nombre.value) return;
    choix.value = null;
    erreurEnregistrement.value = '';
    enregistrement.value = true;
}

async function enregistrer() {
    if (enCours.value) return;
    enCours.value = true;
    try {
        const r = await apiAstreintesHo.enregistrer(listeModifications.value, listeModificationsAns.value);
        abandonner();
        enregistrement.value = false;
        message.value = { type: 'success', texte: messageResultat(r) };
        await charger();
    } catch (e) {
        erreurEnregistrement.value = (e as Error).message;
    } finally {
        enCours.value = false;
    }
}
</script>

<template>
    <p class="rubrique-ho__intro">
        Planning des astreintes <strong>HO</strong> (heures ouvrées) : du lundi au vendredi,
        <strong>demi-journée par demi-journée</strong>. Plusieurs experts peuvent être inscrits sur une même
        demi-journée.
    </p>
    <div id="hoRights" class="rubrique-ho__droits">
        <template v-if="droits">
            <template v-if="droits.ho === 'admin'"
                >🛡️ <strong>Administrateur</strong> : cliquez sur une demi-journée pour inscrire ou retirer des experts.
                Toutes les semaines sont modifiables, y compris les semaines passées.</template
            >
            <template v-else-if="droits.ho === 'expert'"
                >✋ <strong>Expert HO</strong> : cliquez sur une demi-journée pour vous inscrire ou vous retirer. Vous
                ne pouvez modifier que vos propres inscriptions, jusqu'à la semaine en cours.</template
            >
            <template v-else
                >👁️ <strong>Consultation seule</strong> : seuls les experts déclarés pour les astreintes HO et les
                administrateurs peuvent modifier ce planning.</template
            >
            <template v-if="droits.ans === 'admin'">
                Ligne « ANS » : cliquez sur un jour pour désigner un ou plusieurs utilisateurs en astreinte HO ANS (menu
                des utilisateurs ayant la case « Astreinte HO ANS » cochée).</template
            >
            <template v-else-if="droits.ans === 'utilisateur'">
                Ligne « ANS » : cliquez sur un jour pour vous ajouter à l’astreinte HO ANS ou vous retirer (les autres
                utilisateurs désignés sont conservés).</template
            >
        </template>
    </div>

    <div class="rubrique-ho__barre">
        <button type="button" class="ho-btn" title="Mois précédent" @click="allerA(decalerMois(mois, -1))">◀</button>
        <strong id="hoMonthLabel" class="rubrique-ho__mois">{{ donnees ? libelleMois(mois) : '' }}</strong>
        <button type="button" class="ho-btn" title="Mois suivant" @click="allerA(decalerMois(mois, 1))">▶</button>
        <button type="button" class="ho-btn" @click="allerA(moisCourant())">Aujourd'hui</button>
        <span class="rubrique-ho__espace"></span>
        <button v-if="nombre" id="hoCancelBtn" type="button" class="ho-btn" @click="annulerModifications">
            ↺ Annuler les modifications
        </button>
        <button v-if="nombre" id="hoSaveBtn" type="button" class="ho-btn ho-btn-primary" @click="ouvrirEnregistrement">
            💾 Enregistrer <span :key="nombre" id="hoPendingCount">({{ nombre }})</span>
        </button>
    </div>
    <AppAlert v-if="message" :type="message.type" :description="message.texte" />

    <div id="hoLegend" class="rubrique-ho__legende">
        <span v-for="l in LEGENDE" :key="l.libelle" class="rubrique-ho__element">
            <span v-if="l.classes" class="ho-half rubrique-ho__pastille" :class="l.classes"></span>
            <span v-else class="ho-legend-current"></span>{{ l.libelle }}
        </span>
    </div>

    <div id="hoGrid">
        <p v-if="erreurChargement" class="rubrique-ho__erreur">{{ erreurChargement }}</p>
        <p v-else-if="!donnees" class="rubrique-ho__attente">Chargement…</p>
        <table v-else class="ho-grid">
            <thead>
                <tr>
                    <th class="ho-week">Sem.</th>
                    <th v-for="j in JOURS" :key="j">{{ j }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="s in semaines" :key="s.lundi" :class="{ 'ho-current-week': s.courante }">
                    <th
                        class="ho-week"
                        :class="{ 'ho-week-current': s.courante }"
                        :title="`Semaine ${s.numero}${s.courante ? ' (semaine en cours)' : ''}`"
                    >
                        S{{ s.numero }}<small v-if="s.courante">en cours</small>
                    </th>
                    <td v-for="j in s.jours" :key="j.date" class="ho-day">
                        <div
                            class="rubrique-ho__jour"
                            :class="{ 'rubrique-ho__jour--aujourdhui': j.date === donnees.me.today }"
                        >
                            {{ dateFr(j.date).slice(0, 5) }}{{ j.date === donnees.me.today ? ' • aujourd’hui' : '' }}
                        </div>
                        <div
                            v-for="c in j.demiJournees"
                            :key="c.periode"
                            class="ho-half"
                            :class="[
                                c.classes,
                                { 'ho-past': s.passee, 'ho-out': !j.dansLeMois, 'ho-editable': c.modifiable }
                            ]"
                            :title="c.titre"
                            :role="c.modifiable ? 'button' : undefined"
                            :tabindex="c.modifiable ? 0 : undefined"
                            @click="c.modifiable && clicDemiJournee($event, j.date, c.periode)"
                            @keydown.enter="c.modifiable && clicDemiJournee($event, j.date, c.periode)"
                        >
                            <span class="ho-pl">{{ c.periode }}</span>
                            <template v-if="c.experts.length">
                                <span
                                    v-for="x in c.experts"
                                    :key="x.rid"
                                    class="ho-chip"
                                    :class="x.classes"
                                    :title="x.nom"
                                    >{{ x.trigramme }}</span
                                >
                            </template>
                            <template v-else>vide</template>
                        </div>
                        <div
                            class="ho-half ho-ans"
                            :class="[
                                j.ans.classes,
                                { 'ho-past': s.passee, 'ho-out': !j.dansLeMois, 'ho-editable': j.ans.modifiable }
                            ]"
                            :title="j.ans.titre"
                            :role="j.ans.modifiable ? 'button' : undefined"
                            :tabindex="j.ans.modifiable ? 0 : undefined"
                            @click="j.ans.modifiable && clicAns($event, j.date)"
                            @keydown.enter="j.ans.modifiable && clicAns($event, j.date)"
                        >
                            <span class="ho-pl">ANS</span>
                            <template v-if="j.ans.personnes.length">
                                <span
                                    v-for="p in j.ans.personnes"
                                    :key="p.id"
                                    class="ho-chip"
                                    :class="p.classes"
                                    :title="p.nom"
                                    >{{ p.texte }}</span
                                >
                            </template>
                            <template v-else>vide</template>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <ChoixHo
        v-if="choix && donnees"
        :ancre="choix.ancre"
        :titre="titreChoix"
        :ans="choix.periode === null"
        @fermer="ancre => choix?.ancre === ancre && (choix = null)"
    >
        <template v-if="choix.periode">
            <template v-if="expertsChoix.length">
                <label v-for="e in expertsChoix" :key="e.resource_id" class="ho-check">
                    <input
                        type="checkbox"
                        :checked="e.present"
                        @change="cocher(e.resource_id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ e.prenom }} {{ e.nom.toUpperCase() }}</span>
                    <span class="ho-tri">{{ e.trigramme }}</span>
                </label>
            </template>
            <p v-else class="rubrique-ho__avertissement">
                Aucun expert déclaré pour les astreintes HO (onglet Ressources).
            </p>
        </template>
        <template v-else-if="ansChoix">
            <template v-if="ansChoix.length">
                <label v-for="u in ansChoix" :key="u.user_id" class="ho-check">
                    <input
                        type="checkbox"
                        :checked="u.designe"
                        @change="cocherAns(u.user_id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ u.prenom }} {{ (u.nom || '').toUpperCase() }}</span>
                    <span v-if="u.trigramme" class="ho-tri">{{ u.trigramme }}</span>
                </label>
            </template>
            <p v-else class="rubrique-ho__avertissement">
                Aucun utilisateur n'a la case « Astreinte HO ANS » cochée (Administration, gestion des utilisateurs).
            </p>
        </template>
    </ChoixHo>

    <FenetreEnregistrementHo
        v-if="enregistrement && donnees"
        :donnees="donnees"
        :modifications="listeModifications"
        :modifications-ans="listeModificationsAns"
        :en-cours="enCours"
        :erreur="erreurEnregistrement"
        @fermer="enregistrement = false"
        @confirmer="enregistrer"
    />
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :label-annuler="demande?.labelAnnuler"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>

<style scoped>
.rubrique-ho__intro {
    font-size: 13px;
    color: #33691e;
    background: #f1f8e9;
    border-left: 4px solid #7cb342;
    padding: 10px 12px;
    border-radius: 4px;
    margin: 0 0 14px;
}
.rubrique-ho__droits {
    font-size: 12px;
    color: #555;
    margin-bottom: 10px;
}
.rubrique-ho__barre {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
}
.rubrique-ho__mois {
    min-width: 150px;
    text-align: center;
    font-size: 15px;
}
.rubrique-ho__espace {
    flex: 1;
}
.rubrique-ho__legende {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
    margin-bottom: 10px;
}
.rubrique-ho__element {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.rubrique-ho__pastille {
    min-height: 0;
    width: 22px;
    height: 16px;
    padding: 0;
    margin: 0;
    display: inline-block;
}
.rubrique-ho__attente {
    color: #999;
    font-style: italic;
}
.rubrique-ho__erreur {
    color: #b71c1c;
}
.rubrique-ho__jour {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 3px;
    color: #546e7a;
}
.rubrique-ho__jour--aujourdhui {
    color: #1d70b7;
}
.rubrique-ho__avertissement {
    color: #b26a00;
    font-size: 12px;
    margin: 4px 0;
}
</style>
