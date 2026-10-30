// Gestion des utilisateurs : saisie, contrôles, liste, tri, détails et export des journaux (sans affichage)
import type { ActionCompte, ConnexionsCompte, RessourceCompte, Utilisateur } from '@/api/utilisateurs';

// ---------- Saisie ----------

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Prénom : première lettre en majuscule, le reste en minuscules */
export const capitaliser = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Login proposé « prénom.nom » (sans accents, espaces ni tirets), ou null si l'un manque */
export function loginPropose(nom: string, prenom: string): string | null {
    const n = nom.trim();
    const p = prenom.trim();
    if (!n || !p) return null;
    const propre = (s: string) => sansAccents(s).replace(/[\s-]/g, '').toLowerCase();
    return `${propre(p)}.${propre(n)}`;
}

/** Mot de passe de 12 caractères : au moins une majuscule, une minuscule, un chiffre et un symbole, mélangés */
export function genererMotDePasse(alea: () => number = Math.random): string {
    const majuscules = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const minuscules = 'abcdefghijklmnopqrstuvwxyz';
    const chiffres = '0123456789';
    const symboles = '!@#$%&*';
    const tous = majuscules + minuscules + chiffres + symboles;
    const tirer = (jeu: string) => jeu[Math.floor(alea() * jeu.length)] ?? '';
    const car = [tirer(majuscules), tirer(minuscules), tirer(chiffres), tirer(symboles)];
    while (car.length < 12) car.push(tirer(tous));
    return car.sort(() => alea() - 0.5).join('');
}

export interface ChampsCreation {
    nom: string;
    prenom: string;
    username: string;
    email: string;
    telephone: string;
    password: string;
    is_admin: boolean;
    is_expert: boolean;
    is_user: boolean;
    is_rh: boolean;
    resource_id: string;
}

export const champsCreationVides = (): ChampsCreation => ({
    nom: '',
    prenom: '',
    username: '',
    email: '',
    telephone: '',
    password: '',
    is_admin: false,
    is_expert: false,
    is_user: false,
    is_rh: false,
    resource_id: ''
});

/** Contrôles de l'ancien écran (création et modification), dans le même ordre ; null si tout est correct */
export function erreurSaisie(c: {
    username: string;
    nom: string;
    prenom: string;
    email: string;
    password?: string;
    is_admin: boolean | number;
    is_expert: boolean | number;
    is_user: boolean | number;
    is_rh: boolean | number;
    resource_id: string | null;
}): string | null {
    const requis = [c.username, c.nom, c.prenom, c.email, ...(c.password === undefined ? [] : [c.password])];
    if (requis.some(v => !v)) return 'Veuillez remplir tous les champs requis';
    if (!c.is_admin && !c.is_expert && !c.is_user && !c.is_rh) return 'Veuillez sélectionner au moins un profil';
    if (c.is_expert && !c.resource_id) return 'Veuillez sélectionner une ressource pour le profil Expert Métier';
    return null;
}

/** Message après création, selon l'envoi du mot de passe par e-mail */
export function messageCreation(
    envoiDemande: boolean,
    emailEnvoye: boolean
): { type: 'success' | 'warning'; texte: string } {
    if (envoiDemande && emailEnvoye)
        return { type: 'success', texte: '✅ Utilisateur créé avec succès et mot de passe envoyé par email !' };
    if (envoiDemande)
        return {
            type: 'warning',
            texte: "⚠️ Utilisateur créé mais l'email n'a pas pu être envoyé. Veuillez communiquer le mot de passe manuellement."
        };
    return { type: 'success', texte: '✅ Utilisateur créé avec succès !' };
}

// ---------- Liste ----------

/** Trigramme du compte, sinon initiale du prénom et deux premières lettres du nom */
export function trigramme(u: Pick<Utilisateur, 'trigramme' | 'nom' | 'prenom'>): string {
    if (u.trigramme) return u.trigramme;
    return u.prenom && u.nom ? (u.prenom.charAt(0) + u.nom.substring(0, 2)).toUpperCase() : '';
}

