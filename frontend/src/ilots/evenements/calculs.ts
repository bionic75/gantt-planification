// Événements : modèles, filtres, regroupement par année et par mois, mises en forme et exports (sans affichage)
import type { Evenement, Localisation, TypeEvenement } from '@/api/evenements';

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

/**
 * Modèles d'événements de l'ancien code (eventTemplates et EVENT_TPL_ICONS de l'ancien ics-events.js, supprimé) :
 * filtre « Libellé » de la liste et icône d'un événement sans type
 */
export const MODELES: Array<{ code: string; label: string; icone: string }> = [
    { code: 'formation', label: 'FORMATION', icone: 'graduation' },
    { code: 'mes', label: 'MISE EN SERVICE', icone: 'power' },
    { code: 'apd', label: 'ACCOMP. POST DÉM.', icone: 'lifebuoy' },
    { code: 'visite', label: 'VISITE TERRAIN', icone: 'pin' },
    { code: 'congres', label: 'CONGRÈS', icone: 'presentation' },
    { code: 'visiteMetier', label: 'VISITE METIER', icone: 'briefcase' },
    { code: 'vftSite', label: 'VFT SUR SITE', icone: 'clipboardCheck' },
    { code: 'verifPrereq', label: 'VERIF PREREQUIS', icone: 'listChecks' },
    { code: 'visiteOb', label: 'VISITE OB', icone: 'building' },
    { code: 'visitePostMes', label: 'VISITE POST MES', icone: 'eye' },
    { code: 'reunionLancement', label: 'RÉUNION DE LANCEMENT STRATÉGIQUE', icone: 'rocket' }
];

/** Filtre « Libellé » : événements ne correspondant à aucun modèle */
export const AUTRES = '__AUTRES__';

/** Libellés qui cochent « GRIST » (public/js/app/realtime.js : autoCheckGristByLabel) */
const LIBELLES_GRIST = ['MISE EN SERVICE', 'VISITE TERRAIN', 'CONGRES', 'VISITE METIER'];
export const cocheGrist = (libelle: string) => LIBELLES_GRIST.includes(libelle.trim().toUpperCase());

/** Libellé du modèle d'un type (code du type), pour cocher « GRIST » au choix du type */
export const libelleModele = (code: string | null | undefined) => MODELES.find(m => m.code === code)?.label ?? '';

/** Minuscules sans accents ni espaces aux extrémités */
export const normaliser = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Un événement correspond au modèle choisi si son libellé est celui du modèle ou commence par lui
 * (« CONGRES AFARM » pour « CONGRÈS »), ou si son type est celui du modèle (code du type)
 */
export function correspondAuModele(ev: Evenement, libelle: string, types: Map<number, TypeEvenement>) {
    const t = normaliser(libelle);
    if (!t) return true;
    const l = normaliser(ev.label);
    if (l === t || l.startsWith(`${t} `)) return true;
    const code = MODELES.find(m => normaliser(m.label) === t)?.code;
    const type = ev.type_id != null ? types.get(ev.type_id) : undefined;
    return !!(code && type && type.code === code);
}

export interface FiltresListe {
    libelle: string;
    localisation: string;
    participant: string;
    debut: string;
    fin: string;
}

export const SANS_FILTRE: FiltresListe = { libelle: '', localisation: '', participant: '', debut: '', fin: '' };

const filtreLibelle = (ev: Evenement, f: FiltresListe, types: Map<number, TypeEvenement>) => {
    if (!f.libelle) return true;
    if (f.libelle === AUTRES) return !MODELES.some(m => correspondAuModele(ev, m.label, types));
    return correspondAuModele(ev, f.libelle, types);
};

const nomComplet = (p: { prenom: string | null; nom: string | null }) => `${p.prenom || ''} ${p.nom || ''}`;

/** Événements affichés : libellé (modèle), localisation, participant (nom ou email), dates */
export function filtrerListe(events: Evenement[], f: FiltresListe, types: Map<number, TypeEvenement>) {
    const q = normaliser(f.participant);
    return events.filter(ev => {
        if (!filtreLibelle(ev, f, types)) return false;
        if (f.localisation && String(ev.location_id ?? '') !== f.localisation) return false;
        if (q) {
            const interne = (ev.participants || []).some(p => normaliser(nomComplet(p)).includes(q));
            const externe = (ev.external_participants || []).some(
                p => normaliser(nomComplet(p)).includes(q) || normaliser(p.email).includes(q)
            );
            if (!interne && !externe) return false;
        }
        if (f.debut && ev.start_date < f.debut) return false;
        if (f.fin && ev.end_date > f.fin) return false;
        return true;
    });
}

/**
 * Événements exportés : mêmes filtres que la liste, sauf la localisation, comparée comme dans l'ancien code à un champ
 * « location » que l'API ne fournit pas (anomalie connue : avec ce filtre, aucun événement n'est exporté)
 */
