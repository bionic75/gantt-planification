// Analyse de fichiers › lecture : encodage, fichiers texte (séparateur, largeur fixe), classeurs et CSV (SheetJS),
// ligne d'intitulés, lignes du tableau. Le fichier est lu dans le navigateur, rien n'est envoyé au serveur.
import { groupeValeur } from './profil';

/** Ligne du fichier : intitulé de colonne → valeur (texte) */
export type Ligne = Record<string, string>;

/** Fichier lu : cellules (lignes de texte), encodage détecté (CSV, texte) et description */
export interface FichierLu {
    table: string[][];
    encodage: string | null;
    meta: MetaFichier;
}

/** Description du fichier : nature, séparateur ou colonnes à largeur fixe (texte), ligne d'intitulés */
export interface MetaFichier {
    kind: 'csv' | 'excel' | 'txt';
    delim?: string | null;
    widths?: number[] | null;
    hasHeader?: boolean;
    /** N° (à partir de 1) de la ligne d'intitulés ; 0 : aucune */
    headerRow?: number;
    /** Lignes ignorées au-dessus des intitulés */
    skipped?: number;
    /** Ligne d'intitulés détectée (ou choisie) */
    headerAuto?: boolean;
    /** Noms de colonnes appliqués depuis la structure */
    mapped?: boolean;
}

export const FORMAT_NON_SUPPORTE = 'Format non supporté. Utilisez .xlsx, .xls, .csv ou .txt';

/** Fichier texte (.txt, .tsv) ; null si le format n'est pas pris en charge */
export function natureFichier(nom: string): 'texte' | 'csv' | 'classeur' | null {
    const n = nom.toLowerCase();
    if (n.endsWith('.txt') || n.endsWith('.tsv')) return 'texte';
    if (n.endsWith('.csv')) return 'csv';
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'classeur';
    return null;
}

/** Décodage d'un fichier texte : BOM, UTF-8 strict, sinon Windows-1252 (accents français) */
export function decoder(buffer: ArrayBuffer): { text: string; encoding: string } {
    const b = new Uint8Array(buffer);
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)
        return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'UTF-8 (BOM)' };
    if (b[0] === 0xff && b[1] === 0xfe)
        return { text: new TextDecoder('utf-16le').decode(buffer), encoding: 'UTF-16 LE' };
    if (b[0] === 0xfe && b[1] === 0xff)
        return { text: new TextDecoder('utf-16be').decode(buffer), encoding: 'UTF-16 BE' };
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        // UTF-8 valide mais accents doublement encodés (« Ã© ») : texte Windows-1252 réencodé
        if (/Ã[À-ÿ]/.test(text))
            return {
                text: new TextDecoder('windows-1252').decode(buffer),
                encoding: 'Windows-1252 (détecté via mojibake)'
            };
        return { text, encoding: 'UTF-8' };
    } catch {
        return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'Windows-1252 / Latin-1' };
    }
}

