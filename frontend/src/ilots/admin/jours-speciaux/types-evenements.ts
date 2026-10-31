// Types d'événements et reprise des données (sans affichage) : banque d'icônes, gabarits de couleurs, suggestion d'un
// type d'après un libellé, filtre et tri de la reprise
import type { EvenementReprise, ModificationReprise, TypeAdmin } from '@/api/typesEvenements';

/** Icônes proposées pour un type (nom enregistré en base, libellé de l'info-bulle) */
export const BANQUE_ICONES: ReadonlyArray<readonly [string, string]> = [
    ['graduation', 'Formation'],
    ['presentation', 'Présentation / congrès'],
    ['book', 'Documentation'],
    ['lightbulb', 'Idée / atelier'],
    ['video', 'Visioconférence'],
    ['mic', 'Intervention'],
    ['power', 'Mise en service'],
    ['rocket', 'Lancement'],
    ['flag', 'Jalon'],
    ['target', 'Objectif'],
    ['star', 'Temps fort'],
    ['check', 'Validation'],
    ['clipboardCheck', 'Recette / VFT'],
    ['listChecks', 'Vérifications'],
    ['clipboard', 'Compte rendu'],
    ['shield', 'Sécurité'],
    ['key', 'Accès'],
    ['flask', 'Tests'],
    ['lifebuoy', 'Accompagnement / support'],
    ['headset', 'Assistance'],
    ['phone', 'Téléphonie'],
    ['smartphone', 'Mobile'],
    ['wifi', 'Réseau'],
    ['server', 'Infrastructure'],
    ['database', 'Données'],
    ['cog', 'Paramétrage'],
    ['pin', 'Visite terrain'],
    ['building', 'Site / établissement'],
    ['eye', 'Observation'],
    ['briefcase', 'Métier'],
    ['map', 'Déplacement'],
    ['car', 'Voiture'],
    ['truck', 'Livraison'],
    ['plane', 'Avion'],
    ['siren', 'Urgence / SAMU'],
    ['tower', 'Centre de régulation'],
    ['wrench', 'Intervention technique'],
    ['camera', 'Photos'],
    ['users', 'Équipe'],
    ['user', 'Personne'],
    ['hand', 'Accueil'],
    ['heart', 'Convivialité'],
    ['calendar', 'Date'],
    ['bell', 'Rappel'],
    ['megaphone', 'Communication'],
    ['mail', 'Courrier'],
    ['chart', 'Suivi'],
    ['doc', 'Document'],
    ['hourglass', 'Attente'],
    ['timer', 'Délai'],
    ['crown', 'Direction'],
    ['umbrella', 'Congés'],
    ['coffee', 'Pause'],
    ['palette', 'Divers'],
    ['tag', 'Autre']
];

/** Couleurs d'un type : fond, texte, bordure */
export interface Couleurs {
    bg: string;
    text: string;
    border: string;
}

/** Gabarits de couleurs proposés */
export const GABARITS: ReadonlyArray<Couleurs & { n: string }> = [
    { n: 'Jaune · texte bleu', bg: '#ffea00', text: '#0008ff', border: '#000000' },
    { n: 'Jaune · texte rouge', bg: '#ffea00', text: '#d20906', border: '#000000' },
    { n: 'Jaune · texte magenta', bg: '#ffea00', text: '#c2059a', border: '#000000' },
    { n: 'Jaune · texte noir', bg: '#ffeb3b', text: '#000000', border: '#000000' },
    { n: 'Bleu vif · texte blanc', bg: '#0011ff', text: '#ffffff', border: '#000000' },
    { n: 'Bleu · texte blanc', bg: '#0277bd', text: '#ffffff', border: '#01579b' },
    { n: 'Bleu nuit · texte blanc', bg: '#1565c0', text: '#ffffff', border: '#0d47a1' },
    { n: 'Violet · texte blanc', bg: '#7b1fa2', text: '#ffffff', border: '#4a0072' },
    { n: 'Rose · texte blanc', bg: '#ad1457', text: '#ffffff', border: '#78002e' },
    { n: 'Rouge · texte blanc', bg: '#c62828', text: '#ffffff', border: '#8e0000' },
    { n: 'Orange foncé · texte blanc', bg: '#e65100', text: '#ffffff', border: '#bf360c' },
    { n: 'Orange clair · texte noir', bg: '#ffb74d', text: '#000000', border: '#e65100' },
    { n: 'Vert foncé · texte blanc', bg: '#2e7d32', text: '#ffffff', border: '#1b5e20' },
    { n: 'Vert clair · texte vert', bg: '#dff0d8', text: '#427645', border: '#000000' },
    { n: 'Turquoise · texte blanc', bg: '#00897b', text: '#ffffff', border: '#004d40' },
    { n: 'Gris bleu · texte blanc', bg: '#546e7a', text: '#ffffff', border: '#263238' },
    { n: 'Gris clair · texte sombre', bg: '#eceff1', text: '#263238', border: '#90a4ae' },
    { n: 'Blanc · bordure grise', bg: '#ffffff', text: '#333333', border: '#9e9e9e' }
];

/** Couleurs d'un nouveau type */
export const COULEURS_PAR_DEFAUT: Couleurs = { bg: '#ffeb3b', text: '#000000', border: '#000000' };

