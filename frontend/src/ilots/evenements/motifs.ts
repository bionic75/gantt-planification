// Motifs de remplissage des statuts de déploiement : en plus de la couleur, une trame pour distinguer les statuts sur la
// carte (pastilles CSS dans l'administration et la légende, définitions <pattern> SVG pour les départements)

export type Motif = 'plein' | 'diag' | 'diag-inv' | 'points' | 'quadrille' | 'lignes';

export const LIBELLES_MOTIFS: Record<Motif, string> = {
    plein: 'Plein',
    diag: 'Hachures /',
    'diag-inv': 'Hachures \\',
    points: 'Points',
    quadrille: 'Quadrillé',
    lignes: 'Lignes'
};

const estMotif = (m: string): m is Exclude<Motif, 'plein'> => m !== 'plein' && m in LIBELLES_MOTIFS;
/** Teinte claire de la couleur, pour le fond entre les traits */
const clair = (c: string) => `color-mix(in srgb, ${c} 25%, #fff)`;

/** Fond CSS d'une pastille (couleur et motif) */
export function fondMotif(couleur: string, motif: string) {
    if (!estMotif(motif)) return couleur;
    switch (motif) {
        case 'diag':
            return `repeating-linear-gradient(45deg, ${couleur} 0 3px, ${clair(couleur)} 3px 7px)`;
        case 'diag-inv':
            return `repeating-linear-gradient(-45deg, ${couleur} 0 3px, ${clair(couleur)} 3px 7px)`;
        case 'points':
            return `radial-gradient(${couleur} 1.6px, transparent 1.7px) 0 0 / 7px 7px, ${clair(couleur)}`;
        case 'quadrille':
            return `linear-gradient(${couleur} 1.5px, transparent 1.5px) 0 0 / 7px 7px, linear-gradient(90deg, ${couleur} 1.5px, ${clair(couleur)} 1.5px) 0 0 / 7px 7px`;
        case 'lignes':
            return `repeating-linear-gradient(0deg, ${couleur} 0 3px, ${clair(couleur)} 3px 7px)`;
    }
}

/** Identifiant du motif SVG (propre à la couleur et au motif) */
export const idMotif = (couleur: string, motif: string) => `gp-motif-${motif}-${couleur.replace('#', '')}`;

/** Définition SVG `<pattern>` d'un motif, vide pour « plein » : à placer dans les `<defs>` de la carte */
export function svgMotif(couleur: string, motif: string) {
    if (!estMotif(motif)) return '';
    const id = idMotif(couleur, motif);
    const fond = `<rect width="8" height="8" fill="${couleur}" fill-opacity=".25"/>`;
    const ouvre = (transform = '') =>
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8"${transform ? ` patternTransform="${transform}"` : ''}>`;
    switch (motif) {
        case 'diag':
            return `${ouvre('rotate(45)')}${fond}<rect width="3" height="8" fill="${couleur}"/></pattern>`;
        case 'diag-inv':
            return `${ouvre('rotate(-45)')}${fond}<rect width="3" height="8" fill="${couleur}"/></pattern>`;
        case 'points':
            return `${ouvre()}${fond}<circle cx="4" cy="4" r="1.8" fill="${couleur}"/></pattern>`;
        case 'quadrille':
            return `${ouvre()}${fond}<rect width="8" height="1.5" fill="${couleur}"/><rect width="1.5" height="8" fill="${couleur}"/></pattern>`;
        case 'lignes':
            return `${ouvre()}${fond}<rect width="8" height="3" fill="${couleur}"/></pattern>`;
    }
}
