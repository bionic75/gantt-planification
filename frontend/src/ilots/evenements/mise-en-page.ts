// Mise en page du GIF / MP4 (sans affichage) : titre, légende, compteur et logos placés librement dans l'image.
// Positions : fractions (0 à 1) de la largeur et de la hauteur, pour le coin haut gauche de chaque élément, donc
// indépendantes de la taille choisie à l'export. Tailles : pixels d'une image de 800 px de large, proportionnelles
// à la largeur réelle.

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
    compteur: { min: 12, max: 60, defaut: 28 },
    logo: { min: 20, max: 200, defaut: 60 }
} satisfies Record<string, Bornes>;

/** Taille saisie ramenée dans ses bornes (valeur illisible : valeur par défaut) */
export const borner = (valeur: number, b: Bornes) =>
    Number.isFinite(valeur) ? Math.min(b.max, Math.max(b.min, Math.round(valeur))) : b.defaut;

/** Police canvas (« bold 30px Georgia, serif ») pour une taille donnée en référence 800 px */
export const police = (poids: string, taille: number, largeurImage: number, famille: string) =>
    `${poids ? `${poids} ` : ''}${Math.round(taille * echelle(largeurImage))}px ${famille}`;

/** Position du coin haut gauche d'un élément (fractions de l'image) */
export interface Position {
    x: number;
    y: number;
}

export interface ElementTexte extends Position {
    visible: boolean;
    texte: string;
    police: string;
    taille: number;
}

export interface Legende extends Position {
    visible: boolean;
    /** Statuts de la carte (puce de couleur et libellé) */
    statuts: boolean;
    /** Lignes de texte libre sous les statuts */
    texte: string;
    police: string;
    taille: number;
}

/** Date et nombre de mises en service (change à chaque image) */
export interface Compteur extends Position {
    visible: boolean;
    taille: number;
}

export interface LogoGif extends Position {
    id: number;
    nom: string;
    /** Dimensions de l'image d'origine */
    largeur: number;
    hauteur: number;
    /** Hauteur choisie (pixels, image de 800 px de large) */
    taille: number;
}

export interface MiseEnPage {
    titre: ElementTexte;
    legende: Legende;
    compteur: Compteur;
    logos: LogoGif[];
    /** Part de la hauteur laissée libre au-dessus de la carte (0 à 0,3), pour y loger le titre */
    margeHaut: number;
}

/** Titre en haut, légende en bas à gauche, compteur en bas à droite ; le titre est vide tant qu'on ne l'a pas saisi */
export function miseEnPageParDefaut(): MiseEnPage {
    const police0 = POLICES_GIF[0]!.valeur;
    return {
        titre: { visible: true, texte: '', police: police0, taille: BORNES.titre.defaut, x: 0.03, y: 0.02 },
        legende: {
            visible: false,
            statuts: true,
            texte: '',
            police: police0,
            taille: BORNES.legende.defaut,
            x: 0.03,
            y: 0.8
        },
        compteur: { visible: true, taille: BORNES.compteur.defaut, x: 0.72, y: 0.86 },
        logos: [],
        margeHaut: 0.1
    };
}

/** Rectangle occupé par un élément dans l'image (pixels), pour la sélection et le déplacement */
export interface BoiteElement {
    /** « titre », « legende », « compteur » ou « logo-<id> » */
    id: string;
    x: number;
    y: number;
    largeur: number;
    hauteur: number;
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

/** Nouvelle position après un déplacement de `delta` pixels : la boîte reste entièrement dans l'image */
export function positionApresDeplacement(
    depart: Position,
    delta: { dx: number; dy: number },
    boite: { largeur: number; hauteur: number },
    image: { largeur: number; hauteur: number }
): Position {
    const borne = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
    return {
        x: borne(depart.x + delta.dx / image.largeur, (image.largeur - boite.largeur) / image.largeur),
        y: borne(depart.y + delta.dy / image.hauteur, (image.hauteur - boite.hauteur) / image.hauteur)
    };
}

/** Taille après étirement de la boîte (largeur de départ → largeur d'arrivée, pixels) : proportionnelle, bornée */
export function ajusterTaille(taille: number, largeurDepart: number, largeurArrivee: number, b: Bornes): number {
    if (largeurDepart <= 0) return taille;
    return borner((taille * largeurArrivee) / largeurDepart, b);
}

/** Élément le plus en avant (dernier dessiné) à l'endroit pointé (pixels de l'image) ; null s'il n'y en a pas */
export function elementEn(boites: BoiteElement[], px: number, py: number): string | null {
    for (let i = boites.length - 1; i >= 0; i--) {
        const b = boites[i]!;
        if (px >= b.x && px <= b.x + b.largeur && py >= b.y && py <= b.y + b.hauteur) return b.id;
    }
    return null;
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
