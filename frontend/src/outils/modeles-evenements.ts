// Modèles d'événements (règle partagée, lot 6.5) : libellés proposés par le filtre « Libellé » de l'onglet Événements et
// icône d'un événement sans type d'après le début de son libellé, la même au bureau et sur le mobile.

/** Modèles d'événements de l'ancien code (eventTemplates et EVENT_TPL_ICONS de l'ancien ics-events.js) */
export const MODELES: Array<{ code: string; label: string; icone: string }> = [
    { code: 'formation', label: 'FORMATION', icone: 'graduation' },
    { code: 'mes', label: 'MISE EN SERVICE', icone: 'power' },
    { code: 'apd', label: 'ACCOMP. POST DÉM.', icone: 'lifebuoy' },
    { code: 'visite', label: 'VISITE TERRAIN', icone: 'pin' },
    { code: 'congres', label: 'CONGRÈS', icone: 'presentation' },
    { code: 'visiteMetier', label: 'VISITE METIER', icone: 'briefcase' },
    { code: 'vftSite', label: 'VFT SUR SITE', icone: 'clipboardCheck' },
    { code: 'verifPrereq', label: 'VERIF PREREQUIS', icone: 'listChecks' },
    { code: 'visiteOb', label: 'VISITE OB', icone: 'building' },
    { code: 'visitePostMes', label: 'VISITE POST MES', icone: 'eye' },
    { code: 'reunionLancement', label: 'RÉUNION DE LANCEMENT STRATÉGIQUE', icone: 'rocket' }
];

/**
 * Début de libellé (minuscules, sans accents ni points) → icône, dans l'ordre de recherche : les débuts les plus
 * précis d'abord (« visite post mes » avant « visite »)
 */
const DEBUTS: [string, string][] = [
    ['reunion de lancement strategique', 'rocket'],
    ['visite post mes', 'eye'],
    ['verif prerequis', 'listChecks'],
    ['visite metier', 'briefcase'],
    ['visite terrain', 'pin'],
    ['mise en service', 'power'],
    ['accomp', 'lifebuoy'],
    ['visite ob', 'building'],
    ['vft sur site', 'clipboardCheck'],
    ['formation', 'graduation'],
    ['congres', 'presentation']
];

/** Libellé comparé : minuscules, sans accents ni points, sans espaces aux extrémités */
const comparable = (libelle: string | null | undefined) =>
    (libelle || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, '').trim();

/**
 * Icône (nom du jeu d'icônes de l'application) d'un événement sans type, d'après le début de son libellé
 * (« Formations utilisateurs » : graduation, « Accompagnement post démarrage » : lifebuoy) ; null si aucun modèle
 */
export function iconeDuLibelle(libelle: string | null | undefined): string | null {
    const l = comparable(libelle);
    if (!l) return null;
    return DEBUTS.find(([debut]) => l.startsWith(debut))?.[1] ?? null;
}
