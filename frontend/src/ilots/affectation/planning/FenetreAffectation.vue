<!-- Affectation des ressources à une étape d'un déploiement : journées cochées par expert (au plus le nombre de ressources
     nécessaires par jour), disponibilités, ressources externes ; enregistrement. Administrateur seulement, comme le
     serveur : remise en situation de la planification des experts retirés ou des journées décochées, report dans la
     planification et l'événement (« Synchroniser »). -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import {
    apiAffectation,
    type Deploiement,
    type DisponibiliteRessource,
    type RessourceAffectable
} from '@/api/affectation';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppModal from '@/composants/AppModal.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { definitionEtape } from './grille';
import { usePlanningAffectationStore } from './magasin';
import { ajouterJours, estWeekEnd, jourFr, normaliser } from './outils';

const props = defineProps<{ deploiementId: number; etape: string; admin: boolean }>();
const emit = defineEmits<{
    fermer: [];
    annonce: [texte: string];
    message: [texte: string];
    report: [id: number, etape: string, auto: boolean];
}>();

const magasin = usePlanningAffectationStore();
const { demande, repondre, confirmer } = fournirConfirmation();

const ouverte = ref(false);
const deploiement = ref<Deploiement | null>(null);
const necessaire = ref(0);
const dates = ref<string[]>([]);
const dispo = ref<Record<number, DisponibiliteRessource> | null>(null);
/** Journées : date → ressources cochées */
const jours = ref<Record<string, Set<number>>>({});
let initiales: Record<string, Set<number>> = {};
const externesAffichees = ref(new Set<number>());
const filtre = ref('');
const externe = ref('');
const info = ref('');
const erreur = ref('');

/** États d'un jour pour une ressource : libellé et classe de la case */
const ETATS: Record<string, [string, string]> = {
    free: ['Disponible', 'ok'],
    here: ['Déjà sur ce SAMU dans la planification', 'here'],
    ans: ['Activité ANS ce jour-là', 'mid'],
    off: ['Indisponible', 'na'],
    leave: ['Congés', 'na'],
    other: ['Affecté(e) à un autre SAMU ce jour-là', 'ko']
};
const JOURS_SEMAINE = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const nombreLe = (d: string) => jours.value[d]?.size ?? 0;
const intervenants = computed(() => {
    const s = new Set<number>();
    Object.values(jours.value).forEach(set => set.forEach(r => s.add(r)));
    return s;
});

/**
 * Jour impossible à cocher pour un expert sans disponibilité (indisponible, congés, planning non renseigné) ou déjà
 * affecté à un autre SAMU ; sans disponibilités chargées, ou pour une ressource externe : autorisé
 */
function bloque(rid: number, d: string) {
    if (rid < 0 || !dispo.value) return false;
    const st = dispo.value[rid]?.byDay?.[d];
    return st === 'other' || st === 'off' || st === 'leave' || !st;
}

const libelleExterne = (r: RessourceAffectable) =>
    `${r.prenom || ''} ${(r.nom || '').toUpperCase()} (${r.trigramme || '?'})`.trim();

/** Ressources listées : externes affichées puis experts, intervenants en tête, puis par disponibilité */
const liste = computed(() => {
    const q = normaliser(filtre.value);
    const av = dispo.value ?? {};
    const union = intervenants.value;
    const correspond = (r: RessourceAffectable) =>
        !q || union.has(r.id) || normaliser(`${r.nom} ${r.prenom} ${r.trigramme || ''}`).includes(q);
    const score = (r: RessourceAffectable) =>
        (union.has(r.id) ? 1e6 : 0) + (av[r.id]?.free ?? 0) * 10 - (av[r.id]?.other ?? 0);
    const experts = magasin.ressources
        .filter(correspond)
        .sort((a, b) => score(b) - score(a) || (a.nom || '').localeCompare(b.nom || '', 'fr'));
    const ext = magasin.externes
        .filter(r => union.has(r.id) || externesAffichees.value.has(r.id))
        .filter(correspond)
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
    return [...ext, ...experts];
});

/** Ressources externes proposées dans la zone de saisie : pas encore affichées */
const externesProposees = computed(() =>
    magasin.externes.filter(r => !intervenants.value.has(r.id) && !externesAffichees.value.has(r.id))
);

const nbJoursDe = (rid: number) => dates.value.filter(d => jours.value[d]?.has(rid)).length;

