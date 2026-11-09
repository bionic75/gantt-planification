// Analyse de fichiers › profil des colonnes (structure) : type dominant, remplissage, valeurs distinctes et fréquentes,
// plages ; rôle proposé d'après l'intitulé ou le contenu ; type des filtres de chaque colonne.
import type { Ligne } from './lecture';

type Genre = 'email' | 'url' | 'datetime' | 'date' | 'time' | 'bool' | 'int' | 'dec' | 'phone' | 'code';

/** Natures de valeurs reconnues, dans l'ordre de priorité */
export const NATURES: [Genre, string, (v: string) => boolean][] = [
    ['email', 'E-mail', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
    ['url', 'URL', v => /^(https?:\/\/|www\.)\S+$/i.test(v)],
    ['datetime', 'Date/heure', v => /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})[ T]\d{1,2}:\d{2}/.test(v)],
    ['date', 'Date', v => /^(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})$/.test(v)],
    ['time', 'Heure', v => /^\d{1,2}:\d{2}(:\d{2})?$/.test(v)],
    ['bool', 'Booléen', v => /^(oui|non|true|false|vrai|faux|yes|no|o|n|x)$/i.test(v)],
    ['int', 'Entier', v => /^[+-]?\d+$/.test(v) && !/^[+-]?0\d+$/.test(v)],
    ['dec', 'Décimal', v => /^[+-]?\d+[.,]\d+$/.test(v)],
    ['phone', 'Téléphone', v => /^\+?[\d\s.()-]{8,20}$/.test(v) && (v.match(/\d/g) ?? []).length >= 8],
    ['code', 'Code (chiffres, 0 initial)', v => /^0\d+$/.test(v)]
];

/** Groupe de type d'une valeur (détection de la ligne d'intitulés) */
export function groupeValeur(valeur: unknown): string {
    const v = (valeur ?? '').toString().trim();
    if (v === '') return 'empty';
    for (const [k, , f] of NATURES) if (f(v)) return k === 'int' || k === 'dec' ? 'num' : k === 'datetime' ? 'date' : k;
    return 'text';
}

/** Date « JJ/MM/AAAA » ou « AAAA-MM-JJ » (heure ignorée) */
export function lireDate(v: string): Date | null {
    let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
    if (m) return new Date(+m[3]!, +m[2]! - 1, +m[1]!);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
    return null;
}

export const formaterDate = (d: Date | undefined) =>
    d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';

export type NatureColonne = Genre | 'text' | 'cat' | 'list' | 'empty';

export interface ProfilColonne {
    total: number;
    filled: number;
    empty: number;
    distinct: number;
    /** 3 valeurs les plus fréquentes et leur nombre */
    top: [string, number][];
    minLen: number;
    maxLen: number;
    kind: NatureColonne;
    label: string;
    min?: number;
    max?: number;
    avg?: number;
    dmin?: Date;
    dmax?: Date;
    /** Toutes les valeurs renseignées et distinctes : clé potentielle */
    unique: boolean;
}

