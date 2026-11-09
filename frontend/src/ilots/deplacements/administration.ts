// Administration des bons de commande : contrôles de la saisie (création, modification), messages de l'ancien écran
import type { BonCommandeSuivi, CorpsBonCommande } from '@/api/deplacements';

/** Champs saisis d'un bon de commande */
export interface SaisieBon {
    intitule: string;
    titulaire: string;
    debut: string;
    fin: string;
    uo: string;
    solde: boolean;
}

export const bonVide = (): SaisieBon => ({ intitule: '', titulaire: '', debut: '', fin: '', uo: '', solde: false });

/** Corps envoyé : numéro sans espaces autour, titulaire en majuscules, UO entières */
export const corpsBon = (s: SaisieBon, avecSolde: boolean): CorpsBonCommande => ({
    intitule: s.intitule.trim(),
    titulaire: s.titulaire.trim().toUpperCase(),
    date_debut: s.debut,
    date_fin: s.fin,
    nb_uo: parseInt(s.uo),
    ...(avecSolde ? { solde: s.solde } : {})
});

const incomplet = (c: CorpsBonCommande) => !c.intitule || !c.titulaire || !c.date_debut || !c.date_fin || !c.nb_uo;

/** Contrôles avant la création ; message d'erreur, ou null */
export function controlerCreation(s: SaisieBon, bons: BonCommandeSuivi[]): string | null {
    const c = corpsBon(s, false);
    if (incomplet(c)) return 'Veuillez remplir tous les champs';
    if (c.date_fin < c.date_debut) return 'La date de fin doit être postérieure à la date de début';
    if (bons.some(b => b.intitule.toLowerCase() === c.intitule.toLowerCase()))
        return 'Ce numéro de CBDC existe déjà. Veuillez en saisir un autre.';
    return null;
}

/** Contrôle avant la modification ; message d'erreur, ou null */
export const controlerModification = (s: SaisieBon): string | null =>
    incomplet(corpsBon(s, true)) ? 'Veuillez remplir tous les champs' : null;

/** Confirmation de la suppression */
export const confirmationSuppression = (intitule: string | undefined) =>
    `⚠️ Êtes-vous sûr de vouloir supprimer "${intitule ?? 'ce bon de commande'}" ?\n\n` +
    'Si des déplacements sont associés à ce bon de commande, ils seront marqués comme "À affecter".';

/** Message après la suppression */
export const messageSuppression = (desaffectes: number | undefined) =>
    desaffectes && desaffectes > 0
        ? `✅ Bon de commande supprimé.\n\n${desaffectes} déplacement(s) ont été désaffectés et sont maintenant marqués "À affecter".`
        : 'Bon de commande supprimé';
