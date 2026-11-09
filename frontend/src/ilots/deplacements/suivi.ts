// Reporting et administration des déplacements : synthèse et observation des bons de commande, filtres de la liste,
// export CSV, tri des tableaux (comme l'ancien écran : valeurs affichées, valeurs vides en fin de liste)
import type { AmoaCed, BonCommandeSuivi, DeplacementReporting } from '@/api/deplacements';
import { dateFr } from './calculs';

// ── Tri ──────────────────────────────────────────────────────────────────────

export type TypeTri = 'date' | 'nombre' | 'texte';

/** Tri sur la valeur affichée d'une colonne : dates « JJ/MM/AAAA », nombres, texte ; valeurs vides (« - ») en fin */
export function trierPar<T>(lignes: T[], valeur: (l: T) => string, type: TypeTri, croissant: boolean): T[] {
    const vide = (v: string) => v === '-' || v === '';
    const date = (v: string) => {
        const [j, m, a] = v.split('/').map(Number);
        return new Date(a ?? 0, (m ?? 1) - 1, j ?? 1).getTime();
    };
    const sens = croissant ? 1 : -1;
    return [...lignes].sort((x, y) => {
        const a = valeur(x).trim();
        const b = valeur(y).trim();
        if (vide(a) || vide(b)) return vide(a) === vide(b) ? 0 : vide(a) ? 1 : -1;
        const comparaison =
            type === 'date'
                ? date(a) - date(b)
                : type === 'nombre'
                  ? (parseFloat(a.replace(/[^0-9.-]/g, '')) || 0) - (parseFloat(b.replace(/[^0-9.-]/g, '')) || 0)
                  : a.localeCompare(b, 'fr', { sensitivity: 'base' });
        return sens * comparaison;
    });
}

/** État du tri d'un tableau : colonne et sens ; un second clic sur la même colonne inverse le sens */
export interface EtatTri<C extends string> {
    colonne: C;
    croissant: boolean;
}

export const basculerTri = <C extends string>(tri: EtatTri<C> | null, colonne: C): EtatTri<C> =>
    tri?.colonne === colonne ? { colonne, croissant: !tri.croissant } : { colonne, croissant: true };

export const classeTri = <C extends string>(tri: EtatTri<C> | null, colonne: C) =>
    tri?.colonne === colonne ? (tri.croissant ? 'asc' : 'desc') : undefined;

// ── Bons de commande ─────────────────────────────────────────────────────────

export type Ton = 'vert' | 'orange' | 'rouge' | 'bleu';

/** Ligne de la synthèse du reporting */
export interface LigneSynthese {
    bc: BonCommandeSuivi;
    bon: string;
    periode: string;
    solde: number;
    taux: number;
    tonSolde: Ton;
    tonBarre: Ton;
}

export function ligneSynthese(bc: BonCommandeSuivi): LigneSynthese {
    const solde = bc.uo_commandees - bc.uo_consommees;
    const taux = bc.uo_commandees > 0 ? Math.round((bc.uo_consommees / bc.uo_commandees) * 100) : 0;
    return {
        bc,
        bon: `${bc.intitule}${bc.titulaire ? ` - ${bc.titulaire}` : ''}`,
        periode: `${dateFr(bc.date_debut)} - ${dateFr(bc.date_fin)}`,
        solde,
        taux,
        tonSolde: solde < 0 ? 'rouge' : solde < bc.uo_commandees * 0.2 ? 'orange' : 'vert',
        tonBarre: taux > 100 ? 'rouge' : taux > 80 ? 'orange' : 'vert'
    };
}

/** Observation d'un bon de commande (administration) : texte, couleur, gras */
export interface Observation {
    texte: string;
    ton: Ton;
    gras: boolean;
}

/** Ligne de la liste des bons de commande (administration) */
export interface LigneBon {
    bc: BonCommandeSuivi;
    commandees: number;
    consommees: number;
    /** UO consommées au-delà de la commande (négatif : sous-consommation) */
    ecart: number;
    surconsommation: boolean;
    observation: Observation;
}

