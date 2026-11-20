// Calques de la carte des événements : état (affichés ou masqués, transparence des départements) mémorisé dans le navigateur

export interface EtatCalques {
    departements: boolean;
    evenements: boolean;
    experts: boolean;
    /** Part d'opacité retirée aux départements, de 0 à 100 */
    transparence: number;
    /** Fond de carte */
    fond: Fond;
    /** Libellés des statuts masqués par un clic sur la légende */
    statutsMasques: string[];
    /** Carte de France seule : sans fond, outre-mer rapprochée de la métropole */
    franceSeule: boolean;
}

export const FONDS = ['plan', 'satellite', 'administratif'] as const;
export type Fond = (typeof FONDS)[number];

/** Stockage du navigateur, ou un stockage vide quand l'accès est refusé (navigation privée, site bloqué) */
export function stockageNavigateur(): Pick<Storage, 'getItem' | 'setItem'> {
    try {
        return window.localStorage;
    } catch {
        return { getItem: () => null, setItem: () => undefined };
    }
}

export const CLE_CALQUES = 'gp-carte-calques';

export const etatInitial = (): EtatCalques => ({
    departements: true,
    evenements: true,
    experts: true,
    transparence: 60,
    fond: 'plan',
    statutsMasques: [],
    franceSeule: false
});

/** État mémorisé ; état initial si rien n'est mémorisé, si la valeur est illisible ou si le stockage est inaccessible */
export function lireEtat(stockage: Pick<Storage, 'getItem'>): EtatCalques {
    const etat = etatInitial();
    try {
        const v = JSON.parse(stockage.getItem(CLE_CALQUES) ?? 'null') as Partial<
            Record<keyof EtatCalques, unknown>
        > | null;
        if (!v || typeof v !== 'object') return etat;
        for (const k of ['departements', 'evenements', 'experts', 'franceSeule'] as const)
            if (typeof v[k] === 'boolean') etat[k] = v[k];
        if (typeof v.transparence === 'number' && Number.isFinite(v.transparence))
            etat.transparence = Math.min(100, Math.max(0, v.transparence));
        if (FONDS.includes(v.fond as Fond)) etat.fond = v.fond as Fond;
        if (Array.isArray(v.statutsMasques)) etat.statutsMasques = v.statutsMasques.filter(x => typeof x === 'string');
    } catch {
        return etatInitial();
    }
    return etat;
}

export function ecrireEtat(stockage: Pick<Storage, 'setItem'>, etat: EtatCalques) {
    try {
        stockage.setItem(CLE_CALQUES, JSON.stringify(etat));
    } catch {
        // stockage bloqué (navigation privée, quota) : la carte fonctionne sans mémoire
    }
}

/** Opacité de remplissage des départements (0,8 au plus) selon la transparence choisie */
export const opaciteDepartements = (transparence: number) =>
    ((100 - Math.min(100, Math.max(0, transparence))) / 100) * 0.8;