export interface Badge {
    libelle: string;
    profil: 'admin' | 'expert' | 'user' | 'rh';
}

export function badges(u: Utilisateur): Badge[] {
    const b: Badge[] = [];
    if (u.is_admin === 1) b.push({ libelle: 'Admin', profil: 'admin' });
    if (u.is_expert === 1) b.push({ libelle: 'Expert Métier', profil: 'expert' });
    if (u.is_user === 1) b.push({ libelle: 'Utilisateur', profil: 'user' });
    if (u.is_rh === 1) b.push({ libelle: 'RH', profil: 'rh' });
    return b;
}

/** Validation RH : réservée aux profils Admin, Utilisateur et RH */
export const peutValidationRh = (u: Utilisateur) => u.is_admin === 1 || u.is_user === 1 || u.is_rh === 1;

const deux = (n: number) => String(n).padStart(2, '0');

/** Dernière connexion « JJ/MM/AAAA HH:MM:SS » (heure locale), « - » sans connexion */
export function derniereConnexion(dateIso: string | null): string {
    if (!dateIso) return '-';
    const d = new Date(dateIso);
    return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
}

export const compteur = (liste: Utilisateur[]) => {
    const actifs = liste.filter(u => u.actif).length;
    return `(${actifs} actif${actifs > 1 ? 's' : ''} / ${liste.length} au total)`;
};

/** Ordre initial : nom puis prénom */
export const parNom = (liste: Utilisateur[]) =>
    [...liste].sort((a, b) => `${a.nom} ${a.prenom}`.toLowerCase().localeCompare(`${b.nom} ${b.prenom}`.toLowerCase()));

/** Colonnes triables (comme l'ancien écran : « Actif » et « Dernière connexion » sont sans effet) */
export type ColonneTri = 'nom' | 'prenom' | 'trigramme' | 'username' | 'email' | 'profils';

const texteColonne = (u: Utilisateur, c: ColonneTri) => {
    if (c === 'trigramme') return trigramme(u);
    if (c === 'profils')
        return (
            badges(u)
                .map(b => b.libelle)
                .join(' ') || '—'
        );
    return u[c] ?? '';
};

/** Tri du texte affiché, en minuscules ; valeurs numériques comparées en nombres */
export function trier(liste: Utilisateur[], c: ColonneTri, croissant: boolean): Utilisateur[] {
    return [...liste].sort((a, b) => {
        const va = String(texteColonne(a, c)).toLowerCase().trim();
        const vb = String(texteColonne(b, c)).toLowerCase().trim();
        const na = Number(va);
        const nb = Number(vb);
        if (va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb)) return croissant ? na - nb : nb - na;
        return croissant ? va.localeCompare(vb) : vb.localeCompare(va);
    });
}

// ---------- Détails ----------

/** Rôles affichés dans les détails (le profil RH n'y figure pas : anomalie conservée) */
export const roles = (u: Utilisateur) =>
    [u.is_admin === 1 && 'Administrateur', u.is_expert === 1 && 'Expert', u.is_user === 1 && 'Utilisateur']
        .filter(Boolean)
        .join(', ');

/** Profil d'une connexion (RH affiché « Utilisateur » : anomalie conservée) */
export const profilConnexion = (p: string) =>
    p === 'admin' ? 'Administrateur' : p === 'expert' ? 'Expert Métier' : 'Utilisateur';

/** Horodatage UTC sans fuseau (SQLite) : lu comme UTC */
const enUtc = (s: string) => (s.endsWith('Z') || s.includes('+') ? s : `${s}Z`);

