// Grille de la planification : jours et semaines du mois, valeurs et apparence des demi-journées, compteurs des
// ressources, totaux, pastilles des astreintes / HNO
import type { AstreintePlanning, ParticulariteMad, PeriodeMadGrille, Planning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import { cleDate, cleDateLocale, semaineIso } from '@/ilots/consultation/calendrier';

export { NOMS_MOIS, titreMois } from '@/ilots/consultation/calendrier';

export type Periode = 'AM' | 'PM';
export const PERIODES: Periode[] = ['AM', 'PM'];

/** Première année proposée par la liste des années */
const PREMIERE_ANNEE = 2025;

/**
 * Années proposées : de 2025 à deux ans après l'année courante (2028 au moins), et l'année affichée si elle sort de cet
 * intervalle (navigation mois par mois)
 */
export function anneesProposees(courante: number, affichee: number): number[] {
    const debut = Math.min(PREMIERE_ANNEE, affichee);
    const fin = Math.max(courante + 2, 2028, affichee);
    return Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);
}

/** Mois précédent (-1) ou suivant (+1) */
export function moisVoisin(annee: number, mois: number, sens: number): { annee: number; mois: number } {
    const d = new Date(annee, mois + sens, 1);
    return { annee: d.getFullYear(), mois: d.getMonth() };
}

const NOMS_JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export interface JourGrille {
    jour: number;
    /** AAAA-MM-JJ */
    date: string;
    /** Attribut data-date de l'ancien écran : AAAA-M-J, sans zéros */
    dateCourte: string;
    nom: string;
    weekend: boolean;
    aujourdhui: boolean;
}

export function joursDuMois(annee: number, mois: number, maintenant = new Date()): JourGrille[] {
    const aujourdhui = cleDateLocale(maintenant);
    const nb = new Date(annee, mois + 1, 0).getDate();
    return Array.from({ length: nb }, (_, i) => {
        const d = new Date(annee, mois, i + 1);
        const date = cleDate(annee, mois, i + 1);
        return {
            jour: i + 1,
            date,
            dateCourte: `${annee}-${mois + 1}-${i + 1}`,
            nom: NOMS_JOURS[d.getDay()]!,
            weekend: d.getDay() === 0 || d.getDay() === 6,
            aujourdhui: date === aujourdhui
        };
    });
}

/** Semaines ISO du mois : numéro et nombre de jours du mois dans la semaine */
export function semainesDuMois(annee: number, mois: number): { numero: number; jours: number }[] {
    const semaines: { numero: number; jours: number }[] = [];
    const nb = new Date(annee, mois + 1, 0).getDate();
    for (let j = 1; j <= nb; j++) {
        const numero = semaineIso(new Date(annee, mois, j));
        const derniere = semaines[semaines.length - 1];
        if (derniere && derniere.numero === numero) derniere.jours++;
        else semaines.push({ numero, jours: 1 });
    }
    return semaines;
}

/** Ressources de la grille : actives, restreintes au filtre des ressources (« » : toutes) et des fonctions */
export function ressourcesAffichees(ressources: Ressource[], filtre: string[], fonctions: string[]): Ressource[] {
    let liste = ressources.filter(r => r.actif);
    if (filtre.length > 0 && !filtre.includes('')) {
        const ids = filtre.map(id => parseInt(id));
        liste = liste.filter(r => ids.includes(r.id));
    }
    if (fonctions.length > 0) liste = liste.filter(r => r.fonction !== null && fonctions.includes(r.fonction));
    return liste;
}

export const cleCellule = (ressourceId: number, type: string, date: string, periode: Periode) =>
    `${ressourceId}_${type}_${date}_${periode}`;

export interface ValeursCellule {
    dispo: string;
    affectation: string;
    localisation: string;
    auteur: string;
}

