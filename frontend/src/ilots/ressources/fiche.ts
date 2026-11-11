// Fiche de la ressource (sans affichage) : contacts RH (une adresse par ligne), taux enregistré, contrôles et corps de
// la fiche, contrôles des périodes de MAD et des particularités, comme l'ancien écran
import type { CorpsFiche, PeriodeMad, Ressource } from '@/api/ressources';

// ---------- Adresses e-mail (même règle que src/lib/email.js côté serveur) ----------

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function estEmail(valeur: string): boolean {
    const s = valeur.trim();
    if (!s || s.length > 254) return false;
    const at = s.lastIndexOf('@');
    if (at < 1 || s.indexOf('@') !== at) return false;
    const local = s.slice(0, at);
    const labels = s.slice(at + 1).split('.');
    if (local.length > 64 || !LOCAL.test(local)) return false;
    if (labels.length < 2 || !labels.every(l => LABEL.test(l))) return false;
    return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]!);
}

/** Une adresse par ligne : adresses valides (sans doublon, casse ignorée) et lignes invalides ; lignes vides ignorées */
export function lignesEmail(texte: string): { valides: string[]; invalides: string[] } {
    const valides: string[] = [];
    const invalides: string[] = [];
    for (const brute of texte.split(/\r?\n/)) {
        const ligne = brute.trim();
        if (!ligne) continue;
        if (!estEmail(ligne)) invalides.push(ligne);
        else if (!valides.some(v => v.toLowerCase() === ligne.toLowerCase())) valides.push(ligne);
    }
    return { valides, invalides };
}

// ---------- Fiche ----------

export interface FormulaireFiche {
    nom: string;
    prenom: string;
    trigramme: string;
    samu: string;
    fonction: string;
    es: string;
    madVolante: boolean;
    dateDebutMad: string;
    dateFinMad: string;
    joursMaxMad: string;
    principal: string[];
    secondaire: string[];
    astreinteHo: boolean;
    astreinteHno: boolean;
    astreinteApd: boolean;
    dateAstreinte: string;
    contacts: string;
}

/** Fiche d'une ressource ; SAMU absent des localisations : aucun (liste sans option correspondante) */
export function formulaireFiche(
    r: Ressource,
    affectation: { principal: string[]; secondaire: string[] } | undefined,
    samus: ReadonlyArray<string>
): FormulaireFiche {
    return {
        nom: r.nom,
        prenom: r.prenom,
        trigramme: r.trigramme || '',
        samu: samus.includes(r.samu) ? r.samu : '',
        fonction: r.fonction || '',
        es: r.es_rattachement || '',
        madVolante: !!r.is_mad_volante,
        dateDebutMad: r.date_debut || '',
        dateFinMad: r.date_fin_mad || '',
        joursMaxMad: r.jours_max_mad ? String(r.jours_max_mad) : '',
        principal: [...(affectation?.principal ?? [])],
        secondaire: [...(affectation?.secondaire ?? [])],
        astreinteHo: !!r.astreinte_ho,
        astreinteHno: !!r.astreinte_volontaire,
        astreinteApd: !!r.astreinte_apd,
        dateAstreinte: r.astreinte_date_activation || '',
        contacts: r.contacts_rh || ''
    };
}

/** Fiche non enregistrable : message de l'ancien écran (contacts : adresses invalides à corriger), ou null */
export function ficheIncomplete(f: FormulaireFiche): { message: string; contacts: boolean } | null {
    if (f.madVolante) {
        if (!f.dateDebutMad) return { message: 'Renseignez la date de début de la MAD.', contacts: false };
        if (f.dateFinMad && f.dateFinMad < f.dateDebutMad)
            return { message: 'La date de fin de la MAD précède sa date de début.', contacts: false };
    }
    const { invalides } = lignesEmail(f.contacts);
    if (invalides.length)
        return {
            message: `Contacts RH : adresse(s) e-mail invalide(s)\n\n${invalides.join('\n')}\n\nCorrigez ou supprimez ces lignes (une adresse par ligne).`,
            contacts: true
        };
    return null;
}

/**
 * Taux enregistré avec la fiche : celui de la période en cours ; à défaut (ou s'il vaut 0, anomalie conservée), celui
 * de la période qui commence le plus tard
 */
export function tauxEnregistre(historique: PeriodeMad[], aujourdhui: string): number {
    let taux = 0;
    for (const p of historique) {
        if (p.date_debut <= aujourdhui && (!p.date_fin || p.date_fin >= aujourdhui)) {
            taux = p.taux;
            break;
        }
    }
    if (taux === 0 && historique.length)
        taux = [...historique].sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0]!.taux;
    return taux;
}

/** Fiche enregistrée, comme l'ancien écran : champs tels que saisis, date de fin de la ressource conservée */
export function corpsFiche(f: FormulaireFiche, r: Ressource, taux: number): CorpsFiche {
    return {
        nom: f.nom,
        prenom: f.prenom,
        trigramme: f.trigramme,
        email: null,
        telephone: null,
        taux,
        samu: f.samu,
        date_debut: f.dateDebutMad || null,
        date_fin: r.date_fin || null,
        es_rattachement: f.es || null,
        fonction: f.fonction || null,
        contacts_rh: lignesEmail(f.contacts).valides.join('\n') || null,
        astreinte_volontaire: f.astreinteHno,
        astreinte_ho: f.astreinteHo,
        astreinte_apd: f.astreinteApd,
        astreinte_date_activation: f.dateAstreinte || null,
        is_mad_volante: f.madVolante ? 1 : 0,
        date_fin_mad: f.dateFinMad || null,
        jours_max_mad: f.joursMaxMad ? parseInt(f.joursMaxMad) : null
    };
}

/** Consultation RH : ancienneté du régime d'astreintes HNO, « (depuis N mois) » à partir d'un mois */
export function depuisMois(date: string | null, maintenant = new Date()): string {
    if (!date) return '';
    const d = new Date(date);
    const mois = (maintenant.getFullYear() - d.getFullYear()) * 12 + maintenant.getMonth() - d.getMonth();
    return mois > 0 ? ` (depuis ${mois} mois)` : '';
}

// ---------- Périodes de MAD et particularités ----------

/** Période saisie incomplète ou incohérente : message, ou null */
export function periodeIncomplete(debut: string, fin: string, taux: string): string | null {
    if (!debut || taux === '') return 'Veuillez remplir la date de début et le taux';
    if (fin && debut > fin) return 'La date de fin doit être postérieure à la date de début';
    return null;
}

/** Particularité ajoutée incomplète ou incohérente : message, ou null (la modification n'est pas contrôlée) */
export function particulariteIncomplete(debut: string, fin: string, taux: string): string | null {
    if (!debut || !fin || taux === '') return 'Veuillez remplir les dates et le taux';
    if (debut > fin) return 'La date de fin doit être postérieure à la date de début';
    return null;
}
