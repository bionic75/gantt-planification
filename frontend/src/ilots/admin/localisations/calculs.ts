// Localisations : tri de la liste, analyse d'un fichier CSV, conflits d'import, message de suppression (sans affichage)
import type { DonneesLocalisation, Localisation, UsageLocalisation } from '@/api/localisations';

export type ColonneTri = 'libelle_long' | 'libelle_court' | 'adresse' | 'latitude' | 'longitude';
export type Sens = 'asc' | 'desc';

/** Tri : nombres comparés entre eux, textes dans l'ordre français ; valeur absente = texte vide */
export function trier(liste: Localisation[], colonne: ColonneTri, sens: Sens) {
    return [...liste].sort((a, b) => {
        const va = a[colonne] ?? '';
        const vb = b[colonne] ?? '';
        const c =
            typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
        return sens === 'asc' ? c : -c;
    });
}

/** Clic sur une colonne : sens inversé, ou nouvelle colonne en ordre croissant */
export const basculerTri = (t: { colonne: ColonneTri; sens: Sens }, colonne: ColonneTri) =>
    t.colonne === colonne
        ? { colonne, sens: (t.sens === 'asc' ? 'desc' : 'asc') as Sens }
        : { colonne, sens: 'asc' as Sens };

// ── Import CSV ────────────────────────────────────────────────────────────

/** Ligne du fichier (libellés et adresse en majuscules, coordonnées décimales) */
export interface LigneCsv {
    libelle_long: string;
    libelle_court: string;
    adresse: string;
    latitude: number | null;
    longitude: number | null;
}

export type AnalyseCsv =
    | { ok: true; separateur: string; lignes: LigneCsv[] }
    | { ok: false; message: string; detail?: { separateur: string; entetes: string[] } };

/** Nombre décimal (virgule acceptée), sinon null */
export function decimal(v: string | undefined | null) {
    if (v == null) return null;
    const n = parseFloat(String(v).trim().replace(',', '.'));
    return isNaN(n) ? null : n;
}

/**
 * Fichier CSV avec en-tête : séparateur tabulation, « ; » ou « , » (détecté sur la première ligne) ; colonnes
 * libelle_long, libelle_court, adresse, latitude, longitude (variantes acceptées : ll, lc, lat, lng, lon…)
 */
export function analyserCsv(texte: string): AnalyseCsv {
    const lignes = texte
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(l => l.trim());
    const premiere = lignes[0];
    if (lignes.length < 2 || premiere == null) return { ok: false, message: '⚠️ Fichier vide ou sans données.' };
    const separateur = premiere.includes('\t') ? '\t' : premiere.includes(';') ? ';' : ',';
    const entetes = premiere.split(separateur).map(h => h.trim().toLowerCase());
    const indice = (test: (h: string) => boolean) => entetes.findIndex(test);
    const iLong = indice(
        h =>
            h === 'libelle_long' ||
            h === 'libellé_long' ||
            h === 'll' ||
            h.startsWith('libelle_l') ||
            h.startsWith('libellé_l')
    );
    const iCourt = indice(
        h =>
            h === 'libelle_court' ||
            h === 'libellé_court' ||
            h === 'lc' ||
            h.startsWith('libelle_c') ||
            h.startsWith('libellé_c')
    );
    const iAdresse = indice(h => h === 'adresse' || h.startsWith('adress'));
    const iLat = indice(h => h === 'latitude' || h === 'lat');
    const iLng = indice(h => h === 'longitude' || h === 'long' || h === 'lng' || h === 'lon');
    const detail = { separateur, entetes };
    if (iLong < 0 || iCourt < 0)
        return { ok: false, message: '⚠️ Colonnes libelle_long et libelle_court introuvables.', detail };
    if (iLat < 0 || iLng < 0) return { ok: false, message: '⚠️ Colonnes latitude/longitude introuvables.', detail };

    const resultat: LigneCsv[] = [];
    for (const l of lignes.slice(1)) {
        const c = l.split(separateur);
        const long = (c[iLong] || '').trim().toUpperCase();
        const court = (c[iCourt] || '').trim().toUpperCase();
        if (!long || !court) continue;
        resultat.push({
            libelle_long: long,
            libelle_court: court,
            adresse: iAdresse >= 0 ? (c[iAdresse] || '').trim().toUpperCase() : '',
            latitude: decimal(c[iLat]),
            longitude: decimal(c[iLng])
        });
    }
    if (!resultat.length) return { ok: false, message: '⚠️ Aucune ligne valide trouvée.' };
    return { ok: true, separateur, lignes: resultat };
}

export const libelleSeparateur = (s: string) => (s === '\t' ? 'TAB' : s);