/** Date et heure de connexion à Paris « JJ/MM/AAAA HH:MM », et nombre de connexions */
export function dateConnexion(c: ConnexionsCompte): string {
    const brut = c.derniere_connexion || c.login_time;
    const date = brut
        ? new Date(enUtc(brut)).toLocaleString('fr-FR', {
              timeZone: 'Europe/Paris',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
          })
        : '—';
    return `${date}${c.nb_connexions ? ` (×${c.nb_connexions})` : ''}`;
}

export const ACTIVITES: Record<string, string> = {
    1: '❓ Indisponible',
    2: "⏳ En attente d'affectation",
    3: '📞 SAMU (Déploiement)',
    4: '📞 SAMU (Dev. usages)',
    5: '📄 ANS (Déploiement)',
    6: '👨‍🏫 ANS (Dev. usages)',
    7: '☑️ Qualification',
    8: '📖 Divers',
    9: '📊 Analyse',
    10: '🔧 MCO',
    11: '📞 Astreinte',
    12: '🎯 Missions ponctuelles',
    13: '📝 Documentation'
};
export const activite = (v: string | undefined) => (!v || v === '-' ? '-' : (ACTIVITES[v] ?? v));

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const lireDetails = (a: ActionCompte): Record<string, unknown> | null => {
    try {
        return a.details ? (JSON.parse(a.details) as Record<string, unknown>) : null;
    } catch {
        return null;
    }
};

export interface LigneModification {
    jour: string;
    periode: string;
    expert: string | null;
    affectation: string;
    localisation: string;
    dateModification: string;
    heureModification: string;
}

/** Jour concerné « Lun 02/03/2031 » (date lue comme dans l'ancien écran) */
const jourConcerne = (date: unknown) => {
    const d = new Date(String(date));
    return `${JOURS[d.getDay()] ?? ''} ${d.toLocaleDateString('fr-FR')}`;
};

const nomRessource = (ressources: RessourceCompte[], id: unknown) => {
    const r = ressources.find(x => x.id === id);
    return r ? `${r.prenom} ${r.nom}` : 'Expert inconnu';
};

/**
 * Dernières modifications de planning (10 au plus, une par demi-journée, la plus récente) : pour un expert « pur »
 * celles de sa ressource, pour un administrateur ou un utilisateur toutes les siennes (avec l'expert concerné) ;
 * null pour les autres profils (section absente)
 */
export function modificationsPlanning(
    u: Utilisateur,
    actions: ActionCompte[],
    ressources: RessourceCompte[]
): LigneModification[] | null {
    const expertPur = u.is_expert === 1 && !!u.resource_id && u.is_admin === 0 && u.is_user === 0;
    if (!expertPur && u.is_admin !== 1 && u.is_user !== 1) return null;
    const dernieres = new Map<string, { a: ActionCompte; d: Record<string, unknown> }>();
    for (const a of actions) {
        if (a.action_type !== 'planning_modification') continue;
        const d = lireDetails(a);
        if (!d || (expertPur && d.resourceId !== u.resource_id)) continue;
        const cle = `${expertPur ? '' : `${String(d.resourceId)}_`}${String(d.date)}_${String(d.period)}`;
        const actuelle = dernieres.get(cle);
        if (!actuelle || new Date(a.created_at) > new Date(actuelle.a.created_at)) dernieres.set(cle, { a, d });
    }
    return [...dernieres.values()]
        .sort((x, y) => new Date(y.a.created_at).getTime() - new Date(x.a.created_at).getTime())
        .slice(0, 10)
        .map(({ a, d }) => {
            const modif = new Date(enUtc(a.created_at));
            return {
                jour: jourConcerne(d.date),
                periode: String(d.period),
                expert: expertPur ? null : nomRessource(ressources, d.resourceId),
                affectation: activite(d.activity as string | undefined),
                localisation: d.activity === '1' ? '-' : String(d.location || '-'),
                dateModification: modif.toLocaleDateString('fr-FR'),
                heureModification: modif.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            };
        });
}

