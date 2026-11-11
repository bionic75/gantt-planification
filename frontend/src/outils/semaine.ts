// Semaine ISO 8601 (règle partagée, lot 6.5) : planification, consultation, astreintes, aide à l'affectation, mobile.
// La semaine 1 est celle qui contient le premier jeudi de l'année ; l'année de la semaine peut différer de celle du jour
// (30 décembre 2030 : semaine 1 de 2031).

export interface SemaineIso {
    semaine: number;
    /** Année de la semaine (celle de son jeudi) */
    annee: number;
}

/** Semaine ISO d'un jour du calendrier (mois de 0 à 11) */
export function semaineIsoDuJour(annee: number, mois: number, jour: number): SemaineIso {
    const d = new Date(Date.UTC(annee, mois, jour));
    // Jeudi de la même semaine (lundi = 1 … dimanche = 7)
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const debutAnnee = Date.UTC(d.getUTCFullYear(), 0, 1);
    return { semaine: Math.ceil(((d.getTime() - debutAnnee) / 86400000 + 1) / 7), annee: d.getUTCFullYear() };
}

/** Semaine ISO d'une date (calendrier local) */
export const semaineIsoDate = (date: Date): SemaineIso =>
    semaineIsoDuJour(date.getFullYear(), date.getMonth(), date.getDate());

/** Semaine ISO d'un jour « AAAA-MM-JJ » */
export function semaineIsoTexte(jour: string): SemaineIso {
    const [a, m, j] = jour.slice(0, 10).split('-').map(Number) as [number, number, number];
    return semaineIsoDuJour(a, m - 1, j);
}