export function valeurs(planning: Planning, ressourceId: number, date: string, periode: Periode): ValeursCellule {
    const v = (type: string, defaut: string) => planning[cleCellule(ressourceId, type, date, periode)] || defaut;
    return {
        dispo: v('available', '1'),
        affectation: v('activity', '1'),
        localisation: v('localisation', '-'),
        auteur: v('author', '')
    };
}

export const LIBELLES_DISPO: Record<string, string> = {
    1: 'Indisponible',
    2: "Disponible pour l'ANS",
    3: '🏖️ Congés'
};

export const LIBELLES_AFFECTATION: Record<string, string> = {
    1: '❓ Indisponible',
    2: "⏳ En attente d'affectation",
    3: '📞 SAMU (Déploiement)',
    4: '📞 SAMU (Dev. usages)',
    5: '📄 ANS (Déploiement)',
    6: '👨‍🏫 ANS (Dev. usages)',
    7: '☑️ Qualification',
    8: '📖 Divers'
};

const COULEURS_AFFECTATION: Record<string, string> = {
    1: '#95a5a6',
    2: '#9b59b6',
    3: '#e67e22',
    4: '#d35400',
    5: '#3498db',
    6: '#2980b9',
    7: '#e74c3c',
    8: '#16a085'
};

export const couleurDispo = (dispo: string) => (dispo === '1' ? '#95a5a6' : dispo === '3' ? '#00bcd4' : '#27ae60');

/** Couleur de l'affectation ; indisponible ou en congés : celle de la disponibilité */
export function couleurAffectation(dispo: string, affectation: string): string {
    if (dispo === '1' || dispo === '3') return dispo === '3' ? '#00bcd4' : '#95a5a6';
    return COULEURS_AFFECTATION[affectation] || '#95a5a6';
}

export interface AffichageLocalisation {
    /** Congés : icône parasol seule */
    conges?: boolean;
    icone?: string;
    couleur?: string;
    texte: string;
}

const LOCALISATIONS: Record<string, { icone: string; couleur: string; texte: string }> = {
    '🏠 Télétravail': { icone: 'home', couleur: '#3498db', texte: 'TT' },
    '🗼 PSC': { icone: 'tower', couleur: '#9b59b6', texte: 'PSC' },
    '🚗 Déplacement': { icone: 'car', couleur: '#16a085', texte: 'Dép' },
    '📞 Télétravail': { icone: 'home', couleur: '#3498db', texte: 'TT' },
    '🚨 SAMU': { icone: 'siren', couleur: '#e53935', texte: 'SAMU' },
    '🎤 Autres': { icone: 'mic', couleur: '#16a085', texte: 'Aut' }
};

/** Localisation affichée : congés, disponible avec une affectation (hors « Indisponible »), sinon « - » */
export function affichageLocalisation(v: ValeursCellule): AffichageLocalisation {
    if (v.dispo === '3') return { conges: true, texte: '' };
    if (v.dispo !== '2' || v.affectation === '1') return { texte: '-' };
    if (v.localisation.startsWith('🚨 SAMU')) {
        const samu = /SAMU (\w+)/.exec(v.localisation);
        return { icone: 'siren', couleur: '#e53935', texte: samu ? samu[1]! : 'SAMU' };
    }
    const connue = LOCALISATIONS[v.localisation];
    if (connue) return connue;
    return { texte: v.localisation.substring(0, 8) + (v.localisation.length > 8 ? '...' : '') };
}

/**
 * Période d'accès d'une ressource à la planification : historique des MAD (début de la plus ancienne période, fin de
 * la plus récente), à défaut ses dates de début et de fin. Date comparée au jour près (AAAA-MM-JJ).
 */
export function dateAccessible(r: Ressource, date: string, historique: PeriodeMadGrille[] | undefined): boolean {
    return dansPeriode(periodeAcces(r, historique), date);
}

