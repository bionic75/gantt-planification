// Aide à l'affectation › Asana : libellés des valeurs et des tâches, origine d'une valeur (Asana ou modifiée dans
// l'outil), valeur après remplacement, dates d'une activité, résumé d'une analyse, filtre des projets
import type { LigneApercu, Remplacement, RubriqueAsana, TacheAsana, ValeurRubrique } from '@/api/asana';
import { jourFr, normaliser } from '../planning/outils';

const fr = (d: string | null | undefined) => (d ? jourFr(d) : '');

/** Valeur d'une rubrique : « JJ/MM/AAAA » ou « JJ/MM/AAAA → JJ/MM/AAAA » ; « — » si absente */
export const valeurTexte = (v: ValeurRubrique | null | undefined) =>
    !v ? '—' : v.date ? fr(v.date) : `${fr(v.start)} → ${fr(v.end)}`;

/** Échéance effective d'une tâche */
export const effTexte = (e: TacheAsana['eff']) =>
    !e ? 'non datée' : e.start === e.end ? fr(e.end) : `${fr(e.start).slice(0, 5)} → ${fr(e.end)}`;

/** Tâche proposée en remplacement : code, nom sans numérotation (64 caractères), échéance */
export const libelleTache = (t: TacheAsana) =>
    `${t.code ? `${t.code} ` : ''}${String(t.name)
        .replace(/^\s*\d+(\.\d+)*\.?\s+/, '')
        .slice(0, 64)} — ${effTexte(t.eff)}`;

const effDe = (taches: TacheAsana[], gid: string | undefined) =>
    gid ? (taches.find(x => x.gid === gid)?.eff ?? null) : null;

/** Rubrique dont la tâche reprise est remplacée */
export const estRemplacee = (r: RubriqueAsana, ov: Remplacement | undefined) =>
    r.kind === 'date' ? !!ov?.task : !!(ov?.start || ov?.end);

/** Origine de la valeur actuelle : celle d'Asana (règle ou remplacement), modifiée dans l'outil, ou aucune valeur */
export function origine(r: RubriqueAsana, ov: Remplacement | undefined, taches: TacheAsana[]): 'asana' | 'tool' | null {
    const o = ov ?? {};
    if (r.kind === 'date') {
        const e = effDe(taches, o.task);
        const attendue = e ? e.end : (r.auto?.date ?? null);
        const actuelle = r.current?.date ?? null;
        return !actuelle && !attendue ? null : actuelle === attendue ? 'asana' : 'tool';
    }
    const es = effDe(taches, o.start);
    const ee = effDe(taches, o.end);
    const au = r.auto ?? {};
    const a = es ? es.start : au.start;
    const b = ee ? ee.end : au.end;
    const cu = r.current ?? {};
    if (!cu.start && !a && !b) return null;
    return (cu.start || null) === (a || b || null) && (cu.end || null) === (b || a || null) ? 'asana' : 'tool';
}

/** Valeur après remplacement (vide sans remplacement) */
export function apresRemplacement(r: RubriqueAsana, ov: Remplacement | undefined, taches: TacheAsana[]) {
    const o = ov ?? {};
    if (r.kind === 'date') {
        const e = effDe(taches, o.task);
        return e ? fr(e.end) : '';
    }
    const es = effDe(taches, o.start);
    const ee = effDe(taches, o.end);
    if (!es && !ee) return '';
    const cur = r.auto ?? r.current ?? {};
    let a = es ? es.start : cur.start;
    let b = ee ? ee.end : cur.end;
    a = a || b;
    b = b || a;
    return (a ?? '') > (b ?? '') ? `${fr(b)} → ${fr(a)}` : `${fr(a)} → ${fr(b)}`;
}

/** Dates de l'activité d'une rubrique (remplacements compris), pour l'événement associé ; null si non datée */
export function datesRubrique(
    r: RubriqueAsana,
    ov: Remplacement | undefined,
    taches: TacheAsana[]
): { start: string; end: string } | null {
    const o = ov ?? {};
    if (r.kind === 'date') {
        const e = effDe(taches, o.task);
        // Jalons : date unique, portée par « date » (mise en service / production) ou par une période d'un jour
        const v = e ? e.end : r.current?.date || r.current?.start || r.auto?.date || r.auto?.start;
        return v ? { start: v, end: v } : null;
    }
    const es = effDe(taches, o.start);
    const ee = effDe(taches, o.end);
    const base = r.current ?? r.auto ?? {};
    let a = es ? es.start : base.start;
    let b = ee ? ee.end : base.end;
    // Une seule tâche choisie : son intervalle complet est repris
    if (es && !ee && es.end > es.start) b = es.end;
    if (ee && !es && ee.end > ee.start) a = ee.start;
    const debut = a || b;
    const fin = b || a;
    if (!debut || !fin) return null;
    return debut <= fin ? { start: debut, end: fin } : { start: fin, end: debut };
}

/** Résultat de l'analyse d'un projet : rubriques à mettre à jour et conflits */
export function resumeAnalyse(lignes: LigneApercu[]) {
    return {
        aMettreAJour: lignes.filter(r => r.status === 'nouveau' || r.status === 'modifié').length,
        conflits: lignes.filter(r => r.status === 'conflit').length
    };
}

/** Rubrique proposée à l'import (cochée) ; non modifiable si absente, identique ou modifiée dans l'outil seulement */
export const rubriqueCochee = (r: LigneApercu) => r.status === 'nouveau' || r.status === 'modifié';
export const rubriqueBloquee = (r: LigneApercu) =>
    r.status === 'absent' || r.status === 'identique' || r.status === 'local';
export const aAppliquer = (lignes: LigneApercu[]) =>
    lignes.some(r => r.status === 'nouveau' || r.status === 'modifié' || r.status === 'conflit');

/** Projet retenu par le filtre : tous les mots saisis, sans accents ni casse */
export function projetRetenu(nom: string, saisie: string) {
    const mots = normaliser(saisie).split(/\s+/).filter(Boolean);
    const n = normaliser(nom);
    return mots.every(m => n.includes(m));
}

/** Mots saisis dans le filtre (compteur « affichés / total » dès qu'il y en a un) */
export const filtreActif = (saisie: string) => normaliser(saisie).split(/\s+/).some(Boolean);
