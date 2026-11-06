// Saisie dans la grille : disponibilité, affectation, localisation d'une demi-journée (règles de l'ancien écran),
// et suivi des affectations à notifier en invitation Outlook
import type { CompteGrille, PeriodeMadGrille, Planning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import type { Profil } from '@/api/types';
import type { AffectationEnAttente, ExpertEnAttente } from '@/liaison';
import { cleCellule, dateAccessible, joursMadVolanteConsommes, type Periode } from './grille';

/** Contexte de la saisie : profil et personne connectée */
export interface ContexteSaisie {
    profil: Profil;
    /** Ressource de l'expert connecté */
    ressourceId: number | null;
    prenom: string;
    nom: string;
}

export interface Cellule {
    ressource: Ressource;
    date: string;
    periode: Periode;
}

/** Changements de cellules : clé → valeur, null pour une cellule supprimée */
export type Changements = Record<string, string | null>;

/** Affectation à suivre pour les invitations, après le changement */
export interface Suivi {
    affectation: string;
    localisation: string;
}

export type Resultat =
    /** Clic sans effet (ligne d'un autre expert) */
    { ignore: true } | { erreur: string } | { changements: Changements; suivi: Suivi | null };

export const MESSAGES = {
    dispoInterdite:
        "Vous n'avez pas les droits pour modifier la disponibilité. Seuls Admin et Expert peuvent le faire.",
    lectureSeule: 'Profil utilisateur : planning en lecture seule',
    horsMad: 'Cette date est hors de la période de MAD de cette ressource',
    congesExpert: "Cette période est en Congés (posée par l'expert). Seul l'expert peut modifier ce statut.",
    indisponible: "La ressource est indisponible ce jour. Vous devez d'abord mettre la disponibilité à 2.",
    enConges: 'La ressource est en congés ce jour. Aucune affectation possible.',
    localisationConges: 'La ressource est en congés ce jour. Aucune modification de localisation possible.',
    localisationDispo: 'Vous devez d\'abord indiquer "Disponible pour l\'ANS" (choix 2) dans la ligne Disponibilité',
    localisationIndispo: 'Vous ne pouvez pas définir une localisation pour une activité "Indisponible"',
    samuObligatoire: 'Veuillez sélectionner un SAMU'
};

const quotaAtteint = (r: Ressource) =>
    `Quota MAD volante atteint : ${r.jours_max_mad} jour(s) maximum déjà consommés sur la période du contrat.`;

/** Expert sur la ligne d'une autre ressource : le clic est sans effet */
const autreLigne = (ctx: ContexteSaisie, c: Cellule) => ctx.profil === 'expert' && c.ressource.id !== ctx.ressourceId;

const quotaMadVolante = (planning: Planning, r: Ressource) =>
    !!r.is_mad_volante &&
    !!r.jours_max_mad &&
    joursMadVolanteConsommes(planning, r.id, r.date_debut, r.date_fin_mad) >= r.jours_max_mad;

/** Localisation effacée : supprimée seulement si elle existe */
function effacer(planning: Planning, changements: Changements, cle: string) {
    if (planning[cle] !== undefined) changements[cle] = null;
}

/**
 * Disponibilité : expert 1 → 2 → 3 (congés) → 1 ; administrateur 1 → 2 → 1 (congés de l'expert intouchables).
 * L'affectation suit (2 si disponible, sinon 1) ; la localisation est effacée en revenant à « Indisponible ».
 */
export function basculerDisponibilite(
    ctx: ContexteSaisie,
    planning: Planning,
    historique: PeriodeMadGrille[] | undefined,
    c: Cellule
): Resultat {
    if (ctx.profil === 'user') return { erreur: MESSAGES.dispoInterdite };
    if (autreLigne(ctx, c)) return { ignore: true };
    if (!dateAccessible(c.ressource, c.date, historique)) return { erreur: MESSAGES.horsMad };
    const id = c.ressource.id;
    const cle = cleCellule(id, 'available', c.date, c.periode);
    const cleAct = cleCellule(id, 'activity', c.date, c.periode);
    const cleLoc = cleCellule(id, 'localisation', c.date, c.periode);
    const actuelle = planning[cle] || '1';
    if (actuelle === '1' && quotaMadVolante(planning, c.ressource)) return { erreur: quotaAtteint(c.ressource) };

    const changements: Changements = {};
    if (ctx.profil === 'expert') {
        if (actuelle === '1') Object.assign(changements, { [cle]: '2', [cleAct]: '2' });
        else if (actuelle === '2') Object.assign(changements, { [cle]: '3', [cleAct]: '1', [cleLoc]: '🏖️' });
        else {
            Object.assign(changements, { [cle]: '1', [cleAct]: '1' });
            effacer(planning, changements, cleLoc);
        }
    } else {
        if (actuelle === '3') return { erreur: MESSAGES.congesExpert };
        if (actuelle === '1') Object.assign(changements, { [cle]: '2', [cleAct]: '2' });
        else {
            Object.assign(changements, { [cle]: '1', [cleAct]: '1' });
            effacer(planning, changements, cleLoc);
        }
    }
    const loc = cleLoc in changements ? changements[cleLoc] : planning[cleLoc];
    return { changements, suivi: { affectation: changements[cleAct]!, localisation: loc || '-' } };
}

/** Affectation existante (3 à 8) à confirmer avant modification (administrateur, utilisateur) */
export interface Confirmation {
    affectation: string;
    localisation: string;
    /** « prénom.nom » de l'auteur, ou vide */
    auteur: string;
    /** Affectation posée par la personne connectée */
    propre: boolean;
}

/** Contrôles avant le changement d'affectation : refus, confirmation, ou changement direct */
export function controlerAffectation(
    ctx: ContexteSaisie,
    planning: Planning,
    historique: PeriodeMadGrille[] | undefined,
    c: Cellule,
    dejaModifiee: boolean
): { ignore: true } | { erreur: string } | { confirmation: Confirmation } | { direct: true } {
    if (ctx.profil === 'user') return { erreur: MESSAGES.lectureSeule };
    if (autreLigne(ctx, c)) return { ignore: true };
    const id = c.ressource.id;
    const dispo = planning[cleCellule(id, 'available', c.date, c.periode)] || '1';
    if (dispo === '1') return { erreur: MESSAGES.indisponible };
    if (dispo === '3') return { erreur: MESSAGES.enConges };
    if (!dateAccessible(c.ressource, c.date, historique)) return { erreur: MESSAGES.horsMad };
    const actuelle = parseInt(planning[cleCellule(id, 'activity', c.date, c.periode)] || '2');
    if (ctx.profil === 'admin' && actuelle >= 3 && actuelle <= 8 && !dejaModifiee) {
        const auteur = planning[cleCellule(id, 'author', c.date, c.periode)] || '';
        return {
            confirmation: {
                affectation: String(actuelle),
                localisation: planning[cleCellule(id, 'localisation', c.date, c.periode)] || '',
                auteur,
                propre: auteur === `${ctx.prenom}.${ctx.nom}`
            }
        };
    }
    return { direct: true };
}

/**
 * Affectation suivante : 2 → 3 → … → 8 → 2 ; la localisation est effacée en quittant ou en retrouvant « En attente » ;
 * l'auteur (« prénom.nom ») est enregistré
 */
export function changerAffectation(ctx: ContexteSaisie, planning: Planning, c: Cellule): Resultat {
    const id = c.ressource.id;
    const cleAct = cleCellule(id, 'activity', c.date, c.periode);
    const cleLoc = cleCellule(id, 'localisation', c.date, c.periode);
    const actuelle = parseInt(planning[cleAct] || '2');
    const suivante = actuelle + 1 > 8 ? 2 : actuelle + 1;
    if (suivante >= 3 && actuelle < 3 && quotaMadVolante(planning, c.ressource))
        return { erreur: quotaAtteint(c.ressource) };
    const changements: Changements = {
        [cleAct]: String(suivante),
        [cleCellule(id, 'author', c.date, c.periode)]: `${ctx.prenom}.${ctx.nom}`
    };
    if (actuelle === 2 || suivante === 2) effacer(planning, changements, cleLoc);
    const loc = cleLoc in changements ? null : planning[cleLoc];
    return { changements, suivi: { affectation: String(suivante), localisation: loc || '-' } };
}

export interface OptionLocalisation {
    icone: string;
    libelle: string;
    /** Valeur enregistrée ; « SAMU » : choix du SAMU */
    valeur: string;
    couleur: string;
}

/** Contrôles avant le choix de la localisation, puis titre et options de la fenêtre */
export function ouvrirLocalisation(
    ctx: ContexteSaisie,
    planning: Planning,
    historique: PeriodeMadGrille[] | undefined,
    c: Cellule
): { ignore: true } | { erreur: string } | { titre: string; options: OptionLocalisation[] } {
    if (autreLigne(ctx, c)) return { ignore: true };
    if (ctx.profil === 'user') return { erreur: MESSAGES.lectureSeule };
    if (!dateAccessible(c.ressource, c.date, historique)) return { erreur: MESSAGES.horsMad };
    const id = c.ressource.id;
    const dispo = planning[cleCellule(id, 'available', c.date, c.periode)] || '1';
    const affectation = planning[cleCellule(id, 'activity', c.date, c.periode)] || '1';
    if (dispo === '3') return { erreur: MESSAGES.localisationConges };
    if (dispo !== '2') return { erreur: MESSAGES.localisationDispo };
    if (affectation === '1') return { erreur: MESSAGES.localisationIndispo };
    const suffixe = ` (${c.periode})`;
    if (affectation === '2')
        return {
            titre: `Où êtes-vous disponible ?${suffixe}`,
            options: [
                { icone: 'home', libelle: 'Je suis en télétravail', valeur: '🏠 Télétravail', couleur: '#3498db' },
                { icone: 'tower', libelle: 'Je suis à PSC', valeur: '🗼 PSC', couleur: '#9b59b6' },
                { icone: 'car', libelle: 'Je peux me déplacer', valeur: '🚗 Déplacement', couleur: '#16a085' }
            ]
        };
    const options: OptionLocalisation[] = [
        { icone: 'home', libelle: 'Télétravail', valeur: '🏠 Télétravail', couleur: '#3498db' },
        { icone: 'tower', libelle: 'PSC', valeur: '🗼 PSC', couleur: '#9b59b6' },
        { icone: 'mic', libelle: 'Autres (Congrès, CFARM, EHESP...)', valeur: '🎤 Autres', couleur: '#16a085' }
    ];
    if (affectation === '3' || affectation === '4')
        options.splice(1, 0, {
            icone: 'siren',
            libelle: 'SAMU (cliquer pour sélectionner)',
            valeur: 'SAMU',
            couleur: '#e67e22'
        });
    return { titre: `Choisir la localisation de l'activité${suffixe}`, options };
}

/** Localisation choisie ; affectation suivie seulement pour une vraie affectation (3 et plus) */
export function choisirLocalisation(planning: Planning, c: Cellule, valeur: string): Resultat {
    const id = c.ressource.id;
    const affectation = planning[cleCellule(id, 'activity', c.date, c.periode)];
    return {
        changements: { [cleCellule(id, 'localisation', c.date, c.periode)]: valeur },
        suivi: affectation && parseInt(affectation) >= 3 ? { affectation, localisation: valeur } : null
    };
}

/** Planning après les changements (cellules supprimées retirées) */
export function appliquer(planning: Planning, changements: Changements): Planning {
    const p = { ...planning };
    for (const [cle, valeur] of Object.entries(changements)) {
        if (valeur === null) delete p[cle];
        else p[cle] = valeur;
    }
    return p;
}

// ---------- Invitations Outlook : affectations en attente ----------

const LIBELLES: Record<string, string> = {
    3: 'SAMU (Déploiement)',
    4: 'SAMU (Dev. usages)',
    5: 'ANS (Déploiement)',
    6: 'ANS (Dev. usages)',
    7: 'Qualification',
    8: 'Divers'
};
const LIBELLES_EMOJI: Record<string, string> = {
    3: '📞 SAMU (Déploiement)',
    4: '📞 SAMU (Dev. usages)',
    5: '📄 ANS (Déploiement)',
    6: '👨‍🏫 ANS (Dev. usages)',
    7: '☑️ Qualification',
    8: '📖 Divers'
};

/**
 * Affectations en attente d'invitation après une saisie (règles de trackAssignment) : comparées à l'état du planning
 * au chargement, nouvelle, modifiée ou supprimée ; retour à l'état initial : retirée.
 * @param enAttente affectations en attente par ressource (modifiées en place)
 * @param initial planning au chargement
 * @param planning planning après la saisie
 */
export function suivreAffectation(
    enAttente: Record<string, ExpertEnAttente>,
    initial: Planning,
    planning: Planning,
    ressource: Ressource,
    comptes: CompteGrille[],
    date: string,
    periode: Periode,
    suivi: Suivi
): void {
    const expert = comptes.find(u => u.resource_id === ressource.id && u.is_expert);
    if (!expert) return;
    const id = ressource.id;
    const nouvelle = parseInt(suivi.affectation);
    const affInitiale = parseInt(initial[cleCellule(id, 'activity', date, periode)] || '1');
    const dispoInitiale = parseInt(initial[cleCellule(id, 'available', date, periode)] || '1');
    const locInitiale = initial[cleCellule(id, 'localisation', date, periode)] || '-';
    const dispo = parseInt(planning[cleCellule(id, 'available', date, periode)] || '1');
    const avait = affInitiale >= 3;
    const aura = nouvelle >= 3;

    const cle = String(id);
    const retirer = () => {
        const e = enAttente[cle];
        if (!e) return;
        const i = e.assignments.findIndex(a => a.date === date && a.period === periode);
        if (i < 0) return;
        e.assignments.splice(i, 1);
        if (e.assignments.length === 0) delete enAttente[cle];
    };
    const expertEnAttente = (): ExpertEnAttente =>
        (enAttente[cle] ??= {
            expertId: expert.id,
            expertEmail: expert.email,
            expertNom: expert.nom,
            expertPrenom: expert.prenom,
            resourceNom: ressource.nom,
            resourcePrenom: ressource.prenom,
            assignments: []
        });

    // Retour exact à l'état initial, ou ni avant ni après une vraie affectation : rien à notifier
    if ((dispo === dispoInitiale && nouvelle === affInitiale) || (!aura && !avait)) {
        retirer();
        return;
    }
    if (avait && !aura) {
        const e = expertEnAttente();
        const i = e.assignments.findIndex(a => a.date === date && a.period === periode);
        if (i >= 0) e.assignments.splice(i, 1);
        e.assignments.push({
            date,
            period: periode,
            activity: LIBELLES_EMOJI[String(affInitiale)] || 'Affectation',
            activityCode: String(affInitiale),
            location: locInitiale || '-',
            actionType: 'deleted',
            oldActivity: LIBELLES[String(affInitiale)] || 'Affectation',
            oldActivityCode: String(affInitiale),
            oldLocation: locInitiale || '-'
        });
        return;
    }
    const affectation: AffectationEnAttente = {
        date,
        period: periode,
        activity: LIBELLES_EMOJI[suivi.affectation] || suivi.affectation,
        activityCode: suivi.affectation,
        location: suivi.localisation || '-',
        actionType: avait ? 'modified' : 'new',
        oldActivity: avait ? LIBELLES[String(affInitiale)] || String(affInitiale) : null,
        oldActivityCode: avait ? String(affInitiale) : null,
        oldLocation: avait ? locInitiale || '-' : null
    };
    const e = expertEnAttente();
    const i = e.assignments.findIndex(a => a.date === date && a.period === periode);
    if (i >= 0) e.assignments[i] = affectation;
    else e.assignments.push(affectation);
}

/** Compteurs des affectations en attente (enveloppe de l'en-tête) */
export function compteursEnAttente(enAttente: Record<string, ExpertEnAttente>) {
    let nouvelles = 0;
    let modifications = 0;
    let suppressions = 0;
    for (const e of Object.values(enAttente))
        for (const a of e.assignments) {
            if (a.actionType === 'deleted') suppressions++;
            else if (a.actionType === 'modified') modifications++;
            else nouvelles++;
        }
    return { nouvelles, modifications, suppressions };
}
