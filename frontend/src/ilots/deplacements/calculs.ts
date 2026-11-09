// Mes déplacements : UO, bon de commande présélectionné, dépassement du plafond, affichage de la liste, contrôles, tri
import type { AmoaCed, BonCommande, Deplacement } from '@/api/deplacements';

const JOUR = 86400000;
const jour = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Nombre d'UO : jours du déplacement, bornes comprises (0 sans les deux dates) */
export function nombreUo(debut: string, fin: string) {
    if (!debut || !fin) return 0;
    return Math.ceil(Math.abs(jour(fin) - jour(debut)) / JOUR) + 1;
}

/** Bon de commande non soldé dont la période couvre le déplacement (le premier de la liste) */
export const bonCouvrant = (bons: BonCommande[], debut: string, fin: string) =>
    bons.find(b => b.solde !== 1 && b.date_debut <= debut && b.date_fin >= fin);

/** Date « JJ/MM/AAAA » ; « - » sans date */
export function dateFr(iso: string | null | undefined) {
    if (!iso) return '-';
    const [a, m, j] = iso.slice(0, 10).split('-');
    return a && m && j ? `${j}/${m}/${a}` : '-';
}

/** Date de création (« AAAA-MM-JJ HH:MM:SS » ou ISO) au format « JJ/MM/AAAA » */
export const dateCreation = (d: Pick<Deplacement, 'created_at'>) =>
    d.created_at ? dateFr(d.created_at.split(/[T ]/)[0]) : '-';

/**
 * Déplacements qui font dépasser le plafond de leur bon de commande : UO cumulées par bon, dans l'ordre de création
 */
export function depassements(liste: Deplacement[]) {
    const cumul = new Map<number, number>();
    const depasse = new Set<number>();
    const ordre = [...liste].sort(
        (a, b) => (a.created_at ? Date.parse(a.created_at) : 0) - (b.created_at ? Date.parse(b.created_at) : 0)
    );
    for (const d of ordre) {
        if (!d.bon_commande_id) continue;
        const plafond = d.bc_uo_commandees || 0;
        const total = (cumul.get(d.bon_commande_id) ?? 0) + (d.nb_uo || 0);
        cumul.set(d.bon_commande_id, total);
        if (plafond > 0 && total > plafond) depasse.add(d.id);
    }
    return depasse;
}

export const MESSAGE_PLAFOND = '⚠️ Dépasse le plafond de la commande';

/** Ligne de la liste : textes affichés et mise en évidence */
export interface LigneDeplacement {
    d: Deplacement;
    debut: string;
    fin: string;
    amoa: string;
    bon: string;
    sansBon: boolean;
    aRegulariser: boolean;
    depasse: boolean;
    attention: boolean;
    createur: string;
    creeLe: string;
    /** Commentaire complet (infobulle) et tronqué à 30 caractères */
    commentaire: string;
    commentaireCourt: string;
    action: string;
}

export function ligneDeplacement(d: Deplacement, amoaCed: AmoaCed[], depasse: boolean): LigneDeplacement {
    const amoa = amoaCed.find(u => u.id === d.amoa_ced_id);
    const sansBon = !d.bon_commande_id || !d.bon_commande_intitule;
    const aRegulariser = !!d.a_regulariser;
    let commentaire = d.commentaire || '';
    if (depasse && !commentaire.includes('Dépasse le plafond'))
        commentaire = commentaire ? `${MESSAGE_PLAFOND} | ${commentaire}` : MESSAGE_PLAFOND;
    return {
        d,
        debut: dateFr(d.date_debut),
        fin: dateFr(d.date_fin),
        amoa: amoa
            ? `${amoa.nom.toUpperCase()} ${amoa.prenom}`
            : d.amoa_ced_nom
              ? `${d.amoa_ced_nom.toUpperCase()} ${d.amoa_ced_prenom || ''}`
              : '-',
        bon: sansBon
            ? ''
            : `${d.bon_commande_intitule}${d.bon_commande_titulaire ? ` - ${d.bon_commande_titulaire}` : ''}`,
        sansBon,
        aRegulariser,
        depasse,
        attention: aRegulariser || sansBon || depasse,
        createur: d.creator_nom ? `${d.creator_nom.toUpperCase()} ${d.creator_prenom || ''}` : '-',
        creeLe: dateCreation(d),
        commentaire,
        commentaireCourt: commentaire.length > 30 ? `${commentaire.substring(0, 30)}...` : commentaire,
        action: sansBon ? '📋 Affecter' : aRegulariser ? '🔄 Régulariser' : '✏️ Modifier'
    };
}

