// Reporting : périodes, totaux et mises en forme des quatre rapports (sans affichage)
import type {
    EvenementTrouve,
    LigneConnexions,
    PeriodeMois,
    RapportDisponibilites,
    RapportHno,
    StatsMois
} from '@/api/reporting';

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
export const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
/** Années proposées dans les listes (comme l'ancien écran) */
export const ANNEES = [2024, 2025, 2026, 2027, 2028];

const deux = (n: number) => String(n).padStart(2, '0');

// ── Périodes ──────────────────────────────────────────────────────────────

/** Disponibilités : du mois courant au troisième mois suivant */
export function periodeDisponibilites(maintenant = new Date()): PeriodeMois {
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 3, 1);
    return {
        startMonth: maintenant.getMonth(),
        startYear: maintenant.getFullYear(),
        endMonth: fin.getMonth(),
        endYear: fin.getFullYear()
    };
}

/** HNO / astreintes : année en cours, de janvier à décembre */
export const periodeHno = (maintenant = new Date()): PeriodeMois => ({
    startMonth: 0,
    startYear: maintenant.getFullYear(),
    endMonth: 11,
    endYear: maintenant.getFullYear()
});

/** Début (1er du mois de début) au plus tard à la fin (dernier jour du mois de fin) */
export const periodeValide = (p: PeriodeMois) =>
    new Date(p.startYear, p.startMonth, 1) <= new Date(p.endYear, p.endMonth + 1, 0);

/** Connexions, mode mensuel : premier et dernier jour du mois (mois « 01 » à « 12 ») */
export function bornesDuMois(mois: string, annee: string) {
    const dernier = new Date(Number(annee), Number(mois), 0);
    return {
        dateStart: `${annee}-${mois}-01`,
        dateEnd: `${dernier.getFullYear()}-${deux(dernier.getMonth() + 1)}-${deux(dernier.getDate())}`
    };
}

// ── Disponibilités / affectations ─────────────────────────────────────────

export type NiveauTaux = 'vide' | 'faible' | 'moyen' | 'optimal';

/** Couleur d'une cellule : sans jour disponible (gris), < 50 %, 50 à 74 %, ≥ 75 % */
export function niveauTaux(taux: number, disponible: number | null = null): NiveauTaux {
    if (disponible === 0) return 'vide';
    return taux >= 75 ? 'optimal' : taux >= 50 ? 'moyen' : 'faible';
}

const cleMoisDispo = (m: { year: number; month: number }) => `${m.year}-${deux(m.month + 1)}`;
const STATS_VIDES: StatsMois = { available: 0, assigned: 0, leave: 0, rate: 0 };

export interface LigneDisponibilites {
    id: number;
    nom: string;
    tauxMad: number;
    joursMad: string;
    mois: StatsMois[];
    disponible: number;
    affecte: number;
    taux: number;
}

/** Lignes par expert (avec totaux), totaux par mois et total général */
export function tableauDisponibilites(r: RapportDisponibilites) {
    const parMois = r.months.map(() => ({ disponible: 0, affecte: 0 }));
    const lignes: LigneDisponibilites[] = r.experts.map(e => {
        const mois = r.months.map(m => e.monthlyStats[cleMoisDispo(m)] ?? STATS_VIDES);
        let disponible = 0;
        let affecte = 0;
        mois.forEach((s, i) => {
            disponible += s.available;
            affecte += s.assigned;
            const total = parMois[i];
            if (total) {
                total.disponible += s.available;
                total.affecte += s.assigned;
            }
        });
        return {
            id: e.id,
            nom: e.name,
            tauxMad: e.tauxMad,
            joursMad: ((e.tauxMad / 100) * (e.avgWorkingDaysPerMonth || 22)).toFixed(1),
            mois,
            disponible,
            affecte,
            taux: disponible > 0 ? (affecte / disponible) * 100 : 0
        };
    });
    const total = parMois.reduce(
        (t, m) => ({ disponible: t.disponible + m.disponible, affecte: t.affecte + m.affecte }),
        {
            disponible: 0,
            affecte: 0
        }
    );
    return { lignes, parMois, total };
}

/** Tri par nom d'expert ; sans sens : ordre du serveur */
export function trierParNom<T extends { nom: string }>(lignes: T[], sens: 'asc' | 'desc' | null): T[] {
    if (!sens) return lignes;
    return [...lignes].sort((a, b) => {
        const c = a.nom.toLowerCase().localeCompare(b.nom.toLowerCase());
        return sens === 'asc' ? c : -c;
    });
}

// ── HNO / astreintes ──────────────────────────────────────────────────────

/** Mois de la période : clé « AAAA-m » (mois de 0 à 11) et libellé court */
export function moisDeLaPeriode(p: PeriodeMois) {
    const mois: Array<{ cle: string; libelle: string }> = [];
    const d = new Date(p.startYear, p.startMonth, 1);
    const fin = new Date(p.endYear, p.endMonth, 1);
    while (d <= fin) {
        mois.push({
            cle: `${d.getFullYear()}-${d.getMonth()}`,
            libelle: `${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`
        });
        d.setMonth(d.getMonth() + 1);
    }
    return mois;
}

