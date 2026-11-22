import { describe, expect, it } from 'vitest';
import type { Contours } from './departements';
import { ENCARTS, rapprocherOutreMer } from './outre-mer';

const rect = (x0: number, y0: number, x1: number, y1: number) => [
    [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
    ]
];
const contours: Contours = {
    features: [
        { properties: { code: '75', nom: 'Paris' }, geometry: { type: 'Polygon', coordinates: rect(2, 48, 3, 49) } },
        {
            type: 'Feature',
            properties: { code: '971', nom: 'Guadeloupe' },
            geometry: { type: 'MultiPolygon', coordinates: [rect(-62, 15.8, -61, 16.5)] }
        } as Contours['features'][number]
    ]
};
const boite = (f: Contours['features'][number]) => {
    const pts = (f.geometry.coordinates as number[][][][]).flat(2);
    const xs = pts.map(p => p[0] ?? 0);
    const ys = pts.map(p => p[1] ?? 0);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('rapprocherOutreMer', () => {
    const res = rapprocherOutreMer(contours);

    it('laisse la métropole telle quelle', () => {
        expect(res.features[0]).toBe(contours.features[0]);
    });

    it('place un département d’outre-mer au centre de son encart, avec le même code et le même nom', () => {
        const f = res.features[1]!;
        expect(f.properties).toEqual({ code: '971', nom: 'Guadeloupe' });
        expect((f as { type?: string }).type).toBe('Feature');
        const b = boite(f);
        const encart = ENCARTS['971']!;
        expect((b.x0 + b.x1) / 2).toBeCloseTo(encart.lng, 6);
        expect((b.y0 + b.y1) / 2).toBeCloseTo(encart.lat, 6);
    });

    it('tient dans l’encart et garde les proportions telles qu’affichées sur la carte (Mercator)', () => {
        const b = boite(res.features[1]!);
        const encart = ENCARTS['971']!;
        expect(b.x1 - b.x0).toBeLessThanOrEqual(encart.cote + 1e-9);
        expect(b.y1 - b.y0).toBeLessThanOrEqual(encart.cote + 1e-9);
        const rad = (d: number) => (d * Math.PI) / 180;
        const avant = 0.7 / Math.cos(rad(16.15)) / 1;
        const apres = (b.y1 - b.y0) / Math.cos(rad(encart.lat)) / (b.x1 - b.x0);
        expect(apres).toBeCloseTo(avant, 3);
    });

    it('ne modifie pas les contours d’origine (les couleurs se calculent sur les vraies coordonnées)', () => {
        expect(boite(contours.features[1]!).x0).toBe(-62);
    });
});

describe('projectionFranceEtEncarts', () => {
    it("tient dans l'image, sous le bandeau, avec les encarts d'outre-mer", async () => {
        const { projectionFranceEtEncarts, ENCARTS } = await import('./outre-mer');
        const p = projectionFranceEtEncarts(800, 600, 60);
        const points = [
            p(-13.8, 41.8),
            p(9.6, 51.1),
            ...Object.values(ENCARTS).flatMap(e => [p(e.lng - e.cote / 2, e.lat - e.cote / 2)])
        ];
        for (const [x, y] of points) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(800);
            expect(y).toBeGreaterThanOrEqual(60);
            expect(y).toBeLessThanOrEqual(600);
        }
    });
    it('le nord est au-dessus du sud', async () => {
        const { projectionFranceEtEncarts } = await import('./outre-mer');
        const p = projectionFranceEtEncarts(800, 600);
        expect(p(2, 50)[1]).toBeLessThan(p(2, 43)[1]);
    });
});
