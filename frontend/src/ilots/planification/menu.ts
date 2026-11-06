// Menu d'une demi-journée de la grille (clic droit) : droits, entrées (verrou du CRA, astreintes / HNO de la
// demi-journée, ajout), confirmation de suppression
import type { AstreintePlanning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import type { Profil } from '@/api/types';

/** Menu proposé à l'administrateur (profil actif, comme le serveur) et à l'expert sur sa propre ligne */
export const menuAutorise = (profil: Profil, userId: number, r: Ressource) =>
    profil === 'admin' || (r.user_id !== null && r.user_id === userId);

const STATUTS: Record<string, string> = {
    soumis: 'soumis',
    vise_n1: 'visé N1',
    vise_n2: 'visé N2',
    diffuse: 'diffusé/signé'
};

export const libelleType = (type: string) =>
    type === 'astreinte' ? '🔔 Astreinte' : type === 'activite_courante' ? '✅ Activité courante' : '⏰ HNO';

export type EntreeMenu =
    | { cle: string; type: 'verrou'; libelle: string }
    | { cle: string; type: 'modifier' | 'supprimer'; libelle: string; astreinte: AstreintePlanning }
    | { cle: string; type: 'ajouter'; libelle: string }
    | { cle: string; type: 'separateur' };

const AJOUTER: EntreeMenu = { cle: 'ajouter', type: 'ajouter', libelle: 'Ajouter une astreinte / HNO' };

/**
 * Entrées du menu : saisie verrouillée par un CRA soumis ; sinon, pour chaque astreinte de la demi-journée, modifier
 * et supprimer (objet abrégé à 22 caractères), puis ajouter
 */
export function entreesMenu(
    verrou: { locked: boolean; statut?: string },
    astreintes: AstreintePlanning[]
): EntreeMenu[] {
    if (verrou.locked) {
        const statut = (verrou.statut && STATUTS[verrou.statut]) || verrou.statut || '';
        return [{ cle: 'verrou', type: 'verrou', libelle: `CRA ${statut} — modifications verrouillées` }];
    }
    if (astreintes.length === 0) return [AJOUTER];
    const entrees: EntreeMenu[] = [];
    astreintes.forEach((a, i) => {
        const objet = a.objet || '';
        const court = objet.substring(0, 22) + (objet.length > 22 ? '…' : '');
        if (i > 0) entrees.push({ cle: `sep-${a.id}`, type: 'separateur' });
        entrees.push({
            cle: `mod-${a.id}`,
            type: 'modifier',
            libelle: `Modifier — ${libelleType(a.type)} ${court}`,
            astreinte: a
        });
        entrees.push({
            cle: `sup-${a.id}`,
            type: 'supprimer',
            libelle: `Supprimer — ${libelleType(a.type)} ${court}`,
            astreinte: a
        });
    });
    entrees.push({ cle: 'sep-ajout', type: 'separateur' }, AJOUTER);
    return entrees;
}

/** Question de la suppression d'une astreinte depuis le menu */
export function questionSuppression(a: AstreintePlanning): string {
    const type = a.type === 'astreinte' ? 'Astreinte' : a.type === 'activite_courante' ? 'Activité courante' : 'HNO';
    const samu = a.tous_samu ? 'Tous SAMU' : a.samu || '';
    return `Supprimer cette ${type} ?\n${a.objet || ''} | ${samu}\n${a.date_debut} → ${a.date_fin}`;
}

/** En-tête du menu : « NOM Prénom — JJ/MM/AAAA (AM) » */
export function enteteMenu(r: Ressource, date: string, periode: string): string {
    const [a, m, j] = date.split('-');
    return `${r.nom} ${r.prenom} — ${j}/${m}/${a} (${periode})`;
}

/** Position du menu dans la fenêtre (il ne doit pas en sortir) */
export function positionMenu(x: number, y: number, nbAstreintes: number, largeur: number, hauteur: number) {
    const h = Math.min(nbAstreintes * 80 + 80, 300);
    return { x: x + 250 > largeur ? largeur - 255 : x, y: y + h > hauteur ? hauteur - h - 8 : y };
}
