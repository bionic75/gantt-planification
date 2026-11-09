// Analyse de fichiers › filtres : listes et énumérations (groupes de valeurs liés par ET / OU, exclusions), texte
// (jokers * et ?, sans accents ni casse), dates (après, avant, entre, égal), oui / non ; doublons ; export CSV.
import type { Ligne } from './lecture';
import type { ColonneFiltrable } from './profil';

export type Operateur = 'AND' | 'OR';

/** Filtre d'une liste ou d'une énumération : groupes de valeurs (OU dans un groupe), opérateurs entre groupes */
export interface FiltreListe {
    groups: { tokens: string[] }[];
    ops: Operateur[];
    excluded: string[];
}

export type ModeDate = 'after' | 'before' | 'between' | 'exact';

export interface FiltreDate {
    mode: ModeDate;
    date?: string | null;
    from?: string | null;
    to?: string | null;
}

/** Valeur d'un filtre : texte (recherche libre, valeur oui / non), liste, date ; null ou absent : aucun filtre */
export type Filtre = string | FiltreListe | FiltreDate | null;
export type Filtres = Record<string, Filtre>;

export const estListe = (f: Filtre | undefined): f is FiltreListe =>
    !!f && typeof f === 'object' && Array.isArray((f as FiltreListe).groups);
export const estDate = (f: Filtre | undefined): f is FiltreDate =>
    !!f && typeof f === 'object' && !Array.isArray((f as FiltreListe).groups);

/** Texte sans accents, en minuscules */
export const normaliser = (s: unknown) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const jetonsDe = (v: string) =>
    new Set(
        v
            .split(/\s*;\s*/)
            .map(t => t.trim())
            .filter(Boolean)
    );

/** Groupes actifs évalués de gauche à droite (opérateur d'origine entre un groupe et le précédent) */
function evaluerGroupes(f: FiltreListe, correspond: (jeton: string) => boolean): boolean | null {
    const actifs = f.groups.map((g, i) => ({ tokens: g.tokens, origine: i })).filter(g => g.tokens.length > 0);
    if (!actifs.length) return null;
    let resultat = actifs[0]!.tokens.some(correspond);
    for (let gi = 1; gi < actifs.length; gi++) {
        const g = actifs[gi]!;
        const op = f.ops[g.origine - 1] || 'AND';
        const ok = g.tokens.some(correspond);
        resultat = op === 'OR' ? resultat || ok : resultat && ok;
    }
    return resultat;
}

const dateDeLigne = (s: string) => {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : null;
};

/** Expression d'une recherche avec jokers : * (suite quelconque), ? (un caractère) ; null sans joker */
function expressionJokers(recherche: string): RegExp | null {
    if (!recherche.includes('*') && !recherche.includes('?')) return null;
    const source = `^${recherche
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`;
    try {
        return new RegExp(source, 'i');
    } catch {
        return /$^/;
    }
}

/** Lignes retenues par les filtres */
export function filtrer(
    lignes: Ligne[],
    entetes: string[],
    colonnes: Record<string, ColonneFiltrable>,
    filtres: Filtres
): Ligne[] {
    const actifs = entetes.map(col => ({ col, f: filtres[col], type: colonnes[col]?.type })).filter(({ f }) => !!f);
    if (!actifs.length) return lignes;
    const recherches = new Map(
        actifs
            .filter(a => a.type !== 'list' && a.type !== 'enum' && a.type !== 'date')
            .map(a => {
                const r = normaliser(typeof a.f === 'string' ? a.f : '');
                return [a.col, { r, jokers: expressionJokers(r) }] as const;
            })
    );
    return lignes.filter(ligne => {
        for (const { col, f, type } of actifs) {
            const val = (ligne[col] || '').toString();
            if (type === 'list') {
                if (!estListe(f)) continue;
                const jetons = jetonsDe(val);
                if (f.excluded.some(t => jetons.has(t))) return false;
                const r = evaluerGroupes(f, t => jetons.has(t));
                if (r === false) return false;
            } else if (type === 'enum') {
                if (!estListe(f)) {
                    if (val !== f) return false;
                    continue;
                }
                if (f.excluded.includes(val)) return false;
                const r = evaluerGroupes(f, t => val === t);
                if (r === false) return false;
            } else if (type === 'date' && estDate(f)) {
                const d = dateDeLigne(val);
                // Date absente ou invalide : ligne écartée dès qu'un filtre de date existe
                if (!d) return false;
                const jour = (s: string | null | undefined) => (s ? new Date(s) : null);
                const { mode, date, from, to } = f;
                if (mode === 'exact' && date) {
                    if (d.toISOString().slice(0, 10) !== date) return false;
                } else if (mode === 'after' && date) {
                    if (d < (jour(date) as Date)) return false;
                } else if (mode === 'before' && date) {
                    if (d > (jour(date) as Date)) return false;
                } else if (mode === 'between') {
                    if (from && d < (jour(from) as Date)) return false;
                    if (to && d > (jour(to) as Date)) return false;
                }
            } else {
                const r = recherches.get(col);
                if (!r) continue;
                const v = normaliser(val);
                if (!(r.jokers ? r.jokers.test(v) : v.includes(r.r))) return false;
            }
        }
        return true;
    });
}

/** Nombre de filtres actifs : liste avec au moins une valeur ou une exclusion, autre filtre renseigné */
export function nombreFiltresActifs(filtres: Filtres): number {
    let n = 0;
    for (const f of Object.values(filtres)) {
        if (!f) continue;
        if (estListe(f)) {
            if (f.groups.some(g => g.tokens.length > 0) || f.excluded.length > 0) n++;
        } else n++;
    }
    return n;
}

// ── Opérations sur un filtre de liste (copie modifiée ; null : filtre retiré) ─

