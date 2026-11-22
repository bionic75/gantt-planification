// Mise en page du GIF / MP4 : titre, légende et logos (polices, tailles, positions), sans affichage.
// Les tailles sont données pour une image de 800 px de large et suivent la largeur choisie pour l'export.

/** Largeur de référence (pixels) des tailles saisies */
export const REFERENCE_GIF = 800;
const echelle = (largeurImage: number) => largeurImage / REFERENCE_GIF;

/** Polices proposées (familles courantes, disponibles sur les postes) */
export const POLICES_GIF = [
    { valeur: 'Arial, Helvetica, sans-serif', libelle: 'Arial' },
    { valeur: 'Verdana, Geneva, sans-serif', libelle: 'Verdana' },
    { valeur: 'Georgia, serif', libelle: 'Georgia' },
    { valeur: '"Times New Roman", Times, serif', libelle: 'Times' },
    { valeur: '"Courier New", Courier, monospace', libelle: 'Courier' }
];

export interface Bornes {
    min: number;
    max: number;
    defaut: number;
}
/** Tailles en pixels (image de 800 px de large) : textes (hauteur de la police) et logos (hauteur) */
export const BORNES = {
    titre: { min: 14, max: 60, defaut: 30 },
    legende: { min: 8, max: 28, defaut: 14 },
    logo: { min: 20, max: 200, defaut: 60 }
} satisfies Record<string, Bornes>;

/** Taille saisie ramenée dans ses bornes (valeur illisible : valeur par défaut) */
export const borner = (valeur: number, b: Bornes) =>
    Number.isFinite(valeur) ? Math.min(b.max, Math.max(b.min, Math.round(valeur))) : b.defaut;

/** Police canvas (« bold 30px Georgia, serif ») pour une taille donnée en référence 800 px */
export const police = (poids: string, taille: number, largeurImage: number, famille: string) =>
    `${poids ? `${poids} ` : ''}${Math.round(taille * echelle(largeurImage))}px ${famille}`;

/** Où placer un logo : dans le bandeau du titre (à gauche ou à droite) ou en bas à gauche, au-dessus de la légende */
export type PositionLogo = 'titre-gauche' | 'titre-droite' | 'bas-gauche';
export const POSITIONS_LOGO: { valeur: PositionLogo; libelle: string }[] = [
    { valeur: 'titre-gauche', libelle: 'En haut à gauche' },
    { valeur: 'titre-droite', libelle: 'En haut à droite' },
    { valeur: 'bas-gauche', libelle: 'En bas à gauche' }
];

export interface LogoGif {
    id: number;
    nom: string;
    /** Dimensions de l'image d'origine */
    largeur: number;
    hauteur: number;
    /** Hauteur choisie (pixels, image de 800 px de large) */
    taille: number;
    position: PositionLogo;
}

/** Dimensions d'un logo dans l'image : hauteur choisie, proportions conservées, 40 % de la largeur au plus */
export function dimensionsLogo(l: Pick<LogoGif, 'largeur' | 'hauteur' | 'taille'>, largeurImage: number) {
    let hauteur = l.taille * echelle(largeurImage);
    let largeur = (hauteur * l.largeur) / l.hauteur;
    const max = largeurImage * 0.4;
    if (largeur > max) {
        hauteur = (hauteur * max) / largeur;
        largeur = max;
    }
    return { largeur: Math.round(largeur), hauteur: Math.round(hauteur) };
}

/** Marge verticale autour des logos du bandeau (référence 800 px) */
const MARGE_LOGO = 8;
/** Hauteur de la ligne du titre, en multiple de la taille de sa police */
const INTERLIGNE_TITRE = 1.6;

/** Hauteur du bandeau du haut : titre et logos du haut ; 0 s'il n'y en a pas (la carte est cadrée en dessous) */
export function hauteurBandeau(
    largeurImage: number,
    titre: { texte: string; taille: number },
    logos: Pick<LogoGif, 'largeur' | 'hauteur' | 'taille' | 'position'>[]
): number {
    const e = echelle(largeurImage);
    const hauteurs = [
        titre.texte.trim() ? Math.ceil(titre.taille * e * INTERLIGNE_TITRE) : 0,
        ...logos
            .filter(l => l.position !== 'bas-gauche')
            .map(l => dimensionsLogo(l, largeurImage).hauteur + Math.round(2 * MARGE_LOGO * e))
    ];
    return Math.max(...hauteurs);
}

export interface LigneLegende {
    /** Couleur de la puce ; null : ligne de texte libre */
    couleur: string | null;
    texte: string;
}

/** Lignes de la légende : statuts non masqués (si demandés), puis texte libre ligne à ligne (lignes vides ignorées) */
export function lignesLegende(
    statuts: { statut: string; couleur: string; masque: boolean }[],
    avecStatuts: boolean,
    texteLibre: string
): LigneLegende[] {
    return [
        ...(avecStatuts
            ? statuts.filter(s => !s.masque).map(s => ({ couleur: s.couleur as string | null, texte: s.statut }))
            : []),
        ...texteLibre
            .split(/\r?\n/)
            .map(t => t.trim())
            .filter(Boolean)
            .map(texte => ({ couleur: null, texte }))
    ];
}
