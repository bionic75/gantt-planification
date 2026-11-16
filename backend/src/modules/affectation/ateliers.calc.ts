// Rétroplanning des ateliers métier : calcul des dates à partir de la date de MEP (mêmes règles que le classeur
// « Rétroplanning SAMU automatique »).
//
// Règles :
// - la MEP est ferme ; le dernier atelier est visé à MEP − marge (28 jours par défaut) ;
// - chaque atelier précédent est visé 14 jours (paramétrable) avant la date proposée du suivant, sauf l'atelier 1 : 7 jours (paramétrable) avant l'atelier 2 ;
// - la visite métier + démo bandeau est une date théorique visée 14 jours (par défaut) avant la date proposée de l'atelier 1 ;
// - une date cible qui tombe un week-end ou pendant les vacances scolaires de la zone est reculée au dernier jour ouvré disponible ;
// - « Livrables prêts » reprend la date proposée du dernier atelier.
import { BUILTIN_HOLIDAYS } from './ateliers.data.ts';

export const ZONES = ['A', 'B', 'C'];
export const MIN_ATELIERS = 3;
export const MAX_ATELIERS = 7;
export const DEFAULT_DELAI_VISITE = 14;
export const DEFAULT_DELAI_MEP = 28;
/** Écart par défaut entre l'atelier 1 et l'atelier 2, puis entre les ateliers suivants (jours) */
export const ECART_ATELIER_1_2 = 7;
export const ECART_ATELIERS = 14;

/** Contenus proposés pour les ateliers, dans l'ordre (le contenu de l'atelier n est le n-ième par défaut) */
export const CONTENUS = [
    'Callflows : cadrage et première configuration',
    'Callflows : finalisation et consolidation',
    'SAF-GTA + personnalisation bandeau',
    'Gestion des flux d’appels',
    'Débordements',
    'Guides vocaux',
    'Relecture et présentation de la configuration'
];
export const CONTENU_VISITE = 'Préparation commune avant le démarrage des ateliers';
export const CONTENU_LIVRABLES = 'Matrice de configuration téléphonique, guides vocaux et configuration locale';
export const CONTENU_MEP = 'Mise en production';
export const JALON_VISITE = 'Visite métier + démo bandeau';

const MS_DAY = 86400000;
const toUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
};
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

export const isValidDate = (d: unknown) =>
    typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && fmt(toUtc(d)) === d;

export const addDays = (d: string, n: number) => fmt(toUtc(d) + n * MS_DAY);
export const diffDays = (a: string, b: string) => Math.round((toUtc(a) - toUtc(b)) / MS_DAY);
/** 1 = lundi … 7 = dimanche */
export const isoDay = (d: string) => new Date(toUtc(d)).getUTCDay() || 7;

type Period = { start: string; end: string };

/**
 * Vacances d'une zone : celles du classeur (2026-2028) et, après cette période, celles saisies dans l'application
 * @param [appPeriods] vacances de la zone saisies ou importées dans l'application
 */
export function holidaysOfZone(zone: string, appPeriods: Array<{ start?: string; end?: string }> = []): Period[] {
    const builtin = BUILTIN_HOLIDAYS.filter(h => h[2] === zone).map(h => ({ start: h[0], end: h[1] }));
    const to = BUILTIN_HOLIDAYS.reduce((m, h) => (h[1] > m ? h[1] : m), '0000-01-01');
    const extra = appPeriods
        .filter(p => p && isValidDate(p.start) && isValidDate(p.end || p.start))
        .map(p => ({ start: p.start as string, end: (p.end || p.start) as string }))
        .filter(p => p.start > to);
    return [...builtin, ...extra];
}

/** Jour ouvré (lundi au vendredi) hors vacances scolaires */
export function isAvailable(date: string, holidays: Period[]) {
    return isoDay(date) <= 5 && !holidays.some(h => h.start <= date && date <= h.end);
}

/** Dernier jour disponible au plus tard à la date donnée (la date elle-même si elle est disponible) */
export function lastAvailable(date: string, holidays: Period[]) {
    let d = date;
    for (let i = 0; i < 4000; i++, d = addDays(d, -1)) if (isAvailable(d, holidays)) return d;
    return null;
}

type RetroInput = {
    mep: string;
    nb: number;
    zone: string;
    delaiVisite?: number;
    delaiMep?: number;
    ecart12?: number;
    ecartAteliers?: number;
    holidays: Period[];
    jalons?: Record<string, string>;
    contenus?: Record<string, string>;
    planifiees?: Record<string, string>;
};

type RetroRow = {
    key: string;
    ordre: number;
    jalon: string;
    contenu: string;
    cible: string | null;
    proposee: string | null;
    planifiee: string | null;
    statut: string;
    niveau: 'ok' | 'warn' | 'info' | 'fix';
    ecart: number | null;
};

