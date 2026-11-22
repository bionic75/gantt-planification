import { describe, expect, it } from 'vitest';
import {
    BORNES,
    borner,
    dimensionsLogo,
    elementEn,
    ajusterTaille,
    avecOpacite,
    couleurValide,
    cadrerPoint,
    centreCadre,
    zoomAutour,
    ZOOM_CARTE,
    lignesLegende,
    miseEnPageParDefaut,
    police,
    POLICES_GIF,
    stylePolice,
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

    it('couleurs : #rrggbb accepté (casse ignorée), le reste ramené à la valeur par défaut', () => {
        expect(couleurValide('#1A237e', '#000000')).toBe('#1a237e');
        expect(couleurValide('red', '#000000')).toBe('#000000');
        expect(couleurValide('#12345', '#000000')).toBe('#000000');
        expect(couleurValide('url(x)', '#ffffff')).toBe('#ffffff');
        expect(couleurValide(undefined as unknown as string, '#ffffff')).toBe('#ffffff');
    });

    it('opacité : couleur rgba, opacité bornée entre 0 et 1', () => {
        expect(avecOpacite('#1a237e', 0.5)).toBe('rgba(26,35,126,0.5)');
        expect(avecOpacite('#ffffff', 2)).toBe('rgba(255,255,255,1)');
        expect(avecOpacite('#ffffff', -1)).toBe('rgba(255,255,255,0)');
        expect(avecOpacite('n’importe quoi', 0.4)).toBe('rgba(0,0,0,0.4)');
    });

    it('polices : au moins une quinzaine, valeurs uniques, libellés renseignés', () => {
        expect(POLICES_GIF.length).toBeGreaterThanOrEqual(15);
        expect(new Set(POLICES_GIF.map(p => p.valeur)).size).toBe(POLICES_GIF.length);
        expect(POLICES_GIF.every(p => p.libelle && p.valeur)).toBe(true);
    });

    it('style de police : italique, gras, ou rien', () => {
        expect(stylePolice(true, true)).toBe('italic bold');
        expect(stylePolice(true, false)).toBe('bold');
        expect(stylePolice(false, true)).toBe('italic');
        expect(stylePolice(false, false)).toBe('');
        expect(police(stylePolice(true, true), 30, 800, 'Georgia')).toBe('italic bold 30px Georgia');
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
        expect(m.titre).toMatchObject({ alignement: 'center', gras: true, italique: false });
        expect(m.legende).toMatchObject({ alignement: 'left', gras: false });
        expect(m.compteur.libelle).toBe('mise(s) en service');
        // Couleurs : bleu nuit sous le titre, blanc sous la légende et le compteur ; fond de l'image bleu pâle
        expect(m.titre).toMatchObject({ couleurTexte: '#ffffff', couleurFond: '#1a237e', opaciteFond: 0.92 });
        expect(m.legende).toMatchObject({ couleurTexte: '#263238', couleurFond: '#ffffff' });
        expect(m.compteur).toMatchObject({ couleurTexte: '#1a237e', couleurFond: '#ffffff' });
        expect(m.couleurFond).toBe('#dbeafe');
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

    it('cadrage de la carte : par défaut, les points ne bougent pas', () => {
        const m = miseEnPageParDefaut();
        expect(m.carte).toEqual({ x: 0, y: 0, zoom: 1 });
        expect(cadrerPoint([123, 45], m.carte, { largeur: 800, hauteur: 600 }, { x: 400, y: 300 })).toEqual([123, 45]);
    });

    it('centre du cadre : sous l’espace libre du haut', () => {
        expect(centreCadre({ largeur: 800, hauteur: 600 }, 0)).toEqual({ x: 400, y: 300 });
        expect(centreCadre({ largeur: 800, hauteur: 600 }, 0.1)).toEqual({ x: 400, y: 330 });
    });

    it('cadrage : zoom autour du centre du cadre, puis décalage en fractions de l’image', () => {
        const image = { largeur: 800, hauteur: 600 };
        const centre = { x: 400, y: 300 };
        // Le centre reste en place, un point à 100 px du centre passe à 200 px
        expect(cadrerPoint([400, 300], { x: 0, y: 0, zoom: 2 }, image, centre)).toEqual([400, 300]);
        expect(cadrerPoint([500, 300], { x: 0, y: 0, zoom: 2 }, image, centre)).toEqual([600, 300]);
        // Décalage de 0,1 de la largeur (80 px) et de -0,05 de la hauteur (-30 px)
        expect(cadrerPoint([400, 300], { x: 0.1, y: -0.05, zoom: 1 }, image, centre)).toEqual([480, 270]);
    });

    it('zoom à la molette : le point sous le pointeur reste en place', () => {
        const image = { largeur: 800, hauteur: 600 };
        const centre = { x: 400, y: 300 };
        const avant = { x: 0.05, y: -0.02, zoom: 1 };
        const pointeur = { x: 600, y: 200 };
        const apres = zoomAutour(avant, 2, pointeur, image, centre);
        expect(apres.zoom).toBe(2);
        // Point de la carte (avant zoom) qui était sous le pointeur
        const [qx, qy] = [pointeur.x - 0.05 * 800, pointeur.y + 0.02 * 600];
        const [x, y] = cadrerPoint([qx, qy], apres, image, centre);
        expect(x).toBeCloseTo(pointeur.x);
        expect(y).toBeCloseTo(pointeur.y);
        // Zoom borné
        expect(zoomAutour(avant, 99, pointeur, image, centre).zoom).toBe(ZOOM_CARTE.max);
        expect(zoomAutour(avant, 0, pointeur, image, centre).zoom).toBe(ZOOM_CARTE.min);
    });
});
