// Aide à l'affectation › planning des déploiements : dates (UTC), semaines ISO, échappement, couleurs et motifs des étapes
import { semaineIsoTexte } from '@/outils/semaine';

export const MOIS = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre'
];
export const JOURS_COURTS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export const utcMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const ajouterJours = (iso: string, n: number) => isoMs(utcMs(iso) + n * 86400000);
export function aujourdhui(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** « JJ/MM/AAAA » */
export const jourFr = (iso: string) => iso.split('-').reverse().join('/');
export const estWeekEnd = (iso: string) => [0, 6].includes(new Date(utcMs(iso)).getUTCDay());

/** Semaine ISO 8601 d'une date (règle partagée, outils/semaine.ts) */
export function semaineIso(iso: string) {
    const s = semaineIsoTexte(iso);
    return { week: s.semaine, year: s.annee };
}
export const lundiDe = (iso: string) => ajouterJours(iso, -((new Date(utcMs(iso)).getUTCDay() + 6) % 7));
/** Valeur d'un champ « semaine » : « AAAA-Wss » */
export function valeurSemaine(iso: string) {
    if (!iso) return '';
    const w = semaineIso(iso);
    return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}

/** Regroupement des éléments consécutifs de même clé (en-têtes de colonnes fusionnés) */
export function regrouper<T>(liste: T[], cle: (x: T) => string | number, libelle?: (x: T) => string | number) {
    const out: { key: string | number; label: string | number; n: number }[] = [];
    for (const x of liste) {
        const k = cle(x);
        const dernier = out[out.length - 1];
        if (dernier && dernier.key === k) dernier.n++;
        else out.push({ key: k, label: libelle ? libelle(x) : k, n: 1 });
    }
    return out;
}

/** Texte inséré dans le HTML de la grille et des pages imprimées */
export const esc = (t: unknown) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Texte sans accents, en minuscules */
export const normaliser = (t: unknown) =>
    String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

// ── Couleurs et motifs des étapes ───────────────────────────────────────────

const MOTIFS_SVG: Record<string, [string, string]> = {
    diag: ['8', "<path d='M-2 2l4-4M0 8l8-8M6 10l4-4' stroke-width='2'/>"],
    diag2: ['8', "<path d='M10 2l-4-4M8 8l-8-8M2 10l-4-4' stroke-width='2'/>"],
    chevron: ['16 12', "<path d='M0 7L8 13L16 7M0 1L8 7L16 1M0 -5L8 1L16 -5' stroke-width='2' fill='none'/>"],
    grid: ['10', "<path d='M0 .5H10M.5 0V10' stroke-width='1.4'/>"],
    dots: ['8', "<circle cx='4' cy='4' r='1.6' stroke='none' fill='C'/>"],
    cross: ['8', "<path d='M0 0L8 8M8 0L0 8' stroke-width='1.4'/>"],
    hlines: ['6', "<path d='M0 3H6' stroke-width='2'/>"],
    vlines: ['6', "<path d='M3 0V6' stroke-width='2'/>"],
    zigzag: ['12 8', "<path d='M0 6L3 2L6 6L9 2L12 6' stroke-width='1.8' fill='none'/>"]
};

/** Style de fond : couleur et motif discret, clair sur fond foncé et foncé sur fond clair */
export function styleFond(hex: string, motif: string) {
    const base = `background-color:${hex};`;
    const def = MOTIFS_SVG[motif];
    if (!def) return base;
    const n = parseInt(String(hex).slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    const c = lum > 0.62 ? 'rgba(0,0,0,.38)' : 'rgba(255,255,255,.62)';
    const [taille, corps] = def;
    const [w, h] = taille.split(' ').concat(taille.split(' ')).slice(0, 2);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' fill='none' stroke='${c}'>${corps.replace("fill='C'", `fill='${c}'`)}</svg>`;
    return `${base}background-image:url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}');background-size:${w}px ${h}px;`;
}

/** Phases (bandeau haut), étapes à ressources (bandes du bas), jalons (une date) */
export const PHASES = ['cadrage', 'deploiement', 'gel'];
export const ETAPES = ['visite_metier', 'test_prerequis', 'vft', 'formation_utilisateurs', 'accompagnement'];
export const JALONS = ['reunion_lancement', 'visite_ob'];

export type Echelle = 'day' | 'week' | 'month' | 'quarter' | 'year';
export const LIBELLE_ECHELLE: Record<Echelle, string> = {
    day: 'jour',
    week: 'semaine',
    month: 'mois',
    quarter: 'trimestre',
    year: 'année'
};

/**
 * Garde-fou : une saisie intermédiaire (ex. année « 0002 ») ne doit jamais construire une frise gigantesque ; message
 * d'erreur, ou chaîne vide
 */
export function erreurPeriode(debut: string, fin: string, echelle: string) {
    const an = (v: string) => parseInt(String(v).slice(0, 4), 10);
    if (!(an(debut) >= 2000 && an(debut) <= 2100 && an(fin) >= 2000 && an(fin) <= 2100))
        return 'Dates hors limites : choisissez des années entre 2000 et 2100.';
    const jours = (Date.parse(fin) - Date.parse(debut)) / 86400000 + 1;
    const n = jours / ({ day: 1, week: 7, month: 30, quarter: 91, year: 365 }[echelle as Echelle] || 1);
    if (n > 1500)
        return `Période trop large pour cette échelle (${Math.round(n)} colonnes) : réduisez la période ou choisissez une échelle plus large.`;
    return '';
}
