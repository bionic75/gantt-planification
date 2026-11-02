// CRA, administration et vue RH : périodes de lancement, filtres, tableaux (libellés, tri), corbeille, diffusion
// (destinataires, suggestions, journal)
import type { CraListe, CraSupprime, DestinataireDiffusion, JournalDiffusion, StatutCra } from '@/api/cra';
import type { Utilisateur } from '@/api/utilisateurs';
import { majuscule } from './calculs';

/** Statut dans les tableaux (CRA signés, archivés, supprimés) */
export const STATUTS_TABLEAU: Record<StatutCra, string> = {
    a_completer: '✏️ À compléter',
    soumis: '📤 Soumis',
    vise_n1: '✅ Visé N1',
    vise_n2: '✅ Visé N2',
    diffuse: '📨 Diffusé'
};

export const statutTableau = (statut: string | null) =>
    statut ? (STATUTS_TABLEAU[statut as StatutCra] ?? statut) : '—';

export const MOIS = [
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

/** Périodes proposées au lancement : les douze mois passés et le mois courant (« mois:année »), le plus ancien d'abord */
export function periodesLancement(maintenant = new Date()) {
    const periodes: Array<{ valeur: string; libelle: string }> = [];
    for (let i = 12; i >= 0; i--) {
        const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        const libelle = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        periodes.push({ valeur: `${d.getMonth() + 1}:${d.getFullYear()}`, libelle: majuscule(libelle) });
    }
    return periodes;
}

/** Années des filtres : l'année courante et les cinq précédentes */
export function annees(maintenant = new Date()) {
    const a = maintenant.getFullYear();
    return Array.from({ length: 6 }, (_, i) => a - i);
}

/** Date courte (« 05/03/2093 »), « — » si absente */
export const dateCourte = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

/** Date et heure (« 05/03/2093 14:02:11 »), « — » si absente */
export const dateHeure = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR') : '—');

// ---------- Tableau des CRA (signés, archivés) ----------

export const COLONNES_TABLEAU = [
    'Expert',
    'Période',
    'Statut',
    'Soumis le',
    'Visé N1',
    'Visé N2',
    'Diffusé',
    'Lignes'
] as const;

/** Valeur de tri d'une colonne, comme l'ancien écran (dates ISO, période « aaaamm », texte affiché sinon) */
export function cleTri(c: CraListe, colonne: number): string {
    switch (colonne) {
        case 0:
            return c.expert_nom || '—';
        case 1:
            return String(c.annee * 100 + c.mois);
        case 2:
            return statutTableau(c.statut);
        case 3:
            return c.submitted_at || '';
        case 4:
            return c.vise_n1_at || '';
        case 5:
            return c.vise_n2_at || '';
        case 6:
            return c.diffuse_at || '';
        default:
            return String(c.nb_lignes || 0);
    }
}

export function trier(lignes: CraListe[], colonne: number, croissant: boolean): CraListe[] {
    return [...lignes].sort((a, b) => {
        const va = cleTri(a, colonne).trim();
        const vb = cleTri(b, colonne).trim();
        return croissant
            ? va.localeCompare(vb, 'fr', { numeric: true })
            : vb.localeCompare(va, 'fr', { numeric: true });
    });
}

// ---------- Corbeille ----------

/** Bouton de restauration : section d'origine du CRA supprimé */
export const restaurerVers = (c: CraSupprime) =>
    c.pre_delete_archived
        ? '↩️ Vers Archives'
        : c.pre_delete_statut === 'diffuse'
          ? '↩️ Vers Signés'
          : '↩️ Vers En cours';

// ---------- Diffusion ----------

/** Destinataire saisi : une adresse contenant « @ » */
export const adresseValide = (email: string) => !!email && email.includes('@');

/** Libellé d'un destinataire : « Nom <adresse> » ou l'adresse seule */
export const libelleDestinataire = (d: DestinataireDiffusion) => (d.nom ? `${d.nom} <${d.email}>` : d.email);

/** Ajout sans doublon (même adresse) ; adresse absente ignorée */
export function ajouterDestinataire(liste: DestinataireDiffusion[], d: DestinataireDiffusion): DestinataireDiffusion[] {
    if (!d.email || liste.some(x => x.email === d.email)) return liste;
    return [...liste, d];
}

/** Suggestions d'utilisateurs (adresse, nom ou prénom), à partir de deux caractères, huit au plus */
export function suggestions(utilisateurs: Utilisateur[], saisie: string): Utilisateur[] {
    if (!saisie || saisie.length < 2) return [];
    const q = saisie.toLowerCase();
    return utilisateurs
        .filter(
            u =>
                u.email &&
                (u.email.toLowerCase().includes(q) ||
                    (u.nom || '').toLowerCase().includes(q) ||
                    (u.prenom || '').toLowerCase().includes(q))
        )
        .slice(0, 8);
}

/** Type de destinataire du journal de diffusion */
export function typeDestinataire(type: string): { libelle: string; cle: 'drh' | 'expert' | 'rh' } {
    if (type === 'drh_ans') return { libelle: 'DRH ANS', cle: 'drh' };
    if (type === 'expert') return { libelle: 'Expert', cle: 'expert' };
    return { libelle: 'DRH ES', cle: 'rh' };
}

/** État d'un e-mail de diffusion : icône et libellé */
export function etatEnvoi(l: Pick<JournalDiffusion, 'email_status' | 'error_message'>): {
    icone: string;
    libelle: string;
    cle: string;
} {
    switch (l.email_status) {
        case 'sent':
            return { icone: '✅', libelle: 'Envoyé', cle: 'envoye' };
        case 'failed':
            return { icone: '❌', libelle: 'Échec', cle: 'echec' };
        case 'pending':
            return { icone: '⏳', libelle: 'En attente', cle: 'attente' };
        default:
            return { icone: '❓', libelle: 'Inconnu', cle: 'inconnu' };
    }
}

/** E-mail de diffusion à renvoyer : en échec ou en attente, hors profil RH */
export const renvoiPossible = (l: JournalDiffusion, profil: string | null) =>
    (l.email_status === 'failed' || l.email_status === 'pending') && profil !== 'rh';