function caseJour(r: RessourceAffectable, d: string) {
    const coche = !!jours.value[d]?.has(r.id);
    const complet = !coche && nombreLe(d) >= necessaire.value;
    // Expert sans disponibilité ce jour-là ou déjà sur un autre SAMU : sélection impossible (une journée cochée reste
    // décochable)
    const impossible = !coche && bloque(r.id, d);
    const [texte, classe] = ETATS[dispo.value?.[r.id]?.byDay?.[d] ?? ''] ?? ['Planning non renseigné', 'na'];
    return { coche, inactive: complet || impossible, titre: `${texte}${complet ? ' — journée complète' : ''}`, classe };
}

function basculerJour(rid: number, d: string) {
    const set = new Set(jours.value[d] ?? []);
    if (set.has(rid)) set.delete(rid);
    else if (set.size < necessaire.value && !bloque(rid, d)) set.add(rid);
    jours.value = { ...jours.value, [d]: set };
}

/** Tous les jours ouvrés de l'étape (dans la limite par jour ; week-ends à cocher à la main), ou aucun */
function toutLaLigne(rid: number, tous: boolean) {
    const suivants = { ...jours.value };
    for (const d of dates.value) {
        const set = new Set(suivants[d] ?? []);
        if (!tous) set.delete(rid);
        else if (estWeekEnd(d)) continue;
        else if (set.size < necessaire.value && !bloque(rid, d)) set.add(rid);
        suivants[d] = set;
    }
    jours.value = suivants;
}

