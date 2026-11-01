// Accueil : déploiements en cours sur une frise mensuelle (barres : cadrage, déploiement opérationnel ; points :
// visite métier, mise en service, mise en production, VFT, formation), sans affichage
import { ajouterJours } from './calculs';

export interface PeriodeDeploiement {
    start: string;
    end: string;
}

/** Déploiement (GET /affectation/projects) */
export interface Deploiement {
    id: number;
    samu_name: string;
    date_debut: string | null;
    date_mise_en_service: string | null;
    date_mise_en_production: string | null;
    periods: Record<string, PeriodeDeploiement[]>;
}

/** Couleurs choisies pour les étapes (GET /affectation/config) */
export interface ConfigDeploiements {
    colors: Record<string, string>;
    stages: Array<{ key: string; label: string; defaultColor: string }>;
}

/** Étapes dessinées en barre (dans l'ordre des voies) */
export const ETAPES_BARRE = ['cadrage', 'deploiement'] as const;
/** Étapes dessinées en point : période (début de la période) ou date unique */
export const ETAPES_POINT = [
    'visite_metier',
    'mise_en_service',
    'mise_en_production',
    'vft',
    'formation_utilisateurs'
] as const;

export const LIBELLES_ETAPES: Record<string, string> = {
    cadrage: 'Cadrage',
    deploiement: 'Déploiement opérationnel',
    visite_metier: 'Visite métier',
    mise_en_service: 'Mise en service',
    mise_en_production: 'Mise en production',
    vft: 'VFT',
    formation_utilisateurs: 'Formation'
};

export const COULEURS_DEFAUT: Record<string, string> = {
    cadrage: '#7e57c2',
    deploiement: '#1976d2',
    visite_metier: '#ab47bc',
    mise_en_service: '#e53935',
    mise_en_production: '#2e7d32',
    vft: '#43a047',
    formation_utilisateurs: '#ef6c00'
};

export interface MoisFrise {
    /** Premier jour du mois, « AAAA-MM-01 » */
    debut: string;
    libelle: string;
    /** Largeur du mois en % de la frise */
    largeur: number;
}

export interface Frise {
    /** Premier jour du premier mois et dernier jour du dernier mois */
    debut: string;
    fin: string;
    mois: MoisFrise[];
    /** Nombre de jours couverts */
    jours: number;
}

export interface Barre {
    cle: string;
    libelle: string;
    couleur: string;
    debut: string;
    fin: string;
    /** Position et largeur en % de la frise (partie visible) */
    gauche: number;
    largeur: number;
    /** La barre commence avant la frise / se poursuit après */
    coupeeAvant: boolean;
    coupeeApres: boolean;
}

export interface Point {
    cle: string;
    libelle: string;
    couleur: string;
    date: string;
    fin: string | null;
    gauche: number;
}

export interface LigneDeploiement {
    id: number;
    nom: string;
    barres: Barre[];
    points: Point[];
    /** Première et dernière date connues du déploiement */
    premiere: string;
    derniere: string;
}

const DEUX = (n: number) => String(n).padStart(2, '0');

/** Premier jour du mois d'une date « AAAA-MM-JJ », décalé de n mois */
export function debutMoisDecale(cle: string, n: number): string {
    const [a, m] = cle.split('-').map(Number);
    const d = new Date((a ?? 1970) + Math.floor(((m ?? 1) - 1 + n) / 12), ((((m ?? 1) - 1 + n) % 12) + 12) % 12, 1);
    return `${d.getFullYear()}-${DEUX(d.getMonth() + 1)}-01`;
}

/** Frise de nb mois à partir du mois de la date */
export function friseMois(cle: string, nb: number): Frise {
    const debut = debutMoisDecale(cle, 0);
    const mois: MoisFrise[] = [];
    for (let i = 0; i < nb; i++) {
        const m = debutMoisDecale(debut, i);
        const [a, mm] = m.split('-').map(Number);
        const libelle = new Date(a ?? 1970, (mm ?? 1) - 1, 1)
            .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
            .replace('.', '');
        mois.push({ debut: m, libelle, largeur: 0 });
    }
    const fin = ajouterJours(debutMoisDecale(debut, nb), -1);
    const jours = joursEntre(debut, fin) + 1;
    for (const m of mois) m.largeur = (joursEntre(m.debut, debutMoisDecale(m.debut, 1)) / jours) * 100;
    return { debut, fin, mois, jours };
}