export type ActionConflit = 'keep' | 'overwrite' | 'manual';

/** Localisation du fichier déjà en base (même libellé long) */
export interface Conflit {
    fichier: LigneCsv;
    existante: Localisation;
    identique: boolean;
    action: ActionConflit;
    /** Saisie manuelle (action « manual ») */
    manuel: { libelle_court: string; adresse: string; latitude: number | null; longitude: number | null };
}

/** Coordonnées égales en valeur (« 48.86 » et 48.86), absentes des deux côtés */
export const memeCoordonnee = (a: number | string | null | undefined, b: number | string | null | undefined) =>
    a == null || b == null ? a == null && b == null : Number(a) === Number(b);

/** Comparaison des données (coordonnées comparées en valeur, comme l'ancien écran) */
export const identiques = (
    l: Pick<LigneCsv, 'libelle_court' | 'adresse' | 'latitude' | 'longitude'>,
    e: Localisation
) =>
    e.libelle_court === l.libelle_court &&
    (e.adresse || '') === (l.adresse || '') &&
    memeCoordonnee(e.latitude, l.latitude) &&
    memeCoordonnee(e.longitude, l.longitude);

/** Lignes nouvelles (à importer) et lignes déjà en base (conflits, « conserver l'existant » par défaut) */
export function repartir(lignes: LigneCsv[], existantes: Localisation[]) {
    const nouvelles: LigneCsv[] = [];
    const conflits: Conflit[] = [];
    for (const l of lignes) {
        const e = existantes.find(x => x.libelle_long === l.libelle_long);
        if (!e) {
            nouvelles.push(l);
            continue;
        }
        conflits.push({
            fichier: l,
            existante: e,
            identique: identiques(l, e),
            action: 'keep',
            manuel: {
                libelle_court: e.libelle_court,
                adresse: e.adresse || '',
                latitude: l.latitude,
                longitude: l.longitude
            }
        });
    }
    return { nouvelles, conflits };
}

/** Données écrites pour un conflit : fichier (écraser) ou saisie manuelle ; null pour « conserver » */
export function donneesConflit(c: Conflit): DonneesLocalisation | null {
    if (c.action === 'keep') return null;
    const source = c.action === 'manual' ? c.manuel : c.fichier;
    return {
        libelle_long: c.fichier.libelle_long,
        libelle_court: source.libelle_court,
        adresse: source.adresse,
        latitude: source.latitude,
        longitude: source.longitude
    };
}

/** Résumé de l'import quand des localisations du fichier existent déjà */
export function resumeImport(ajoutees: number, conflits: Conflit[]) {
    const differentes = conflits.filter(c => !c.identique).length;
    const identiquesEnBase = conflits.length - differentes;
    const parties = [];
    if (ajoutees > 0) parties.push(`${ajoutees} ajouté(s)`);
    if (differentes > 0) parties.push(`${differentes} avec données différentes`);
    if (identiquesEnBase > 0) parties.push(`${identiquesEnBase} déjà identiques en base`);
    return `⚠️ ${parties.join(' | ')} — choisissez l'action pour chaque entrée existante.`;
}

// ── Suppression ───────────────────────────────────────────────────────────

export interface UsageNomme extends UsageLocalisation {
    id: number;
    nom: string;
}

/** Message de confirmation : simple, ou détaillé si des localisations sont utilisées par des événements */
export function messageSuppression(usages: UsageNomme[], total: number) {
    const utilisees = usages.filter(u => u.count > 0);
    const libres = usages.filter(u => u.count === 0);
    const libelleTotal = total === 1 ? '1 localisation' : `${total} localisations`;
    if (!utilisees.length) return `Supprimer ${libelleTotal} ?\n\n${usages.map(u => `• ${u.nom}`).join('\n')}`;
    let texte = `⚠️ ATTENTION — ${utilisees.length} localisation(s) sur ${total} sont utilisées par des événements :\n\n`;
    for (const u of utilisees) {
        texte += `• ${u.nom} → ${u.count} événement(s)\n`;
        for (const ev of u.events.slice(0, 3))
            texte += `   - "${ev.label}" (${ev.start_date}${ev.end_date !== ev.start_date ? ` → ${ev.end_date}` : ''})\n`;
        if (u.events.length > 3) texte += `   ... et ${u.events.length - 3} autre(s)\n`;
    }
    if (libres.length) texte += `\n${libres.length} localisation(s) non utilisée(s) seront aussi supprimées.\n`;
    return `${texte}\nSi vous confirmez, les événements concernés afficheront "NON DÉFINI" à la place de la localisation.\n\nConfirmer la suppression ?`;
}