/** Découpage d'une ligne : séparateur, champs entre guillemets (« "" » pour un guillemet) */
export function decouperLigne(ligne: string, d: string): string[] {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < ligne.length; i++) {
        const c = ligne[i];
        if (q) {
            if (c === '"') {
                if (ligne[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else q = false;
            } else cur += c;
        } else if (c === '"' && cur === '') q = true;
        else if (c === d) {
            out.push(cur);
            cur = '';
        } else cur += c;
    }
    out.push(cur);
    return out;
}

export const nomSeparateur = (d: string) =>
    ({ '\t': 'tabulation', ';': 'point-virgule', '|': 'barre verticale', ',': 'virgule' })[d] ?? d;

/** Séparateur : celui qui donne un nombre de champs (≥ 2) le plus constant ; null si aucun */
export function detecterSeparateur(lignes: string[]): string | null {
    const echantillon = lignes.slice(0, 200);
    let meilleur: { d: string; score: number } | null = null;
    for (const d of ['\t', ';', '|', ',']) {
        const comptes = echantillon.map(l => decouperLigne(l, d).length);
        const freq = new Map<number, number>();
        comptes.forEach(c => freq.set(c, (freq.get(c) ?? 0) + 1));
        let mode = 0;
        let mf = 0;
        freq.forEach((f, c) => {
            if (f > mf || (f === mf && c > mode)) {
                mode = c;
                mf = f;
            }
        });
        let ratio = mf / echantillon.length;
        // Lignes de titre au-dessus : régularité mesurée à partir de la 1re ligne au bon nombre de champs
        const idx = comptes.indexOf(mode);
        if (ratio < 0.8 && mode >= 2 && idx > 0 && idx <= 12) {
            const suite = comptes.slice(idx);
            if (suite.length >= 3) ratio = suite.filter(c => c === mode).length / suite.length;
        }
        if (mode >= 2 && ratio >= 0.8) {
            const score = ratio * 100 + Math.min(mode, 30);
            if (!meilleur || score > meilleur.score) meilleur = { d, score };
        }
    }
    return meilleur ? meilleur.d : null;
}

/** Colonnes à largeur fixe : débuts des colonnes, séparées par des positions blanches sur (presque) toutes les lignes */
export function detecterLargeurs(lignes: string[]): number[] | null {
    const echantillon = lignes.slice(0, 200);
    const w = Math.max(...echantillon.map(l => l.length));
    if (w < 10 || echantillon.length < 3) return null;
    const blancs = new Array<number>(w).fill(0);
    echantillon.forEach(l => {
        for (let i = 0; i < w; i++) if (i >= l.length || l[i] === ' ') blancs[i] = (blancs[i] ?? 0) + 1;
    });
    const ecart = (i: number) => (blancs[i] ?? 0) >= echantillon.length * 0.97;
    const debuts: number[] = [];
    let dansColonne = false;
    for (let i = 0; i < w; i++) {
        if (!ecart(i) && !dansColonne) {
            debuts.push(i);
            dansColonne = true;
        } else if (ecart(i)) dansColonne = false;
    }
    return debuts.length >= 2 ? debuts : null;
}

/** Fichier texte : lignes non vides découpées (séparateur, sinon largeur fixe, sinon une colonne) */
export function lireTexte(texte: string): { table: string[][]; delim: string | null; widths: number[] | null } {
    const lignes = texte
        .replace(/^\uFEFF/, '')
        .split(/\r\n|\n|\r/)
        .filter(l => l.trim() !== '');
    if (!lignes.length) throw new Error('Le fichier est vide');
    const delim = detecterSeparateur(lignes);
    let widths: number[] | null = null;
    let table: string[][];
    if (delim) table = lignes.map(l => decouperLigne(l, delim));
    else {
        widths = detecterLargeurs(lignes);
        const w = widths;
        if (w) table = lignes.map(l => w.map((debut, i) => l.slice(debut, w[i + 1] ?? l.length).trim()));
        else table = lignes.map(l => [l.trim()]);
    }
    return { table, delim, widths };
}

/**
 * La 1re ligne est-elle un en-tête ? Comparaison de son type à celui du reste de chaque colonne.
 * strict (texte) : en-tête seulement si indices positifs ; sinon (classeur, CSV) : en-tête sauf indice contraire.
 */
export function detecterEntete(table: string[][], strict: boolean): boolean {
    if (table.length < 2) return !strict;
    const n = Math.max(...table.slice(0, 50).map(r => r.length));
    const reste = table.slice(1, 501);
    let pour = 0;
    let contre = 0;
    const premiere: string[] = [];
    for (let c = 0; c < n; c++) {
        const f = (table[0]?.[c] ?? '').toString().trim();
        premiere.push(f);
        const groupes = reste.map(r => groupeValeur(r[c])).filter(g => g !== 'empty');
        if (!groupes.length) continue;
        const compte: Record<string, number> = {};
        groupes.forEach(g => (compte[g] = (compte[g] ?? 0) + 1));
        const [dominant, nb] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] as [string, number];
        if (dominant === 'text' || nb / groupes.length < 0.9) continue;
        const fg = groupeValeur(f);
        if (fg === dominant) contre++;
        else if (fg === 'text') pour++;
    }
    if (!strict) return !(contre > 0 && pour === 0);
    if (contre > 0) return false;
    if (pour > 0) return true;
    // Fichier tout texte : valeurs de la 1re ligne renseignées, uniques, courtes, absentes du reste de leur colonne
    if (premiere.some(v => v === '' || v.length > 60)) return false;
    if (new Set(premiere.map(v => v.toLowerCase())).size !== premiere.length) return false;
    return premiere.every((v, c) => !reste.some(r => (r[c] ?? '').toString().trim().toLowerCase() === v.toLowerCase()));
}

/**
 * Lignes du tableau : intitulés de la ligne n° ligneEntete (à partir de 1 ; 0 : « Colonne 1 »…), données à partir de
 * l'index debutDonnees ; intitulés vides nommés « Colonne n », doublons numérotés « (2) »
 */
export function lignesDuTableau(table: string[][], ligneEntete: number, debutDonnees: number): Ligne[] {
    const n = table.reduce((m, r) => (r.length > m ? r.length : m), 0);
    let entetes =
        ligneEntete > 0
            ? (table[ligneEntete - 1] ?? []).map((v, i) => (v || '').trim() || `Colonne ${i + 1}`)
            : Array.from({ length: n }, (_, i) => `Colonne ${i + 1}`);
    while (entetes.length < n) entetes.push(`Colonne ${entetes.length + 1}`);
    const vus: Record<string, number> = {};
    entetes = entetes.map(h => {
        vus[h] = (vus[h] ?? 0) + 1;
        return (vus[h] ?? 0) > 1 ? `${h} (${vus[h]})` : h;
    });
    return table.slice(debutDonnees).map(r => {
        const o: Ligne = {};
        entetes.forEach((h, i) => {
            o[h] = (r[i] ?? '').toString().trim();
        });
        return o;
    });
}

