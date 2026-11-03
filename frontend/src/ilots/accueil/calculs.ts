// Accueil : qui travaille et sur quelle mission, événements de la journée et de la semaine (sans affichage)
import type { Evenement } from '@/api/evenements';

export type Periode = 'AM' | 'PM';

/** Planning complet de l'API (GET /schedule) : « <ressource>_<type>_<AAAA-MM-JJ>_<AM|PM> » → valeur */
export type Planning = Record<string, string>;

export interface RessourceAccueil {
    id: number;
    nom: string | null;
    prenom: string | null;
    trigramme?: string | null;
    actif?: number | null;
}

/** Activité d'une demi-journée où l'expert est disponible pour l'ANS */
export interface Mission {
    /** Code d'activité du planning (1 à 8) */
    code: number;
    libelle: string;
    couleur: string;
    /** Localisation saisie (SAMU, télétravail…), vide si « - » */
    lieu: string | null;
    /** Aucune mission affectée : l'expert est disponible, en attente d'affectation */
    enAttente: boolean;
}

export interface JourPersonne {
    matin: Mission | null;
    apresMidi: Mission | null;
}

export interface LignePersonne {
    id: number;
    nom: string;
    /** Un jour par entrée de la période demandée */
    jours: JourPersonne[];
}

export interface JourSemaine {
    date: string;
    /** « lun. 02/11 » */
    libelle: string;
    aujourdhui: boolean;
}

const ACTIVITES: Record<number, { libelle: string; couleur: string }> = {
    1: { libelle: "En attente d'affectation", couleur: '#9b59b6' },
    2: { libelle: "En attente d'affectation", couleur: '#9b59b6' },
    3: { libelle: 'SAMU (Déploiement)', couleur: '#e67e22' },
    4: { libelle: 'SAMU (Dev. usages)', couleur: '#d35400' },
    5: { libelle: 'ANS (Déploiement)', couleur: '#3498db' },
    6: { libelle: 'ANS (Dev. usages)', couleur: '#2980b9' },
    7: { libelle: 'Qualification', couleur: '#e74c3c' },
    8: { libelle: 'Divers', couleur: '#16a085' }
};

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** « AAAA-MM-JJ » d'une date locale */
export function cleDate(d: Date): string {
    const deux = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

function enDate(cle: string): Date {
    const [a, m, j] = cle.split('-').map(Number);
    return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1);
}

export function ajouterJours(cle: string, n: number): string {
    const d = enDate(cle);
    d.setDate(d.getDate() + n);
    return cleDate(d);
}

/** Lundi de la semaine contenant la date */
export function lundiDe(cle: string): string {
    const jour = enDate(cle).getDay();
    return ajouterJours(cle, jour === 0 ? -6 : 1 - jour);
}

/** Jours ouvrés (lundi à vendredi) de la semaine de la date */
export function joursOuvres(cle: string, aujourdhui: string): JourSemaine[] {
    const lundi = lundiDe(cle);
    return [0, 1, 2, 3, 4].map(i => {
        const date = ajouterJours(lundi, i);
        const d = enDate(date);
        return {
            date,
            libelle: `${JOURS_COURTS[d.getDay()]} ${date.slice(8)}/${date.slice(5, 7)}`,
            aujourdhui: date === aujourdhui
        };
    });
}

/** « 02/11/2026 » */
export function dateFr(cle: string): string {
    return `${cle.slice(8)}/${cle.slice(5, 7)}/${cle.slice(0, 4)}`;
}

/** « lundi 2 novembre 2026 » */
export function dateLongue(cle: string): string {
    return enDate(cle).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Valeur d'une cellule du planning (ancien format sans période accepté) */
function valeur(planning: Planning, id: number, type: string, date: string, periode: Periode): string | undefined {
    return planning[`${id}_${type}_${date}_${periode}`] ?? planning[`${id}_${type}_${date}`];
}

/** Localisation sans l'émoji de tête (« 🏠 Télétravail » → « Télétravail »), null si vide */
export function lieuAffiche(brut: string | undefined): string | null {
    const lieu = (brut ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    return lieu ? lieu : null;
}

/** Mission d'une demi-journée ; null si l'expert n'est pas disponible pour l'ANS (indisponible, congés, non renseigné) */
export function missionPeriode(planning: Planning, id: number, date: string, periode: Periode): Mission | null {
    if (valeur(planning, id, 'available', date, periode) !== '2') return null;
    const code = Number(valeur(planning, id, 'activity', date, periode) ?? 1);
    const activite = ACTIVITES[code] ?? ACTIVITES[1]!;
    const enAttente = code < 3 || !ACTIVITES[code];
    return {
        code: enAttente ? 2 : code,
        libelle: activite.libelle,
        couleur: activite.couleur,
        lieu: lieuAffiche(valeur(planning, id, 'localisation', date, periode)),
        enAttente
    };
}

export function nomAffiche(r: RessourceAccueil): string {
    const nom = `${r.prenom ?? ''} ${(r.nom ?? '').toUpperCase()}`.trim();
    return nom || r.trigramme || `Ressource ${r.id}`;
}

/** Ressources distinctes et actives (l'API renvoie une ligne par compte expert), triées par nom */
export function ressourcesActives(liste: RessourceAccueil[], aujourdhui: string): RessourceAccueil[] {
    const uniques = new Map<number, RessourceAccueil>();
    for (const r of liste) {
        if (r.actif === 0) continue;
        const fin = (r as { date_fin?: string | null }).date_fin;
        if (fin && fin < aujourdhui) continue;
        if (!uniques.has(r.id)) uniques.set(r.id, r);
    }
    return [...uniques.values()].sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), 'fr'));
}

