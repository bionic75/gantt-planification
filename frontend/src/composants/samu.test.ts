import { describe, expect, it } from 'vitest';
import { LISTE_CAPTV, LISTE_SAMU, LISTE_SAMU_ET_CAPTV } from './samu';

describe('CAPTV', () => {
    it('7 centres, ajoutés après les SAMU sans modifier la liste des SAMU', () => {
        expect(LISTE_CAPTV).toEqual([
            'CAPTV 49',
            'CAPTV 33',
            'CAPTV 13',
            'CAPTV 75',
            'CAPTV 69',
            'CAPTV 54',
            'CAPTV 31'
        ]);
        expect(LISTE_SAMU).toHaveLength(99);
        expect(LISTE_SAMU_ET_CAPTV).toHaveLength(106);
    });
});
