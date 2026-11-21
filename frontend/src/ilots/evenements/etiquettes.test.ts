import { describe, expect, it } from 'vitest';
import { placerEtiquettes, type EtiquetteAPlacer } from './etiquettes';

const e = (id: string, x: number, y: number, largeur = 80, hauteur = 12): EtiquetteAPlacer => ({
    id,
    x,
    y,
    largeur,
    hauteur
});
const seChevauchent = (a: { cx: number; cy: number; largeur: number; hauteur: number }, b: typeof a) =>
    Math.abs(a.cx - b.cx) < (a.largeur + b.largeur) / 2 && Math.abs(a.cy - b.cy) < (a.hauteur + b.hauteur) / 2;

describe('placerEtiquettes', () => {
    it('étiquette isolée : gardée sur son ancrage', () => {
        const [p] = placerEtiquettes([e('a', 100, 50)], 400, 300);
        expect([p?.cx, p?.cy, p?.deplacee]).toEqual([100, 50, false]);
    });

    it('étiquettes superposées : aucune ne chevauche une autre, la première garde sa place', () => {
        const placees = placerEtiquettes([e('a', 100, 50), e('b', 102, 52), e('c', 98, 49), e('d', 101, 55)], 400, 300);
        expect([placees[0]?.cx, placees[0]?.cy]).toEqual([100, 50]);
        for (let i = 0; i < placees.length; i++)
            for (let j = i + 1; j < placees.length; j++) expect(seChevauchent(placees[i]!, placees[j]!)).toBe(false);
        expect(placees[1]?.deplacee).toBe(true);
    });

    it("reste dans l'image quand l'ancrage est au bord", () => {
        const [p] = placerEtiquettes([e('a', 5, 3)], 400, 300);
        expect(p!.cx - 40).toBeGreaterThanOrEqual(0);
        expect(p!.cy - 6).toBeGreaterThanOrEqual(0);
    });
});
