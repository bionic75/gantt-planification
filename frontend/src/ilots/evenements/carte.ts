// Carte des événements : filtres, regroupement par lieu, placement des experts, lecture chronologique
import type { EvenementCarte, ExpertCarte, LocalisationCarte } from '@/api/carte';
import type { Compte } from '@/api/evenements';

/** Participant choisi dans le filtre : compte de l'application, ou invité externe d'un événement de la carte */
export interface ParticipantCarte {
    id?: number;
    nom: string;
    prenom: string;
    email?: string;
    external?: boolean;
}

export interface FiltresCarte {
    localisation: string;
    type: string;
    participants: ParticipantCarte[];
}

/** Type affiché dans le filtre : libellé long, « Sans type » pour un événement non repris */
export const typeDe = (e: Pick<EvenementCarte, 'type_long'>) => e.type_long || 'Sans type';

/** Types proposés : ceux des événements chargés, par ordre alphabétique */
export const typesProposes = (events: EvenementCarte[]) =>
    [...new Set(events.map(typeDe))].sort((a, b) => a.localeCompare(b, 'fr'));

/** Texte comparé sans casse ni accents */
export const normaliser = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const memeExterne = (
    a: { nom?: string | null; prenom?: string | null; email?: string | null },
    b: { nom?: string | null; prenom?: string | null; email?: string | null }
) =>
    a.email
        ? normaliser(a.email) === normaliser(b.email)
        : !b.email && normaliser(a.nom) === normaliser(b.nom) && normaliser(a.prenom) === normaliser(b.prenom);

/** L'événement compte-t-il cette personne parmi ses participants (compte, ou invité externe) ? */
export function participe(e: EvenementCarte, p: ParticipantCarte) {
    if (!p.external) return p.id != null && (e.participant_ids || []).includes(p.id);
    return (e.external_participants || []).some(x => memeExterne(p, x));
}

/** Événements retenus : localisation, type, et toutes les personnes choisies parmi les participants */
export function filtrer(events: EvenementCarte[], f: FiltresCarte) {
    return events.filter(
        e =>
            (!f.localisation || String(e.location_id) === f.localisation) &&
            (!f.type || typeDe(e) === f.type) &&
            f.participants.every(p => participe(e, p))
    );
}

/** Localisations proposées : celles qui ont des coordonnées */
export const localisationsGeolocalisees = (l: LocalisationCarte[]) => l.filter(x => !!x.latitude && !!x.longitude);

/** Lieu de la carte et ses événements */
export interface LieuCarte {
    cle: string;
    lat: number;
    lng: number;
    libelle: string;
    adresse: string | null;
    evenements: EvenementCarte[];
}

export function grouperParLieu(events: EvenementCarte[]): LieuCarte[] {
    const lieux = new Map<string, LieuCarte>();
    for (const e of events) {
        const cle = String(e.location_id);
        let lieu = lieux.get(cle);
        if (!lieu) {
            lieu = {
                cle,
                lat: e.latitude,
                lng: e.longitude,
                libelle: e.libelle_court,
                adresse: e.adresse,
                evenements: []
            };
            lieux.set(cle, lieu);
        }
        lieu.evenements.push(e);
    }
    return [...lieux.values()];
}

/** Expert placé au lieu de son SAMU (libellé court de la localisation) */
export interface ExpertPlace extends ExpertCarte {
    lat: number;
    lng: number;
    libelle: string;
}

/**
 * Experts dont le SAMU est une localisation géolocalisée ; les experts d'un même lieu sont un peu décalés au sud et
 * étalés horizontalement (pas de superposition avec les pastilles des événements)
 */
