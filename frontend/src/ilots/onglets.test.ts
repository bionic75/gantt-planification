import { describe, expect, it } from 'vitest';
import { libelleOnglet } from './onglets';

describe('onglets', () => {
    it("libellé de l'onglet des événements", () => {
        expect(libelleOnglet('evenements')).toBe('Événements / Cartographie');
    });
});
