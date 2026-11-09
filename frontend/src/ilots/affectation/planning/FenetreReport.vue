<!-- Report d'une affectation (administrateur) : journées des experts dans la planification (à jour, à renseigner,
     conflits, planifiées hors grille, avec le choix d'alignement), événement de l'étape et ses participants. Ouverte
     après l'enregistrement d'une affectation (« auto » : seulement s'il y a quelque chose à reporter) ou par
     « Synchroniser ». -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAffectation, type ApercuReport, type CorpsReport, type RessourceReport } from '@/api/affectation';
import AppModal from '@/composants/AppModal.vue';
import { jourFr } from './outils';

const props = defineProps<{ deploiementId: number; etape: string; auto: boolean }>();
const emit = defineEmits<{ fermer: []; message: [texte: string] }>();

const donnees = ref<ApercuReport | null>(null);
const ouverte = ref(false);
const erreur = ref('');
const reporterPlanning = ref(false);
const reporterEvenement = ref(false);
/** Experts dont la planification est renseignée */
const experts = ref(new Set<number>());
/** Participants ajoutés à l'événement (comptes utilisateurs) */
const participants = ref(new Set<number>());
/** Choix pour les journées en conflit (force, drop) et planifiées hors grille (clear, add) : ressource → choix */
const conflits = ref<Record<number, string>>({});
const horsGrille = ref<Record<number, string>>({});
const evenement = ref({ label: '', start: '', end: '' });

const jours = (n: number) => `${String(n / 2).replace('.', ',')} j`;
const LIBELLES_ETAT: Record<string, string> = {
    ok: 'Planifié (à jour)',
    write: 'À renseigner',
    extra: "Planifié sans journée d'affectation"
};
const JOURS = ['d', 'l', 'm', 'm', 'j', 'v', 's'];

const besoinPlanning = computed(() => !!donnees.value?.resources.some(r => r.toWrite));
const besoinAlignement = computed(() => !!donnees.value?.resources.some(r => r.extraCount || r.conflictCount));
const existant = computed(() => donnees.value?.event.existing ?? null);
const besoinEvenement = computed(() => {
    const d = donnees.value;
    if (!d) return false;
    const ex = d.event.existing;
    return !ex || d.resources.some(r => r.user_id && !ex.participants.includes(r.user_id));
});
const rienAFaire = computed(() => !besoinPlanning.value && !besoinEvenement.value && !besoinAlignement.value);

function etatPlanning(r: RessourceReport) {
    if (r.toWrite) return { fort: `${jours(r.toWrite)}`, texte: ' à renseigner' };
    if (r.done)
        return {
            fort: '',
            texte:
                r.conflictCount || r.extraCount
                    ? `${jours(r.done)} à jour dans la planification`
                    : 'Déjà à jour dans la planification'
        };
    return { fort: '', texte: 'Rien à écrire' };
}

/** Jours affichés pour une ressource : période de l'étape, et jours planifiés hors période */
function joursDe(r: RessourceReport) {
    const d = donnees.value!;
    const liste: string[] = [];
    for (let t = Date.parse(`${d.spanStart}T00:00:00Z`); t <= Date.parse(`${d.spanEnd}T00:00:00Z`); t += 864e5) {
        const iso = new Date(t).toISOString().slice(0, 10);
        if ((iso >= d.start && iso <= d.end) || r.states[`${iso}_AM`] || r.states[`${iso}_PM`]) liste.push(iso);
    }
    return liste;
}
const titreEtat = (r: RessourceReport, cle: string) => {
    const st = r.states[cle];
    if (!st) return 'Rien';
    return st.s === 'conflict' ? st.reason || 'Conflit' : (LIBELLES_ETAT[st.s] ?? '');
};
const jourSemaine = (iso: string) => JOURS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const estWe = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/** Case d'un expert (planification) ou d'un participant (événement) */
function basculer(quoi: 'experts' | 'participants', id: number, oui: boolean) {
    const ensemble = quoi === 'experts' ? experts : participants;
    const s = new Set(ensemble.value);
    if (oui) s.add(id);
    else s.delete(id);
    ensemble.value = s;
}