/** Valeurs par expert et par mois, totaux par expert, par mois et général */
export function tableauHno(r: RapportHno, mois: Array<{ cle: string }>) {
    const parMois = mois.map(() => ({ hno: 0, astreintes: 0 }));
    const lignes = r.experts.map(e => {
        const valeurs = mois.map(m => e.monthlyData[m.cle] ?? { hno: 0, astreintes: 0 });
        valeurs.forEach((v, i) => {
            const t = parMois[i];
            if (t) {
                t.hno += v.hno || 0;
                t.astreintes += v.astreintes || 0;
            }
        });
        return {
            id: e.resource_id,
            nom: `${e.prenom} ${e.nom}`,
            valeurs,
            hno: valeurs.reduce((s, v) => s + (v.hno || 0), 0),
            astreintes: valeurs.reduce((s, v) => s + (v.astreintes || 0), 0)
        };
    });
    const total = parMois.reduce((t, m) => ({ hno: t.hno + m.hno, astreintes: t.astreintes + m.astreintes }), {
        hno: 0,
        astreintes: 0
    });
    return { lignes, parMois, total };
}

/** Valeur d'une cellule : « - » pour zéro */
export const ouTiret = (n: number) => (n ? String(n) : '-');

// ── Événements ────────────────────────────────────────────────────────────

/** « AAAA-MM-JJ » → « JJ/MM/AAAA » */
export function dateFr(d: string | null | undefined) {
    if (!d) return '-';
    const [a, m, j] = d.split('-');
    return `${j}/${m}/${a}`;
}

export const libellePeriode = (p: string | null) =>
    p === 'AM' ? '☀️ Matin' : p === 'PM' ? '🌙 Après-midi' : 'Journée entière';

export const nomAffiche = (prenom: string | null | undefined, nom: string | null | undefined) =>
    `${prenom || ''} ${(nom || '').toUpperCase()}`.trim();

/** Couleurs de l'étiquette d'un événement (configuration de son type) */
export function couleursEvenement(e: EvenementTrouve) {
    let cfg: { bgColor?: string; textColor?: string; borderColor?: string };
    try {
        cfg = (typeof e.config === 'string' ? JSON.parse(e.config) : e.config) ?? {};
    } catch {
        cfg = {};
    }
    return { fond: cfg.bgColor || '#ffeb3b', texte: cfg.textColor || '#000', bordure: cfg.borderColor || '#ccc' };
}

// ── Connexions ────────────────────────────────────────────────────────────

export const libelleProfil = (p: string) =>
    p === 'admin' ? 'Administrateur' : p === 'expert' ? 'Expert Métier' : p === 'rh' ? 'RH' : 'Utilisateur';

/** Horodatage UTC du serveur → « JJ/MM/AAAA HH:MM » à Paris */
export function dateConnexion(brut: string | null) {
    if (!brut) return '—';
    const t = brut.endsWith('Z') || brut.includes('+') ? brut : `${brut}Z`;
    return new Date(t).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export interface UtilisateurConnexions {
    nom: string;
    login: string;
    profils: Array<{ profil: string; nb: number }>;
    total: number;
    derniere: string | null;
}

/** Une ligne par utilisateur (le serveur renvoie une ligne par profil utilisé), profils du plus utilisé au moins utilisé */
export function regrouperConnexions(lignes: LigneConnexions[]): UtilisateurConnexions[] {
    const parLogin = new Map<string, UtilisateurConnexions>();
    for (const r of lignes) {
        const cle = (r.username || '').toLowerCase();
        let u = parLogin.get(cle);
        if (!u) {
            u = {
                nom: `${r.prenom || ''} ${r.nom || ''}`.trim(),
                login: r.username || '',
                profils: [],
                total: 0,
                derniere: null
            };
            parLogin.set(cle, u);
        }
        u.total += r.nb_connexions || 0;
        u.profils.push({ profil: String(r.profile), nb: r.nb_connexions || 0 });
        if (!u.derniere || (r.derniere_connexion && r.derniere_connexion > u.derniere))
            u.derniere = r.derniere_connexion;
    }
    for (const u of parLogin.values()) u.profils.sort((a, b) => b.nb - a.nb);
    return [...parLogin.values()];
}

export type CleTriConnexions = 'nom' | 'login' | 'profil' | 'total' | 'last';
export interface TriConnexions {
    cle: CleTriConnexions;
    /** 1 croissant, -1 décroissant */
    sens: 1 | -1;
}

/** Tri initial : nombre de connexions décroissant */
export const TRI_CONNEXIONS: TriConnexions = { cle: 'total', sens: -1 };

/** Clic sur une colonne : sens inversé, ou nouvelle colonne (nombres et dates : décroissant d'abord) */
export function basculerTri(t: TriConnexions, cle: CleTriConnexions): TriConnexions {
    if (t.cle === cle) return { cle, sens: t.sens === 1 ? -1 : 1 };
    return { cle, sens: cle === 'total' || cle === 'last' ? -1 : 1 };
}

const valeurTri: Record<CleTriConnexions, (u: UtilisateurConnexions) => string | number> = {
    nom: u => u.nom,
    login: u => u.login,
    profil: u =>
        u.profils
            .map(p => libelleProfil(p.profil))
            .sort()
            .join(' '),
    total: u => u.total,
    last: u => u.derniere || ''
};

/** Tri (à égalité : plus de connexions d'abord) */
export function trierConnexions(utilisateurs: UtilisateurConnexions[], t: TriConnexions) {
    const v = valeurTri[t.cle];
    return [...utilisateurs].sort((a, b) => {
        const x = v(a);
        const y = v(b);
        const c =
            typeof x === 'number' && typeof y === 'number'
                ? x - y
                : String(x).localeCompare(String(y), 'fr', { numeric: true });
        return c * t.sens || b.total - a.total;
    });
}
