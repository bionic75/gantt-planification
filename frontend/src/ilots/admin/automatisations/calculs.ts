// Automatisations (sans affichage) : formulaires des automatisations n°1 et n°2 lus depuis la configuration enregistrée
// et configurations enregistrées, comme l'ancien écran (valeurs des listes, sélections dans l'ordre des listes)
import type { ConfigAutomatisation, EnvoiAutomatisation, ParametresSauvegarde } from '@/api/automatisations';

/** Option d'une liste : valeur affichée, comme une liste de l'ancien écran (texte) */
export interface Option<V extends string | number = string> {
    valeur: V;
    libelle: string;
}

/** Valeur d'une liste : celle demandée si la liste la propose, sinon aucune (liste HTML sans option correspondante) */
export const dansListe = (valeur: string, options: ReadonlyArray<Option>) =>
    options.some(o => o.valeur === valeur) ? valeur : '';

/** Sélection d'une liste multiple : valeurs proposées par la liste, dans l'ordre de la liste */
export const selection = <V extends string | number>(valeurs: unknown, options: ReadonlyArray<Option<V>>): V[] =>
    Array.isArray(valeurs) ? options.filter(o => valeurs.includes(o.valeur)).map(o => o.valeur) : [];

// ---------- N°1 : rappel de saisie des disponibilités ----------

export const JOURS_AVANT_FIN: ReadonlyArray<Option> = [3, 5, 7, 10, 15].map(n => ({
    valeur: String(n),
    libelle: `${n} jours`
}));

export interface FormulaireRappel {
    actif: boolean;
    jours: string;
    /** Compte en copie (identifiant, texte), '' : aucun */
    copie: string;
}

export function formulaireRappel(
    c: ConfigAutomatisation | null | undefined,
    comptes: ReadonlyArray<Option>
): FormulaireRappel {
    return {
        actif: !!c?.enabled,
        jours: dansListe(String(c?.days || '5'), JOURS_AVANT_FIN),
        copie: dansListe(String(c?.copyUserId || ''), comptes)
    };
}

/** Configuration enregistrée : jours en nombre (valeur absente : null, comme parseInt('') envoyé en JSON) */
export const configRappel = (f: FormulaireRappel): ConfigAutomatisation => {
    const jours = parseInt(f.jours);
    return { enabled: f.actif, days: Number.isNaN(jours) ? null : jours, copyUserId: f.copie || null };
};

// ---------- N°2 : sauvegarde des plannings ----------

export const FREQUENCES: ReadonlyArray<Option> = [
    { valeur: 'daily', libelle: 'Tous les jours' },
    { valeur: 'weekly', libelle: 'Toutes les semaines' },
    { valeur: 'monthly', libelle: 'Une fois par mois' }
];
export const JOURS_SEMAINE: ReadonlyArray<Option> = [
    ['1', 'Lundi'],
    ['2', 'Mardi'],
    ['3', 'Mercredi'],
    ['4', 'Jeudi'],
    ['5', 'Vendredi'],
    ['6', 'Samedi'],
    ['0', 'Dimanche']
].map(([valeur, libelle]) => ({ valeur: valeur!, libelle: libelle! }));
export const JOURS_MOIS: ReadonlyArray<Option> = Array.from({ length: 31 }, (_, i) => ({
    valeur: String(i + 1),
    libelle: String(i + 1)
}));
export const HEURES: ReadonlyArray<Option> = Array.from({ length: 24 }, (_, i) => ({
    valeur: String(i),
    libelle: `${String(i).padStart(2, '0')}:00`
}));
export const FORMATS: ReadonlyArray<Option> = [
    { valeur: 'csv', libelle: 'CSV' },
    { valeur: 'xlsx', libelle: 'XLSX (Excel)' }
];

export interface FormulaireSauvegarde {
    actif: boolean;
    groupeAdmin: boolean;
    groupeUtilisateur: boolean;
    groupeExpert: boolean;
    destinataires: number[];
    frequence: string;
    jourSemaine: string;
    jourMois: string;
    heure: string;
    tousLesMois: boolean;
    mois: string[];
    tousLesExperts: boolean;
    experts: number[];
    exclureVides: boolean;
    format: string;
}

/** Listes du formulaire : comptes avec e-mail, ressources, mois ayant des données */
export interface ListesSauvegarde {
    comptes: ReadonlyArray<Option<number>>;
    ressources: ReadonlyArray<Option<number>>;
    mois: ReadonlyArray<Option>;
}

/**
 * Formulaire de la configuration enregistrée (aucune configuration : valeurs initiales de l'écran). Toutes les données
 * et tous les experts par défaut ; mois et experts choisis seulement s'ils ne sont pas tous retenus.
 */
