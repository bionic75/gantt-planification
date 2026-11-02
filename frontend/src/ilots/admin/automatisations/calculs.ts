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

// ---------- N°3 : notifications Teams ----------

/** Types de notifications envoyées vers Teams (icônes de la barre d'onglets et des demandes) */
export const NOTIFICATIONS_TEAMS: ReadonlyArray<Option & { icone: string }> = [
    {
        valeur: 'affectation',
        libelle: "Nouvelle affectation d'expert",
        icone: '<path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/>'
    },
    {
        valeur: 'demande',
        libelle: "Demande d'affectation reçue",
        icone: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'
    },
    {
        valeur: 'astreinte',
        libelle: 'Nouvelle astreinte/HNO créée',
        icone: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
    },
    {
        valeur: 'evenement',
        libelle: 'Nouvel événement renseigné',
        icone: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'
    }
];

/** Type d'une notification de l'historique Teams */
export const TYPES_ENVOI_TEAMS: Record<string, string> = {
    affectation: '📅 Affectation',
    demande: '✉️ Demande',
    astreinte: '🔔 Astreinte/HNO',
    evenement: '📆 Événement'
};

export interface FormulaireTeams {
    actif: boolean;
    /** Adresse du canal ; vide sans configuration (l'ancien écran proposait une adresse réelle par défaut) */
    adresse: string;
    notifications: string[];
}

export const formulaireTeams = (c: ConfigAutomatisation | null | undefined): FormulaireTeams => ({
    actif: !!c?.enabled,
    adresse: typeof c?.teamsEmail === 'string' ? c.teamsEmail : '',
    notifications: selection(c?.notifications, NOTIFICATIONS_TEAMS)
});

/** Configuration enregistrée : types dans l'ordre de la liste */
export const configTeams = (f: FormulaireTeams): ConfigAutomatisation => ({
    enabled: f.actif,
    teamsEmail: f.adresse,
    notifications: selection(f.notifications, NOTIFICATIONS_TEAMS)
});

// ---------- N°4 : workflow CRA ----------

/** Compte RH proposé comme viseur ou DRH (champs repris tels quels, comme les attributs de l'ancien écran) */
export interface CompteRh {
    id: number;
    nom: string | null;
    prenom: string | null;
    email: string | null;
}

export const libelleRh = (u: CompteRh) => `${(u.nom || '').toUpperCase()} ${u.prenom || ''}`;

export const JOURS_DECLENCHEMENT: ReadonlyArray<Option> = Array.from({ length: 28 }, (_, i) => ({
    valeur: String(i + 1),
    libelle: String(i + 1)
}));

export interface FormulaireCra {
    actif: boolean;
    jour: string;
    /** Viseurs : identifiant du compte (texte), '' : aucun */
    n1: string;
    n2: string;
    drh: number[];
}

export function formulaireCra(c: ConfigAutomatisation | null | undefined, rh: ReadonlyArray<CompteRh>): FormulaireCra {
    const comptes = rh.map(u => ({ valeur: String(u.id), libelle: libelleRh(u) }));
    // Jour absent ou inconnu : première option (1), comme une liste sans option choisie
    const jour = dansListe(String(c?.day ?? ''), JOURS_DECLENCHEMENT) || '1';
    return {
        actif: !!c?.enabled,
        jour,
        n1: dansListe(String(c?.admin_n1_id || ''), comptes),
        n2: dansListe(String(c?.admin_n2_id || ''), comptes),
        drh: selection(
            c?.drh_ans_ids,
            rh.map(u => ({ valeur: u.id, libelle: '' }))
        )
    };
}

/**
 * Configuration enregistrée, comme l'ancien écran : viseur sans compte choisi → identifiant null, e-mail vide et nom
 * « » (espace) ; valeurs absentes des comptes écrites telles quelles (« null »)
 */
export function configCra(f: FormulaireCra, rh: ReadonlyArray<CompteRh>): ConfigAutomatisation {
    const compte = (id: string) => rh.find(u => String(u.id) === id);
    const viseur = (id: string) => {
        const u = compte(id);
        return {
            id: id || null,
            email: u ? String(u.email) || '' : '',
            nom: u ? `${String(u.prenom) || ''} ${String(u.nom) || ''}` : ' '
        };
    };
    const n1 = viseur(f.n1);
    const n2 = viseur(f.n2);
    const drh = rh.filter(u => f.drh.includes(u.id));
    return {
        enabled: f.actif,
        day: parseInt(f.jour) || 1,
        admin_n1_id: n1.id,
        admin_n1_email: n1.email,
        admin_n1_nom: n1.nom,
        admin_n2_id: n2.id,
        admin_n2_email: n2.email,
        admin_n2_nom: n2.nom,
        drh_ans_ids: drh.map(u => u.id),
        drh_ans_infos: drh.map(u => ({
            id: u.id,
            email: String(u.email) || '',
            nom: `${String(u.prenom) || ''} ${String(u.nom) || ''}`.trim()
        }))
    };
}

