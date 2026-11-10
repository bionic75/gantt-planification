// Application mobile : dates (heure locale), activité et congés d'une demi-journée, libellés de période, grilles de
// la semaine et du mois, événements, icônes des événements, carte « Autour de moi » (distances, décompte)

export type Vue = 'day' | 'week' | 'month';
export type Periode = 'AM' | 'PM';

export const MOIS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const LIBELLES_VUES: Record<Vue, string> = { day: 'Jour', week: 'Semaine', month: 'Mois' };

/** Activités (codes de la planification) : libellé et couleur */
export const ACTIVITES: Record<string, { label: string; color: string }> = {
    1: { label: 'Indisponible', color: '#95a5a6' },
    2: { label: 'En attente', color: '#9b59b6' },
    3: { label: 'SAMU Déploiement', color: '#e67e22' },
    4: { label: 'SAMU Dev. usages', color: '#d35400' },
    5: { label: 'ANS Déploiement', color: '#3498db' },
    6: { label: 'ANS Dev. usages', color: '#2980b9' },
    7: { label: 'Qualification', color: '#e74c3c' },
    8: { label: 'Divers', color: '#16a085' }
};
/** Mêmes pictogrammes que la légende du planning */
export const EMOJIS_ACTIVITES: Record<string, string> = {
    1: '❓',
    2: '⏳',
    3: '📞',
    4: '📞',
    5: '🚀',
    6: '🖥',
    7: '☑️',
    8: '📖'
};

// ── Dates (heure locale du téléphone) ───────────────────────────────────────

export const versIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function depuisIso(s: string) {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d);
}
export const estAujourdhui = (d: Date, maintenant = new Date()) =>
    d.getFullYear() === maintenant.getFullYear() &&
    d.getMonth() === maintenant.getMonth() &&
    d.getDate() === maintenant.getDate();
export function ajouterJours(d: Date, n: number) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}
export function lundiDe(d: Date) {
    const r = new Date(d);
    r.setDate(r.getDate() - (r.getDay() === 0 ? 6 : r.getDay() - 1));
    return r;
}
/** « JJ/MM » */
export function dateCourte(s: string | null | undefined) {
    if (!s) return '';
    const d = depuisIso(s);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Numéro de semaine ISO 8601 */
export function numeroSemaine(d: Date) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const jour = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - jour);
    const an = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return Math.ceil(((dt.getTime() - an.getTime()) / 86400000 + 1) / 7);
}

/** Libellé de la période affichée */
export function libellePeriode(vue: Vue, c: Date) {
    if (vue === 'day')
        return `${c.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} (Sem ${numeroSemaine(c)})`;
    if (vue === 'week') {
        const lundi = lundiDe(c);
        const vendredi = ajouterJours(lundi, 4);
        return `Sem ${numeroSemaine(lundi)} — ${lundi.getDate()} ${MOIS[lundi.getMonth()]!.slice(0, 3)} › ${vendredi.getDate()} ${MOIS[vendredi.getMonth()]!.slice(0, 3)}`;
    }
    return `${MOIS[c.getMonth()]} ${c.getFullYear()}`;
}

/** Période précédente ou suivante */
export function deplacer(vue: Vue, c: Date, sens: number) {
    if (vue === 'day') return ajouterJours(c, sens);
    if (vue === 'week') return ajouterJours(c, sens * 7);
    return new Date(c.getFullYear(), c.getMonth() + sens, 1);
}

// ── Planification d'une ressource ───────────────────────────────────────────

export type Planification = Record<string, string>;

/** Activité d'une demi-journée (code), hors congé ; null si aucune */
export function activite(p: Planification, rid: number, iso: string, periode: Periode): string | null {
    const cle = `${iso}_${periode}`;
    if ((p[`${rid}_available_${cle}`] || '1') === '3') return null;
    return p[`${rid}_activity_${cle}`] || '1';
}
/** Congé le matin ou l'après-midi */
export const enConge = (p: Planification, rid: number, iso: string) =>
    p[`${rid}_available_${iso}_AM`] === '3' || p[`${rid}_available_${iso}_PM`] === '3';

/** Jours ouvrés de la semaine (lundi → vendredi) */
export const joursSemaine = (c: Date) => Array.from({ length: 5 }, (_, i) => ajouterJours(lundiDe(c), i));

/** Grille du mois : lignes (numéro de semaine ISO, 7 jours ou null hors du mois) */
export function grilleMois(c: Date) {
    const y = c.getFullYear();
    const m = c.getMonth();
    const dernier = new Date(y, m + 1, 0).getDate();
    const decalage = new Date(y, m, 1).getDay() === 0 ? 6 : new Date(y, m, 1).getDay() - 1;
    const lignes: { semaine: number; jours: (Date | null)[] }[] = [];
    for (let l = 0; l < Math.ceil((decalage + dernier) / 7); l++) {
        const jours: (Date | null)[] = [];
        for (let col = 0; col < 7; col++) {
            const jour = l * 7 + col - decalage + 1;
            jours.push(jour < 1 || jour > dernier ? null : new Date(y, m, jour));
        }
        lignes.push({ semaine: numeroSemaine(new Date(y, m, 1 - decalage + l * 7)), jours });
    }
    return lignes;
}