export const listeVide = (): FiltreListe => ({ groups: [{ tokens: [] }], ops: [], excluded: [] });

const copie = (f: Filtre | undefined): FiltreListe =>
    estListe(f)
        ? { groups: f.groups.map(g => ({ tokens: [...g.tokens] })), ops: [...f.ops], excluded: [...f.excluded] }
        : listeVide();

/** Groupes vides retirés (opérateurs conservés avec leur groupe) ; null si plus aucune valeur incluse */
export function nettoyerGroupes(f: FiltreListe): FiltreListe | null {
    const groups: FiltreListe['groups'] = [];
    const ops: Operateur[] = [];
    f.groups.forEach((g, i) => {
        if (g.tokens.length > 0) {
            if (groups.length > 0) ops.push(f.ops[i - 1] || 'AND');
            groups.push(g);
        }
    });
    // Comportement de l'ancien écran conservé : sans valeur incluse, le filtre est retiré, exclusions comprises
    if (!groups.length) return null;
    return { ...f, groups, ops };
}

/** Valeurs ajoutées au 1er groupe (sans doublon) */
export function ajouterJetons(f: Filtre | undefined, jetons: Iterable<string>): FiltreListe {
    const n = copie(f);
    const groupe = n.groups[0] ?? { tokens: [] };
    if (!n.groups.length) n.groups.push(groupe);
    for (const t of jetons) if (!groupe.tokens.includes(t)) groupe.tokens.push(t);
    return n;
}

export function retirerJeton(f: Filtre | undefined, gi: number, ti: number): FiltreListe | null {
    if (!estListe(f)) return null;
    const n = copie(f);
    n.groups[gi]?.tokens.splice(ti, 1);
    return nettoyerGroupes(n);
}

export function retirerGroupe(f: Filtre | undefined, gi: number): FiltreListe | null {
    if (!estListe(f) || f.groups.length <= 1) return null;
    const n = copie(f);
    n.groups.splice(gi, 1);
    // Opérateur qui reliait le groupe précédent à celui-ci
    if (n.ops.length >= gi && gi > 0) n.ops.splice(gi - 1, 1);
    else if (n.ops.length > 0) n.ops.splice(0, 1);
    return nettoyerGroupes(n);
}

export function ajouterGroupe(f: Filtre | undefined, op: Operateur): FiltreListe {
    const n = copie(f);
    n.groups.push({ tokens: [] });
    n.ops.push(op);
    return n;
}

export function basculerOperateur(f: Filtre | undefined, i: number): FiltreListe {
    const n = copie(f);
    n.ops[i] = n.ops[i] === 'OR' ? 'AND' : 'OR';
    return n;
}

/** Valeur glissée vers un groupe (à une position, ou en fin de groupe) */
export function deplacerJeton(
    f: Filtre | undefined,
    depuis: { gi: number; ti: number },
    vers: { gi: number; ti: number }
): FiltreListe | null {
    const n = copie(f);
    const [jeton] = n.groups[depuis.gi]?.tokens.splice(depuis.ti, 1) ?? [];
    if (jeton === undefined) return estListe(f) ? f : null;
    while (n.groups.length <= vers.gi) {
        n.groups.push({ tokens: [] });
        n.ops.push('AND');
    }
    const cible = n.groups[vers.gi]!.tokens;
    let position = depuis.gi === vers.gi && depuis.ti < vers.ti ? vers.ti - 1 : vers.ti;
    position = Math.max(0, Math.min(position, cible.length));
    cible.splice(position, 0, jeton);
    return nettoyerGroupes(n);
}

export function exclure(f: Filtre | undefined, valeurs: Iterable<string>): FiltreListe {
    const n = copie(f);
    for (const v of valeurs) if (!n.excluded.includes(v)) n.excluded.push(v);
    return n;
}

/** Exclusion retirée ; filtre retiré s'il ne reste ni exclusion ni valeur incluse */
export function retirerExclusion(f: Filtre | undefined, i: number): FiltreListe | null {
    if (!estListe(f)) return null;
    const n = copie(f);
    n.excluded.splice(i, 1);
    if (!n.excluded.length && n.groups.every(g => !g.tokens.length)) return null;
    return n;
}

// ── Doublons, export ─────────────────────────────────────────────────────────

export const cleDoublon = (ligne: Ligne, colonnes: string[]) =>
    colonnes.map(c => (ligne[c] || '').toString().trim()).join('\x00');

/** Clés présentes plus d'une fois dans tout le fichier (pas seulement les lignes filtrées) */
export function clesEnDoublon(lignes: Ligne[], colonnes: string[]): Set<string> {
    const doublons = new Set<string>();
    if (!colonnes.length) return doublons;
    const compte = new Map<string, number>();
    lignes.forEach(l => {
        const k = cleDoublon(l, colonnes);
        compte.set(k, (compte.get(k) ?? 0) + 1);
    });
    compte.forEach((n, k) => {
        if (n > 1) doublons.add(k);
    });
    return doublons;
}

/** Export CSV : valeurs entre guillemets, séparateur « ; », lignes CRLF, BOM UTF-8 (Excel) */
export function csvAnalyse(lignes: Ligne[], colonnes: string[]): string {
    const champ = (v: unknown) => `"${(v || '').toString().replace(/"/g, '""')}"`;
    return (
        '\uFEFF' +
        [colonnes.map(champ).join(';'), ...lignes.map(l => colonnes.map(c => champ(l[c])).join(';'))].join('\r\n')
    );
}

export const nomExport = (aujourdhui = new Date()) => `analyse_export_${aujourdhui.toISOString().slice(0, 10)}.csv`;

/** Nombre au format français */
export const nombreFr = (n: number) => n.toLocaleString('fr-FR');