/** Ligne du journal détaillé du test : couleur selon son contenu */
export function couleurJournal(ligne: string): 'ok' | 'erreur' | 'etape' | 'detail' | 'normal' {
    if (ligne.includes('✅')) return 'ok';
    if (ligne.includes('❌') || ligne.includes('⚠️')) return 'erreur';
    if (ligne.includes('───')) return 'etape';
    if (ligne.startsWith('  •') || ligne.startsWith('  ')) return 'detail';
    return 'normal';
}

// ---------- N°5 à n°8 : astreintes HO et HO ANS ----------

export const JOURS_HO: ReadonlyArray<Option> = [
    [1, 'lundi'],
    [2, 'mardi'],
    [3, 'mercredi'],
    [4, 'jeudi'],
    [5, 'vendredi'],
    [6, 'samedi'],
    [0, 'dimanche']
].map(([v, l]) => ({ valeur: String(v), libelle: String(l) }));

/** Nombre d'une liste (heure, jour) : valeur absente ou inconnue → null (parseInt('') envoyé en JSON) */
const entier = (v: string) => {
    const n = parseInt(v);
    return Number.isNaN(n) ? null : n;
};

export interface FormulaireHo {
    actif: boolean;
    heure: string;
    sujet: string;
    corps: string;
    destinataires: number[];
    /** N°5 et n°7 */
    jour: string;
    tousLesExperts: boolean;
    /** N°6 et n°8 */
    jours: string[];
    semaine: 'current' | 'next';
    groupeAdmin: boolean;
    groupeUtilisateur: boolean;
    groupeExpert: boolean;
}

/** Formulaire d'une automatisation HO (valeurs par défaut de l'écran ; sujet et corps : modèles du serveur) */
export function formulaireHo(
    n: 5 | 6 | 7 | 8,
    c: ConfigAutomatisation | null | undefined,
    modele: { subject: string; body: string },
    destinataires: ReadonlyArray<Option<number>>
): FormulaireHo {
    const jours = Array.isArray(c?.weekDays) ? (c.weekDays as unknown[]).map(Number) : [1];
    return {
        actif: !!c?.enabled,
        heure: dansListe(String(c?.hour ?? (n === 5 || n === 7 ? 9 : 8)), HEURES),
        sujet: (c?.subject as string) || modele.subject,
        corps: (c?.body as string) || modele.body,
        // Sélection d'après le texte des identifiants (configurations enregistrées en texte ou en nombre)
        destinataires: selection(
            Array.isArray(c?.recipients) ? (c.recipients as unknown[]).map(String) : [],
            destinataires.map(o => ({ ...o, valeur: String(o.valeur) }))
        ).map(Number),
        jour: dansListe(String(c?.weekDay ?? 4), JOURS_HO),
        tousLesExperts: c?.allExperts !== false,
        jours: JOURS_HO.filter(j => jours.includes(Number(j.valeur))).map(j => j.valeur),
        semaine: c?.week === 'next' ? 'next' : 'current',
        groupeAdmin: !!c?.groupAdmin,
        groupeUtilisateur: !!c?.groupUser,
        groupeExpert: !!c?.groupExpert
    };
}

/** Configuration enregistrée d'une automatisation HO (ordre des champs de l'ancien écran) */
export function configHo(
    n: 5 | 6 | 7 | 8,
    f: FormulaireHo,
    destinataires: ReadonlyArray<Option<number>>
): ConfigAutomatisation {
    const base = { enabled: f.actif, hour: entier(f.heure), subject: f.sujet.trim(), body: f.corps };
    const choisis = selection(f.destinataires, destinataires);
    if (n === 5 || n === 7)
        return { ...base, weekDay: entier(f.jour), allExperts: f.tousLesExperts, recipients: choisis };
    return {
        ...base,
        weekDays: JOURS_HO.filter(j => f.jours.includes(j.valeur)).map(j => Number(j.valeur)),
        week: f.semaine,
        groupAdmin: f.groupeAdmin,
        groupUser: f.groupeUtilisateur,
        groupExpert: f.groupeExpert,
        recipients: choisis
    };
}
