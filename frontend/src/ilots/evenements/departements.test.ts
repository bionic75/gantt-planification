import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DeploiementCarte, StatutDeploiement } from '@/api/deploiements';
import { centreDe, couleursDepartements, departementDe, type Contours } from './departements';

const carre = (x: number, y: number, t = 10) => [
    [
        [x, y],
        [x + t, y],
        [x + t, y + t],
        [x, y + t],
        [x, y]
    ]
];
const contours: Contours = {
    features: [
        { properties: { code: 'A', nom: 'Alpha' }, geometry: { type: 'Polygon', coordinates: carre(0, 0) } },
        {
            properties: { code: 'B', nom: 'Beta' },
            geometry: { type: 'MultiPolygon', coordinates: [carre(20, 0), carre(40, 0)] }
        },
        {
            properties: { code: 'C', nom: 'Gamma' },
            geometry: { type: 'Polygon', coordinates: [carre(0, 20, 30)[0], carre(10, 30, 10)[0]] }
        }
    ]
};
// longitude = x, latitude = y
const statut = (id: number, position: number, couleur = '#111111', pattern = 'plein'): StatutDeploiement => ({
    id,
    label: `S${id}`,
    color: couleur,
    pattern,
    position,
    is_service: 0,
    nb_samu: 0
});
const dep = (id: number, lat: number | null, lng: number | null, status_id: number | null): DeploiementCarte => ({
    id,
    samu_name: `SAMU ${id}`,
    location_id: id,
    latitude: lat,
    longitude: lng,
    status_id,
    date_mise_en_service: null
});

describe('departementDe', () => {
    it('trouve le département d’un point dans un polygone', () => {
        expect(departementDe(5, 5, contours)).toEqual({ code: 'A', nom: 'Alpha' });
    });
    it('parcourt tous les polygones d’un multipolygone', () => {
        expect(departementDe(5, 45, contours)?.code).toBe('B');
    });
    it('ignore un point dans le trou d’un polygone', () => {
        expect(departementDe(35, 15, contours)).toBeNull();
        expect(departementDe(35, 5, contours)?.code).toBe('C');
    });
    it('renvoie null hors de tous les contours', () => {
        expect(departementDe(100, 100, contours)).toBeNull();
    });
    it('lit le vrai fichier : Paris 75, Marseille 13', () => {
        // Chemin relatif à ce fichier : les tests se lancent depuis la racine ou depuis le paquet frontend
        const fichier = path.join(import.meta.dirname, '../../../public/departements.geojson');
        const reel = JSON.parse(readFileSync(fichier, 'utf8')) as Contours;
        expect(departementDe(48.8566, 2.3522, reel)?.code).toBe('75');
        expect(departementDe(43.2965, 5.3698, reel)?.code).toBe('13');
    });
});

describe('couleursDepartements', () => {
    const statuts = [statut(1, 1, '#aa0000'), statut(2, 0, '#00aa00')];
    it('ignore un déploiement sans coordonnées ou sans statut', () => {
        const m = couleursDepartements([dep(1, null, null, 1), dep(2, 5, 5, null)], statuts, contours);
        expect(m.size).toBe(0);
    });
    it('colore le département avec la couleur du statut', () => {
        const m = couleursDepartements([dep(1, 5, 5, 1)], statuts, contours);
        expect(m.get('A')).toEqual({ couleur: '#aa0000', motif: 'plein', statut: 'S1', samu: ['SAMU 1'] });
    });
    it('garde le statut de plus petite position quand plusieurs déploiements partagent le département', () => {
        const m = couleursDepartements([dep(1, 5, 5, 1), dep(2, 6, 6, 2)], statuts, contours);
        expect(m.get('A')).toEqual({ couleur: '#00aa00', motif: 'plein', statut: 'S2', samu: ['SAMU 2'] });
    });
    it('reprend le motif du statut', () => {
        const m = couleursDepartements([dep(1, 5, 5, 3)], [statut(3, 0, '#00aa00', 'points')], contours);
        expect(m.get('A')?.motif).toBe('points');
    });
    it('liste tous les SAMU de même statut dans le département', () => {
        const m = couleursDepartements([dep(1, 5, 5, 2), dep(2, 6, 6, 2)], statuts, contours);
        expect(m.get('A')?.samu).toEqual(['SAMU 1', 'SAMU 2']);
    });
});

describe('couleursDepartements : statuts masqués', () => {
    it('ignore les déploiements dont le statut est masqué (la légende peut le cacher)', () => {
        const statuts = [statut(1, 1), statut(2, 2)];
        const liste = [dep(1, 5, 5, 1), dep(2, 5, 25, 2)];
        const res = couleursDepartements(liste, statuts, contours, new Set(['S1']));
        expect([...res.keys()]).toEqual(['B']);
    });
});

describe('centreDe', () => {
    it('centre de l’emprise, polygone ou multipolygone', () => {
        expect(centreDe(contours.features[0]!)).toEqual([5, 5]);
        expect(centreDe(contours.features[1]!)).toEqual([35, 5]);
    });
});