export function filtrerExport(events: Evenement[], f: FiltresListe, types: Map<number, TypeEvenement>) {
    const q = normaliser(f.participant);
    return events.filter(ev => {
        if (!filtreLibelle(ev, f, types)) return false;
        if (f.localisation && (ev as { location?: string }).location !== f.localisation) return false;
        if (f.debut && ev.start_date < f.debut) return false;
        if (f.fin && ev.end_date > f.fin) return false;
        if (q) {
            const interne = (ev.participants || []).some(p => normaliser(nomComplet(p)).includes(q));
            const externe = (ev.external_participants || []).some(p =>
                normaliser(p.email || nomComplet(p)).includes(q)
            );
            if (!interne && !externe) return false;
        }
        return true;
    });
}

export type Sens = 'asc' | 'desc';

export interface GroupeAnnee {
    annee: number;
    nombre: number;
    mois: Array<{ mois: number; evenements: Evenement[] }>;
}

/** Arborescence année > mois (date de début) ; années, mois et événements dans le sens choisi */
export function grouperParAnnee(events: Evenement[], sens: Sens): GroupeAnnee[] {
    const parAnnee = new Map<number, Map<number, Evenement[]>>();
    for (const ev of events) {
        const [a, m] = ev.start_date.split('-').map(Number);
        if (a == null || m == null) continue;
        const mois = parAnnee.get(a) ?? new Map<number, Evenement[]>();
        parAnnee.set(a, mois);
        mois.set(m - 1, [...(mois.get(m - 1) ?? []), ev]);
    }
    const ordre = (x: number, y: number) => (sens === 'desc' ? y - x : x - y);
    return [...parAnnee.entries()]
        .sort(([a], [b]) => ordre(a, b))
        .map(([annee, mois]) => ({
            annee,
            nombre: [...mois.values()].reduce((s, l) => s + l.length, 0),
            mois: [...mois.entries()]
                .sort(([a], [b]) => ordre(a, b))
                .map(([m, evenements]) => ({
                    mois: m,
                    evenements: [...evenements].sort((x, y) =>
                        sens === 'desc'
                            ? y.start_date.localeCompare(x.start_date)
                            : x.start_date.localeCompare(y.start_date)
                    )
                }))
        }));
}

// ── Mises en forme ────────────────────────────────────────────────────────

/** « AAAA-MM-JJ » → « JJ/MM/AAAA » */
export const dateFr = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '');

/** Dates affichées (« 12/05/2031 - 13/05/2031 ») et nombre de jours */
export function periodeAffichee(ev: Evenement) {
    const debut = dateFr(ev.start_date);
    const fin = dateFr(ev.end_date);
    const jour = (iso: string) => {
        const [a, m, j] = iso.split('-').map(Number);
        return Date.UTC(a ?? 0, (m ?? 1) - 1, j ?? 1);
    };
    const jours = Math.round(Math.abs(jour(ev.end_date) - jour(ev.start_date)) / 86400000) + 1;
    return { texte: debut === fin ? debut : `${debut} - ${fin}`, jours };
}

/** « Créé le JJ/MM/AAAA HH:MM par » (horodatage UTC affiché à l'heure locale), à défaut « Créé par » */
export function mentionCreation(createdAt: string | null) {
    if (createdAt) {
        const d = new Date(`${createdAt.replace(' ', 'T')}Z`);
        if (!isNaN(d.getTime())) {
            const z = (n: number) => String(n).padStart(2, '0');
            return `Créé le ${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())} par `;
        }
    }
    return 'Créé par ';
}

export const nomCreateur = (ev: Evenement) =>
    `${ev.creator_prenom || ''} ${(ev.creator_nom || '').toUpperCase()}`.trim() || 'Système';