/** Contrôle des paramètres ; renvoie le message d'erreur ou null */
export function validateInput(input: Partial<RetroInput>) {
    if (!isValidDate(input.mep)) return 'Date de MEP invalide (AAAA-MM-JJ)';
    const nb = Number(input.nb);
    if (!Number.isInteger(nb) || nb < MIN_ATELIERS || nb > MAX_ATELIERS) {
        return `Nombre d'ateliers invalide (${MIN_ATELIERS} à ${MAX_ATELIERS})`;
    }
    if (!ZONES.includes(String(input.zone))) return 'Zone scolaire invalide (A, B ou C)';
    for (const [label, v] of [
        ['Délai visite / atelier 1', input.delaiVisite],
        ['Délai minimal avant la MEP', input.delaiMep],
        ['Écart atelier 1 / atelier 2', input.ecart12],
        ['Écart entre les ateliers', input.ecartAteliers]
    ]) {
        if (v !== undefined && v !== null && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 365)) {
            return `${label} invalide (0 à 365 jours)`;
        }
    }
    return null;
}

/**
 * Calcul des jalons : visite métier, ateliers 1 à N, livrables, MEP
 */
export function computeRetroplanning(input: RetroInput): { rows: RetroRow[]; warnings: string[] } {
    const nb = Number(input.nb);
    const delaiVisite = input.delaiVisite == null ? DEFAULT_DELAI_VISITE : Number(input.delaiVisite);
    const delaiMep = input.delaiMep == null ? DEFAULT_DELAI_MEP : Number(input.delaiMep);
    const ecart12 = input.ecart12 == null ? ECART_ATELIER_1_2 : Number(input.ecart12);
    const ecartAteliers = input.ecartAteliers == null ? ECART_ATELIERS : Number(input.ecartAteliers);
    const { holidays, mep } = input;
    const planifiees = input.planifiees || {};
    const warnings: string[] = [];

    // Ateliers, du dernier au premier
    const at: Record<number, { cible: string; proposee: string | null }> = {};
    for (let k = nb; k >= 1; k--) {
        const cible =
            k === nb
                ? addDays(mep, -delaiMep)
                : addDays(at[k + 1].proposee as string, k === 1 ? -ecart12 : -ecartAteliers);
        at[k] = { cible, proposee: lastAvailable(cible, holidays) };
    }
    // La visite métier est toujours une date théorique calculée à partir de l'atelier 1
    const visiteCible = addDays(at[1].proposee as string, -delaiVisite);
    const visiteProposee = lastAvailable(visiteCible, holidays);

    const rows: RetroRow[] = [];
    const statutDate = (cible: string | null, proposee: string | null) =>
        proposee === cible ? 'Date cible' : 'Décalé hors vacances / week-end';
    const push = (
        key: string,
        ordre: number,
        jalon: string,
        contenu: string,
        cible: string | null,
        proposee: string | null,
        statut: string,
        niveau: 'ok' | 'warn' | 'info' | 'fix'
    ) => {
        const planifiee = planifiees[key] && isValidDate(planifiees[key]) ? planifiees[key] : null;
        let s = statut;
        let n = niveau;
        let ecart = null;
        if (planifiee && proposee) {
            ecart = diffDays(planifiee, proposee);
            if (key === 'mep') {
                s = ecart === 0 ? 'MEP planifiée (conforme)' : `MEP planifiée : ${ecart > 0 ? '+' : ''}${ecart} j`;
            } else {
                s = ecart === 0 ? 'Planifié (conforme)' : `Planifié : ${ecart > 0 ? '+' : ''}${ecart} j`;
            }
            n = ecart === 0 ? 'ok' : ecart > 0 ? 'warn' : 'info';
            if (!['livrables', 'mep'].includes(key) && !isAvailable(planifiee, holidays)) {
                s += ' — hors jour disponible';
                n = 'warn';
            }
        }
        rows.push({ key, ordre, jalon, contenu, cible, proposee, planifiee, statut: s, niveau: n, ecart });
    };

    push(
        'visite',
        0,
        input.jalons?.visite || JALON_VISITE,
        CONTENU_VISITE,
        visiteCible,
        visiteProposee,
        statutDate(visiteCible, visiteProposee),
        visiteProposee === visiteCible ? 'ok' : 'warn'
    );
    for (let k = 1; k <= nb; k++) {
        push(
            `a${k}`,
            k,
            input.jalons?.[`a${k}`] || `Atelier ${k}`,
            input.contenus?.[`a${k}`] || CONTENUS[k - 1],
            at[k].cible,
            at[k].proposee,
            statutDate(at[k].cible, at[k].proposee),
            at[k].proposee === at[k].cible ? 'ok' : 'warn'
        );
    }
    push(
        'livrables',
        nb + 1,
        'Livrables prêts',
        CONTENU_LIVRABLES,
        at[nb].proposee,
        at[nb].proposee,
        'Prêts à l’issue du dernier atelier',
        'info'
    );
    push('mep', nb + 2, 'MEP', CONTENU_MEP, mep, mep, 'Jalon ferme', 'fix');

    // Contrôles de cohérence
    if (!isAvailable(mep, holidays))
        warnings.push(`La MEP (${mep}) tombe un week-end ou pendant les vacances scolaires de la zone ${input.zone}.`);
    const today = new Date().toISOString().slice(0, 10);
    if (visiteProposee && visiteProposee < today)
        warnings.push(
            'La date proposée pour la visite métier est déjà passée : avancez la MEP ou réduisez les délais.'
        );
    return { rows, warnings };
}