export function formulaireSauvegarde(
    c: ConfigAutomatisation | null | undefined,
    l: ListesSauvegarde
): FormulaireSauvegarde {
    const tousLesExperts = c?.allExperts !== false;
    const tousLesMois = c?.allMonths !== false;
    return {
        actif: !!c?.enabled,
        groupeAdmin: !!c?.groupAdmin,
        groupeUtilisateur: !!c?.groupUser,
        groupeExpert: !!c?.groupExpert,
        destinataires: selection(c?.recipients, l.comptes),
        frequence: dansListe(String(c?.frequency || 'daily'), FREQUENCES),
        jourSemaine: dansListe(String(c?.weekDay || '1'), JOURS_SEMAINE),
        jourMois: dansListe(String(c?.monthDay || '1'), JOURS_MOIS),
        heure: dansListe(String(c?.hour || '8'), HEURES),
        tousLesMois,
        mois: tousLesMois ? [] : selection(c?.selectedMonths, l.mois),
        tousLesExperts,
        experts: tousLesExperts ? [] : selection(c?.expertsList, l.ressources),
        exclureVides: c?.excludeEmpty !== false,
        format: dansListe(String(c?.format || 'csv'), FORMATS)
    };
}

/** Paramètres d'une sauvegarde (test) : sélections retenues dans l'ordre des listes */
export function parametresSauvegarde(f: FormulaireSauvegarde, l: ListesSauvegarde): ParametresSauvegarde {
    return {
        groupAdmin: f.groupeAdmin,
        groupUser: f.groupeUtilisateur,
        groupExpert: f.groupeExpert,
        recipients: selection(f.destinataires, l.comptes),
        allMonths: f.tousLesMois,
        selectedMonths: selection(f.mois, l.mois),
        allExperts: f.tousLesExperts,
        expertsList: selection(f.experts, l.ressources),
        excludeEmpty: f.exclureVides,
        format: f.format
    };
}

/** Configuration enregistrée (ordre des champs de l'ancien écran) */
export function configSauvegarde(f: FormulaireSauvegarde, l: ListesSauvegarde): ConfigAutomatisation {
    const p = parametresSauvegarde(f, l);
    return {
        enabled: f.actif,
        groupAdmin: p.groupAdmin,
        groupUser: p.groupUser,
        groupExpert: p.groupExpert,
        recipients: p.recipients,
        frequency: f.frequence,
        weekDay: f.jourSemaine,
        monthDay: f.jourMois,
        hour: f.heure,
        allMonths: p.allMonths,
        selectedMonths: p.selectedMonths,
        allExperts: p.allExperts,
        expertsList: p.expertsList,
        excludeEmpty: p.excludeEmpty,
        format: p.format
    };
}

/** Test refusé avant le récapitulatif : message, ou null si les paramètres sont complets */
export function testIncomplet(p: ParametresSauvegarde): string | null {
    if (!(p.groupAdmin || p.groupUser || p.groupExpert || p.recipients.length > 0))
        return '❌ Veuillez sélectionner au moins un destinataire';
    if (!p.allMonths && p.selectedMonths.length === 0)
        return '❌ Veuillez sélectionner au moins un mois ou cocher "Toutes les données"';
    if (!p.allExperts && p.expertsList.length === 0)
        return '❌ Veuillez sélectionner au moins un expert ou cocher "Tous les experts"';
    return null;
}

const NOMS_MOIS = [
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

/** « Données incluses » du récapitulatif */
export function libelleMois(p: ParametresSauvegarde, libelleServeur: string | undefined): string {
    if (p.allMonths) return libelleServeur || 'Toutes les données';
    if (p.selectedMonths.length)
        return p.selectedMonths
            .map(m => {
                const [annee, mois] = m.split('-');
                return `${NOMS_MOIS[parseInt(mois ?? '') - 1]} ${annee}`;
            })
            .join(', ');
    return libelleServeur || 'Aucun mois';
}

// ---------- Historique ----------

export const dateEnvoi = (iso: string) => new Date(iso).toLocaleString('fr-FR');

/** Destinataires d'une sauvegarde : nombre (« - » si aucun) et noms (liste enregistrée lisible et non vide) */
export function destinatairesEnvoi(e: EnvoiAutomatisation): { nombre: string; noms: string[] } {
    const nombre = e.recipients_count ? `${e.recipients_count} destinataire(s)` : '-';
    if (e.recipients_list) {
        try {
            const noms = JSON.parse(e.recipients_list) as unknown;
            if (Array.isArray(noms) && noms.length) return { nombre, noms: noms.map(String) };
        } catch {
            /* liste illisible : nombre seul */
        }
    }
    return { nombre, noms: [] };
}