export function ligneBon(bc: BonCommandeSuivi): LigneBon {
    const commandees = bc.uo_commandees || 0;
    const consommees = bc.uo_consommees || 0;
    const ecart = consommees - commandees;
    const surconsommation = consommees > commandees;
    let observation: Observation;
    if (bc.solde) {
        if (bc.regularisation_cible_bdc_id) {
            const cible = bc.regularisation_cible_intitule || `BDC #${bc.regularisation_cible_bdc_id}`;
            observation = {
                texte: `✅ Surconsommation régularisée sur le bon de commande ${cible}`,
                ton: 'vert',
                gras: true
            };
        } else if (surconsommation) {
            observation = {
                texte: `⚠️ Régularisation à prévoir pour ${ecart} UO sur le prochain bon de commande`,
                ton: 'rouge',
                gras: true
            };
        } else if (consommees < commandees) {
            observation = { texte: `ℹ️ Réfaction à prévoir pour ${Math.abs(ecart)} UO`, ton: 'bleu', gras: true };
        } else observation = { texte: '✅ Équilibré', ton: 'vert', gras: false };
    } else {
        const reste = commandees - consommees;
        observation =
            reste < 0
                ? { texte: `${reste} UO (surconsommation)`, ton: 'rouge', gras: false }
                : { texte: `${reste} UO disponibles`, ton: 'vert', gras: false };
    }
    return { bc, commandees, consommees, ecart, surconsommation, observation };
}

export type ColonneBon = 'intitule' | 'titulaire' | 'debut' | 'fin' | 'consommees' | 'commandees' | 'solde';

const COLONNES_BON: Record<ColonneBon, [TypeTri, (l: LigneBon) => string]> = {
    intitule: ['texte', l => l.bc.intitule],
    titulaire: ['texte', l => l.bc.titulaire || '-'],
    debut: ['date', l => dateFr(l.bc.date_debut)],
    fin: ['date', l => dateFr(l.bc.date_fin)],
    consommees: ['nombre', l => String(l.consommees)],
    commandees: ['nombre', l => String(l.commandees)],
    solde: ['texte', l => (l.bc.solde ? 'OUI' : 'NON')]
};

export function trierBons(lignes: LigneBon[], tri: EtatTri<ColonneBon> | null) {
    if (!tri) return lignes;
    const [type, valeur] = COLONNES_BON[tri.colonne];
    return trierPar(lignes, valeur, type, tri.croissant);
}

/** Bons de commande cibles d'une régularisation : actifs, non soldés, autres que le bon source */
export const ciblesRegularisation = (bons: BonCommandeSuivi[], sourceId: number) =>
    bons.filter(b => b.id !== sourceId && !b.solde && b.actif !== 0);

/** Premier jour du mois suivant (« AAAA-MM-JJ », comme l'ancien écran : date UTC du minuit local) */
export function premierDuMoisSuivant(aujourdhui = new Date()) {
    return new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + 1, 1).toISOString().split('T')[0] ?? '';
}

// ── Liste des déplacements ───────────────────────────────────────────────────

const nomComplet = (nom: string, prenom: string | null | undefined) => `${nom.toUpperCase()} ${prenom || ''}`.trim();

/** AMOA CED d'un déplacement : liste des AMOA CED (administrateur), sinon nom porté par le déplacement */
export function nomAmoa(d: DeplacementReporting, amoaCed: AmoaCed[], defaut: (id: number) => string) {
    if (!d.amoa_ced_id) return null;
    const u = amoaCed.find(a => a.id === d.amoa_ced_id);
    if (u) return `${u.nom.toUpperCase()} ${u.prenom}`;
    if (d.amoa_ced_nom) return nomComplet(d.amoa_ced_nom, d.amoa_ced_prenom);
    return defaut(d.amoa_ced_id);
}

export interface LigneReporting {
    d: DeplacementReporting;
    /** « N° - titulaire », vide sans bon de commande (« À affecter ») */
    bon: string;
    debut: string;
    fin: string;
    createur: string;
    amoa: string;
}

export function ligneReporting(d: DeplacementReporting, amoaCed: AmoaCed[]): LigneReporting {
    return {
        d,
        bon: d.bon_commande_intitule
            ? `${d.bon_commande_intitule}${d.bon_commande_titulaire ? ` - ${d.bon_commande_titulaire}` : ''}`
            : '',
        debut: dateFr(d.date_debut),
        fin: dateFr(d.date_fin),
        createur: d.user_nom ? nomComplet(d.user_nom, d.user_prenom) : '-',
        amoa: nomAmoa(d, amoaCed, id => `AMOA CED #${id}`) ?? '-'
    };
}

