import { describe, expect, it } from 'vitest';
import {
    BORNES,
    borner,
    dimensionsLogo,
    hauteurBandeau,
    lignesLegende,
    police,
    type PositionLogo
} from './mise-en-page';

const logo = (largeur: number, hauteur: number, taille: number, position: PositionLogo = 'titre-gauche') => ({
    id: 1,
    nom: 'logo.png',
    largeur,
    hauteur,
    taille,
    position
});

describe('mise en page du GIF / MP4', () => {
    it('tailles bornées, valeur illisible ramenée à la valeur par défaut', () => {
        expect(borner(500, BORNES.titre)).toBe(BORNES.titre.max);
        expect(borner(1, BORNES.legende)).toBe(BORNES.legende.min);
        expect(borner(Number.NaN, BORNES.logo)).toBe(BORNES.logo.defaut);
        expect(borner(40, BORNES.logo)).toBe(40);
    });

    it("taille des textes et des logos proportionnelle à la largeur de l'image (référence : 800 px)", () => {
        expect(police('bold', 30, 800, 'Georgia, serif')).toBe('bold 30px Georgia, serif');
        expect(police('', 14, 1600, 'Arial')).toBe('28px Arial');
        expect(dimensionsLogo(logo(200, 100, 60), 800)).toEqual({ largeur: 120, hauteur: 60 });
        expect(dimensionsLogo(logo(200, 100, 60), 1600)).toEqual({ largeur: 240, hauteur: 120 });
    });

    it("logo très large : limité à 40 % de la largeur de l'image, proportions conservées", () => {
        expect(dimensionsLogo(logo(1000, 100, 60), 800)).toEqual({ largeur: 320, hauteur: 32 });
    });

    it('bandeau : titre ou logos en haut ; pas de bandeau sans eux ; logos du bas ignorés', () => {
        expect(hauteurBandeau(800, { texte: '', taille: 30 }, [])).toBe(0);
        expect(hauteurBandeau(800, { texte: '  ', taille: 30 }, [logo(100, 100, 60, 'bas-gauche')])).toBe(0);
        expect(hauteurBandeau(800, { texte: 'Titre', taille: 30 }, [])).toBe(48);
        expect(hauteurBandeau(1600, { texte: 'Titre', taille: 30 }, [])).toBe(96);
        // Un logo plus haut que le titre agrandit le bandeau
        expect(hauteurBandeau(800, { texte: 'Titre', taille: 30 }, [logo(100, 100, 100, 'titre-droite')])).toBe(116);
        expect(hauteurBandeau(800, { texte: '', taille: 30 }, [logo(100, 100, 60)])).toBe(76);
    });

    it('légende : statuts affichés (non masqués), puis lignes de texte libre sans ligne vide', () => {
        const statuts = [
            { statut: 'En service', couleur: '#2e7d32', masque: false },
            { statut: 'Prévu', couleur: '#f9a825', masque: true }
        ];
        expect(lignesLegende(statuts, true, 'Source : DGOS\n\n  Mise à jour 2026 ')).toEqual([
            { couleur: '#2e7d32', texte: 'En service' },
            { couleur: null, texte: 'Source : DGOS' },
            { couleur: null, texte: 'Mise à jour 2026' }
        ]);
        expect(lignesLegende(statuts, false, '')).toEqual([]);
    });
});