/** Ligne d'intitulés : les lignes de titre ou vides au-dessus (moins de cellules remplies) sont ignorées */
export function enteteAutomatique(table: string[][], strict: boolean) {
    const remplies = table.map(r => r.filter(v => (v ?? '').toString().trim() !== '').length);
    const corps = remplies
        .slice(0, 200)
        .filter(n => n > 0)
        .sort((a, b) => a - b);
    const typique = corps.length ? (corps[Math.floor(corps.length / 2)] ?? 1) : 1;
    let debut = 0;
    const limite = Math.min(table.length - 1, 12);
    for (let i = 0; i <= limite; i++) {
        const n = remplies[i] ?? 0;
        if (n >= Math.max(2, typique * 0.7) || (typique < 2 && n >= 1)) {
            debut = i;
            break;
        }
    }
    return detecterEntete(table.slice(debut), strict)
        ? { headerRow: debut + 1, dataStart: debut + 1, skipped: debut }
        : { headerRow: 0, dataStart: debut, skipped: debut };
}

/** Lignes avec la ligne d'intitulés choisie (0 à 50 ; 0 : aucune) et la description mise à jour */
export function choisirLigneEntete(lu: FichierLu, valeur: string | number) {
    const k = Math.max(0, Math.min(parseInt(String(valeur), 10) || 0, Math.min(lu.table.length - 1, 50)));
    return {
        lignes: lignesDuTableau(lu.table, k, k > 0 ? k : 0),
        meta: { ...lu.meta, hasHeader: k > 0, headerRow: k, skipped: k > 0 ? k - 1 : 0, headerAuto: false }
    };
}

/** Classeur ou CSV lu par SheetJS : 1re feuille non vide, cellules en texte, lignes vides retirées */
async function lireClasseur(buffer: ArrayBuffer, csv: string | null): Promise<string[][]> {
    const XLSX = await import('xlsx');
    // Classeur : formats des cellules conservés (dates reconnues à leur format, valeur numérique d'Excel)
    const classeur =
        csv !== null
            ? XLSX.read(csv, { type: 'string', raw: false })
            : XLSX.read(new Uint8Array(buffer), { type: 'array', cellNF: true });
    let feuille = null;
    for (const nom of classeur.SheetNames) {
        const f = classeur.Sheets[nom];
        const ref = f?.['!ref'];
        if (f && ref && XLSX.utils.decode_range(ref).e.r > 0) {
            feuille = f;
            break;
        }
    }
    if (!feuille) throw new Error('Aucune feuille de données trouvée');
    if (csv === null) {
        // Dates affichées « JJ/MM/AAAA » (« JJ/MM/AAAA HH:mm » avec une heure), calculées sur la valeur numérique
        // d'Excel : indépendant du fuseau horaire du navigateur (SheetJS les affichait « 3/15/31 »)
        for (const [ref, cellule] of Object.entries(feuille)) {
            if (ref.startsWith('!')) continue;
            const c = cellule as { t?: string; v?: unknown; z?: string | number; w?: string };
            if (c.t === 'n' && typeof c.v === 'number' && c.z !== undefined && XLSX.SSF.is_date(c.z))
                c.w = XLSX.SSF.format(c.v % 1 === 0 ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm', c.v);
        }
    }
    return XLSX.utils
        .sheet_to_json<unknown[]>(feuille, { header: 1, defval: '', raw: false })
        .map(r => r.map(v => (v ?? '').toString()))
        .filter(r => r.some(v => v.trim() !== ''));
}

/** Lecture d'un fichier (contenu) : table, encodage, nature, ligne d'intitulés détectée */
export async function lireFichier(nom: string, buffer: ArrayBuffer): Promise<FichierLu> {
    const nature = natureFichier(nom);
    if (!nature) throw new Error(FORMAT_NON_SUPPORTE);
    let encodage: string | null = null;
    let table: string[][];
    let meta: MetaFichier;
    if (nature === 'texte') {
        const { text, encoding } = decoder(buffer);
        encodage = encoding;
        const lu = lireTexte(text);
        table = lu.table;
        meta = { kind: 'txt', delim: lu.delim, widths: lu.widths };
    } else if (nature === 'csv') {
        const { text, encoding } = decoder(buffer);
        encodage = encoding;
        table = await lireClasseur(buffer, text);
        meta = { kind: 'csv' };
    } else {
        table = await lireClasseur(buffer, null);
        meta = { kind: 'excel' };
    }
    if (!table.length) throw new Error('Le fichier ne contient pas de données');
    const entete = enteteAutomatique(table, nature === 'texte');
    return {
        table,
        encodage,
        meta: {
            ...meta,
            hasHeader: entete.headerRow > 0,
            headerRow: entete.headerRow,
            skipped: entete.skipped,
            headerAuto: true
        }
    };
}

/** Lignes du fichier lu, avec la ligne d'intitulés détectée */
export function lignesDuFichier(lu: FichierLu): Ligne[] {
    const headerRow = lu.meta.headerRow ?? 0;
    return lignesDuTableau(lu.table, headerRow, headerRow > 0 ? headerRow : (lu.meta.skipped ?? 0));
}
