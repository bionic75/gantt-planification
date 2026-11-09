// « Gérer mes / les astreintes/HNO » : SAMU proposés, arborescence des lignes déclarées, contrôles de la saisie
import type { CorpsLigneAstreinte, LigneAstreinte, TypeLigneAstreinte } from '@/api/astreintes';

/** SAMU proposés (liste commune aux îlots) */
export { LISTE_SAMU as SAMU_ASTREINTES } from '@/composants/samu';

export const NOMS_MOIS = [
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

/** Types proposés à la saisie ; « Activité courante » (lignes d'un CRA) seulement pour modifier une telle ligne */
export function typesProposes(typeEnModification: string | null): { valeur: TypeLigneAstreinte; libelle: string }[] {
    const types: { valeur: TypeLigneAstreinte; libelle: string }[] = [
        { valeur: 'astreinte', libelle: 'Astreinte' },
        { valeur: 'hno', libelle: 'Travail HNO' }
    ];
    if (typeEnModification === 'activite_courante')
        types.push({ valeur: 'activite_courante', libelle: 'Activité courante' });
    return types;
}

/** Étiquette et couleur d'un type */
export function apparenceType(type: string): { libelle: string; classe: string } {
    if (type === 'astreinte') return { libelle: '🔔 Astreinte', classe: 'astreinte' };
    if (type === 'activite_courante') return { libelle: '✅ Activité courante', classe: 'activite' };
    return { libelle: '⏰ HNO', classe: 'hno' };
}

/** Date AAAA-MM-JJ → JJ/MM/AAAA */
export const dateFr = (date: string) => {
    const [a, m, j] = date.slice(0, 10).split('-');
    return `${j}/${m}/${a}`;
};

/** Période affichée : « JJ/MM/AAAA » ou « début - fin », heures entre parenthèses */
export function periode(l: LigneAstreinte): string {
    const debut = dateFr(l.date_debut);
    const fin = dateFr(l.date_fin);
    const dates = debut === fin ? debut : `${debut} - ${fin}`;
    return l.heure_debut && l.heure_fin ? `${dates} (${l.heure_debut} - ${l.heure_fin})` : dates;
}

export const samuAffiche = (l: LigneAstreinte) => (l.tous_samu ? 'Tous les SAMU' : l.samu);

export interface MoisArbre {
    cle: string;
    libelle: string;
    lignes: LigneAstreinte[];
}
export interface AnneeArbre {
    cle: string;
    libelle: string;
    mois: MoisArbre[];
}
export interface ExpertArbre {
    cle: string;
    libelle: string;
    annees: AnneeArbre[];
}

/** Années (plus récente d'abord), puis mois (plus récent d'abord) ; lignes dans l'ordre reçu */
function parAnnee(lignes: LigneAstreinte[], prefixe: string): AnneeArbre[] {
    const annees = new Map<number, Map<number, LigneAstreinte[]>>();
    for (const l of lignes) {
        const [a, m] = l.date_debut.split('-').map(Number) as [number, number];
        const mois = annees.get(a) ?? new Map<number, LigneAstreinte[]>();
        mois.set(m - 1, [...(mois.get(m - 1) ?? []), l]);
        annees.set(a, mois);
    }
    return [...annees.entries()]
        .sort(([a], [b]) => b - a)
        .map(([annee, mois]) => ({
            cle: `${prefixe}${annee}`,
            libelle: String(annee),
            mois: [...mois.entries()]
                .sort(([a], [b]) => b - a)
                .map(([m, ls]) => ({ cle: `${prefixe}${annee}-${m}`, libelle: NOMS_MOIS[m]!, lignes: ls }))
        }));
}

/** Arborescence de l'expert : Année > Mois */
export const arbreExpert = (lignes: LigneAstreinte[]) => parAnnee(lignes, '');

/** Arborescence de l'administrateur : Expert (« nom prénom », ordre alphabétique) > Année > Mois */
export function arbreAdministrateur(lignes: LigneAstreinte[]): ExpertArbre[] {
    const experts = new Map<string, LigneAstreinte[]>();
    for (const l of lignes) {
        const nom = `${l.user_nom} ${l.user_prenom}`;
        experts.set(nom, [...(experts.get(nom) ?? []), l]);
    }
    return [...experts.keys()]
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map(nom => ({ cle: nom, libelle: nom, annees: parAnnee(experts.get(nom)!, `${nom}|`) }));
}

export interface SaisieAstreinte {
    type: string;
    dateDebut: string;
    dateFin: string;
    heureDebut: string;
    heureFin: string;
    samu: string;
    tousSamu: boolean;
    objet: string;
    /** Administrateur : expert choisi (« » : aucun) */
    expert: string;
}

export const saisieVide = (): SaisieAstreinte => ({
    type: 'astreinte',
    dateDebut: '',
    dateFin: '',
    heureDebut: '',
    heureFin: '',
    samu: '',
    tousSamu: false,
    objet: '',
    expert: ''
});

export const saisieDe = (l: LigneAstreinte): SaisieAstreinte => ({
    type: l.type,
    dateDebut: l.date_debut,
    dateFin: l.date_fin,
    heureDebut: l.heure_debut || '',
    heureFin: l.heure_fin || '',
    samu: l.samu || '',
    tousSamu: l.tous_samu === 1,
    objet: l.objet,
    expert: String(l.user_id)
});

/**
 * Contrôle de la saisie, dans l'ordre de l'ancien écran : message du premier refus, sinon le corps à enregistrer
 * @param adhesion date d'adhésion de l'expert au dispositif (profil expert seulement)
 */
export function controler(
    s: SaisieAstreinte,
    {
        administrateur,
        modification,
        adhesion
    }: { administrateur: boolean; modification: boolean; adhesion: string | null }
): { erreur: string } | { corps: CorpsLigneAstreinte } {
    if (!s.dateDebut || !s.dateFin) return { erreur: 'Veuillez remplir les dates' };
    if (adhesion && s.dateDebut < adhesion) {
        const date = new Date(adhesion).toLocaleDateString('fr-FR');
        return {
            erreur: `Vous ne pouvez pas saisir d'activité avant votre date d'adhésion au dispositif astreintes (${date}).`
        };
    }
    if (!s.heureDebut || !s.heureFin) return { erreur: 'Veuillez remplir les heures de début et de fin' };
    if (!s.tousSamu && !s.samu) return { erreur: 'Veuillez sélectionner un SAMU ou cocher "Tous les SAMU"' };
    const objet = s.objet.trim();
    if (!objet) return { erreur: "Veuillez remplir l'objet" };
    const corps: CorpsLigneAstreinte = {
        type: s.type,
        date_debut: s.dateDebut,
        date_fin: s.dateFin,
        heure_debut: s.heureDebut,
        heure_fin: s.heureFin,
        samu: s.tousSamu ? null : s.samu,
        tous_samu: s.tousSamu,
        objet
    };
    if (administrateur) {
        if (!s.expert && !modification) return { erreur: 'Veuillez sélectionner un expert' };
        corps.user_id = parseInt(s.expert);
    }
    return { corps };
}
