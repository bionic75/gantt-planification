// Recherche avancée : icônes des options (image d'arrière-plan), les mêmes que la légende de la planification et que
// ses cellules. La légende est lue dans la grille de la planification.
import { iconesImages, type IconesImages } from '@/decor/icones-emojis';

const GRIS = '#455a64';

/** Icône (url("data:…")) de chaque valeur d'une liste, d'après une section de la légende de la planification */
function depuisLegende(
    api: IconesImages,
    section: Element | undefined,
    valeurs: string[],
    generique: (valeur: string) => string
): Record<string, string> {
    const icones: Record<string, string> = {};
    if (!section) return icones;
    const elements = section.querySelectorAll('.legend-item');
    valeurs.forEach((valeur, i) => {
        const element = elements[i];
        const svg = element?.querySelector('svg');
        const pastille = element?.querySelector<HTMLElement>('.color-code');
        // Couleur posée par la feuille de style de la légende (classe color-code--…)
        const couleur = pastille ? getComputedStyle(pastille).backgroundColor || GRIS : GRIS;
        // Pas d'icône dans la légende : icône générique
        const url = svg ? api.urlForSvg(svg.innerHTML, couleur) : api.urlForName(generique(valeur), couleur);
        if (url) icones[valeur] = url;
    });
    return icones;
}

/** Icônes des disponibilités (1 à 3) et des affectations (1 à 8), d'après la légende affichée */
export function iconesCriteres(): { disponibilites: Record<string, string>; affectations: Record<string, string> } {
    const api = iconesImages;
    const sections = document.querySelectorAll('.legend-section');
    return {
        disponibilites: depuisLegende(api, sections[0], ['1', '2', '3'], v => (v === '1' ? 'ban' : 'check-circle')),
        affectations: {
            ...depuisLegende(api, sections[1], ['1', '2', '3', '4'], () => 'ban'),
            ...depuisLegende(api, sections[2], ['5', '6', '7', '8'], () => 'ban')
        }
    };
}

export interface OptionLocalisation {
    valeur: string;
    libelle: string;
    icone: string | null;
}

/**
 * Option d'une localisation : l'émoji de tête est remplacé par l'icône correspondante (« Congés » pour la plage
 * seule) ; sans émoji (ex. « Télétravail ») : icône maison
 */
export function optionLocalisation(valeur: string, api: IconesImages | null = iconesImages): OptionLocalisation {
    if (!api) return { valeur, libelle: valeur, icone: null };
    const m = /^(\p{Extended_Pictographic})️?\s*/u.exec(valeur);
    if (!m) return { valeur, libelle: valeur, icone: api.urlForName('home', GRIS) };
    const emoji = m[1]!;
    const icone = api.urlForEmoji(emoji, GRIS);
    if (!icone) return { valeur, libelle: valeur, icone: null };
    const libelle = valeur.slice(m[0].length).trim() || (emoji.codePointAt(0) === 0x1f3d6 ? 'Congés' : '');
    return { valeur, libelle: libelle || valeur, icone };
}

/** Style d'une option portant une icône */
export const styleOption = (icone: string | null | undefined) =>
    icone
        ? {
              backgroundImage: icone,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '4px center',
              backgroundSize: '16px 16px',
              paddingLeft: '26px',
              minHeight: '22px'
          }
        : undefined;