/** Période d'accès (bornes AAAA-MM-JJ ; début null : aucun accès, fin null : sans fin), calculée une fois par ressource */
export function periodeAcces(
    r: Ressource,
    historique: PeriodeMadGrille[] | undefined
): { debut: string | null; fin: string | null } {
    let debut = r.date_debut;
    let fin = r.date_fin;
    if (historique && historique.length > 0) {
        const tri = [...historique].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
        debut = tri[0]!.date_debut;
        fin = tri[tri.length - 1]!.date_fin;
    }
    return { debut: debut ? debut.slice(0, 10) : null, fin: fin ? fin.slice(0, 10) : null };
}

export const dansPeriode = (p: { debut: string | null; fin: string | null }, date: string) =>
    !!p.debut && date >= p.debut && (!p.fin || date <= p.fin);

/** Demi-journées disponibles (« 2 ») du mois, en jours */
export function joursDisponibles(planning: Planning, ressourceId: number, annee: number, mois: number): number {
    let total = 0;
    const nb = new Date(annee, mois + 1, 0).getDate();
    for (let j = 1; j <= nb; j++) {
        const date = cleDate(annee, mois, j);
        for (const p of PERIODES) if (planning[cleCellule(ressourceId, 'available', date, p)] === '2') total += 0.5;
        // Ancien format, sans demi-journée
        if (
            planning[`${ressourceId}_available_${date}`] === '2' &&
            !planning[cleCellule(ressourceId, 'available', date, 'AM')]
        )
            total++;
    }
    return total;
}

/**
 * Jours attendus dans le mois (texte à une décimale) : jours ouvrés au taux de la période de MAD (ou de la
 * particularité) en vigueur chaque jour ; sans historique, jours ouvrés de la période de la ressource à son taux
 */
export function joursAttendus(
    r: Ressource,
    annee: number,
    mois: number,
    historique: PeriodeMadGrille[] | undefined,
    particularites: ParticulariteMad[] | undefined
): string {
    const nb = new Date(annee, mois + 1, 0).getDate();
    const ouvre = (j: number) => {
        const d = new Date(annee, mois, j).getDay();
        return d !== 0 && d !== 6;
    };
    if (!historique || historique.length === 0) {
        const premier = cleDate(annee, mois, 1);
        const dernier = cleDate(annee, mois, nb);
        const debut = r.date_debut && r.date_debut.slice(0, 10) > premier ? r.date_debut.slice(0, 10) : premier;
        const fin = r.date_fin && r.date_fin.slice(0, 10) < dernier ? r.date_fin.slice(0, 10) : dernier;
        if (debut > dernier || fin < premier) return String(0);
        let jours = 0;
        for (let j = 1; j <= nb; j++) {
            const date = cleDate(annee, mois, j);
            if (date >= debut && date <= fin && ouvre(j)) jours++;
        }
        return ((jours * r.taux) / 100).toFixed(1);
    }
    let total = 0;
    for (let j = 1; j <= nb; j++) {
        if (!ouvre(j)) continue;
        const date = cleDate(annee, mois, j);
        const particularite = particularites?.find(p => p.date_debut <= date && p.date_fin >= date);
        const periode = historique.find(m => m.date_debut <= date && (!m.date_fin || m.date_fin >= date));
        total += (particularite ? particularite.taux : periode ? periode.taux : 0) / 100;
    }
    return total.toFixed(1);
}

/** Jours de MAD volante consommés : demi-journées disponibles et affectées (hors 1 et 2) dans la période du contrat */
export function joursMadVolanteConsommes(
    planning: Planning,
    ressourceId: number,
    debut: string | null,
    fin: string | null
): number {
    let consommes = 0;
    for (const [cle, valeur] of Object.entries(planning)) {
        const m = /^(\d+)_activity_(\d{4}-\d{2}-\d{2})_(AM|PM)$/.exec(cle);
        if (!m || parseInt(m[1]!) !== ressourceId) continue;
        const date = m[2]!;
        if (debut && date < debut.slice(0, 10)) continue;
        if (fin && date > fin.slice(0, 10)) continue;
        if (!valeur || valeur === '1' || valeur === '2') continue;
        if (planning[`${ressourceId}_available_${date}_${m[3]}`] === '2') consommes += 0.5;
    }
    return consommes;
}

