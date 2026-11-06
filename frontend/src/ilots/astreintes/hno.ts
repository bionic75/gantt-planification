// Astreintes HNO : mois proposés, règles FPH (Décret n°2002-9 du 4 janvier 2002), compteurs et calendrier des
// disponibilités, experts proposés pour un créneau, export CSV du planning
import type { CreneauPlanningHno, DisponibiliteHno } from '@/api/astreintes';
import type { Ressource } from '@/api/ressources';

const deux = (n: number) => String(n).padStart(2, '0');

/** Date locale d'une chaîne « AAAA-MM-JJ » (sans décalage UTC) */
const dateLocale = (iso: string) => {
    const [a, m, j] = iso.split('-').map(Number);
    return new Date(a!, m! - 1, j!);
};

/** Mois proposés : le mois courant et les 3 suivants (« AAAA-MM », « Mars 2031 ») */
export function moisProposes(maintenant = new Date()) {
    return Array.from({ length: 4 }, (_, i) => {
        const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + i, 1);
        const libelle = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        return {
            valeur: `${d.getFullYear()}-${deux(d.getMonth() + 1)}`,
            libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1)
        };
    });
}

// ---------- Volontaires ----------

/** Ressources actives triées par « nom prénom » ; volontaires seulement si demandé */
export const ressourcesActives = (ressources: Ressource[], volontairesSeulement = false) =>
    ressources
        .filter(r => r.actif && (!volontairesSeulement || r.astreinte_volontaire === 1))
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));

export const nomExpert = (r: Pick<Ressource, 'nom' | 'prenom'>) => `${r.nom.toUpperCase()} ${r.prenom}`;

// ---------- Disponibilités ----------

/** Heures d'un créneau : 24 h le week-end (journée), 14 h en semaine (soir) */
const heuresDuJour = (jourSemaine: number) => (jourSemaine === 0 || jourSemaine === 6 ? 24 : 14);

export interface Compteurs {
    jours: number;
    heures: number;
    samedis: number;
    dimanches: number;
}

/** Compteurs du mois pour une liste de jours disponibles */
export function compteurs(dates: string[], annee: number, mois: number): Compteurs {
    const c: Compteurs = { jours: 0, heures: 0, samedis: 0, dimanches: 0 };
    for (const iso of dates) {
        const d = dateLocale(iso);
        if (d.getFullYear() !== annee || d.getMonth() + 1 !== mois) continue;
        const j = d.getDay();
        c.jours++;
        c.heures += heuresDuJour(j);
        if (j === 6) c.samedis++;
        if (j === 0) c.dimanches++;
    }
    return c;
}

/** Niveau des compteurs : heures (vert, orange au-delà de 100 h, rouge au-delà de 144 h), samedis et dimanches */
export const niveauHeures = (h: number) => (h > 144 ? 'alerte' : h > 100 ? 'attention' : 'ok');
export const niveauJour = (n: number) => (n > 1 ? 'alerte' : n === 1 ? 'ok' : 'neutre');

/** Alertes du résumé du mois */
export function alertes(c: Compteurs): string[] {
    const liste: string[] = [];
    if (c.heures > 144)
        liste.push(`⚠️ ${c.heures}h d'astreinte déclarées ce mois (max 144h ≈ 2x72h pour 2 périodes de 15 jours)`);
    if (c.samedis > 1) liste.push(`⚠️ ${c.samedis} samedis déclarés (max 1 samedi/mois selon décret FPH)`);
    if (c.dimanches > 1) liste.push(`⚠️ ${c.dimanches} dimanches déclarés (max 1 dimanche/mois selon décret FPH)`);
    return liste;
}

/** Jour rendu disponible : avertissements des règles FPH qui l'interdisent (liste vide si accepté) */
export function refusDisponibilite(dates: string[], nouveau: string, annee: number, mois: number): string[] {
    const c = compteurs(dates, annee, mois);
    const j = dateLocale(nouveau).getDay();
    const refus: string[] = [];
    if (j === 6 && c.samedis >= 1)
        refus.push(
            `⚠️ Vous avez déjà déclaré ${c.samedis} samedi ce mois.\nSelon le Décret n°2002-9, un agent ne peut participer au service d'astreinte que dans la limite d'1 samedi par mois.`
        );
    if (j === 0 && c.dimanches >= 1)
        refus.push(
            `⚠️ Vous avez déjà déclaré ${c.dimanches} dimanche ce mois.\nSelon le Décret n°2002-9, un agent ne peut participer au service d'astreinte que dans la limite d'1 dimanche par mois.`
        );
    const total = c.heures + heuresDuJour(j);
    if (total > 144)
        refus.push(
            `⚠️ Vous atteignez ${total}h d'astreinte ce mois.\nSelon le Décret n°2002-9, la durée de l'astreinte ne peut excéder 72h pour 15 jours (soit ~144h/mois max).`
        );
    return refus;
}