/** Champs saisis d'un déplacement */
export interface SaisieDeplacement {
    amoa: string;
    debut: string;
    fin: string;
    samu: string;
    ville: string;
    bon: string;
    commentaire: string;
}

/** Contrôles avant l'enregistrement ; message d'erreur, ou null */
export function controler(s: SaisieDeplacement, bons: BonCommande[], ajout: boolean): string | null {
    const ville = s.ville.trim();
    if (!s.amoa || !s.debut || !s.fin || !s.samu || !ville || (!ajout && !s.bon))
        return 'Veuillez remplir tous les champs obligatoires';
    if (!s.bon) return 'Veuillez sélectionner un bon de commande';
    if (s.fin < s.debut) return 'La date de fin doit être postérieure ou égale à la date de début';
    const bon = bons.find(b => b.id === Number(s.bon));
    if (bon && (s.debut < bon.date_debut || s.fin > bon.date_fin))
        return (
            `⚠️ Les dates du déplacement sont en dehors de la période du bon de commande sélectionné.\n\n` +
            `Bon de commande : ${bon.intitule}\nPériode valide : du ${dateFr(bon.date_debut)} au ${dateFr(bon.date_fin)}\n\n` +
            'Veuillez corriger les dates ou choisir un autre bon de commande.'
        );
    return null;
}

/** Bons de commande proposés à la modification : tous (administrateur), sinon non soldés et celui du déplacement */
export const bonsModifiables = (bons: BonCommande[], admin: boolean, actuel: number | null) =>
    admin ? bons : bons.filter(b => b.solde !== 1 || b.id === actuel);

export const libelleBon = (b: BonCommande, avecSolde = false) =>
    `${b.intitule} - ${b.titulaire || 'N/A'}${avecSolde && b.solde === 1 ? ' [SOLDÉ]' : ''}`;

// ── Tri ──────────────────────────────────────────────────────────────────────

export type ColonneTri = 'debut' | 'fin' | 'uo' | 'samu' | 'ville' | 'amoa' | 'bon' | 'createur' | 'creeLe';
const TYPES: Record<ColonneTri, 'date' | 'nombre' | 'texte'> = {
    debut: 'date',
    fin: 'date',
    uo: 'nombre',
    samu: 'texte',
    ville: 'texte',
    amoa: 'texte',
    bon: 'texte',
    createur: 'texte',
    creeLe: 'date'
};

function valeur(l: LigneDeplacement, c: ColonneTri): string {
    switch (c) {
        case 'debut':
            return l.debut;
        case 'fin':
            return l.fin;
        case 'uo':
            return String(l.d.nb_uo);
        case 'samu':
            return l.d.samu;
        case 'ville':
            return l.d.ville;
        case 'amoa':
            return l.amoa;
        case 'bon':
            return l.sansBon ? '⚠️ À affecter' : l.bon;
        case 'createur':
            return l.createur;
        case 'creeLe':
            return l.creeLe;
    }
}

/** Tri d'une colonne : valeurs vides (« - ») en fin de liste */
export function trier(lignes: LigneDeplacement[], c: ColonneTri, croissant: boolean) {
    const vide = (v: string) => v === '-' || v === '';
    const date = (v: string) => {
        const [j, m, a] = v.split('/').map(Number);
        return new Date(a ?? 0, (m ?? 1) - 1, j ?? 1).getTime();
    };
    const sens = croissant ? 1 : -1;
    return [...lignes].sort((x, y) => {
        const a = valeur(x, c).trim();
        const b = valeur(y, c).trim();
        if (vide(a) || vide(b)) return vide(a) === vide(b) ? 0 : vide(a) ? 1 : -1;
        const type = TYPES[c];
        const comparaison =
            type === 'date'
                ? date(a) - date(b)
                : type === 'nombre'
                  ? (parseFloat(a) || 0) - (parseFloat(b) || 0)
                  : a.localeCompare(b, 'fr', { sensitivity: 'base' });
        return sens * comparaison;
    });
}
