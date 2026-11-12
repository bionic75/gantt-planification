<!-- Événement(s) du SAMU relié(s) à une activité du déploiement : liste déroulante (création proposée s'il n'y a pas
     d'événement du type de l'activité), ou, pour une activité découpable, choix multiple des parties et ajout d'une
     partie à ses propres dates -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiAffectation, type CandidatsActivite } from '@/api/affectation';
import { useConfirmation } from '@/composants/confirmation';
import { jourFr } from '../planning/outils';
import { datesEvenement, libelleCandidat, resumeParties } from './administration';
import IconeAff from './IconeAff.vue';

const props = defineProps<{
    projetId: number | null;
    cle: string;
    libelle: string;
    samu: string;
    /** undefined : recherche en cours ; null : indisponibles */
    candidats: CandidatsActivite | null | undefined;
    /** Dates de l'activité saisies dans le formulaire */
    dates: { start: string; end: string } | null;
    /** Sans le titre « Événement » (cellule de la fenêtre des tâches Asana) */
    compact?: boolean;
    /** Message quand l'activité n'a pas de date */
    messageSansDate?: string;
}>();
const emit = defineEmits<{
    liaison: [maj: Partial<CandidatsActivite>];
    recharger: [];
    erreur: [message: string];
    annonce: [message: string];
}>();

const confirmer = useConfirmation();
const c = computed(() => props.candidats);
const tous = computed(() => (c.value ? [...c.value.matching, ...c.value.others] : []));
const lie = computed(() => tous.value.find(e => e.id === c.value?.linked) ?? null);
const memesDates = computed(
    () => !!(lie.value && props.dates && props.dates.start === lie.value.start && props.dates.end === lie.value.end)
);
const titreListe = computed(() => `Événements de ce SAMU${c.value?.typeLong ? ` (type « ${c.value.typeLong} »)` : ''}`);

async function lier(valeur: string) {
    const id = valeur ? Number(valeur) : null;
    try {
        await apiAffectation.lierEvenements(props.projetId!, { key: props.cle, eventId: id });
        emit('liaison', { linked: id });
    } catch (e) {
        emit('erreur', (e as Error).message);
    }
}

async function cocher(id: number, oui: boolean) {
    const avant = new Set(c.value?.linkedIds ?? []);
    if (oui) avant.add(id);
    else avant.delete(id);
    const ids = tous.value.filter(e => avant.has(e.id)).map(e => e.id);
    try {
        await apiAffectation.lierEvenements(props.projetId!, { key: props.cle, eventIds: ids });
        emit('liaison', { linkedIds: ids });
    } catch (e) {
        emit('erreur', (e as Error).message);
    }
}

// Nouvelle partie d'une activité découpable
const partieDebut = ref('');
const partieFin = ref('');

async function ajouterPartie() {
    emit('erreur', '');
    if (!partieDebut.value) {
        emit('erreur', `${props.libelle} : renseignez le début de la partie.`);
        return;
    }
    try {
        await apiAffectation.creerEvenement(props.projetId!, {
            key: props.cle,
            start: partieDebut.value,
            end: partieFin.value || partieDebut.value
        });
        partieDebut.value = '';
        partieFin.value = '';
        emit('recharger');
    } catch (e) {
        emit('erreur', (e as Error).message);
    }
}

/** Événement créé aux dates de l'activité (SAMU, type, ressources affectées en participants) */
async function creer() {
    emit('erreur', '');
    const d = props.dates;
    if (!d) {
        emit(
            'erreur',
            props.messageSansDate ??
                `${props.libelle} : renseignez d'abord la date (ou la période) avant de créer l'événement.`
        );
        return;
    }
    const quand = d.start === d.end ? `le ${jourFr(d.start)}` : `du ${jourFr(d.start)} au ${jourFr(d.end)}`;
    const ok = await confirmer(
        `Créer l'événement « ${c.value?.typeLong || props.libelle} » pour ${props.samu}, ${quand} ?\n\nLes ressources affectées à cette activité (si elles ont un compte) seront ajoutées en participants.`,
        'Confirmer',
        { danger: false }
    );
    if (!ok) return;
    try {
        await apiAffectation.creerEvenement(props.projetId!, { key: props.cle, start: d.start, end: d.end });
        emit('recharger');
        emit('annonce', `Événement « ${props.libelle} » créé et relié.`);
    } catch (e) {
        emit('erreur', (e as Error).message);
    }
}
</script>