/** Experts disponibles au moins une demi-journée des dates données, avec leur mission jour par jour */
export function presences(
    planning: Planning,
    ressources: RessourceAccueil[],
    dates: string[],
    aujourdhui: string
): LignePersonne[] {
    const lignes: LignePersonne[] = [];
    for (const r of ressourcesActives(ressources, aujourdhui)) {
        const jours = dates.map(date => ({
            matin: missionPeriode(planning, r.id, date, 'AM'),
            apresMidi: missionPeriode(planning, r.id, date, 'PM')
        }));
        if (jours.some(j => j.matin || j.apresMidi)) lignes.push({ id: r.id, nom: nomAffiche(r), jours });
    }
    return lignes;
}

/** Mêmes missions le matin et l'après-midi : affichées une seule fois */
export function memeMission(jour: JourPersonne): boolean {
    const { matin, apresMidi } = jour;
    return !!matin && !!apresMidi && matin.libelle === apresMidi.libelle && matin.lieu === apresMidi.lieu;
}

/** Événements dont la période recoupe [debut, fin] (bornes incluses), triés par date puis libellé */
export function evenementsEntre(evenements: Evenement[], debut: string, fin: string): Evenement[] {
    return evenements
        .filter(e => e.start_date <= fin && (e.end_date || e.start_date) >= debut)
        .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.label.localeCompare(b.label, 'fr'));
}

/** Présentation d'un événement : « Localisation | Type | Libellé (début - fin) - Participants » */
export interface LigneEvenement {
    localisation: string | null;
    type: string | null;
    libelle: string;
    /** « 02/11/2026 » ou « 02/11/2026 - 04/11/2026 » */
    dates: string;
    participants: string | null;
}

export function ligneEvenement(e: Evenement): LigneEvenement {
    const fin = e.end_date && e.end_date !== e.start_date ? ` - ${dateFr(e.end_date)}` : '';
    const noms = [...(e.participants ?? []), ...(e.external_participants ?? [])]
        .map(p => `${p.prenom ?? ''} ${(p.nom ?? '').toUpperCase()}`.trim())
        .filter(Boolean);
    return {
        localisation: e.location_libelle_court?.trim() || null,
        type: (e.type_long || e.type_short || '').trim() || null,
        libelle: e.label,
        dates: `${dateFr(e.start_date)}${fin}`,
        participants: noms.length ? noms.join(', ') : null
    };
}

/** Planning des astreintes HO d'un mois (GET /astreintes-ho) : inscriptions, noms des experts et droits de l'utilisateur */
export interface AstreintesHo {
    slots: Array<{ date: string; period: Periode; resource_id: number }>;
    names: Array<{ id: number; nom: string | null; prenom: string | null; trigramme?: string | null }>;
    me: { canEdit: boolean; isAdmin: boolean; resourceId: number | null };
    /** Astreinte HO ANS : un utilisateur par jour ouvré */
    ans?: {
        slots: Array<{ date: string; user_id: number }>;
        names: Array<{ id: number; nom: string | null; prenom: string | null; trigramme?: string | null }>;
    };
}

/** Experts en astreinte HO un jour donné, par demi-journée (triés par nom) */
export function astreintesDuJour(planning: AstreintesHo | null, date: string): Record<Periode, string[]> {
    const noms: Record<Periode, string[]> = { AM: [], PM: [] };
    if (!planning) return noms;
    for (const s of planning.slots) {
        if (s.date !== date || !(s.period in noms)) continue;
        const r = planning.names.find(n => n.id === s.resource_id);
        const nom = r
            ? nomAffiche({ id: r.id, nom: r.nom, prenom: r.prenom, trigramme: r.trigramme })
            : `Ressource ${s.resource_id}`;
        if (!noms[s.period].includes(nom)) noms[s.period].push(nom);
    }
    for (const p of ['AM', 'PM'] as const) noms[p].sort((a, b) => a.localeCompare(b, 'fr'));
    return noms;
}

/** Utilisateurs en astreinte HO ANS un jour donné (« Prénom NOM », triés), liste vide si personne */
export function astreinteAnsDuJour(planning: AstreintesHo | null, date: string): string[] {
    const noms = (planning?.ans?.slots ?? [])
        .filter(s => s.date === date)
        .map(s => {
            const u = planning?.ans?.names.find(n => n.id === s.user_id);
            return u
                ? nomAffiche({ id: u.id, nom: u.nom, prenom: u.prenom, trigramme: u.trigramme })
                : `Utilisateur ${s.user_id}`;
        });
    return [...new Set(noms)].sort((a, b) => a.localeCompare(b, 'fr'));
}