/** Nombre de jours de a à b (négatif si b précède a) */
export function joursEntre(a: string, b: string): number {
    const t = (c: string) => Date.UTC(Number(c.slice(0, 4)), Number(c.slice(5, 7)) - 1, Number(c.slice(8, 10)));
    return Math.round((t(b) - t(a)) / 86400000);
}

/** Position d'un jour en % de la frise (début du jour) */
export function pourcent(frise: Frise, date: string): number {
    return (joursEntre(frise.debut, date) / frise.jours) * 100;
}

const dateValide = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Lignes de la frise : déploiements dont une date tombe dans la frise et qui ne sont pas terminés avant le mois en cours.
 * Triées par première date puis par nom.
 */
export function lignesDeploiements(
    deploiements: Deploiement[],
    frise: Frise,
    aujourdhui: string,
    couleurs: Record<string, string> = {}
): LigneDeploiement[] {
    const couleur = (cle: string) => couleurs[cle] || COULEURS_DEFAUT[cle] || '#888888';
    const debutMoisCourant = debutMoisDecale(aujourdhui, 0);
    const lignes: LigneDeploiement[] = [];
    for (const d of deploiements) {
        const periodes = (cle: string) =>
            (d.periods?.[cle] ?? []).filter(p => dateValide(p.start) && dateValide(p.end));
        const barres: Barre[] = [];
        for (const cle of ETAPES_BARRE) {
            for (const p of periodes(cle)) {
                if (p.end < frise.debut || p.start > frise.fin) continue;
                const debut = p.start < frise.debut ? frise.debut : p.start;
                const fin = p.end > frise.fin ? frise.fin : p.end;
                barres.push({
                    cle,
                    libelle: LIBELLES_ETAPES[cle] ?? cle,
                    couleur: couleur(cle),
                    debut: p.start,
                    fin: p.end,
                    gauche: pourcent(frise, debut),
                    largeur: ((joursEntre(debut, fin) + 1) / frise.jours) * 100,
                    coupeeAvant: p.start < frise.debut,
                    coupeeApres: p.end > frise.fin
                });
            }
        }
        const points: Point[] = [];
        const ajouterPoint = (cle: string, date: string, fin: string | null) => {
            if (date < frise.debut || date > frise.fin) return;
            points.push({
                cle,
                libelle: LIBELLES_ETAPES[cle] ?? cle,
                couleur: couleur(cle),
                date,
                fin,
                // Centre du jour
                gauche: pourcent(frise, date) + 50 / frise.jours
            });
        };
        for (const cle of ETAPES_POINT) {
            if (cle === 'mise_en_service' || cle === 'mise_en_production') {
                const date = cle === 'mise_en_service' ? d.date_mise_en_service : d.date_mise_en_production;
                if (dateValide(date)) ajouterPoint(cle, date, null);
            } else for (const p of periodes(cle)) ajouterPoint(cle, p.start, p.end !== p.start ? p.end : null);
        }
        if (!barres.length && !points.length) continue;
        // Dates connues du déploiement (hors frise comprises) : un déploiement terminé avant le mois en cours est écarté
        const toutes = [
            d.date_debut,
            d.date_mise_en_service,
            d.date_mise_en_production,
            ...Object.values(d.periods ?? {}).flatMap(ps => ps.flatMap(p => [p.start, p.end]))
        ].filter(dateValide);
        const derniere = [...toutes].sort().at(-1) ?? frise.fin;
        if (derniere < debutMoisCourant) continue;
        lignes.push({
            id: d.id,
            nom: d.samu_name,
            barres,
            points,
            premiere: [...toutes].sort()[0] ?? frise.debut,
            derniere
        });
    }
    return lignes.sort(
        (a, b) => a.premiere.localeCompare(b.premiere) || a.nom.localeCompare(b.nom, 'fr', { numeric: true })
    );
}