/** Semaines du calendrier (lundi → dimanche), jours hors du mois à null */
export function semainesDuMois(annee: number, mois: number): Array<Array<{ jour: number; date: string } | null>> {
    const nbJours = new Date(annee, mois, 0).getDate();
    const premier = new Date(annee, mois - 1, 1).getDay();
    const decalage = premier === 0 ? 6 : premier - 1;
    const semaines = [];
    let jour = 1;
    for (let s = 0; s < Math.ceil((nbJours + decalage) / 7); s++) {
        const semaine = [];
        for (let i = 0; i < 7; i++) {
            if (s * 7 + i < decalage || jour > nbJours) semaine.push(null);
            else {
                semaine.push({ jour, date: `${annee}-${deux(mois)}-${deux(jour)}` });
                jour++;
            }
        }
        semaines.push(semaine);
    }
    return semaines;
}

// ---------- Planning ----------

/** Libellés d'un créneau du planning */
export function creneau(c: Pick<CreneauPlanningHno, 'date' | 'type_creneau'>) {
    const d = dateLocale(c.date);
    return {
        date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        jour: d.toLocaleDateString('fr-FR', { weekday: 'long' }),
        weekEnd: d.getDay() === 0 || d.getDay() === 6,
        libelle: c.type_creneau === 'soir' ? '🌙 Soir (18h-08h)' : '☀️ Journée'
    };
}

/** Experts volontaires disponibles un jour (disponibilités renvoyées par la génération), hors expert exclu */
export function expertsDisponibles(
    ressources: Ressource[],
    disponibilites: DisponibiliteHno[],
    date: string,
    exclu: number | null
) {
    return ressourcesActives(ressources, true).filter(
        r => r.id !== exclu && disponibilites.some(d => d.resource_id === r.id && d.date === date)
    );
}

/** Attribution d'un créneau : refus des règles FPH pour l'expert sur le planning du mois (liste vide si acceptée) */
export function refusAttribution(planning: CreneauPlanningHno[], expertId: number, date: string): string[] {
    let samedis = 0;
    let dimanches = 0;
    let heures = 0;
    for (const s of planning) {
        if (s.resource_id !== expertId) continue;
        const j = dateLocale(s.date).getDay();
        heures += heuresDuJour(j);
        if (j === 6) samedis++;
        if (j === 0) dimanches++;
    }
    const j = dateLocale(date).getDay();
    const refus: string[] = [];
    if (j === 6 && samedis >= 1) refus.push(`Maximum d'1 samedi par mois atteint (${samedis} samedi déjà assigné)`);
    if (j === 0 && dimanches >= 1)
        refus.push(`Maximum d'1 dimanche par mois atteint (${dimanches} dimanche déjà assigné)`);
    if (heures + heuresDuJour(j) > 144)
        refus.push(`Maximum de 72h/15 jours dépassé (${heures + heuresDuJour(j)}h ce mois, max ~144h)`);
    return refus;
}

/** Export CSV (séparateur « ; », BOM UTF-8) */
export function csvPlanning(planning: CreneauPlanningHno[], ressources: Ressource[]) {
    let csv = '﻿Date;Jour;Créneau;Expert;Trigramme\n';
    for (const s of planning) {
        const d = dateLocale(s.date);
        const r = ressources.find(x => x.id === s.resource_id);
        csv += `${d.toLocaleDateString('fr-FR')};${d.toLocaleDateString('fr-FR', { weekday: 'long' })};${
            s.type_creneau === 'soir' ? 'Soir (18h-08h)' : 'Journée complète'
        };${r ? nomExpert(r) : 'Non assigné'};${r ? r.trigramme : '-'}\n`;
    }
    return csv;
}
