// Aide à l'affectation › ateliers métier : formulaire de la simulation, corps envoyé, libellés (dates, objet des
// courriels, statut des sondages, avancement), destinataires en pastilles
import type {
    CorpsRetroplanning,
    JalonSimule,
    LignesRetroplanning,
    OptionSondage,
    Retroplanning,
    SamuAteliers,
    StatutSondage,
    UtilisateurAteliers
} from '@/api/ateliers';

/** Formulaire partagé par le paramétrage et la simulation ; délais vides : valeurs par défaut */
export interface FormulaireAteliers {
    id: number | null;
    samu: string;
    mep: string;
    nb: number;
    zone: string;
    delaiVisite: number | '';
    delaiMep: number | '';
    ecart12: number | '';
    ecartAteliers: number | '';
    jalons: Record<string, string>;
    contenus: Record<string, string>;
    planifiees: Record<string, string>;
    heures: Record<string, string>;
    /** Ateliers dont le contenu est saisi à la main (« Personnalisé… ») */
    custom: Record<string, boolean>;
    invites: Record<string, string>;
    teams: string;
    destinataires: { userIds: number[]; emails: string[] };
    savedAt: string | null;
}

export const formulaireVide = (): FormulaireAteliers => ({
    id: null,
    samu: '',
    mep: '',
    nb: 4,
    zone: '',
    delaiVisite: 14,
    delaiMep: 28,
    ecart12: 7,
    ecartAteliers: 14,
    jalons: {},
    contenus: {},
    planifiees: {},
    heures: {},
    custom: {},
    invites: {},
    teams: '',
    destinataires: { userIds: [], emails: [] },
    savedAt: null
});

/**
 * SAMU choisi : son rétroplanning enregistré, sinon la MEP et la zone de son déploiement (délais et nombre d'ateliers
 * conservés)
 */
export function formulaireDuSamu(
    precedent: FormulaireAteliers,
    nom: string,
    enregistre: Retroplanning | undefined,
    projet: SamuAteliers | undefined
): FormulaireAteliers {
    const f = formulaireVide();
    f.samu = nom;
    if (enregistre) {
        const l = enregistre.lignes || {};
        f.id = enregistre.id;
        f.mep = enregistre.mep_date;
        f.nb = enregistre.nb_ateliers;
        f.zone = enregistre.zone;
        f.delaiVisite = enregistre.delai_visite_atelier;
        f.delaiMep = enregistre.delai_mep;
        f.ecart12 = l.ecarts?.ecart12 ?? 7;
        f.ecartAteliers = l.ecarts?.ecartAteliers ?? 14;
        f.jalons = { ...(l.jalons || {}) };
        f.contenus = { ...(l.contenus || {}) };
        f.planifiees = { ...(l.planifiees || {}) };
        f.heures = { ...(l.heures || {}) };
        f.invites = { ...(l.invites || {}) };
        f.teams = l.teams || '';
        f.destinataires = { userIds: [], emails: [], ...(l.destinataires || {}) };
        f.savedAt = enregistre.updated_at;
    } else if (projet) {
        f.mep = projet.mep || '';
        f.zone = projet.zone || '';
        f.nb = precedent.nb;
        f.delaiVisite = precedent.delaiVisite;
        f.delaiMep = precedent.delaiMep;
        f.ecart12 = precedent.ecart12;
        f.ecartAteliers = precedent.ecartAteliers;
    }
    return f;
}

/** Corps envoyé (simulation, enregistrement) : délais vides remplacés par leur valeur par défaut */
export const corpsRetroplanning = (f: FormulaireAteliers): CorpsRetroplanning => ({
    samu_name: f.samu,
    mep: f.mep,
    nb: Number(f.nb),
    zone: f.zone,
    delaiVisite: f.delaiVisite === '' ? 14 : f.delaiVisite,
    delaiMep: f.delaiMep === '' ? 28 : f.delaiMep,
    ecart12: f.ecart12 === '' ? 7 : f.ecart12,
    ecartAteliers: f.ecartAteliers === '' ? 14 : f.ecartAteliers,
    lignes: {
        jalons: f.jalons,
        contenus: f.contenus,
        planifiees: f.planifiees,
        heures: f.heures,
        invites: f.invites,
        teams: f.teams,
        destinataires: f.destinataires
    } satisfies Omit<LignesRetroplanning, 'ecarts'>
});