export const nomParticipant = (p: { prenom: string | null; nom: string | null }) =>
    `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();

export const initiales = (prenom: string | null | undefined, nom: string | null | undefined) =>
    ((prenom || '')[0] || '').toUpperCase() + ((nom || '')[0] || '').toUpperCase();

/** Couleurs des pastilles de participants (formulaire et liste des événements) */
export const COULEURS_PARTICIPANTS = [
    '#e91e63',
    '#9c27b0',
    '#673ab7',
    '#3f51b5',
    '#2196f3',
    '#009688',
    '#4caf50',
    '#ff9800',
    '#795548',
    '#607d8b'
];

/** Couleur stable selon le nom */
export function couleurParticipant(nom: string) {
    let h = 0;
    for (let i = 0; i < nom.length; i++) h = nom.charCodeAt(i) + ((h << 5) - h);
    return COULEURS_PARTICIPANTS[Math.abs(h) % COULEURS_PARTICIPANTS.length] as string;
}

/** Couleurs de l'événement (fond, texte, bordure) */
export function couleurs(ev: Pick<Evenement, 'config'>) {
    let c: { bgColor?: string; textColor?: string; borderColor?: string };
    try {
        c = (typeof ev.config === 'string' ? JSON.parse(ev.config) : ev.config) ?? {};
    } catch {
        c = {};
    }
    return { fond: c.bgColor || '#ffeb3b', texte: c.textColor || '#000', bordure: c.borderColor || '#fbc02d' };
}

/** Événement typé (hors type « Autre ») : libellé court du type, sinon libellé de l'événement */
export const aUnType = (ev: Evenement) => !!(ev.type_long && !ev.type_other);
export const libelleCourt = (ev: Evenement) => (aUnType(ev) ? ev.type_short || ev.type_long || '' : ev.label || '');

/** Icône : celle du type, ou celle du modèle reconnu dans le libellé (événement sans type) */
export function iconeEvenement(ev: Evenement) {
    if (aUnType(ev)) return ev.type_icon || '';
    const l = normaliser(ev.label);
    const modele = [...MODELES]
        .sort((a, b) => b.label.length - a.label.length)
        .find(m => {
            const t = normaliser(m.label);
            return l === t || l.startsWith(`${t} `);
        });
    return modele?.icone ?? '';
}

/** Localisation en préfixe (« SAMU 75 | Formation ») */
export function libelleAffiche(ev: Evenement, localisations: Localisation[]) {
    const loc = ev.location_id
        ? (localisations.find(l => l.id === ev.location_id)?.libelle_court ?? 'NON DÉFINI')
        : null;
    return loc ? `${loc} | ${libelleCourt(ev)}` : libelleCourt(ev);
}

// ── Exports ───────────────────────────────────────────────────────────────

const echapper = (v: unknown) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
    );

const ENTETES = [
    'Type',
    'Libellé',
    'Date début',
    'Date fin',
    'Localisation',
    'Participants internes',
    'Participants externes',
    'Description'
];

/** Champs exportés absents de l'API (anomalie connue de l'ancien code : colonnes toujours vides) */
const absent = (ev: Evenement, champ: 'location' | 'description') =>
    (ev as unknown as Record<string, string | undefined>)[champ];

/** CSV (séparateur « , », valeurs entre guillemets, BOM pour Excel) */
export function exportCsv(events: Evenement[]) {
    const lignes = events.map(ev => {
        const internes = (ev.participants || []).map(p => nomComplet(p).trim()).join('; ');
        const externes = (ev.external_participants || []).map(p => p.email || nomComplet(p).trim()).join('; ');
        return [
            ev.type_long || '',
            ev.label || '',
            ev.start_date || '',
            ev.end_date || '',
            absent(ev, 'location') || '',
            internes,
            externes,
            (absent(ev, 'description') || '').replace(/\n/g, ' ')
        ]
            .map(v => `"${String(v).replace(/"/g, '""')}"`)
            .join(',');
    });
    return `\uFEFF${[ENTETES.join(','), ...lignes].join('\n')}`;
}

/** Page HTML autonome (tableau) */
export function exportHtml(events: Evenement[], aujourdhui = new Date()) {
    const lignes = events
        .map(ev => {
            const internes = (ev.participants || [])
                .map(p => nomComplet(p).trim())
                .filter(Boolean)
                .join(', ');
            const externes = (ev.external_participants || [])
                .map(p => p.email || nomComplet(p).trim())
                .filter(Boolean)
                .join(', ');
            let cfg: { bgColor?: string; textColor?: string };
            try {
                cfg = (typeof ev.config === 'string' ? JSON.parse(ev.config || '{}') : ev.config) ?? {};
            } catch {
                cfg = {};
            }
            const badge = aUnType(ev)
                ? `<span style="background:${cfg.bgColor || '#607d8b'};color:${cfg.textColor || '#fff'};padding:2px 8px;border-radius:4px;font-size:11px;">${echapper(libelleCourt(ev))}</span>`
                : '';
            return `<tr><td>${badge}${aUnType(ev) ? ` ${echapper(ev.type_long)}` : ''}</td><td>${echapper(ev.label || '')}</td><td>${ev.start_date || ''}</td><td>${ev.end_date || ''}</td><td>${absent(ev, 'location') || ''}</td><td>${internes}</td><td>${externes}</td><td>${(absent(ev, 'description') || '').replace(/\n/g, '<br>')}</td></tr>`;
        })
        .join('');
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Événements exportés</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}table{border-collapse:collapse;width:100%;}th{background:#1565c0;color:#fff;padding:8px;text-align:left;}td{border:1px solid #ddd;padding:6px;}tr:nth-child(even){background:#f5f5f5;}</style></head><body><h2>Événements — export du ${aujourdhui.toLocaleDateString('fr-FR')}</h2><table><thead><tr>${ENTETES.map(e => `<th>${e}</th>`).join('')}</tr></thead><tbody>${lignes}</tbody></table></body></html>`;
}

/** Téléchargement d'un fichier construit dans le navigateur */
export function telecharger(nomFichier: string, contenu: string, type: string) {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type }));
    lien.download = nomFichier;
    lien.click();
}

export const nomFichierDuJour = (extension: string) =>
    `evenements_${new Date().toISOString().slice(0, 10)}.${extension}`;
