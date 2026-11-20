import { describe, expect, it, vi } from 'vitest';
import { ecrireEtat, etatInitial, lireEtat, opaciteDepartements, stockageNavigateur } from './calques';

const stockage = (valeur: string | null) => ({ getItem: () => valeur });

describe('calques de la carte', () => {
    it('tous les calques sont affichés au départ, transparence à 60 %', () => {
        expect(etatInitial()).toMatchObject({ departements: true, evenements: true, experts: true, transparence: 60 });
    });

    it('revient à l’état initial si rien n’est mémorisé, si le JSON est invalide ou si la lecture échoue', () => {
        expect(lireEtat(stockage(null))).toEqual(etatInitial());
        expect(lireEtat(stockage('{pas du json'))).toEqual(etatInitial());
        expect(
            lireEtat({
                getItem: () => {
                    throw new Error('stockage bloqué');
                }
            })
        ).toEqual(etatInitial());
    });

    it('ignore les valeurs de mauvais type', () => {
        const e = lireEtat(stockage(JSON.stringify({ departements: 'oui', transparence: 'beaucoup', experts: false })));
        expect(e).toEqual({ ...etatInitial(), experts: false });
    });

    it('relit ce qu’il a écrit, et n’échoue pas si l’écriture est impossible', () => {
        let v = '';
        const etat = { ...etatInitial(), departements: false, experts: false, transparence: 25 };
        ecrireEtat({ setItem: (_k: string, x: string) => (v = x) }, etat);
        expect(lireEtat(stockage(v))).toEqual(etat);
        expect(() =>
            ecrireEtat(
                {
                    setItem: () => {
                        throw new Error('quota');
                    }
                },
                etat
            )
        ).not.toThrow();
    });

    it('opacité des départements : 0,8 au plus, 0 à 100 % de transparence, bornée', () => {
        expect(opaciteDepartements(0)).toBeCloseTo(0.8);
        expect(opaciteDepartements(100)).toBe(0);
        expect(opaciteDepartements(60)).toBeCloseTo(0.32);
        expect(opaciteDepartements(150)).toBe(0);
        expect(opaciteDepartements(-5)).toBeCloseTo(0.8);
    });

    it('fonctionne quand l’accès même au stockage du navigateur est refusé', () => {
        const espion = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new DOMException('Accès refusé', 'SecurityError');
        });
        try {
            const s = stockageNavigateur();
            expect(lireEtat(s)).toEqual(etatInitial());
            expect(() => ecrireEtat(s, etatInitial())).not.toThrow();
        } finally {
            espion.mockRestore();
        }
    });
});

describe('fond de carte et statuts masqués', () => {
    it('plan et aucun statut masqué au départ', () => {
        expect(etatInitial()).toMatchObject({ fond: 'plan', statutsMasques: [] });
    });
    it('carte de France seule : désactivée au départ, relue si mémorisée', () => {
        expect(etatInitial().franceSeule).toBe(false);
        expect(lireEtat(stockage(JSON.stringify({ franceSeule: true }))).franceSeule).toBe(true);
        expect(lireEtat(stockage(JSON.stringify({ franceSeule: 'oui' }))).franceSeule).toBe(false);
    });
    it('relit le fond et les statuts masqués, ignore les valeurs invalides', () => {
        expect(lireEtat(stockage(JSON.stringify({ fond: 'satellite', statutsMasques: ['En projet'] })))).toMatchObject({
            fond: 'satellite',
            statutsMasques: ['En projet']
        });
        expect(lireEtat(stockage(JSON.stringify({ fond: 'hologramme', statutsMasques: 'tous' })))).toMatchObject({
            fond: 'plan',
            statutsMasques: []
        });
    });
});