/** Gabarit de ces couleurs, 'custom' si aucun ne correspond */
export function gabaritDe(c: Couleurs): number | 'custom' {
    const i = GABARITS.findIndex(x => x.bg === c.bg && x.text === c.text && x.border === c.border);
    return i >= 0 ? i : 'custom';
}

export const couleursDuType = (t: TypeAdmin): Couleurs => ({
    bg: t.bg_color,
    text: t.text_color,
    border: t.border_color
});

/** Texte comparable : minuscules, sans accents ni ponctuation */
export const normaliser = (t: unknown) =>
    String(t ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/** Libellés historiques (anciens gabarits d'événements) → code du type */
const LIBELLES_HISTORIQUES: ReadonlyArray<readonly [string, string]> = [
    ['reunion de lancement strategique', 'reunionLancement'],
    ['accomp post dem', 'apd'],
    ['accompagnement post demarrage', 'apd'],
    ['mise en service', 'mes'],
    ['visite terrain', 'visite'],
    ['visite metier', 'visiteMetier'],
    ['visite post mes', 'visitePostMes'],
    ['visite ob', 'visiteOb'],
    ['vft sur site', 'vftSite'],
    ['verif prerequis', 'verifPrereq'],
    ['verification des prerequis', 'verifPrereq'],
    ['formations utilisateurs', 'formation'],
    ['formation', 'formation'],
    ['congres', 'congres']
];

/**
 * Type suggéré pour un libellé : libellé historique (égal, ou suivi d'autres mots), sinon type (autre que « Autre(s) »)
 * de même libellé long
 */
export function suggestion(libelle: string, types: TypeAdmin[]): TypeAdmin | null {
    const l = normaliser(libelle);
    const historique = LIBELLES_HISTORIQUES.find(([k]) => l === k || l.startsWith(k + ' '));
    if (historique) return types.find(t => t.code === historique[1]) ?? null;
    return types.find(t => !t.is_other && normaliser(t.label_long) === l) ?? null;
}

// ---------- Reprise ----------

/** « AAAA-MM-JJ » → « JJ/MM/AAAA » */
export const dateFr = (iso: string | null | undefined) => (iso ? String(iso).split('-').reverse().join('/') : '');

/** Onglets : « À traiter » = sans type en base, « Traité » = type enregistré */
export type OngletReprise = 'todo' | 'done';
export const traite = (e: EvenementReprise) => !!e.type_id;

export type CleColonne = 'start' | 'end' | 'type' | 'label' | 'loc' | 'parts' | 'creator';

/** Ligne avec ses modifications non enregistrées */
export interface EtatReprise {
    modifications: Record<number, ModificationReprise>;
    types: TypeAdmin[];
}

export const typeDe = (e: EvenementReprise, m: EtatReprise['modifications']) =>
    m[e.id]?.type_id !== undefined ? (m[e.id]?.type_id ?? null) : e.type_id;
export const libelleDe = (e: EvenementReprise, m: EtatReprise['modifications']) => m[e.id]?.label ?? e.label;

/** Colonnes (titre, valeur de tri et de recherche) ; « Créé par » trié sur « nom prénom » (comme l'ancien écran) */
export const COLONNES: ReadonlyArray<{ k: CleColonne; t: string; v: (e: EvenementReprise, s: EtatReprise) => string }> =
    [
        { k: 'start', t: 'Début', v: e => e.start_date },
        { k: 'end', t: 'Fin', v: e => e.end_date },
        {
            k: 'type',
            t: 'Type',
            v: (e, s) => s.types.find(t => t.id === Number(typeDe(e, s.modifications)))?.label_long || ''
        },
        { k: 'label', t: 'Libellé', v: (e, s) => libelleDe(e, s.modifications) },
        { k: 'loc', t: 'Localisation', v: e => e.location_court || e.location_long || '' },
        { k: 'parts', t: 'Participants', v: e => (e.participants || []).join(', ') },
        { k: 'creator', t: 'Créé par', v: e => `${e.creator_nom || ''} ${e.creator_prenom || ''}`.trim() }
    ];

/** Événements de l'onglet correspondant à la recherche (tous les champs), triés (puis par identifiant) */
export function evenementsAffiches(
    evenements: EvenementReprise[],
    s: EtatReprise & { onglet: OngletReprise; recherche: string; tri: CleColonne; sens: 1 | -1 }
): EvenementReprise[] {
    const q = normaliser(s.recherche);
    const col = COLONNES.find(c => c.k === s.tri) ?? COLONNES[0]!;
    return evenements
        .filter(
            e =>
                (s.onglet === 'done') === traite(e) &&
                (!q || normaliser(COLONNES.map(c => c.v(e, s)).join(' ')).includes(q))
        )
        .map(e => ({ e, v: col.v(e, s) }))
        .sort((a, b) => String(a.v).localeCompare(String(b.v), 'fr', { numeric: true }) * s.sens || a.e.id - b.e.id)
        .map(x => x.e);
}

/** Onglet après chargement : le même s'il a des événements, sinon « À traiter » s'il y en a, sinon « Traité » */
export function ongletApresChargement(evenements: EvenementReprise[], onglet: OngletReprise | null): OngletReprise {
    if (onglet && evenements.some(e => (onglet === 'done') === traite(e))) return onglet;
    return evenements.some(e => !traite(e)) ? 'todo' : 'done';
}
