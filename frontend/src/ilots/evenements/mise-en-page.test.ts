import { describe, expect, it } from 'vitest';
import {
    BORNES,
    borner,
    dimensionsLogo,
    elementEn,
    ajusterTaille,
    lignesLegende,
    miseEnPageParDefaut,
    police,
    positionApresDeplacement,
    type BoiteElement
} from './mise-en-page';

const logo = (largeur: number, hauteur: number, taille: number) => ({ largeur, hauteur, taille });

describe('mise en page du GIF / MP4', () => {
    it('tailles bornées, valeur illisible ramenée à la valeur par défaut', () => {
        expect(borner(500, BORNES.titre)).toBe(BORNES.titre.max);
        expect(borner(1, BORNES.legende)).toBe(BORNES.legende.min);
        expect(borner(Number.NaN, BORNES.logo)).toBe(BORNES.logo.defaut);
        expect(borner(40, BORNES.logo)).toBe(40);
    });

    it("tailles des textes et des logos proportionnelles à la largeur de l'image (référence : 800 px)", () => {
        expect(police('bold', 30, 800, 'Georgia, serif')).toBe('bold 30px Georgia, serif');
        expect(police('', 14, 1600, 'Arial')).toBe('28px Arial');
        expect(dimensionsLogo(logo(200, 100, 60), 800)).toEqual({ largeur: 120, hauteur: 60 });
        expect(dimensionsLogo(logo(200, 100, 60), 1600)).toEqual({ largeur: 240, hauteur: 120 });
    });

    it("logo très large : limité à 40 % de la largeur de l'image, proportions conservées", () => {
        expect(dimensionsLogo(logo(1000, 100, 60), 800)).toEqual({ largeur: 320, hauteur: 32 });
    });

    it('mise en page par défaut : éléments dans l’image, sans logo, légende et titre visibles', () => {
        const m = miseEnPageParDefaut();
        for (const e of [m.titre, m.legende, m.compteur]) {
            expect(e.x).toBeGreaterThanOrEqual(0);
            expect(e.x).toBeLessThanOrEqual(1);
            expect(e.y).toBeGreaterThanOrEqual(0);
            expect(e.y).toBeLessThanOrEqual(1);
        }
        expect(m.logos).toEqual([]);
        expect(m.titre.visible && m.compteur.visible).toBe(true);
        // Deux appels : objets indépendants (la fenêtre modifie sa copie)
        expect(miseEnPageParDefaut()).not.toBe(m);
    });

    it('déplacement : la boîte reste entièrement dans l’image', () => {
        const image = { largeur: 800, hauteur: 600 };
        const boite = { largeur: 200, hauteur: 100 };
        // 0,5 × 800 = 400 → +100 px : 500 / 800 = 0,625
        expect(positionApresDeplacement({ x: 0.5, y: 0.5 }, { dx: 100, dy: 0 }, boite, image)).toEqual({
            x: 0.625,
            y: 0.5
        });
        // Au-delà du bord droit : collée au bord (600 / 800)
        expect(positionApresDeplacement({ x: 0.5, y: 0.5 }, { dx: 900, dy: 900 }, boite, image)).toEqual({
            x: 0.75,
            y: 500 / 600
        });
        // Au-delà du bord gauche et haut
        expect(positionApresDeplacement({ x: 0.1, y: 0.1 }, { dx: -900, dy: -900 }, boite, image)).toEqual({
            x: 0,
            y: 0
        });
    });

    it('redimensionnement : taille proportionnelle à la largeur de la boîte, bornée', () => {
        expect(ajusterTaille(30, 200, 300, BORNES.titre)).toBe(45);
        expect(ajusterTaille(30, 200, 1000, BORNES.titre)).toBe(BORNES.titre.max);
        expect(ajusterTaille(30, 200, 1, BORNES.titre)).toBe(BORNES.titre.min);
        // Boîte de départ de largeur nulle : taille inchangée
        expect(ajusterTaille(30, 0, 300, BORNES.titre)).toBe(30);
    });

    it('sélection : l’élément le plus en avant (dernier dessiné) à l’endroit pointé', () => {
        const boites: BoiteElement[] = [
            { id: 'titre', x: 0, y: 0, largeur: 300, hauteur: 50 },
            { id: 'logo-1', x: 100, y: 10, largeur: 80, hauteur: 40 }
        ];
        expect(elementEn(boites, 120, 20)).toBe('logo-1');
        expect(elementEn(boites, 10, 10)).toBe('titre');
        expect(elementEn(boites, 500, 500)).toBeNull();
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