// ── Événements ──────────────────────────────────────────────────────────────

export interface EvenementMobile {
    id: number;
    label: string;
    start_date: string;
    end_date: string;
    period?: string | null;
    location_libelle_court?: string | null;
    type_long?: string | null;
    type_short?: string | null;
    type_code?: string | null;
    type_other?: boolean | number | null;
    participants?: { prenom: string | null; nom: string | null }[];
}

/** Événements qui touchent l'intervalle [debut, fin] (« AAAA-MM-JJ ») */
export const evenementsEntre = (evts: EvenementMobile[], debut: string, fin: string) =>
    evts.filter(e => e.end_date >= debut && e.start_date <= fin);

/** Libellé affiché d'un événement : court ou long du type ; « Autre(s) » ou sans type : libellé de l'événement */
export function libelleEvenement(e: EvenementMobile) {
    const type = !!(e.type_long && !e.type_other);
    const affiche = type ? e.type_short || e.type_long || '' : e.label;
    return { affiche, detail: type && e.label && e.label !== affiche ? e.label : '' };
}

/** Dates d'un événement : « JJ/MM → JJ/MM (Matin) » */
export function datesEvenement(e: EvenementMobile) {
    let t = dateCourte(e.start_date);
    if (e.end_date && e.end_date !== e.start_date) t += ` → ${dateCourte(e.end_date)}`;
    if (e.period && e.period !== 'FULL') t += ` (${e.period === 'AM' ? 'Matin' : 'Après-midi'})`;
    return t;
}

export const ICONES_EVENEMENTS: Record<string, string> = {
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    briefcase:
        '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
    lifebuoy:
        '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.2 4.2M14.9 14.9l4.2 4.2M14.9 9.1l4.2-4.2M4.9 19.1l4.2-4.2"/>',
    clipboardCheck:
        '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    listChecks: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
    presentation:
        '<path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M12 16v5M8 21h8"/><path d="m7 12 3-3 2 2 4-4"/>'
};
/** Icône de chaque modèle d'événement (identique à celle du bureau), choisie d'après le début du libellé */
const MODELES: [string, string][] = [
    ['reunion de lancement strategique', 'rocket'],
    ['visite post mes', 'eye'],
    ['verif prerequis', 'listChecks'],
    ['visite metier', 'briefcase'],
    ['visite terrain', 'pin'],
    ['mise en service', 'power'],
    ['accomp', 'lifebuoy'],
    ['visite ob', 'building'],
    ['vft sur site', 'clipboardCheck'],
    ['formation', 'graduation'],
    ['congres', 'presentation']
];
/** Tracé de l'icône d'après le libellé (épingle par défaut) */
export function iconeDuLibelle(label: string) {
    const l = (label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, '').trim();
    const modele = MODELES.find(([k]) => l === k || l.startsWith(`${k} `) || l.startsWith(k));
    return (modele && ICONES_EVENEMENTS[modele[1]]) || ICONES_EVENEMENTS.pin!;
}
/** Tracé de l'icône d'un événement : celle de son type, sinon d'après le libellé */
export function iconeEvenement(e: EvenementMobile) {
    const type = !!(e.type_long && !e.type_other);
    return (type && e.type_code && ICONES_EVENEMENTS[e.type_code]) || iconeDuLibelle(e.label);
}

// ── Carte « Autour de moi » ─────────────────────────────────────────────────

/** Distance en km entre deux points */
export function distanceKm(a: number, b: number, c: number, d: number) {
    const r = Math.PI / 180;
    const x = (c - a) * r;
    const y = (d - b) * r;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Message de décompte : lieux dans le rayon (0 : France entière), le plus proche, précision de la position ; sans
 * position, nombre de lieux en France
 */
export function decompte(distances: number[] | null, rayon: number, precision: number, total = distances?.length ?? 0) {
    if (!distances) return `${total} lieu${total > 1 ? 'x' : ''} en France (position inconnue).`;
    const dedans = distances.filter(d => rayon === 0 || d <= rayon).sort((a, b) => a - b);
    const plusProche = [...distances].sort((a, b) => a - b)[0];
    return (
        `${dedans.length} lieu${dedans.length > 1 ? 'x' : ''} ${rayon > 0 ? `dans un rayon de ${rayon} km` : 'en France'}` +
        (dedans.length
            ? ` — le plus proche à ${dedans[0]!.toFixed(1)} km`
            : plusProche != null
              ? ` — le plus proche est à ${plusProche.toFixed(0)} km (affiché sur la carte)`
              : '') +
        (precision > 2000 ? ` · position approximative ±${Math.round(precision / 1000)} km` : '')
    );
}