async function ouvrir() {
    try {
        const d = await apiAffectation.apercuReport(props.deploiementId, props.etape);
        if (!d.resources.length) {
            emit('message', 'Aucune ressource affectée à cette étape.');
            emit('fermer');
            return;
        }
        donnees.value = d;
        if (props.auto && rienAFaire.value) {
            // Rien à reporter : l'utilisateur n'est pas interrompu
            emit('fermer');
            return;
        }
        reporterPlanning.value = besoinPlanning.value;
        reporterEvenement.value = besoinEvenement.value;
        experts.value = new Set(d.resources.filter(r => r.toWrite).map(r => r.id));
        participants.value = new Set(d.resources.filter(r => r.user_id).map(r => r.user_id as number));
        evenement.value = { label: d.event.label, start: d.start, end: d.end };
        ouverte.value = true;
    } catch (e) {
        emit('message', e instanceof Error ? e.message : String(e));
        emit('fermer');
    }
}

async function valider() {
    const d = donnees.value;
    if (!d) return;
    erreur.value = '';
    const choisis = (choix: Record<number, string>, valeur: string) =>
        Object.entries(choix)
            .filter(([, v]) => v === valeur)
            .map(([id]) => Number(id));
    const alignement = {
        force_ids: choisis(conflits.value, 'force'),
        drop_ids: choisis(conflits.value, 'drop'),
        clear_ids: choisis(horsGrille.value, 'clear'),
        add_ids: choisis(horsGrille.value, 'add')
    };
    const corps: CorpsReport = {};
    if (reporterPlanning.value || Object.values(alignement).some(l => l.length))
        corps.planning = { resource_ids: reporterPlanning.value ? [...experts.value] : [], ...alignement };
    if (reporterEvenement.value) {
        const ex = d.event.existing;
        corps.event = {
            apply: true,
            // Participants à ajouter (ceux déjà présents dans l'événement existant ne sont pas renvoyés)
            participants: [...participants.value].filter(u => !ex?.participants.includes(u))
        };
        if (!ex)
            Object.assign(corps.event, {
                label: evenement.value.label,
                startDate: evenement.value.start,
                endDate: evenement.value.end
            });
    }
    if (!corps.planning && !corps.event) {
        emit('fermer');
        return;
    }
    try {
        const r = await apiAffectation.reporter(props.deploiementId, props.etape, corps);
        emit(
            'message',
            `Report effectué : ${r.planning} demi-journée(s) planifiée(s)` +
                (r.cleared ? `, ${r.cleared} remise(s) en « Disponible »` : '') +
                (r.forced ? `, ${r.forced} remplacée(s) dans la planification` : '') +
                (r.dropped ? `, ${r.dropped} journée(s) retirée(s) de la grille` : '') +
                (r.added ? `, ${r.added} journée(s) ajoutée(s) à la grille` : '') +
                (r.event
                    ? `, événement ${r.event.created ? 'créé' : 'mis à jour'} (${r.event.participants} participant(s)).`
                    : '.')
        );
        emit('fermer');
    } catch (e) {
        erreur.value = e instanceof Error ? e.message : String(e);
    }
}

onMounted(() => void ouvrir());
</script>

