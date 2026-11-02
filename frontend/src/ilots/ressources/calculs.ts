// Ressources (sans affichage) : dates et statut de la MAD, trigramme proposé, ES de rattachement, tri de la liste,
// suggestions de SAMU, contrôle et corps du formulaire d'ajout, comme l'ancien écran
import type { CorpsRessource, PeriodeMad, Ressource } from '@/api/ressources';

// ---------- MAD ----------

/** Dates de la MAD : première date de début et dernière date de fin de l'historique, sinon celles de la ressource */
export function datesMad(
    r: Ressource,
    historique: PeriodeMad[] | undefined
): { debut: string | null; fin: string | null } {
    if (historique && historique.length) {
        const tries = [...historique].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
        return { debut: tries[0]!.date_debut, fin: tries[tries.length - 1]!.date_fin };
    }
    return { debut: r.date_debut, fin: r.date_fin };
}

export type ClasseStatut = 'pending' | 'inactive' | 'active';

/** Statut de la MAD à la date du jour (dates lues comme l'ancien écran : new Date puis minuit local) */
export function statutMad(
    r: Ressource,
    historique: PeriodeMad[] | undefined,
    maintenant = new Date()
): { texte: string; classe: ClasseStatut } {
    const aujourdhui = new Date(maintenant);
    aujourdhui.setHours(0, 0, 0, 0);
    const { debut, fin } = datesMad(r, historique);
    if (!debut) return { texte: 'Non démarré', classe: 'pending' };
    const d = new Date(debut);
    d.setHours(0, 0, 0, 0);
    if (aujourdhui < d) return { texte: 'À venir', classe: 'pending' };
    if (fin) {
        const f = new Date(fin);
        f.setHours(0, 0, 0, 0);
        if (aujourdhui > f) return { texte: 'Terminé', classe: 'inactive' };
    }
    return { texte: 'En cours', classe: 'active' };
}

/** Date affichée (JJ/MM/AAAA), « - » sans date */
export const dateFr = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '-');

// ---------- Saisie ----------

export const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Prénom : première lettre en majuscule, le reste en minuscules */
export const capitaliser = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Trigramme proposé : initiale du prénom et deux premières lettres du nom (sans accents, espaces ni tirets) */
export function trigrammePropose(nom: string, prenom: string): string | null {
    const n = nom.trim();
    const p = prenom.trim();
    if (!n || !p) return null;
    const net = (s: string) => sansAccents(s).replace(/[\s-]/g, '');
    return (net(p).charAt(0) + net(n).substring(0, 2)).toUpperCase();
}

/** ES de rattachement d'un SAMU : début de son adresse (jusqu'à la première virgule) */
export function esDuSamu(adresse: string | null | undefined): string {
    const a = adresse || '';
    return a.includes(',') ? a.split(',')[0]!.trim() : a.trim();
}

/** SAMU proposés : libellés courts distincts, hors SAMU déjà choisis (dans les deux rôles), triés, 10 au plus */
export function suggestionsSamu(libelles: ReadonlyArray<string | null>, exclus: ReadonlyArray<string>, saisie: string) {
    const q = saisie.toLowerCase().trim();
    return [...new Set(libelles.filter((l): l is string => !!l))]
        .filter(s => !exclus.includes(s))
        .filter(s => !q || s.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 10);
}

export interface FormulaireAjout {
    nom: string;
    prenom: string;
    trigramme: string;
    madVolante: boolean;
    taux: string;
    dateFinMad: string;
    joursMaxMad: string;
    samu: string;
    dateDebut: string;
    es: string;
    fonction: string;
    astreinteHo: boolean;
    astreinteHno: boolean;
    astreinteApd: boolean;
    dateAstreinte: string;
}

export const formulaireVide = (): FormulaireAjout => ({
    nom: '',
    prenom: '',
    trigramme: '',
    madVolante: false,
    taux: '',
    dateFinMad: '',
    joursMaxMad: '',
    samu: '',
    dateDebut: '',
    es: '',
    fonction: '',
    astreinteHo: false,
    astreinteHno: false,
    astreinteApd: false,
    dateAstreinte: ''
});

/** Formulaire incomplet : message de l'ancien écran, ou null */
export function ajoutIncomplet(f: FormulaireAjout): string | null {
    if (!f.nom.trim() || !f.prenom.trim() || !f.trigramme.trim() || !f.samu.trim() || !f.dateDebut)
        return 'Remplissez tous les champs obligatoires (*)';
    if (!f.madVolante && !f.taux) return 'Remplissez le taux de MAD';
    if (f.madVolante && (!f.dateFinMad || !f.joursMaxMad))
        return 'Remplissez la date de fin et les jours max pour une MAD volante';
    if (f.astreinteHno && !f.dateAstreinte) return "Veuillez saisir la date de démarrage du régime d'astreintes";
    return null;
}

export const corpsAjout = (f: FormulaireAjout): CorpsRessource => ({
    nom: f.nom.trim(),
    prenom: f.prenom.trim(),
    trigramme: f.trigramme.trim().toUpperCase(),
    email: null,
    telephone: null,
    taux: f.madVolante ? 0 : parseFloat(f.taux),
    samu: f.samu.trim(),
    actif: 1,
    date_debut: f.dateDebut,
    date_fin: null,
    es_rattachement: f.es.trim() || null,
    fonction: f.fonction.trim() || null,
    astreinte_volontaire: f.astreinteHno ? 1 : 0,
    astreinte_ho: f.astreinteHo ? 1 : 0,
    astreinte_apd: f.astreinteApd ? 1 : 0,
    astreinte_date_activation: f.dateAstreinte || null,
    is_mad_volante: f.madVolante ? 1 : 0,
    date_fin_mad: f.dateFinMad || null,
    jours_max_mad: f.joursMaxMad ? parseInt(f.joursMaxMad) : null
});

/**
 * Formulaire après un ajout réussi, comme l'ancien écran : champs vidés, sauf la case « MAD volante », la date de fin
 * et les jours max (anomalie conservée)
 */
export const apresAjout = (f: FormulaireAjout): FormulaireAjout => ({
    ...formulaireVide(),
    madVolante: f.madVolante,
    dateFinMad: f.dateFinMad,
    joursMaxMad: f.joursMaxMad
});

// ---------- Liste ----------

/** Ordre d'affichage : nom puis prénom, sans tenir compte de la casse */
export const ordreAlphabetique = (a: Ressource, b: Ressource) =>
    `${a.nom} ${a.prenom}`.toLowerCase().localeCompare(`${b.nom} ${b.prenom}`.toLowerCase());

/** Date JJ/MM/AAAA… comparée comme AAAA/MM/JJ… */
const comparable = (v: string) => {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)/);
    return m ? `${m[3]}/${m[2]}/${m[1]}${m[4]}` : v;
};

/**
 * Tri de l'ancien écran sur le texte des cellules (minuscules, sans espaces autour) : nombres comparés comme des
 * nombres (cellule vide comprise), le reste par ordre alphabétique
 */
export function trierParTexte<T>(lignes: T[], texte: (l: T) => string, croissant: boolean): T[] {
    return [...lignes].sort((x, y) => {
        const a = comparable(texte(x).toLowerCase().trim());
        const b = comparable(texte(y).toLowerCase().trim());
        if (!isNaN(Number(a)) && !isNaN(Number(b))) return croissant ? Number(a) - Number(b) : Number(b) - Number(a);
        return croissant ? a.localeCompare(b) : b.localeCompare(a);
    });
}