<template>
    <div class="pr aff-evl" :class="{ 'aff-evl--compact': compact }" :data-ek="cle">
        <span v-if="!projetId" class="aff-muted">Enregistrez le déploiement pour relier des événements.</span>
        <span v-else-if="candidats === undefined" class="aff-muted">Recherche des événements…</span>
        <span v-else-if="!c" class="aff-muted">Événements indisponibles.</span>
        <template v-else-if="c.multi">
            <span v-if="!compact" class="aff-muted aff-evl-titre"
                ><IconeAff nom="vide" classe="aff-ico-sm" />Événement</span
            >
            <div :data-evbox="cle">
                <details class="aff-multi">
                    <summary>{{ resumeParties(c) }}<span class="aff-multi-fleche">▼</span></summary>
                    <div class="aff-multi-liste">
                        <div class="aff-multi-aide">
                            Cochez les parties de l'événement (jours de l'activité = jours des parties cochées dès deux
                            parties)
                        </div>
                        <label v-for="e in c.matching" :key="`m${e.id}`" class="aff-multi-ligne"
                            ><input
                                type="checkbox"
                                :data-eid="e.id"
                                :checked="c.linkedIds.includes(e.id)"
                                @change="cocher(e.id, ($event.target as HTMLInputElement).checked)"
                            /><span
                                >{{ datesEvenement(e) }} · {{ e.label
                                }}{{ e.participants ? ` · ${e.participants} part.` : '' }}</span
                            ></label
                        >
                        <label v-for="e in c.others" :key="`o${e.id}`" class="aff-multi-ligne"
                            ><input
                                type="checkbox"
                                :data-eid="e.id"
                                :checked="c.linkedIds.includes(e.id)"
                                @change="cocher(e.id, ($event.target as HTMLInputElement).checked)"
                            /><span
                                >{{ datesEvenement(e) }} · {{ e.label
                                }}{{ e.participants ? ` · ${e.participants} part.` : '' }} · <i>autre type</i></span
                            ></label
                        >
                        <span v-if="!tous.length" class="aff-muted aff-multi-vide">Aucun événement pour ce SAMU.</span>
                        <div class="aff-multi-ajout">
                            <input
                                :id="`evPS_${cle}`"
                                v-model="partieDebut"
                                type="date"
                                title="Début de la partie"
                                :aria-label="`Début de la partie ${libelle}`"
                            /><span class="aff-muted">→</span>
                            <input
                                :id="`evPE_${cle}`"
                                v-model="partieFin"
                                type="date"
                                title="Fin de la partie (facultative)"
                                :aria-label="`Fin de la partie ${libelle}`"
                            />
                            <button
                                type="button"
                                class="aff-btn aff-btn-primary"
                                title="Crée une partie de l'événement (SAMU, type, dates saisies, ressources affectées en participants)"
                                @click="ajouterPartie"
                            >
                                <IconeAff nom="plus" classe="aff-ico-sm" />Ajouter une partie
                            </button>
                        </div>
                    </div>
                </details>
            </div>
            <button
                type="button"
                class="aff-btn aff-evl-bouton"
                title="Crée un événement aux dates de l'activité (SAMU, type, ressources affectées en participants) ; d'autres parties se saisissent dans la liste"
                @click="creer"
            >
                <IconeAff nom="plus" classe="aff-ico-sm" />Nouveau
            </button>
        </template>
        <template v-else>
            <span v-if="!compact" class="aff-muted aff-evl-titre"
                ><IconeAff nom="vide" classe="aff-ico-sm" />Événement</span
            >
            <select
                :data-ek="cle"
                :value="c.linked ?? ''"
                :title="titreListe"
                :aria-label="`Événement relié : ${libelle}`"
                @change="lier(($event.target as HTMLSelectElement).value)"
            >
                <option value="">— Aucun événement lié —</option>
                <optgroup v-if="c.matching.length" :label="`Correspondant au SAMU et au type « ${c.typeLong || ''} »`">
                    <option v-for="e in c.matching" :key="e.id" :value="e.id">{{ libelleCandidat(e) }}</option>
                </optgroup>
                <optgroup v-if="c.others.length" label="Autres événements de ce SAMU">
                    <option v-for="e in c.others" :key="e.id" :value="e.id">{{ libelleCandidat(e) }}</option>
                </optgroup>
            </select>
            <span v-if="!c.matching.length" class="none"
                >Aucun événement « {{ c.typeLong || '' }} » trouvé pour ce SAMU.</span
            >
            <button
                type="button"
                class="aff-btn aff-evl-bouton"
                title="Crée l'événement dans l'outil (SAMU, type, dates de l'activité, ressources affectées en participants)"
                @click="creer"
            >
                <IconeAff nom="plus" classe="aff-ico-sm" />Nouveau
            </button>
            <span :id="`aEvInfo_${cle}`"
                ><template v-if="lie"
                    ><span v-if="memesDates" class="ok">✔ mêmes dates que l'activité</span
                    ><span v-else class="warn" :title="`Dates de l'événement : ${datesEvenement(lie)}`"
                        >⚠ dates différentes de l'activité</span
                    ></template
                ></span
            >
        </template>
    </div>
</template>