export function profilColonne(lignes: Ligne[], col: string): ProfilColonne {
    const vals = lignes.map(r => (r[col] ?? '').toString().trim());
    const ne = vals.filter(v => v !== '');
    const comptes = new Map<string, number>();
    ne.forEach(v => comptes.set(v, (comptes.get(v) ?? 0) + 1));
    let mn = Infinity;
    let mx = 0;
    for (const v of ne) {
        if (v.length < mn) mn = v.length;
        if (v.length > mx) mx = v.length;
    }
    // Type dominant (≥ 95 % des valeurs renseignées)
    let kind: NatureColonne = 'text';
    let label = 'Texte';
    if (ne.length) {
        const pas = Math.ceil(ne.length / 20000);
        const echantillon = ne.length > 20000 ? ne.filter((_, i) => i % pas === 0) : ne;
        for (const [k, l, f] of NATURES) {
            if (echantillon.filter(f).length / echantillon.length >= 0.95) {
                kind = k;
                label = l;
                break;
            }
        }
        // Entiers et décimaux mélangés : décimal
        if (kind === 'text' && echantillon.every(v => /^[+-]?\d+([.,]\d+)?$/.test(v))) {
            kind = 'dec';
            label = 'Décimal';
        }
        if (kind === 'text' && ne.length >= 10 && comptes.size <= Math.max(2, Math.min(30, ne.length * 0.05))) {
            kind = 'cat';
            label = `Catégorie (${comptes.size} valeurs)`;
        }
        if (kind === 'text' && echantillon.filter(v => /\s*;\s*/.test(v)).length / echantillon.length > 0.1) {
            kind = 'list';
            label = 'Liste (séparateur « ; »)';
        }
    } else {
        label = 'Vide';
        kind = 'empty';
    }
    const p: ProfilColonne = {
        total: vals.length,
        filled: ne.length,
        empty: vals.length - ne.length,
        distinct: comptes.size,
        top: [...comptes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
        minLen: ne.length ? mn : 0,
        maxLen: mx,
        kind,
        label,
        unique: false
    };
    if (kind === 'int' || kind === 'dec') {
        const nombres = ne.map(v => parseFloat(v.replace(',', '.'))).filter(n => !isNaN(n));
        if (nombres.length) {
            let a = Infinity;
            let b = -Infinity;
            let t = 0;
            for (const x of nombres) {
                if (x < a) a = x;
                if (x > b) b = x;
                t += x;
            }
            p.min = a;
            p.max = b;
            p.avg = t / nombres.length;
        }
    }
    if (kind === 'date' || kind === 'datetime') {
        const ds = ne
            .map(lireDate)
            .filter((d): d is Date => !!d)
            .map(d => d.getTime());
        if (ds.length) {
            let a = Infinity;
            let b = -Infinity;
            for (const x of ds) {
                if (x < a) a = x;
                if (x > b) b = x;
            }
            p.dmin = new Date(a);
            p.dmax = new Date(b);
        }
    }
    p.unique = ne.length > 0 && comptes.size === ne.length && p.empty === 0;
    return p;
}

// ── Rôle proposé de chaque colonne ──────────────────────────────────────────

const ROLES: [string, RegExp, string[] | null][] = [
    ['Nom complet', /\b(nom complet|nom prenom|nom et prenom|full ?name|identite)\b/, ['text']],
    ['Prénom', /\b(prenom|first ?name|given name)\b/, ['text']],
    ['Nom', /^(nom|nom de famille|name|last ?name|surname|patronyme)$/, ['text']],
    ['E-mail', /\b(e ?mail|courriel|mel|mail)\b/, ['email']],
    ['Téléphone', /\b(tel|telephone|mobile|portable|gsm|fax|phone)\b/, ['phone', 'code', 'num']],
    ['Date', /\b(date|jour|naissance|debut|fin|creation|modification|echeance)\b/, ['date']],
    [
        'Service / Direction',
        /\b(service|direction|departement|entite|organisation|societe|structure|etablissement|site)\b/,
        null
    ],
    ['Fonction', /\b(fonction|poste|titre|metier|emploi|grade)\b/, null],
    ['Profil / Rôle', /\b(profil|role|droit|habilitation|groupe)\b/, null],
    ['Statut', /\b(statut|etat|status|actif|active)\b/, null],
    ['Login', /\b(login|username|user|utilisateur|compte)\b/, null],
    ['Adresse', /\b(adresse|rue|voie)\b/, ['text']],
    ['Code postal', /\b(cp|code postal|zip)\b/, ['num', 'code']],
    ['Ville', /\b(ville|commune|localite)\b/, ['text']],
    ['Montant', /\b(montant|prix|cout|total|tarif|salaire)\b/, ['num']],
    ['Commentaire', /\b(commentaire|remarque|observation|note|description|libelle)\b/, null],
    ['Identifiant', /\b(id|identifiant|matricule|uid|ref|reference|numero|num|code)\b/, null]
];

/** Texte sans accents, en minuscules, mots séparés par une espace */
const normaliserIntitule = (v: string) =>
    (v || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

export interface RoleColonne {
    label: string;
    source: 'entête' | 'contenu';
    conf: 'haute' | 'moyenne' | 'faible';
    warn: string;
}

export function proposerRole(lignes: Ligne[], col: string, p: ProfilColonne, avecEntete: boolean): RoleColonne {
    const genere = /^Colonne \d+$/.test(col);
    const grp = p.kind === 'int' || p.kind === 'dec' ? 'num' : p.kind === 'datetime' ? 'date' : p.kind;
    if (avecEntete && !genere) {
        const n = normaliserIntitule(col);
        for (const [label, re, natures] of ROLES) {
            if (re.test(n)) {
                const ok =
                    !natures ||
                    p.kind === 'empty' ||
                    natures.includes(grp) ||
                    (natures.includes('text') && ['cat', 'list', 'text'].includes(grp));
                return {
                    label,
                    source: 'entête',
                    conf: ok ? 'haute' : 'faible',
                    warn: ok ? '' : `le contenu ressemble plutôt à : ${p.label.toLowerCase()}`
                };
            }
        }
        return { label: col, source: 'entête', conf: 'moyenne', warn: '' };
    }
    const vals = lignes
        .slice(0, 2000)
        .map(r => (r[col] ?? '').toString().trim())
        .filter(v => v !== '');
    const part = (f: (v: string) => boolean) => (vals.length ? vals.filter(f).length / vals.length : 0);
    const parNature: Partial<Record<NatureColonne, string>> = {
        email: 'E-mail',
        phone: 'Téléphone',
        date: 'Date',
        datetime: 'Date',
        time: 'Heure',
        url: 'Lien (URL)',
        bool: 'Indicateur (oui/non)',
        code: 'Code',
        list: 'Liste'
    };
    const libelle = parNature[p.kind];
    if (libelle) return { label: libelle, source: 'contenu', conf: 'haute', warn: '' };
    if (p.kind === 'int' && p.unique && p.maxLen >= 4)
        return { label: 'Identifiant', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.kind === 'int' || p.kind === 'dec') return { label: 'Nombre', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.kind === 'cat') return { label: 'Catégorie', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.kind === 'empty') return { label: 'Vide', source: 'contenu', conf: 'faible', warn: '' };
    if (
        p.distinct / Math.max(p.filled, 1) >= 0.5 &&
        part(v => /[A-ZÀ-Ý]/.test(v) && v === v.toUpperCase() && v.length <= 30) >= 0.8
    )
        return { label: 'Nom', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.distinct / Math.max(p.filled, 1) >= 0.5 && part(v => /^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(v)) >= 0.8)
        return { label: 'Prénom', source: 'contenu', conf: 'faible', warn: '' };
    if (p.unique && /^[\w.-]+$/.test(vals[0] || ''))
        return { label: 'Identifiant', source: 'contenu', conf: 'faible', warn: '' };
    return { label: p.maxLen > 60 ? 'Commentaire' : 'Libellé', source: 'contenu', conf: 'faible', warn: '' };
}

// ── Type des filtres de chaque colonne ──────────────────────────────────────

/** date : toutes les valeurs « JJ/MM/AAAA… » ; list : valeurs « a; b » ; enum : 200 valeurs distinctes au plus */
export type TypeFiltre = 'date' | 'list' | 'enum' | 'text';

export interface ColonneFiltrable {
    type: TypeFiltre;
    /** Valeurs proposées, triées (jetons pour une liste ; aucune pour une date) */
    valeurs: string[];
}

export function typesDesFiltres(lignes: Ligne[], entetes: string[]): Record<string, ColonneFiltrable> {
    const tri = (a: string, b: string) => a.localeCompare(b, 'fr');
    const resultat: Record<string, ColonneFiltrable> = {};
    for (const col of entetes) {
        const nonVides = lignes
            .slice(0, Math.min(2000, lignes.length))
            .map(r => (r[col] || '').toString().trim())
            .filter(v => v !== '');
        // Date en priorité (avant liste et énumération)
        if (nonVides.length > 0 && nonVides.every(v => /^\d{2}\/\d{2}\/\d{4}/.test(v))) {
            resultat[col] = { type: 'date', valeurs: [] };
            continue;
        }
        if (nonVides.filter(v => /\s*;\s*/.test(v)).length / Math.max(nonVides.length, 1) > 0.1) {
            const jetons = new Set<string>();
            lignes.forEach(r =>
                (r[col] || '')
                    .toString()
                    .split(/\s*;\s*/)
                    .forEach(t => {
                        const tt = t.trim();
                        if (tt) jetons.add(tt);
                    })
            );
            resultat[col] = { type: 'list', valeurs: [...jetons].sort(tri) };
            continue;
        }
        const uniques = [...new Set(lignes.map(r => (r[col] || '').toString().trim()))].filter(v => v !== '');
        resultat[col] = {
            type: uniques.length <= 200 && uniques.length > 0 ? 'enum' : 'text',
            valeurs: uniques.sort(tri)
        };
    }
    return resultat;
}
