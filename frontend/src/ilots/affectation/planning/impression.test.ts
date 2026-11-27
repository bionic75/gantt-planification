import { describe, expect, it } from 'vitest';
import type { Deploiement } from '@/api/affectation';
import type { ContexteGrille } from './grille';
import { mettreEnPage, type OptionsImpression } from './impression';

const dep = (id: number, nom: string, d: Partial<Deploiement>): Deploiement => ({
    id,
    samu_name: nom,
    chef_projet_nom: null,
    date_debut: '2031-01-06',
    date_mise_en_service: null,
    date_mise_en_production: null,
    periods: {},
    assignments: {},
    assignment_days: {},
    ...d
});
const visite = (jour: string) => ({ periods: { visite_metier: [{ start: jour, end: jour, needed: 0 }] } });

/** Pages d'un planning mensuel : 24 mois répartis sur deux pages A4 paysage (13 puis 11 colonnes) */
function pages(deploiements: Deploiement[], options: Partial<OptionsImpression> = {}) {
    const ctx: ContexteGrille = {
        deploiements,
        config: null,
        ressources: [],
        externes: [],
        masquees: new Set()
    };
    const o: OptionsImpression = {
        title: 'Planning',
        from: '2031-01-01',
        to: '2032-12-31',
        zoom: 'month',
        paper: 'A4',
        orient: 'landscape',
        fit: 'split',
        keepMonths: false,
        legend: false,
        tpl: false,
        cover: false,
        end: false,
        samu: new Set(deploiements.map(p => p.id)),
        hidden: new Set(),
        ...options
    };
    return mettreEnPage(o, ctx, { key: 'samu', dir: 1 }, new Set(), { exists: false }, document.body).pages;
}

describe('impression : SAMU sans activité sur la période de la page', () => {
    const mars2031 = dep(1, 'SAMU 25', visite('2031-03-03'));
    const juin2032 = dep(2, 'SAMU 39', visite('2032-06-07'));

    it('chaque page ne garde que les SAMU actifs sur ses colonnes', () => {
        const [p1, p2, ...reste] = pages([mars2031, juin2032]);
        expect(reste).toEqual([]);
        expect(p1).toContain('SAMU 25');
        expect(p1).not.toContain('SAMU 39');
        expect(p2).toContain('SAMU 39');
        expect(p2).not.toContain('SAMU 25');
    });

    it('page sans aucun SAMU actif : supprimée, numérotation recalculée', () => {
        const resultat = pages([juin2032]);
        expect(resultat).toHaveLength(1);
        expect(resultat[0]).toContain('SAMU 39');
        expect(resultat[0]).toContain('Page 1 / 1');
        expect(resultat[0]).not.toContain('colonnes');
    });

    it('aucune activité sur toute la période : une page avec un message', () => {
        const resultat = pages([dep(3, 'SAMU 70', {})]);
        expect(resultat).toHaveLength(1);
        expect(resultat[0]).not.toContain('SAMU 70');
        expect(resultat[0]).toContain('Aucune activité sur la période');
    });

    it('mise en service, mise en production, jalon et phase comptent comme activité', () => {
        const resultat = pages(
            [
                dep(4, 'SAMU 01', { date_mise_en_service: '2031-02-01' }),
                dep(5, 'SAMU 02', { date_mise_en_production: '2031-02-01' }),
                dep(6, 'SAMU 03', { periods: { visite_ob: [{ start: '2031-02-01', end: '2031-02-01' }] } }),
                dep(7, 'SAMU 04', { periods: { cadrage: [{ start: '2030-11-01', end: '2031-01-15' }] } })
            ],
            { to: '2031-06-30' }
        );
        for (const nom of ['SAMU 01', 'SAMU 02', 'SAMU 03', 'SAMU 04']) expect(resultat[0]).toContain(nom);
    });

    it('rubrique non affichée ou début de projet seul : pas une activité', () => {
        const resultat = pages([mars2031, dep(8, 'SAMU 90', { date_debut: '2031-02-03' })], {
            to: '2031-06-30',
            hidden: new Set(['visite_metier'])
        });
        expect(resultat[0]).not.toContain('SAMU 25');
        expect(resultat[0]).not.toContain('SAMU 90');
    });
});