/** Ressource externe choisie dans les propositions : ajoutée à la grille (journées à cocher ensuite) */
function choisirExterne() {
    const v = normaliser(externe.value);
    const trouvee = magasin.externes.find(r => normaliser(libelleExterne(r)) === v);
    if (!trouvee) return;
    externesAffichees.value = new Set([...externesAffichees.value, trouvee.id]);
    externe.value = '';
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function ouvrir() {
    let p = magasin.deploiements.find(x => x.id === props.deploiementId);
    const x = p?.periods?.[props.etape]?.[0];
    if (!p || !x || !x.needed) {
        emit('fermer');
        return;
    }
    try {
        await magasin.chargerRessources();
    } catch (e) {
        emit('message', message(e));
        emit('fermer');
        return;
    }
    // Les participants des événements reliés à cette activité sont repris comme ressources affectées
    try {
        const sy = await apiAffectation.synchroniserDepuisEvenements(p.id);
        if ((sy.changes ?? []).length) {
            await magasin.relireDeploiements();
            p = magasin.deploiements.find(z => z.id === props.deploiementId) ?? p;
        }
    } catch {
        /* synchronisation indisponible : l'affectation reste manuelle */
    }
    deploiement.value = p;
    necessaire.value = x.needed;
    // Tous les jours de l'étape, week-ends compris (certaines activités se tiennent le samedi ou le dimanche)
    const liste: string[] = [];
    for (let d = x.start; d <= x.end; d = ajouterJours(d, 1)) liste.push(d);
    dates.value = liste;
    try {
        const r = await apiAffectation.disponibilites(p.id, props.etape);
        dispo.value = r.availability;
        if (r.dates) dates.value = r.dates;
    } catch {
        /* disponibilités indisponibles : grille sans indicateurs */
    }
    // Journées d'intervention actuelles
    const actuelles = p.assignment_days?.[props.etape] ?? {};
    jours.value = Object.fromEntries(dates.value.map(d => [d, new Set(actuelles[d] ?? [])]));
    initiales = Object.fromEntries(dates.value.map(d => [d, new Set(actuelles[d] ?? [])]));
    info.value = `${p.samu_name} — ${definitionEtape(magasin.contexte, props.etape).label} (${jourFr(x.start)} → ${jourFr(x.end)})`;
    ouverte.value = true;
}

async function enregistrer() {
    const p = deploiement.value;
    if (!p) return;
    erreur.value = '';
    const precedents = p.assignments?.[props.etape] ?? [];
    const days: Record<string, number[]> = {};
    for (const d of dates.value) if (jours.value[d]?.size) days[d] = [...jours.value[d]!];
    let r: Awaited<ReturnType<typeof apiAffectation.enregistrerJournees>>;
    try {
        r = await apiAffectation.enregistrerJournees(p.id, props.etape, days);
    } catch (e) {
        erreur.value = message(e);
        return;
    }
    const assignments = { ...(p.assignments ?? {}), [props.etape]: r.resource_ids };
    const assignment_days = { ...(p.assignment_days ?? {}) };
    if (r.resource_ids.length) assignment_days[props.etape] = r.assignment_days;
    else delete assignment_days[props.etape];
    magasin.mettreAJour({ ...p, assignments, assignment_days });
    ouverte.value = false;
    // Remise en situation de la planification et report : réservés à l'administrateur, comme le serveur
    if (props.admin) {
        await desaffecter(p, precedents, r.resource_ids);
        await remettreJournees(p, r.resource_ids);
        // Les ressources externes n'ont pas de planification à synchroniser
        if (r.resource_ids.some(x => x > 0)) emit('report', p.id, props.etape, true);
    }
    emit('fermer');
}

/** Experts retirés de l'étape : remise en « 2 - Disponible » / « 2 - En attente d'affectation », retrait de l'événement */
async function desaffecter(p: Deploiement, precedents: number[], restants: number[]) {
    const retires = precedents.filter(x => !restants.includes(x));
    if (!retires.length) return;
    const noms = retires
        .map(id => {
            const q = magasin.ressources.find(z => z.id === id) ?? magasin.externes.find(z => z.id === id);
            return q ? `${q.prenom || ''} ${(q.nom || '').toUpperCase()}`.trim() : `#${id}`;
        })
        .join(', ');
    const ok = await confirmer(
        `Désaffectation : ${noms}.\n\nLes remettre dans leur planification en « 2 - Disponible » / « 2 - En attente d'affectation » (localisation effacée) sur la période de l'activité, et les retirer de l'événement lié ?\n\nIls redeviendront affectables sur un autre SAMU.`,
        'Confirmer'
    );
    if (!ok) return;
    try {
        const rl = await apiAffectation.liberer(p.id, props.etape, { resource_ids: retires });
        emit(
            'annonce',
            `${rl.planningReset} demi-journée(s) remise(s) en « Disponible / En attente d'affectation » ; ${rl.removedFromEvents} participation(s) retirée(s) des événements.`
        );
    } catch (e) {
        emit('message', message(e));
    }
}

/**
 * Journées décochées (ou jamais cochées mais posées pour ce SAMU dans la planification) pour des experts qui restent
 * affectés : remise en situation de ces journées
 */
async function remettreJournees(p: Deploiement, restants: number[]) {
    const retirees: Record<number, string[]> = {};
    let n = 0;
    for (const d of dates.value) {
        for (const rid of restants) {
            if (jours.value[d]?.has(rid)) continue;
            const avant = !!initiales[d]?.has(rid);
            const ici = dispo.value?.[rid]?.byDay?.[d] === 'here';
            if (avant || ici) {
                (retirees[rid] ??= []).push(d);
                n++;
            }
        }
    }
    if (!n) return;
    const ok = await confirmer(
        `${n} journée(s) sans affectation dans la grille mais posées pour ce SAMU dans la planification (retirées ou jamais cochées).\n\nLes remettre dans leur planification en « 2 - Disponible » / « 2 - En attente d'affectation » (localisation effacée) ? Seules les demi-journées posées par l'affectation pour ce SAMU sont modifiées.`,
        'Confirmer'
    );
    if (!ok) return;
    try {
        const rl = await apiAffectation.liberer(p.id, props.etape, { days: retirees });
        emit('annonce', `${rl.planningReset} demi-journée(s) remise(s) en « Disponible / En attente d'affectation ».`);
    } catch (e) {
        emit('message', e instanceof ErreurApi ? e.message : message(e));
    }
}

onMounted(() => void ouvrir());
</script>

<template>
    <AppModal
        id="affAssignModal"
        :opened="ouverte"
        title="Affecter des ressources"
        class="aff-affectation"
        @close="emit('fermer')"
    >
        <div id="affAssignInfo" class="aff-muted">
            {{ info }}<br /><b>{{ intervenants.size }}</b> intervenant(s) sur l'étape · {{ necessaire }} ressource(s) au
            maximum par jour
        </div>
        <p class="aff-muted aff-affectation__aide">
            Cochez, pour chaque expert, les <b>journées</b> où il intervient, week-ends compris (le nombre de ressources
            nécessaires est le maximum <b>par jour</b>). Ces journées alimentent la planification ; l'événement associé
            réunit tous les intervenants de l'étape.
        </p>
        <input
            id="affAssignFilter"
            v-model="filtre"
            type="text"
            placeholder="Filtrer les ressources…"
            aria-label="Filtrer les ressources"
            class="aff-affectation__champ"
        />
        <input
            id="affAssignExt"
            v-model="externe"
            list="affExtList"
            type="text"
            autocomplete="off"
            placeholder="Ajouter une ressource externe : premières lettres du nom, du prénom ou du trigramme…"
            aria-label="Ajouter une ressource externe"
            class="aff-affectation__champ"
            @input="choisirExterne"
        />
        <datalist id="affExtList">
            <option v-for="r in externesProposees" :key="r.id" :value="libelleExterne(r)"></option>
        </datalist>
        <div id="affAssignList" class="aff-assign-list">
            <template v-if="liste.length">
                <table class="aff-asg">
                    <thead>
                        <tr>
                            <th class="who">Ressource</th>
                            <th
                                v-for="d in dates"
                                :key="d"
                                class="d"
                                :class="{ we: estWeekEnd(d), full: nombreLe(d) >= necessaire }"
                                :title="`${jourFr(d)} : ${nombreLe(d)} / ${necessaire} ressource(s)`"
                            >
                                <div>{{ JOURS_SEMAINE[new Date(`${d}T00:00:00Z`).getUTCDay()] }}</div>
                                <div>{{ d.slice(8) }}/{{ d.slice(5, 7) }}</div>
                                <div class="c">{{ nombreLe(d) }}/{{ necessaire }}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in liste" :key="r.id" :class="{ sel: nbJoursDe(r.id) > 0 }">
                            <th class="who">
                                <div class="n">
                                    <b>{{ (r.nom || '').toUpperCase() }}</b> {{ r.prenom || '' }}
                                    <span class="tri">{{ r.trigramme || '' }}</span
                                    ><span v-if="r.external" class="aff-muted aff-affectation__externe"> externe</span>
                                </div>
                                <div class="aff-muted aff-affectation__nombre">
                                    {{ nbJoursDe(r.id) }} / {{ dates.length }} j ·
                                    <a
                                        href="#"
                                        title="Tous les jours ouvrés de l'étape"
                                        @click.prevent="toutLaLigne(r.id, true)"
                                        >tout</a
                                    >
                                    · <a href="#" @click.prevent="toutLaLigne(r.id, false)">aucun</a>
                                </div>
                            </th>
                            <td v-for="d in dates" :key="d" :class="{ we: estWeekEnd(d) }">
                                <button
                                    type="button"
                                    class="aff-dc"
                                    :class="[caseJour(r, d).classe, { on: caseJour(r, d).coche }]"
                                    :disabled="caseJour(r, d).inactive"
                                    :title="caseJour(r, d).titre"
                                    :aria-label="`${(r.nom || '').toUpperCase()} ${r.prenom || ''}, ${jourFr(d)} : ${caseJour(r, d).titre}`"
                                    :aria-pressed="caseJour(r, d).coche"
                                    @click="basculerJour(r.id, d)"
                                >
                                    {{ caseJour(r, d).coche ? '✓' : '' }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div class="aff-asg-leg">
                    <span v-for="[texte, classe] in Object.values(ETATS)" :key="texte"
                        ><i class="aff-dc" :class="classe"></i>{{ texte }}</span
                    >
                </div>
            </template>
            <div v-else class="aff-muted aff-affectation__vide">Aucune ressource</div>
        </div>
        <template #footer>
            <span id="affAssignError" class="aff-error">{{ erreur }}</span>
            <button
                v-if="admin"
                type="button"
                class="aff-btn"
                title="Reporter les ressources affectées dans la planification et les événements"
                @click="deploiement && emit('report', deploiement.id, etape, false)"
            >
                Synchroniser
            </button>
            <button type="button" class="aff-btn" @click="emit('fermer')">Annuler</button>
            <button type="button" class="aff-btn aff-btn-primary" @click="enregistrer">
                <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8M7 3v5h8" /></svg
                >Enregistrer
            </button>
        </template>
    </AppModal>
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>

<style>
.gp-modale.aff-affectation .gp-modale__boite {
    width: min(1180px, 96vw);
}
.aff-affectation__aide {
    margin: 8px 0 0;
    font-size: 12px;
}
.aff-affectation__champ {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid #cfd8e6;
    border-radius: 8px;
    width: 100%;
    box-sizing: border-box;
}
.aff-affectation__externe {
    font-size: 10px;
}
.aff-affectation__nombre {
    font-size: 11px;
}
.aff-affectation__vide {
    padding: 14px;
}
</style>