export interface AstreinteCellule {
    id: number;
    type: string;
    objet: string;
    samu: string;
    heures: string;
}

/** Astreintes / HNO d'une ressource couvrant une demi-journée (selon les heures le premier et le dernier jour) */
export function astreintesDeLaCellule(
    astreintes: AstreintePlanning[],
    ressourceId: number,
    date: string,
    periode: Periode
): AstreinteCellule[] {
    const resultat: AstreinteCellule[] = [];
    for (const a of astreintes) {
        if (a.resource_id !== ressourceId) continue;
        const debut = (a.date_debut || '').substring(0, 10);
        const fin = (a.date_fin || '').substring(0, 10);
        if (date < debut || date > fin) continue;
        const premier = date === debut;
        const dernier = date === fin;
        let couvre = true;
        if (a.heure_debut && a.heure_fin) {
            const hD = parseInt(a.heure_debut.split(':')[0]!);
            const hF = parseInt(a.heure_fin.split(':')[0]!);
            if (!premier && !dernier) couvre = true;
            else if (periode === 'AM') {
                couvre = premier ? hD < 12 : true;
                if (dernier) couvre = couvre && hF > 0;
            } else {
                couvre = dernier ? hF > 12 || (hF === 12 && (a.heure_fin.split(':')[1] || '0') > '0') : true;
                if (premier) couvre = couvre && hD < 24;
            }
        }
        if (couvre)
            resultat.push({
                id: a.id,
                type: a.type,
                objet: a.objet,
                samu: a.tous_samu ? 'Tous SAMU' : a.samu || '',
                heures: a.heure_debut && a.heure_fin ? `${a.heure_debut}–${a.heure_fin}` : ''
            });
    }
    return resultat;
}

/** Pastille ASTR / HNO d'une demi-journée (les activités courantes n'en ont pas) ; null sans pastille */
export function pastilleAstreinte(liste: AstreinteCellule[]): { libelle: string; infobulle: string } | null {
    const astr = liste.some(a => a.type === 'astreinte');
    const hno = liste.some(a => a.type === 'hno');
    if (!astr && !hno) return null;
    const type = (a: AstreinteCellule) =>
        a.type === 'astreinte' ? '🔔 Astreinte' : a.type === 'activite_courante' ? '✅ Activité courante' : '⏰ HNO';
    const infobulle = liste
        .map(a => `${type(a)}${a.heures ? ' ' + a.heures : ''}: ${a.objet || ''}${a.samu ? ' | ' + a.samu : ''}`)
        .join('\n');
    return { libelle: astr && hno ? 'ASTR\nHNO' : astr ? 'ASTR' : 'HNO', infobulle };
}

/** Infobulle de la photo d'une ressource : nom, fonction, ES de rattachement, SAMU principal / secondaire */
export function infobulleRessource(
    r: Ressource,
    samu: { principal: string[]; secondaire: string[] } | undefined
): string {
    const parties = [`${r.prenom} ${r.nom.toUpperCase()}`];
    if (r.fonction) parties.push(`Fonction: ${r.fonction}`);
    if (r.es_rattachement) parties.push(`ES: ${r.es_rattachement}`);
    if (samu?.principal.length) parties.push(`🅿️ Principal: ${samu.principal.join(', ')}`);
    if (samu?.secondaire.length) parties.push(`🅢 Secondaire: ${samu.secondaire.join(', ')}`);
    return parties.join('\n');
}

/** Couleur du compteur de MAD volante : sous 20 % puis 50 % des jours restants */
export function couleurMadVolante(restants: number, max: number): string {
    if (restants <= max * 0.2) return '#e53935';
    if (restants <= max * 0.5) return '#fb8c00';
    return '#6a1b9a';
}
