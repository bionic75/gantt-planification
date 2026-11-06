// Calculs des calendriers de consultation (vue calendrier mensuel, calendrier des congés et événements) : grille du
// mois en semaines ISO, congés scolaires, dates particulières, experts disponibles par demi-journée
import type {
    ConfigDateParticuliere,
    DateParticuliere,
    EtatPlanning,
    PeriodeConges,
    RessourcePlanning,
    ZoneConges
} from '@/liaison';

export const NOMS_MOIS = [
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

/** Semaine ISO : le lundi ouvre la ligne */
export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const deux = (n: number) => String(n).padStart(2, '0');

/** Date AAAA-MM-JJ d'un jour du mois (mois de 0 à 11) */
export const cleDate = (annee: number, mois: number, jour: number) => `${annee}-${deux(mois + 1)}-${deux(jour)}`;

/** Date AAAA-MM-JJ d'une date du calendrier local */
export const cleDateLocale = (d: Date) => cleDate(d.getFullYear(), d.getMonth(), d.getDate());

export const titreMois = (annee: number, mois: number) => `${NOMS_MOIS[mois]} ${annee}`;

/** Numéro de semaine ISO 8601 d'une date (calendrier local) */
export function semaineIso(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
}

/** Mois précédent (-1) ou suivant (+1) */
export function moisVoisin(annee: number, mois: number, sens: number): { annee: number; mois: number } {
    const d = new Date(annee, mois + sens, 1);
    return { annee: d.getFullYear(), mois: d.getMonth() };
}

export interface CaseJour {
    jour: number;
    date: string;
    weekend: boolean;
    aujourdhui: boolean;
}

export interface SemaineCalendrier {
    numero: number;
    /** Sept cases, du lundi au dimanche ; null hors du mois */
    cases: (CaseJour | null)[];
}

/** Grille d'un mois : une ligne par semaine (lundi en tête), numéro ISO de la semaine de chaque ligne */
export function grilleMois(annee: number, mois: number, maintenant = new Date()): SemaineCalendrier[] {
    const decalage = (new Date(annee, mois, 1).getDay() + 6) % 7;
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const aujourdhui = cleDateLocale(maintenant);
    const semaines: SemaineCalendrier[] = [];
    for (let ligne = 0; ligne < Math.ceil((decalage + nbJours) / 7); ligne++) {
        const cases: (CaseJour | null)[] = [];
        for (let colonne = 0; colonne < 7; colonne++) {
            const jour = ligne * 7 + colonne - decalage + 1;
            if (jour < 1 || jour > nbJours) {
                cases.push(null);
                continue;
            }
            const date = cleDate(annee, mois, jour);
            cases.push({ jour, date, weekend: colonne >= 5, aujourdhui: date === aujourdhui });
        }
        semaines.push({ numero: semaineIso(new Date(annee, mois, 1 - decalage + ligne * 7)), cases });
    }
    return semaines;
}

export const ZONES: ZoneConges[] = ['zoneA', 'zoneB', 'zoneC'];
export const NOM_ZONE: Record<ZoneConges, string> = { zoneA: 'Zone A', zoneB: 'Zone B', zoneC: 'Zone C' };

/** Date dans une période de congés de la zone (fin de période exclue) */
export const enConges = (conges: Partial<Record<ZoneConges, PeriodeConges[]>>, date: string, zone: ZoneConges) =>
    (conges[zone] ?? []).some(p => date >= p.start && date < p.end);

export const zonesEnConges = (conges: Partial<Record<ZoneConges, PeriodeConges[]>>, date: string) =>
    ZONES.filter(z => enConges(conges, date, z));

/** Dates particulières (jours fériés, événements) couvrant la date */
export const datesDuJour = (dates: DateParticuliere[], date: string) =>
    dates.filter(sd => date >= sd.date && date <= (sd.endDate || sd.date));

/** Infobulle d'un événement typé : lieu, type et libellé ; à défaut le libellé affiché */
export function infobulleEvenement(cfg: ConfigDateParticuliere, lieu: string | null, defaut: string): string {
    if (!cfg.typeLong) return defaut;
    return (
        (lieu ? `${lieu} | ` : '') + cfg.typeLong + (cfg.label && cfg.label !== cfg.typeLong ? ` — ${cfg.label}` : '')
    );
}

export interface Pastille {
    cle: string;
    libelle: string;
    infobulle: string;
    icone?: string;
    fond: string;
    texte: string;
    bordure: string;
}

/**
 * Pastille d'une date particulière : « lieu | libellé » (lieu court, « NON DÉFINI » pour un événement sans lieu)
 * @param defaut libellé sans nom (« JF » dans la vue mensuelle, « Événement » dans le calendrier des événements)
 */
export function pastille(
    sd: DateParticuliere & { config: ConfigDateParticuliere },
    defaut: string,
    rang: number
): Pastille {
    const cfg = sd.config;
    const nom = cfg.shown || cfg.label || sd.summary || defaut;
    const lieu = cfg.locationLibelleCourt ? cfg.locationLibelleCourt : cfg.eventId ? 'NON DÉFINI' : null;
    const libelle = lieu ? `${lieu} | ${nom}` : nom;
    return {
        cle: `${rang}|${cfg.eventId ?? ''}|${sd.date}|${libelle}`,
        libelle,
        infobulle: infobulleEvenement(cfg, lieu, libelle),
        icone: cfg.typeIcon || undefined,
        fond: cfg.bgColor || '#ffeb3b',
        texte: cfg.textColor || '#000',
        bordure: cfg.borderColor || '#fbc02d'
    };
}

/** Dates particulières décrites (avec apparence) : les autres ne sont pas affichées */
export const avecConfig = (dates: DateParticuliere[]) =>
    dates.filter((sd): sd is DateParticuliere & { config: ConfigDateParticuliere } => !!sd.config);

/** Période d'accès d'une ressource à la planification : historique des MAD, à défaut ses dates de début et de fin */
export function dateAccessible(r: RessourcePlanning, date: string, historique: EtatPlanning['historiqueMad']): boolean {
    let debut = r.date_debut;
    let fin = r.date_fin;
    const periodes = historique[r.id];
    if (periodes && periodes.length > 0) {
        const tri = [...periodes].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
        debut = tri[0]!.date_debut;
        fin = tri[tri.length - 1]!.date_fin;
    }
    if (!debut) return false;
    if (date < debut.slice(0, 10)) return false;
    return !fin || date <= fin.slice(0, 10);
}

/** Ressources du calendrier mensuel : actives, restreintes au filtre de la planification s'il en désigne */
export function ressourcesAffichees(etat: EtatPlanning): RessourcePlanning[] {
    const actives = etat.ressources.filter(r => r.actif);
    if (etat.filtre.length === 0 || etat.filtre.includes('')) return actives;
    const ids = etat.filtre.map(id => parseInt(id));
    return actives.filter(r => ids.includes(r.id));
}

/** Couleurs des experts, attribuées dans l'ordre des ressources affichées */
export const COULEURS_EXPERTS = [
    '#e74c3c',
    '#3498db',
    '#2ecc71',
    '#f39c12',
    '#9b59b6',
    '#1abc9c',
    '#e67e22',
    '#34495e',
    '#16a085',
    '#27ae60',
    '#2980b9',
    '#8e44ad',
    '#c0392b',
    '#d35400',
    '#7f8c8d'
];

export const couleurExpert = (rang: number) => COULEURS_EXPERTS[rang % COULEURS_EXPERTS.length]!;

/** Experts disponibles pour l'ANS (disponibilité « 2 ») sur une demi-journée, dans leur période d'accès */
export function disponibles(
    etat: EtatPlanning,
    ressources: RessourcePlanning[],
    date: string,
    periode: 'AM' | 'PM'
): RessourcePlanning[] {
    return ressources.filter(
        r =>
            dateAccessible(r, date, etat.historiqueMad) &&
            (etat.planning[`${r.id}_available_${date}_${periode}`] || '1') === '2'
    );
}
