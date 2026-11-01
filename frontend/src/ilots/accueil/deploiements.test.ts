import { describe, expect, it } from 'vitest';
import { debutMoisDecale, friseMois, joursEntre, lignesDeploiements, pourcent, type Deploiement } from './deploiements';

const dep = (champs: Partial<Deploiement>): Deploiement => ({
    id: 1,
    samu_name: 'SAMU 56',
    date_debut: null,
    date_mise_en_service: null,
    date_mise_en_production: null,
    periods: {},
    ...champs
});

describe('frise', () => {
    it('mois décalés, passage d’année compris', () => {
        expect(debutMoisDecale('2026-11-15', 0)).toBe('2026-11-01');
        expect(debutMoisDecale('2026-11-15', 2)).toBe('2027-01-01');
        expect(debutMoisDecale('2026-11-15', -11)).toBe('2025-12-01');
    });

    it('douze mois à partir du mois de la date', () => {
        const f = friseMois('2026-11-15', 12);
        expect(f.debut).toBe('2026-11-01');
        expect(f.fin).toBe('2027-10-31');
        expect(f.jours).toBe(365);
        expect(f.mois).toHaveLength(12);
        expect(f.mois.reduce((s, m) => s + m.largeur, 0)).toBeCloseTo(100);
    });

    it('jours et position', () => {
        const f = friseMois('2026-11-01', 12);
        expect(joursEntre('2026-11-01', '2026-11-11')).toBe(10);
        expect(pourcent(f, '2026-11-01')).toBe(0);
        expect(pourcent(f, '2027-05-01')).toBeCloseTo((181 / 365) * 100);
    });
});

describe('lignes de déploiements', () => {
    const frise = friseMois('2026-11-15', 12);

    it('barres, points et couleurs', () => {
        const lignes = lignesDeploiements(
            [
                dep({
                    date_mise_en_service: '2027-02-10',
                    date_mise_en_production: '2027-03-10',
                    periods: {
                        cadrage: [{ start: '2026-11-02', end: '2026-12-11' }],
                        deploiement: [{ start: '2027-01-04', end: '2027-02-26' }],
                        visite_metier: [{ start: '2026-12-14', end: '2026-12-14' }],
                        vft: [{ start: '2027-02-01', end: '2027-02-05' }],
                        formation_utilisateurs: [{ start: '2027-02-15', end: '2027-02-19' }],
                        accompagnement: [{ start: '2027-03-15', end: '2027-03-19' }]
                    }
                })
            ],
            frise,
            '2026-11-15',
            { cadrage: '#111111' }
        );
        expect(lignes).toHaveLength(1);
        const l = lignes[0]!;
        expect(l.barres.map(b => b.cle)).toEqual(['cadrage', 'deploiement']);
        expect(l.barres[0]).toMatchObject({ couleur: '#111111', coupeeAvant: false, coupeeApres: false });
        expect(l.points.map(p => p.cle).sort()).toEqual([
            'formation_utilisateurs',
            'mise_en_production',
            'mise_en_service',
            'vft',
            'visite_metier'
        ]);
        // « Accompagnement » n'est ni barre ni point
        expect(l.points.some(p => p.date === '2027-03-15')).toBe(false);
        expect(l.points.find(p => p.cle === 'vft')?.fin).toBe('2027-02-05');
    });

    it('barre coupée aux bords de la frise', () => {
        const [l] = lignesDeploiements(
            [dep({ periods: { deploiement: [{ start: '2026-10-01', end: '2027-12-31' }] } })],
            frise,
            '2026-11-15'
        );
        expect(l?.barres[0]).toMatchObject({ coupeeAvant: true, coupeeApres: true, gauche: 0 });
        expect(l?.barres[0]?.largeur).toBeCloseTo(100);
    });

    it('déploiement terminé avant le mois en cours ou hors frise : écarté', () => {
        const termine = dep({ id: 1, periods: { deploiement: [{ start: '2026-08-01', end: '2026-09-30' }] } });
        const lointain = dep({ id: 2, periods: { deploiement: [{ start: '2029-01-01', end: '2029-02-01' }] } });
        expect(lignesDeploiements([termine, lointain], frise, '2026-11-15')).toEqual([]);
    });

    it('déploiement commencé avant la frise mais pas terminé : conservé ; tri par première date', () => {
        const a = dep({ id: 1, samu_name: 'B', periods: { cadrage: [{ start: '2026-12-01', end: '2026-12-31' }] } });
        const b = dep({ id: 2, samu_name: 'A', periods: { cadrage: [{ start: '2026-11-03', end: '2026-12-31' }] } });
        expect(lignesDeploiements([a, b], frise, '2026-11-15').map(l => l.id)).toEqual([2, 1]);
    });

    it('périodes invalides ignorées', () => {
        const d = dep({ periods: { cadrage: [{ start: 'x', end: '2026-12-01' }], vft: [] } as never });
        expect(lignesDeploiements([d], frise, '2026-11-15')).toEqual([]);
    });
});
