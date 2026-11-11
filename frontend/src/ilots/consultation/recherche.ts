// Recherche avancée : demi-journées des experts actifs répondant aux critères (disponibilité, affectation,
// localisation) sur un intervalle de dates, et classement des créneaux par nombre d'experts
import type { EtatPlanning, RessourcePlanning } from '@/evenements';
import { cleDateLocale } from './calendrier';

/** Intervalle proposé : du premier au dernier jour du mois courant (dates du calendrier local) */
export function intervalleParDefaut(maintenant = new Date()): { debut: string; fin: string } {
    return {
        debut: cleDateLocale(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)),
        fin: cleDateLocale(new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0))
    };
}

export const DISPONIBILITES = [
    { valeur: '1', libelle: 'Indisponible' },
    { valeur: '2', libelle: "Disponible pour l'ANS" },
    { valeur: '3', libelle: 'Congés' }
];

export const AFFECTATIONS = [
    { valeur: '1', libelle: 'Indisponible' },
    { valeur: '2', libelle: "En attente d'affectation" },
    { valeur: '3', libelle: 'SAMU (Déploiement)' },
    { valeur: '4', libelle: 'SAMU (Dev. usages)' },
    { valeur: '5', libelle: 'ANS (Déploiement)' },
    { valeur: '6', libelle: 'ANS (Dev. usages)' },
    { valeur: '7', libelle: 'Qualification' },
    { valeur: '8', libelle: 'Divers' }
];

const nomComplet = (r: RessourcePlanning) => `${r.nom} ${r.prenom}`;

/** Experts proposés : ressources actives, par nom et prénom */
export const expertsProposes = (etat: EtatPlanning) =>
    etat.ressources.filter(r => r.actif).sort((a, b) => nomComplet(a).localeCompare(nomComplet(b)));

/** Localisations proposées : celles saisies dans la planification (hors « - »), triées */
export function localisationsProposees(etat: EtatPlanning): string[] {
    const valeurs = new Set<string>();
    for (const [cle, valeur] of Object.entries(etat.planning)) {
        if (cle.includes('_localisation_') && valeur && valeur !== '-') valeurs.add(valeur);
    }
    return [...valeurs].sort();
}

export interface Criteres {
    /** Experts choisis ; aucun : tous les experts actifs */
    experts: number[];
    debut: string;
    fin: string;
    /** Valeurs choisies ; aucune : critère ignoré */
    disponibilites: string[];
    affectations: string[];
    localisations: string[];
}

export interface Correspondance {
    date: string;
    periode: 'AM' | 'PM';
}

export interface ResultatExpert {
    ressource: RessourcePlanning;
    correspondances: Correspondance[];
}

/** Jours de l'intervalle, bornes comprises (AAAA-MM-JJ) */
export function joursEntre(debut: string, fin: string): string[] {
    const jours: string[] = [];
    const finUtc = new Date(`${fin}T00:00:00Z`);
    for (const d = new Date(`${debut}T00:00:00Z`); d <= finUtc; d.setUTCDate(d.getUTCDate() + 1)) {
        jours.push(d.toISOString().slice(0, 10));
    }
    return jours;
}

/** Demi-journées répondant aux critères, par expert (experts sans correspondance exclus) */
export function rechercher(etat: EtatPlanning, criteres: Criteres): ResultatExpert[] {
    const actives = etat.ressources.filter(r => r.actif);
    const ressources = criteres.experts.length > 0 ? actives.filter(r => criteres.experts.includes(r.id)) : actives;
    const jours = joursEntre(criteres.debut, criteres.fin);
    const retenu = (choix: string[], valeur: string) => choix.length === 0 || choix.includes(valeur);
    const resultats: ResultatExpert[] = [];
    for (const ressource of ressources) {
        const correspondances: Correspondance[] = [];
        for (const date of jours) {
            for (const periode of ['AM', 'PM'] as const) {
                const valeur = (type: string, defaut: string) =>
                    etat.planning[`${ressource.id}_${type}_${date}_${periode}`] || defaut;
                if (
                    retenu(criteres.disponibilites, valeur('available', '1')) &&
                    retenu(criteres.affectations, valeur('activity', '1')) &&
                    retenu(criteres.localisations, valeur('localisation', '-'))
                )
                    correspondances.push({ date, periode });
            }
        }
        if (correspondances.length > 0) resultats.push({ ressource, correspondances });
    }
    return resultats;
}

const jourMois = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Détail d'un expert : 5 premières dates « JJ/MM (AM/PM) », puis le nombre de dates restantes */
export function detailExpert(correspondances: Correspondance[]): string {
    const parDate = new Map<string, string[]>();
    for (const c of correspondances) parDate.set(c.date, [...(parDate.get(c.date) ?? []), c.periode]);
    const dates = [...parDate.entries()];
    let detail = dates
        .slice(0, 5)
        .map(([date, periodes]) => `${jourMois(date)} (${periodes.join('/')})`)
        .join(', ');
    if (dates.length > 5) detail += `, ... (+${dates.length - 5})`;
    return detail;
}

export interface Creneau {
    date: string;
    periode: 'AM' | 'PM';
    experts: RessourcePlanning[];
}

/** Créneaux (date et demi-journée) par nombre d'experts décroissant ; à égalité, dans l'ordre de découverte */
export function classerCreneaux(resultats: ResultatExpert[]): Creneau[] {
    const creneaux = new Map<string, Creneau>();
    for (const { ressource, correspondances } of resultats) {
        for (const { date, periode } of correspondances) {
            const cle = `${date}_${periode}`;
            const creneau = creneaux.get(cle) ?? { date, periode, experts: [] };
            creneau.experts.push(ressource);
            creneaux.set(cle, creneau);
        }
    }
    return [...creneaux.values()].sort((a, b) => b.experts.length - a.experts.length);
}

/** Créneaux affichés au plus */
export const CRENEAUX_AFFICHES = 20;

/** Trigramme d'un expert ; à défaut initiale du prénom et deux premières lettres du nom */
export const trigrammeExpert = (r: RessourcePlanning) =>
    r.trigramme || `${r.prenom.charAt(0)}${r.nom.substring(0, 2).toUpperCase()}`;

/** Jour d'un créneau : « lun. » et « 01/09/2031 » */
export function jourCreneau(date: string): { jour: string; date: string } {
    const d = new Date(`${date}T12:00:00`);
    return {
        jour: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    };
}

/** Rang des trois premiers créneaux : or, argent, bronze */
export const COULEURS_RANG = ['#f1c40f', '#95a5a6', '#cd7f32'];