/** Demandes d'affectation envoyées (10 au plus), pour un administrateur ou un utilisateur ; null sinon */
export function demandesAffectation(
    u: Utilisateur,
    actions: ActionCompte[],
    ressources: RessourceCompte[]
): string[] | null {
    const expertPur = u.is_expert === 1 && !!u.resource_id && u.is_admin === 0 && u.is_user === 0;
    if (expertPur || (u.is_admin !== 1 && u.is_user !== 1)) return null;
    return actions
        .filter(a => a.action_type === 'email_request' && a.details)
        .slice(0, 10)
        .map(a => {
            const d = lireDetails(a) ?? {};
            return `${jourConcerne(d.date)} - ${nomRessource(ressources, d.resourceId)}`;
        });
}

// ---------- Export CSV des journaux ----------

const echapper = (v: unknown) => {
    if (typeof v !== 'string') return v;
    return v.includes(';') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
};

/** Contenu de l'export (BOM pour Excel), comme l'ancien écran */
export function csvJournaux(
    u: Utilisateur,
    connexions: ConnexionsCompte[],
    actions: ActionCompte[],
    maintenant = new Date()
): string {
    let csv = '\uFEFF';
    csv += `Export des logs - ${u.prenom} ${u.nom} (${u.username})\n`;
    csv += `Date d'export: ${maintenant.toLocaleString('fr-FR')}\n\n`;

    csv += '=== LOGS DE CONNEXION ===\nDate/Heure;Type\n';
    // Champ « login_time » absent des connexions regroupées : « undefined » écrit (anomalie conservée)
    csv += connexions.length
        ? connexions.map(c => `${String(c.login_time)};Connexion\n`).join('')
        : 'Aucune connexion enregistrée\n';
    csv += '\n';

    csv += '=== MODIFICATIONS DE PLANNING ===\n';
    csv += 'Date;Période;Ressource;Disponibilité;Activité;Localisation;Date de modification\n';
    const planning = actions.filter(a => a.action_type === 'planning_modification');
    if (planning.length) {
        for (const a of planning) {
            const d = lireDetails(a);
            if (!d) continue;
            const act = (d.activity as string) || '-';
            const loc = act === '1' || act === 'Indisponible' ? '-' : (d.location as string) || '-';
            csv += `${echapper(d.date || '-')};${echapper(d.period || '-')};${String(d.resourceId || '-')};${echapper(d.availability || '-')};${echapper(act)};${echapper(loc)};${new Date(a.created_at).toLocaleString('fr-FR')}\n`;
        }
    } else csv += 'Aucune modification de planning\n';
    csv += '\n';

    csv += "=== DEMANDES D'AFFECTATION ENVOYÉES ===\nExpert;Période;Message;Date d'envoi\n";
    const demandes = actions.filter(a => a.action_type === 'email_request');
    if (demandes.length) {
        for (const a of demandes) {
            const d = lireDetails(a);
            if (!d) continue;
            const periode = `Du ${String(d.startDate)} (${String(d.startPeriod)}) au ${String(d.endDate)} (${String(d.endPeriod)})`;
            csv += `${echapper(d.expertName || '-')};${echapper(periode)};${echapper(d.message || '-')};${new Date(a.created_at).toLocaleString('fr-FR')}\n`;
        }
    } else csv += 'Aucune demande envoyée\n';
    return csv;
}

export const nomFichierJournaux = (username: string, maintenant = new Date()) =>
    `logs_${username}_${maintenant.toISOString().split('T')[0]}.csv`;

export const MESSAGES_REMISE_A_ZERO: Record<'connexions' | 'planning' | 'emails', string> = {
    connexions: 'Êtes-vous sûr de vouloir supprimer TOUTES les connexions de cet utilisateur ?',
    planning: 'Êtes-vous sûr de vouloir supprimer TOUTES les modifications de planning de cet utilisateur ?',
    emails: "Êtes-vous sûr de vouloir supprimer TOUTES les demandes d'affectation envoyées par cet utilisateur ?"
};