export function placerExperts(experts: ExpertCarte[], localisations: LocalisationCarte[]): ExpertPlace[] {
    const norm = (s: string | null | undefined) => (s || '').toUpperCase().trim();
    const parLieu = new Map<string, Array<ExpertCarte & { lieu: LocalisationCarte }>>();
    for (const x of experts) {
        const lieu = localisations.find(l => l.latitude && l.longitude && norm(l.libelle_court) === norm(x.samu));
        if (!lieu) continue;
        const cle = `${lieu.latitude}_${lieu.longitude}`;
        parLieu.set(cle, [...(parLieu.get(cle) ?? []), { ...x, lieu }]);
    }
    return [...parLieu.values()].flatMap(liste =>
        liste.map(({ lieu, ...x }, i) => ({
            ...x,
            lat: Number(lieu.latitude) - 0.025,
            lng: Number(lieu.longitude) + (i - (liste.length - 1) / 2) * 0.04,
            libelle: lieu.libelle_court
        }))
    );
}

const nomCompte = (c: { prenom?: string | null; nom?: string | null }) =>
    `${c.prenom || ''} ${(c.nom || '').toUpperCase()}`.trim();

/** Libellé d'un participant choisi (étiquette du filtre) */
export const libelleParticipant = (p: ParticipantCarte) => (p.external ? p.email || nomCompte(p) || '?' : nomCompte(p));

/**
 * Propositions de la saisie : 6 comptes au plus (nom, prénom ou e-mail), puis 4 invités externes au plus des
 * événements chargés (dédoublonnés) ; personnes déjà choisies exclues
 */
export function propositions(
    saisie: string,
    comptes: Compte[],
    events: EvenementCarte[],
    choisis: ParticipantCarte[]
): ParticipantCarte[] {
    const q = normaliser(saisie);
    if (!q) return [];
    const internes = comptes
        .filter(
            u =>
                normaliser(`${u.prenom || ''} ${u.nom || ''} ${u.email || ''}`).includes(q) &&
                !choisis.some(p => !p.external && p.id === u.id)
        )
        .slice(0, 6)
        .map(u => ({ id: u.id, nom: u.nom || '', prenom: u.prenom || '' }));
    const vus = new Set<string>();
    const externes: ParticipantCarte[] = [];
    for (const e of events) {
        for (const x of e.external_participants || []) {
            const libelle = x.email || `${x.prenom || ''} ${x.nom || ''}`.trim();
            if (!libelle || vus.has(libelle)) continue;
            if (!normaliser(libelle).includes(q) && !normaliser(`${x.prenom || ''} ${x.nom || ''}`).includes(q))
                continue;
            if (choisis.some(p => p.external && memeExterne(p, x))) continue;
            vus.add(libelle);
            externes.push({ external: true, nom: x.nom || '', prenom: x.prenom || '', email: x.email || '' });
        }
    }
    return [...internes, ...externes.slice(0, 4)];
}

// ── Lecture chronologique ────────────────────────────────────────────────────

const jour = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000;
const isoDuJour = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);

export interface PlageLecture {
    debut: string;
    fin: string;
    jours: number;
}

/** Période lue : dates choisies, à défaut premier début et dernière fin des événements ; null si rien à lire */
export function plageLecture(events: EvenementCarte[], debut: string, fin: string): PlageLecture | null {
    const debuts = events
        .map(e => e.start_date)
        .filter(Boolean)
        .sort();
    const fins = events
        .map(e => e.end_date || e.start_date)
        .filter(Boolean)
        .sort();
    const d = debut || debuts[0];
    const f = fin || fins[fins.length - 1];
    if (!d || !f || f < d) return null;
    return { debut: d, fin: f, jours: Math.max(1, jour(f) - jour(d)) };
}

/** Date atteinte à la position (0 à 1) de la lecture */
export const dateALaPosition = (p: PlageLecture, position: number) =>
    isoDuJour(jour(p.debut) + Math.floor(Math.max(0, Math.min(1, position)) * p.jours));

/** Événements déjà commencés à cette date (apparition progressive) */
export const commencesA = (events: EvenementCarte[], date: string) => events.filter(e => (e.start_date || '') <= date);

/** Nombre d'événements par lieu (pastilles qui changent : animation d'apparition) */
export function compteParLieu(events: EvenementCarte[]) {
    const c: Record<string, number> = {};
    for (const e of events) c[e.location_id] = (c[e.location_id] || 0) + 1;
    return c;
}
