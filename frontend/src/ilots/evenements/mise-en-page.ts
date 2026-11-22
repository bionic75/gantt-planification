// Mise en page du GIF / MP4 (sans affichage) : titre, légende, compteur et logos placés librement dans l'image.
// Positions : fractions (0 à 1) de la largeur et de la hauteur, pour le coin haut gauche de chaque élément, donc
// indépendantes de la taille choisie à l'export. Tailles : pixels d'une image de 800 px de large, proportionnelles
// à la largeur réelle.

/** Largeur de référence (pixels) des tailles saisies */
export const REFERENCE_GIF = 800;
const echelle = (largeurImage: number) => largeurImage / REFERENCE_GIF;

/** Polices proposées (familles courantes des postes Windows et Mac, avec repli générique) */
export const POLICES_GIF = [
    { valeur: 'Arial, Helvetica, sans-serif', libelle: 'Arial' },
    { valeur: '"Helvetica Neue", Helvetica, Arial, sans-serif', libelle: 'Helvetica' },
    { valeur: 'Verdana, Geneva, sans-serif', libelle: 'Verdana' },
    { valeur: 'Tahoma, Geneva, sans-serif', libelle: 'Tahoma' },
    { valeur: '"Trebuchet MS", Helvetica, sans-serif', libelle: 'Trebuchet' },
    { valeur: '"Century Gothic", "Avenir Next", Futura, sans-serif', libelle: 'Century Gothic' },
    { valeur: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif', libelle: 'Gill Sans' },
    { valeur: '"Segoe UI", Roboto, "Helvetica Neue", sans-serif', libelle: 'Segoe UI' },
    { valeur: '"Arial Black", Impact, sans-serif', libelle: 'Arial Black (épais)' },
    { valeur: 'Impact, "Arial Narrow Bold", sans-serif', libelle: 'Impact (condensé)' },
    { valeur: 'Georgia, serif', libelle: 'Georgia' },
    { valeur: '"Times New Roman", Times, serif', libelle: 'Times' },
    { valeur: 'Palatino, "Palatino Linotype", "Book Antiqua", serif', libelle: 'Palatino' },
    { valeur: 'Garamond, "Hoefler Text", serif', libelle: 'Garamond' },
    { valeur: 'Baskerville, "Baskerville Old Face", serif', libelle: 'Baskerville' },
    { valeur: 'Rockwell, "Courier Bold", serif', libelle: 'Rockwell' },
    { valeur: '"Courier New", Courier, monospace', libelle: 'Courier' },
    { valeur: '"Lucida Console", Monaco, monospace', libelle: 'Lucida Console' },
    { valeur: '"Brush Script MT", "Lucida Handwriting", cursive', libelle: 'Script (manuscrit)' },
    { valeur: '"Comic Sans MS", "Comic Neue", cursive', libelle: 'Comic Sans' }
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

/** Style de police canvas : « italic bold », « bold », « italic » ou vide */
export const stylePolice = (gras: boolean, italique: boolean) =>
    `${italique ? 'italic' : ''}${italique && gras ? ' ' : ''}${gras ? 'bold' : ''}`;

/** Police canvas (« bold 30px Georgia, serif ») pour une taille donnée en référence 800 px */
export const police = (poids: string, taille: number, largeurImage: number, famille: string) =>
    `${poids ? `${poids} ` : ''}${Math.round(taille * echelle(largeurImage))}px ${famille}`;

/** Position du coin haut gauche d'un élément (fractions de l'image) */
export interface Position {
    x: number;
    y: number;
}

/** Alignement des lignes d'un texte dans sa boîte */
export type Alignement = 'left' | 'center' | 'right';
export const ALIGNEMENTS: { valeur: Alignement; libelle: string }[] = [
    { valeur: 'left', libelle: 'À gauche' },
    { valeur: 'center', libelle: 'Centré' },
    { valeur: 'right', libelle: 'À droite' }
];

export interface ElementTexte extends Position {
    visible: boolean;
    /** Plusieurs lignes : un retour à la ligne par ligne */
    texte: string;
    police: string;
    taille: number;
    gras: boolean;
    italique: boolean;
    alignement: Alignement;
}

export interface Legende extends Position {
    visible: boolean;
    /** Statuts de la carte (puce de couleur et libellé) */
    statuts: boolean;
    /** Lignes de texte libre sous les statuts */
    texte: string;
    police: string;
    taille: number;
    gras: boolean;
    italique: boolean;
    alignement: Alignement;
}

/** Date et nombre de mises en service (change à chaque image) */
export interface Compteur extends Position {
    visible: boolean;
    taille: number;
    /** Texte après « n / total » */
    libelle: string;
}

export const LIBELLE_COMPTEUR_DEFAUT = 'mise(s) en service';

export interface LogoGif extends Position {
    id: number;
    nom: string;
    /** Dimensions de l'image d'origine */
    largeur: number;
    hauteur: number;
    /** Hauteur choisie (pixels, image de 800 px de large) */
    taille: number;
}

/** Cadrage de la carte dans l'image : décalage (fractions de l'image) et zoom autour du centre du cadre */
export interface CadrageCarte {
    x: number;
    y: number;
    zoom: number;
}
export const ZOOM_CARTE = { min: 0.5, max: 3, defaut: 1 } satisfies Bornes;

export interface MiseEnPage {
    /** Position et échelle de la carte (déplacée et zoomée à la souris) */
    carte: CadrageCarte;
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
        carte: { x: 0, y: 0, zoom: ZOOM_CARTE.defaut },
        titre: {
            visible: true,
            texte: '',
            police: police0,
            taille: BORNES.titre.defaut,
            gras: true,
            italique: false,
            alignement: 'center',
            x: 0.03,
            y: 0.02
        },
        legende: {
            visible: false,
            statuts: true,
            texte: '',
            police: police0,
            taille: BORNES.legende.defaut,
            gras: false,
            italique: false,
            alignement: 'left',
            x: 0.03,
            y: 0.8
        },
        compteur: { visible: true, taille: BORNES.compteur.defaut, libelle: LIBELLE_COMPTEUR_DEFAUT, x: 0.72, y: 0.86 },
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

type Image = { largeur: number; hauteur: number };
type Point = { x: number; y: number };

/** Centre du cadre de la carte : image moins l'espace libre du haut (`margeHaut` : part de la hauteur) */
export function centreCadre(image: { largeur: number; hauteur: number }, margeHaut: number): { x: number; y: number } {
    const haut = Math.round(image.hauteur * margeHaut);
    return { x: image.largeur / 2, y: haut + (image.hauteur - haut) / 2 };
}

/** Point de la carte (pixels, cadrage automatique) dans l'image après zoom autour de `centre` puis décalage */
export function cadrerPoint([x, y]: [number, number], c: CadrageCarte, image: Image, centre: Point): [number, number] {
    return [
        centre.x + (x - centre.x) * c.zoom + c.x * image.largeur,
        centre.y + (y - centre.y) * c.zoom + c.y * image.hauteur
    ];
}

/** Cadrage après un zoom qui garde en place le point de la carte situé sous le pointeur (pixels de l'image) */
export function zoomAutour(c: CadrageCarte, zoom: number, pointeur: Point, image: Image, centre: Point): CadrageCarte {
    const z = Math.min(ZOOM_CARTE.max, Math.max(ZOOM_CARTE.min, Number.isFinite(zoom) ? zoom : ZOOM_CARTE.defaut));
    // P = centre + (q − centre) × zoom + décalage : on cherche le décalage qui garde q sous P avec le nouveau zoom
    const decalage = (p: number, ctr: number, off: number) => p - ctr - ((p - ctr - off) * z) / c.zoom;
    return {
        x: decalage(pointeur.x, centre.x, c.x * image.largeur) / image.largeur,
        y: decalage(pointeur.y, centre.y, c.y * image.hauteur) / image.hauteur,
        zoom: z
    };
}