export type ColonneReporting = 'bon' | 'debut' | 'fin' | 'createur' | 'amoa' | 'samu' | 'ville' | 'uo';

const COLONNES_REPORTING: Record<ColonneReporting, [TypeTri, (l: LigneReporting) => string]> = {
    bon: ['texte', l => l.bon || '⚠️ À affecter'],
    debut: ['date', l => l.debut],
    fin: ['date', l => l.fin],
    createur: ['texte', l => l.createur],
    amoa: ['texte', l => l.amoa],
    samu: ['texte', l => l.d.samu],
    ville: ['texte', l => l.d.ville],
    uo: ['nombre', l => String(l.d.nb_uo)]
};

export function trierReporting(lignes: LigneReporting[], tri: EtatTri<ColonneReporting> | null) {
    if (!tri) return lignes;
    const [type, valeur] = COLONNES_REPORTING[tri.colonne];
    return trierPar(lignes, valeur, type, tri.croissant);
}

/** Filtres de la liste : bon de commande, période (début à partir de, fin jusqu'à), SAMU, AMOA CED */
export interface FiltresReporting {
    bon: string;
    debut: string;
    fin: string;
    samu: string;
    amoa: string;
}

export const filtresVides = (): FiltresReporting => ({ bon: '', debut: '', fin: '', samu: '', amoa: '' });

export const filtrer = (liste: DeplacementReporting[], f: FiltresReporting) =>
    liste.filter(
        d =>
            (!f.bon || d.bon_commande_id === parseInt(f.bon)) &&
            (!f.debut || d.date_debut >= f.debut) &&
            (!f.fin || d.date_fin <= f.fin) &&
            (!f.samu || d.samu === f.samu) &&
            (!f.amoa || d.amoa_ced_id === parseInt(f.amoa))
    );

/** Compteur sous la liste */
export const compteur = (liste: DeplacementReporting[]) =>
    liste.length
        ? `${liste.length} déplacement(s) - Total: ${liste.reduce((s, d) => s + (d.nb_uo || 0), 0)} UO`
        : '0 déplacement(s)';

/** SAMU présents dans les déplacements, triés */
export const samusPresents = (liste: DeplacementReporting[]) =>
    [...new Set(liste.map(d => d.samu).filter(Boolean))].sort();

/**
 * AMOA CED proposés au filtre : ceux de la liste des AMOA CED (administrateur) présents dans les déplacements, triés
 * par nom ; sinon ceux portés par les déplacements
 */
export function amoaPresents(liste: DeplacementReporting[], amoaCed: AmoaCed[]): { id: number; libelle: string }[] {
    if (amoaCed.length) {
        const ids = new Set(liste.map(d => d.amoa_ced_id).filter(Boolean));
        return amoaCed
            .filter(u => ids.has(u.id))
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
            .map(u => ({ id: u.id, libelle: `${u.nom.toUpperCase()} ${u.prenom}` }));
    }
    const noms = new Map<number, string>();
    for (const d of liste) {
        if (d.amoa_ced_id)
            noms.set(
                d.amoa_ced_id,
                d.amoa_ced_nom ? nomComplet(d.amoa_ced_nom, d.amoa_ced_prenom) : `AMOA CED #${d.amoa_ced_id}`
            );
    }
    return [...noms.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, libelle]) => ({ id, libelle }));
}

/** Export CSV de la liste filtrée : séparateur « ; », BOM UTF-8 (Excel), valeurs telles quelles */
export function csvReporting(liste: DeplacementReporting[], amoaCed: AmoaCed[]) {
    const entetes = [
        'N° de BDC',
        'Titulaire',
        'Date début',
        'Date fin',
        'Créé par',
        'AMOA CED',
        'SAMU',
        'Ville',
        'Nb UO'
    ];
    const lignes = liste.map(d => [
        d.bon_commande_intitule || 'À affecter',
        d.bon_commande_titulaire || '',
        d.date_debut,
        d.date_fin,
        d.user_nom ? nomComplet(d.user_nom, d.user_prenom) : '',
        nomAmoa(d, amoaCed, () => '') ?? '',
        d.samu,
        d.ville,
        d.nb_uo
    ]);
    return '\uFEFF' + entetes.join(';') + '\n' + lignes.map(l => l.join(';')).join('\n');
}

export const nomFichierCsv = (aujourdhui = new Date()) =>
    `export_deplacements_${aujourdhui.toISOString().split('T')[0]}.csv`;
