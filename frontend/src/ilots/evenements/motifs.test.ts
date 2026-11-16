import { describe, expect, it } from 'vitest';
import { LIBELLES_MOTIFS, fondMotif, idMotif, svgMotif } from './motifs';

describe('motifs des statuts', () => {
    it('six motifs, avec leur libellé', () => {
        expect(Object.keys(LIBELLES_MOTIFS)).toEqual(['plein', 'diag', 'diag-inv', 'points', 'quadrille', 'lignes']);
    });
    it('le motif plein est la couleur seule, sans définition SVG', () => {
        expect(fondMotif('#fdd835', 'plein')).toBe('#fdd835');
        expect(svgMotif('#fdd835', 'plein')).toBe('');
    });
    it('un motif inconnu se comporte comme plein', () => {
        expect(fondMotif('#fdd835', 'zebre')).toBe('#fdd835');
        expect(svgMotif('#fdd835', 'zebre')).toBe('');
    });
    it('chaque motif a un fond CSS qui reprend la couleur', () => {
        for (const m of ['diag', 'diag-inv', 'points', 'quadrille', 'lignes'])
            expect(fondMotif('#fdd835', m)).toContain('#fdd835');
    });
    it('identifiant SVG sans dièse, propre à la couleur et au motif', () => {
        expect(idMotif('#fdd835', 'diag')).toBe('gp-motif-diag-fdd835');
        expect(idMotif('#fdd835', 'points')).not.toBe(idMotif('#fdd835', 'diag'));
        expect(idMotif('#1e88e5', 'diag')).not.toBe(idMotif('#fdd835', 'diag'));
    });
    it('définition SVG d’un motif : identifiant, couleur et trame', () => {
        for (const m of ['diag', 'diag-inv', 'points', 'quadrille', 'lignes']) {
            const svg = svgMotif('#fdd835', m);
            expect(svg).toContain(`id="${idMotif('#fdd835', m)}"`);
            expect(svg).toContain('patternUnits="userSpaceOnUse"');
            expect(svg).toContain('#fdd835');
        }
        expect(svgMotif('#fdd835', 'diag')).toContain('rotate(45)');
        expect(svgMotif('#fdd835', 'diag-inv')).toContain('rotate(-45)');
    });
});
