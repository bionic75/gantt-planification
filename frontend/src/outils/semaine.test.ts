import { describe, expect, it } from 'vitest';
import { semaineIsoDate, semaineIsoDuJour, semaineIsoTexte } from './semaine';

describe('semaine ISO 8601', () => {
    it('semaine du premier jeudi, année de la semaine', () => {
        expect(semaineIsoTexte('2031-03-03')).toEqual({ semaine: 10, annee: 2031 });
        expect(semaineIsoTexte('2030-12-30')).toEqual({ semaine: 1, annee: 2031 });
        expect(semaineIsoTexte('2026-12-28')).toEqual({ semaine: 53, annee: 2026 });
        expect(semaineIsoTexte('2027-01-01')).toEqual({ semaine: 53, annee: 2026 });
        expect(semaineIsoDuJour(2031, 0, 1)).toEqual({ semaine: 1, annee: 2031 });
    });

    it('date du calendrier local', () => {
        expect(semaineIsoDate(new Date(2031, 2, 3, 23, 30))).toEqual({ semaine: 10, annee: 2031 });
        expect(semaineIsoDate(new Date(2026, 0, 1))).toEqual({ semaine: 1, annee: 2026 });
    });
});