<template>
    <AppModal
        id="affSyncModal"
        :opened="ouverte"
        :title="`Reporter l'affectation — ${donnees?.samu ?? ''}`"
        class="aff-report"
        @close="emit('fermer')"
    >
        <template v-if="donnees">
            <p class="aff-muted aff-report__intro">
                <template v-if="rienAFaire"
                    ><b>Tout est à jour :</b> la planification et les événements correspondent déjà à cette
                    affectation.</template
                >
                <template v-else-if="!besoinPlanning && !besoinEvenement"
                    ><b>Rien à écrire,</b> mais la planification et la grille d'affectation ne concordent pas (voir
                    ci-dessous). Choisissez, pour chaque écart, la façon de les aligner.</template
                >
                <template v-else
                    >Les ressources ont été affectées dans l'aide à l'affectation. Autorisez-vous le report dans la
                    planification et les événements ?</template
                >
            </p>
            <div class="aff-sync-sec">
                <h4>
                    <input
                        id="affSyncPlan"
                        v-model="reporterPlanning"
                        type="checkbox"
                        :disabled="!besoinPlanning"
                        aria-label="Reporter dans la planification des experts"
                    />1. Planification des experts
                </h4>
                <div class="aff-muted">
                    Du {{ jourFr(donnees.start) }} au {{ jourFr(donnees.end) }}, sur les journées d'intervention de
                    chaque expert : activité {{ donnees.activity }} « SAMU (Déploiement) », localisation «
                    {{ donnees.samuLoc }} », disponibilité ANS.
                </div>
                <div class="aff-sg-lg">
                    <span><i class="aff-report__ok"></i>À jour</span
                    ><span><i class="aff-report__ecrire"></i>À renseigner</span
                    ><span><i class="aff-report__conflit"></i>Conflit grille / planification</span
                    ><span><i class="aff-report__hors"></i>Planifié hors grille</span
                    ><span><i class="aff-report__rien"></i>Rien</span
                    ><span class="aff-muted">(haut = matin, bas = après-midi)</span>
                </div>
                <label v-for="r in donnees.resources" :key="r.id" class="aff-sync-row">
                    <input
                        type="checkbox"
                        :checked="experts.has(r.id)"
                        :disabled="!r.toWrite"
                        @change="basculer('experts', r.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>
                        <b>{{ (r.nom || '').toUpperCase() }}</b> {{ r.prenom || '' }}<br />
                        <b v-if="etatPlanning(r).fort">{{ etatPlanning(r).fort }}</b
                        >{{ etatPlanning(r).texte
                        }}<template v-if="r.done && r.toWrite"> · {{ jours(r.done) }} déjà faits</template>
                        <span class="aff-sg">
                            <span v-for="iso in joursDe(r)" :key="iso" class="aff-sg-d" :class="{ we: estWe(iso) }"
                                >{{ jourSemaine(iso) }}<br />{{ iso.slice(8) }}/{{ iso.slice(5, 7) }}
                                <span
                                    v-for="demi in ['AM', 'PM']"
                                    :key="demi"
                                    class="aff-sg-c"
                                    :class="r.states[`${iso}_${demi}`]?.s"
                                    :title="titreEtat(r, `${iso}_${demi}`)"
                                ></span>
                            </span>
                        </span>
                        <span v-if="r.conflictCount" class="aff-sg-fix">
                            <b class="aff-report__texte-conflit">{{ jours(r.conflictCount) }} en conflit (rouge)</b> →
                            <select
                                v-model="conflits[r.id]"
                                :aria-label="`Journées en conflit de ${r.nom || ''}`"
                                @click.prevent.stop
                            >
                                <option :value="undefined">Laisser tel quel</option>
                                <option v-if="r.forceableCount" value="force">
                                    Écraser la planification ({{ jours(r.forceableCount) }})
                                </option>
                                <option value="drop">Retirer ces journées de la grille</option>
                            </select>
                        </span>
                        <span v-if="r.extraCount" class="aff-sg-fix">
                            <b class="aff-report__texte-hors"
                                >{{ jours(r.extraCount) }} planifiée(s) hors grille (orange)</b
                            >
                            →
                            <select
                                v-model="horsGrille[r.id]"
                                :aria-label="`Journées planifiées hors grille de ${r.nom || ''}`"
                                @click.prevent.stop
                            >
                                <option :value="undefined">Laisser tel quel</option>
                                <option value="clear">Remettre en « Disponible »</option>
                                <option v-if="r.addableCount" value="add">Ajouter à la grille</option>
                            </select>
                        </span>
                    </span>
                </label>
            </div>
            <div class="aff-sync-sec">
                <h4>
                    <input
                        id="affSyncEvt"
                        v-model="reporterEvenement"
                        type="checkbox"
                        :disabled="!besoinEvenement"
                        aria-label="Reporter dans l'événement"
                    />2. Événement
                </h4>
                <div v-if="existant" class="aff-muted">
                    Événement existant : <b>{{ existant.label }}</b> ({{ jourFr(existant.start_date) }} →
                    {{ jourFr(existant.end_date) }}). Seuls les participants manquants seront ajoutés.
                </div>
                <template v-else>
                    <div class="aff-field">
                        <label class="lbl" for="affEvtLabel">Titre</label
                        ><input id="affEvtLabel" v-model="evenement.label" type="text" class="aff-report__titre" />
                    </div>
                    <div class="aff-report__dates">
                        <div class="aff-field">
                            <label class="lbl" for="affEvtStart">Début</label
                            ><input id="affEvtStart" v-model="evenement.start" type="date" />
                        </div>
                        <div class="aff-field">
                            <label class="lbl" for="affEvtEnd">Fin</label
                            ><input id="affEvtEnd" v-model="evenement.end" type="date" />
                        </div>
                    </div>
                    <div class="aff-field">
                        <span class="lbl">SAMU concerné</span> <b>{{ donnees.samu }}</b
                        ><span v-if="!donnees.locationId" class="aff-error">
                            (entité introuvable : événement sans lieu)</span
                        >
                    </div>
                </template>
                <div class="aff-report__participants">
                    <span class="lbl">Participants</span>
                    <label v-for="r in donnees.resources" :key="r.id" class="aff-sync-row">
                        <template v-if="!r.user_id">
                            <input type="checkbox" disabled /><span
                                ><b>{{ (r.nom || '').toUpperCase() }}</b> {{ r.prenom || '' }}<br /><span
                                    class="aff-muted"
                                    >Pas de compte utilisateur : ne peut pas être ajouté(e) à l'événement</span
                                ></span
                            >
                        </template>
                        <template v-else>
                            <input
                                type="checkbox"
                                :checked="participants.has(r.user_id) || !!existant?.participants.includes(r.user_id)"
                                :disabled="!!existant?.participants.includes(r.user_id)"
                                @change="
                                    basculer('participants', r.user_id, ($event.target as HTMLInputElement).checked)
                                "
                            /><span
                                ><b>{{ (r.nom || '').toUpperCase() }}</b> {{ r.prenom || ''
                                }}<span v-if="existant?.participants.includes(r.user_id)" class="aff-muted">
                                    — déjà participant(e)</span
                                ></span
                            >
                        </template>
                    </label>
                </div>
            </div>
        </template>
        <template #footer>
            <span id="affSyncError" class="aff-error">{{ erreur }}</span>
            <button id="affSyncLater" type="button" class="aff-btn" @click="emit('fermer')">
                {{ rienAFaire ? 'Fermer' : 'Plus tard' }}
            </button>
            <button v-if="!rienAFaire" id="affSyncOk" type="button" class="aff-btn aff-btn-primary" @click="valider">
                <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8M7 3v5h8" /></svg
                >Valider les modifications
            </button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.aff-report .gp-modale__boite {
    width: min(640px, 94vw);
}
.aff-report__intro {
    margin: 0 0 12px;
}
.aff-report__ok {
    background: #43a047;
}
.aff-report__ecrire {
    background: #1e88e5;
}
.aff-report__conflit {
    background: #e53935;
}
.aff-report__hors {
    background: #fb8c00;
}
.aff-report__rien {
    background: #eef1f6;
}
.aff-report__texte-conflit {
    color: #e53935;
}
.aff-report__texte-hors {
    color: #fb8c00;
}
.aff-report__titre {
    width: 100%;
}
.aff-report__dates {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}
.aff-report__participants {
    margin-top: 8px;
}
.aff-sg .aff-sg-d {
    display: inline-block;
}
.aff-sg .aff-sg-c {
    display: block;
}
</style>