/** Indication sous la zone : null, ou texte (et proposition de reprendre la zone du SAMU) */
export function indicationZone(projet: SamuAteliers | undefined, zone: string) {
    if (!projet) return { texte: 'La zone est proposée selon le département du SAMU.', reprendre: false };
    if (!projet.zone)
        return { texte: 'Zone non déterminée pour ce SAMU (hors métropole ?) : choisissez-la.', reprendre: false };
    return projet.zone === zone
        ? { texte: `Zone ${projet.zone} : zone scolaire de ce SAMU (corrigeable).`, reprendre: false }
        : { texte: `Zone proposée pour ce SAMU : ${projet.zone}.`, reprendre: true };
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** « mer. 15/09/2032 » ; « — » sans date */
export function dateLongue(d: string | null | undefined) {
    if (!d) return '—';
    const [y, m, j] = d.split('-').map(Number) as [number, number, number];
    return `${JOURS[new Date(Date.UTC(y, m - 1, j)).getUTCDay()]} ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
/** « 15/09/2032 » ; « — » sans date */
export const dateCourte = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '—');

/** Atelier (a1…a6) ou autre jalon */
export const estAtelier = (cle: string) => /^a\d$/.test(cle);

/** Objet des courriels : « [SI-SAMU] SAMU 44 - Atelier Métier #1 | Configuration téléphonique du CRRA » */
export function objetCourriel(samu: string, r: Pick<JalonSimule, 'key' | 'jalon' | 'contenu'>) {
    const m = /(\d+[A-Za-z]?)\s*$/.exec(samu || '');
    const court = m ? `SAMU ${m[1]}` : samu;
    const titre = /^a\d+$/.test(r.key) ? `Atelier Métier #${r.key.slice(1)}` : r.jalon;
    return `[SI-SAMU] ${court} - ${titre} | ${r.contenu || 'Configuration téléphonique du CRRA'}`;
}

/** Fin d'un atelier : une heure après le début (23:59 au plus) */
export function uneHeureApres(t: string) {
    const [h, m] = t.split(':').map(Number) as [number, number];
    return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Prochain jalon d'un rétroplanning (planifié ou proposé), « Terminé » sinon */
export function prochainJalon(r: Retroplanning, jour = new Date().toISOString().slice(0, 10)) {
    const m = r.jalons.find(j => (j.planifiee || j.proposee || '') >= jour && j.key !== 'livrables');
    return m ? `${m.jalon} — ${dateCourte(m.planifiee || m.proposee)}` : 'Terminé';
}

/** Visite métier et ateliers planifiés */
export function avancement(r: Retroplanning) {
    const ateliers = r.jalons.filter(j => j.key === 'visite' || estAtelier(j.key));
    const planifies = ateliers.filter(j => j.planifiee).length;
    return {
        texte: `${planifies}/${ateliers.length} planifiés`,
        niveau: planifies === ateliers.length ? 'ok' : planifies ? 'info' : ''
    };
}

export const LIBELLES_SONDAGE: Record<StatutSondage, string> = {
    brouillon: 'Sondage (brouillon)',
    envoye: 'Sondage en cours',
    reponses: 'Réponses en cours',
    termine: 'Sondage terminé'
};

/** Libellé du bouton du sondage d'un jalon */
export const libelleBoutonSondage = (s: { statut: StatutSondage; reponses: number } | undefined) =>
    !s ? 'Sondage' : s.statut === 'reponses' ? `Réponses en cours (${s.reponses})` : LIBELLES_SONDAGE[s.statut];

/** Créneau d'un sondage : « mar. 08/06/2032 · 14:00 – 16:00 » */
export const libelleCreneau = (o: OptionSondage) =>
    `${dateLongue(o.date)}${o.heure ? ` · ${o.heure}${o.heure_fin ? ` – ${o.heure_fin}` : ''}` : ''}`;

// ── Destinataires en pastilles ──────────────────────────────────────────────

/** Pastille : utilisateur (uid) ou adresse libre */
export interface Pastille {
    id: string;
    uid?: number;
    email: string;
    label: string;
    initials: string;
    color: string;
    free?: boolean;
}

const COULEURS = ['#4caf50', '#ff9800', '#3f51b5', '#e91e63', '#009688', '#795548', '#607d8b', '#9c27b0'];

export const normaliserTexte = (v: unknown) =>
    String(v || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
export const estCourriel = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const nomPersonne = (u: Pick<UtilisateurAteliers, 'nom' | 'prenom'>) =>
    `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim();

export const pastilleUtilisateur = (u: UtilisateurAteliers): Pastille => ({
    id: `u${u.id}`,
    uid: u.id,
    email: u.email || '',
    label: nomPersonne(u),
    initials: ((u.prenom || '').charAt(0) + (u.nom || '').charAt(0)).toUpperCase() || '?',
    color: COULEURS[u.id % COULEURS.length]!
});

export const pastilleLibre = (email: string): Pastille => ({
    id: `e${email.toLowerCase()}`,
    email,
    label: email,
    initials: '@',
    color: '#90a4ae',
    free: true
});

/** Pastille d'une adresse : l'utilisateur correspondant s'il existe, sinon l'adresse libre */
export function pastilleDeCourriel(utilisateurs: UtilisateurAteliers[], email: string) {
    const u = utilisateurs.find(x => x.email && x.email.toLowerCase() === String(email).toLowerCase());
    return u ? pastilleUtilisateur(u) : pastilleLibre(email);
}

const dejaChoisie = (choisies: Pastille[], p: Pastille) =>
    choisies.some(
        it => it.id === p.id || (!!it.email && !!p.email && it.email.toLowerCase() === p.email.toLowerCase())
    );

/** Propositions pour la saisie : 8 utilisateurs au plus, puis l'adresse saisie (destinataires libres) */
export function propositions(
    utilisateurs: UtilisateurAteliers[],
    choisies: Pastille[],
    saisie: string,
    libre: boolean
) {
    const texte = saisie.trim();
    const q = normaliserTexte(texte);
    const liste = q
        ? utilisateurs
              .filter(u => u.email)
              .map(pastilleUtilisateur)
              .filter(c => !dejaChoisie(choisies, c) && normaliserTexte(`${c.label} ${c.email}`).includes(q))
              .slice(0, 8)
        : [];
    if (
        libre &&
        estCourriel(texte) &&
        !liste.some(c => c.email.toLowerCase() === texte.toLowerCase()) &&
        !dejaChoisie(choisies, pastilleLibre(texte))
    )
        liste.push(pastilleLibre(texte));
    return liste;
}

/** Ajout d'une pastille (sans doublon d'identifiant ni d'adresse) */
export const ajouterPastille = (choisies: Pastille[], p: Pastille) =>
    dejaChoisie(choisies, p) ? choisies : [...choisies, p];
