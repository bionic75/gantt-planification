// Aide à l'affectation › onglet « Événements » : filtres, tri, dates, participants, comparaison avec le planning
import type { EvenementAffectation } from '@/api/affectation';

/** Texte sans accents, en minuscules */
const normaliser = (t: unknown) =>
    String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

const jourFr = (d: string) => (d ? d.split('-').reverse().join('/') : '');

/** « JJ/MM/AAAA », ou « JJ/MM/AAAA → JJ/MM/AAAA » sur plusieurs jours */
export const datesEvenement = (e: { start: string; end: string }) =>
    e.start === e.end ? jourFr(e.start) : `${jourFr(e.start)} → ${jourFr(e.end)}`;

/** Demi-journée (matin, après-midi) ; vide pour la journée entière */
export const demiJournee = (period: string | null) =>
    !period || period === 'FULL' ? '' : period === 'AM' ? 'matin' : period === 'PM' ? 'après-midi' : period;

/** Participants ; ceux qui n'interviennent que certains jours de l'activité sont suivis de ces jours */
export const nomsParticipants = (e: EvenementAffectation) =>
    e.participants.map(n => (e.participants_jours[n] ? `${n} (${e.participants_jours[n]})` : n));

/** Comparaison avec le planning des déploiements : mêmes dates, activité prévue à d'autres dates, non datée */
export type ComparaisonPlanning = 'memes-dates' | 'autres-dates' | 'non-datee';

export const comparaisonPlanning = (e: EvenementAffectation): ComparaisonPlanning =>
    !e.planned ? 'non-datee' : e.planned.start === e.start && e.planned.end === e.end ? 'memes-dates' : 'autres-dates';

export interface FiltresEvenements {
    samu: string;
    /** Activité (clé) */
    stage: string;
    /** Recherche : SAMU, intitulé, type, participants */
    q: string;
}

export function filtrer(liste: EvenementAffectation[], f: FiltresEvenements) {
    const q = normaliser(f.q);
    return liste.filter(
        e =>
            (!f.samu || e.samu === f.samu) &&
            (!f.stage || e.stage === f.stage) &&
            (!q || normaliser([e.samu, e.label, e.type.label, e.participants.join(' ')].join(' ')).includes(q))
    );
}

export type ColonneEvenements = 'samu' | 'type' | 'label' | 'start' | 'part' | 'plan';

const VALEURS: Record<ColonneEvenements, (e: EvenementAffectation) => string | number> = {
    samu: e => e.samu,
    type: e => e.type.label,
    label: e => e.label,
    start: e => e.start + e.end,
    part: e => e.participants.length,
    plan: e => ({ 'memes-dates': 0, 'autres-dates': 1, 'non-datee': 2 })[comparaisonPlanning(e)]
};

const comparer = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'fr', { numeric: true });

export interface TriEvenements {
    k: ColonneEvenements;
    /** 1 : croissant, -1 : décroissant */
    dir: 1 | -1;
}

/** Tri sur une colonne, puis par date de début et par SAMU */
export function trier(liste: EvenementAffectation[], tri: TriEvenements) {
    const valeur = VALEURS[tri.k] ?? VALEURS.start;
    return [...liste].sort(
        (a, b) => comparer(valeur(a), valeur(b)) * tri.dir || comparer(a.start, b.start) || comparer(a.samu, b.samu)
    );
}

/** Second clic sur la même colonne : sens inversé ; autre colonne : croissant */
export const basculerTri = (tri: TriEvenements, k: ColonneEvenements): TriEvenements => ({
    k,
    dir: tri.k === k ? (-tri.dir as 1 | -1) : 1
});

/** SAMU proposés au filtre, triés (numéros dans l'ordre) */
export const samusPresents = (liste: EvenementAffectation[]) =>
    [...new Set(liste.map(e => e.samu))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

/** Confirmation de la suppression d'un événement (administrateur) */
export const confirmationSuppression = (e: EvenementAffectation) =>
    `Supprimer l'événement « ${e.label} » (${e.samu}, ${datesEvenement(e)}) ?\n\n` +
    "Ses participants sont retirés, et leur planification posée par l'affectation de ce SAMU sur la période est remise en " +
    "« Disponible / En attente d'affectation ». L'événement ne pourra pas être rétabli.";

/** Date du jour « AAAA-MM-JJ » (heure locale) */
export function aujourdhui(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
