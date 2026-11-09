import { describe, expect, it } from 'vitest';
import type { Deploiement } from '@/api/affectation';
import {
    bornesValides,
    construireColonnes,
    contenuCellule,
    debutBorne,
    deploiementsTries,
    finBorne,
    periodeAutomatique,
    Trigrammes,
    typeBorne,
    valeurBorne,
    type ContexteGrille
} from './grille';
import { nomFichierExport } from './impression';
import { erreurPeriode, lundiDe, semaineIso, styleFond, valeurSemaine } from './outils';

const dep = (d: Partial<Deploiement>): Deploiement => ({
    id: 1,
    samu_name: 'SAMU 25',
    chef_projet_nom: 'Durand',
    date_debut: '2031-01-06',
    date_mise_en_service: '2031-04-01',
    date_mise_en_production: null,
    periods: { visite_metier: [{ start: '2031-03-03', end: '2031-03-05', needed: 2 }] },
    assignments: {},
    assignment_days: {},
    ...d
});

const contexte = (deploiements: Deploiement[], masquees: string[] = []): ContexteGrille => ({
    deploiements,
    config: {
        stages: [{ key: 'visite_metier', label: 'Visite métier' }],
        colors: { visite_metier: '#336699' },
        patterns: {}
    },
    ressources: [{ id: 7, nom: 'martin', prenom: 'Léa', trigramme: 'LMA' }],
    externes: [],
    masquees: new Set(masquees)
});

describe('dates', () => {
    it('semaines ISO, lundi, valeur de champ semaine', () => {
        expect(semaineIso('2031-03-03')).toEqual({ week: 10, year: 2031 });
        expect(semaineIso('2030-12-30')).toEqual({ week: 1, year: 2031 });
        expect(lundiDe('2031-03-08')).toBe('2031-03-03');
        expect(valeurSemaine('2031-03-05')).toBe('2031-W10');
    });

    it('garde-fou de la période', () => {
        expect(erreurPeriode('0002-01-01', '2031-01-01', 'day')).toMatch(/hors limites/);
        expect(erreurPeriode('2000-01-01', '2100-01-01', 'day')).toMatch(/Période trop large/);
        expect(erreurPeriode('2031-01-01', '2031-12-31', 'day')).toBe('');
    });

    it('fond : couleur seule, ou motif clair sur fond foncé', () => {
        expect(styleFond('#336699', 'none')).toBe('background-color:#336699;');
        expect(styleFond('#336699', 'dots')).toMatch(
            /background-image:url\('data:image\/svg\+xml,.*rgba\(255%2C255%2C255/
        );
    });
});

describe('colonnes de la grille', () => {
    it('jour : 5 lignes d’en-tête, week-ends, jour courant', () => {
        const { cols, rows } = construireColonnes('day', '2031-03-01', '2031-03-03', { jour: '2031-03-02' });
        expect(cols.map(c => [c.key, c.we, c.today])).toEqual([
            ['2031-03-01', true, false],
            ['2031-03-02', true, true],
            ['2031-03-03', false, false]
        ]);
        expect(rows).toHaveLength(5);
        expect(rows[1]).toContain('Mars');
        expect(rows[2]).toContain('S9');
        expect(rows[3]).toContain('data-today="1"');
    });

    it('semaine, mois, trimestre, année', () => {
        expect(construireColonnes('week', '2031-03-05', '2031-03-12').cols.map(c => c.from)).toEqual([
            '2031-03-03',
            '2031-03-10'
        ]);
        expect(construireColonnes('month', '2031-01-15', '2031-03-01').cols.map(c => [c.from, c.to])).toEqual([
            ['2031-01-01', '2031-01-31'],
            ['2031-02-01', '2031-02-28'],
            ['2031-03-01', '2031-03-31']
        ]);
        expect(construireColonnes('quarter', '2031-02-01', '2031-07-01').cols.map(c => c.key)).toEqual([
            '2031-T1',
            '2031-T2',
            '2031-T3'
        ]);
        expect(construireColonnes('year', '2031-02-01', '2032-07-01', { print: true }).rows[0]).not.toContain(
            'min-width'
        );
    });
});

describe('contenu des cellules', () => {
    const p = dep({ assignments: { visite_metier: [7] }, assignment_days: { visite_metier: { '2031-03-03': [7] } } });
    const ctx = contexte([p]);
    const cols = construireColonnes('day', '2031-03-01', '2031-03-06').cols;
    const tri = new Trigrammes(cols, 'day');
    const cellule = (jour: string, c = ctx) =>
        contenuCellule(
            c,
            tri,
            p,
            cols.find(x => x.key === jour)!
        );

    it('étape à ressources : trigrammes du jour, infobulle, affectation au clic', () => {
        const html = cellule('2031-03-03');
        expect(html).toContain('<span>LMA</span>');
        expect(html).toContain('data-affecter="1|visite_metier"');
        expect(html).toContain('1/2 ressource(s) par jour :\n• Léa MARTIN');
        expect(html).toContain('background-color:#336699');
        // Jour sans intervenant : nombre d'affectés seulement en tête de période
        expect(cellule('2031-03-04')).not.toContain('LMA');
    });

    it('étape masquée, impression (non cliquable), cellule vide hors période', () => {
        expect(cellule('2031-03-03', contexte([p], ['visite_metier']))).not.toContain('data-affecter');
        expect(cellule('2031-03-03', { ...ctx, impression: true })).not.toContain('data-affecter');
        // Hors période : emplacement invisible, même hauteur que la voie dans les autres colonnes
        expect(cellule('2031-03-01')).toContain('visibility:hidden');
        expect(cellule('2031-03-01')).not.toContain('data-affecter');
    });

    it('jalons et début du projet', () => {
        const q = dep({ date_debut: '2031-03-02', date_mise_en_service: '2031-03-02' });
        const html = contenuCellule(
            contexte([q]),
            tri,
            q,
            cols.find(x => x.key === '2031-03-02')!
        );
        expect(html).toContain('aff-mk start');
        expect(html).toContain('title="Début du projet : 02/03/2031"');
    });

    it('textes échappés', () => {
        const q = dep({ periods: { visite_metier: [{ start: '2031-03-03', end: '2031-03-03', needed: 1 }] } });
        const c = contexte([q]);
        c.config!.stages[0]!.label = '<b>Visite</b>';
        expect(
            contenuCellule(
                c,
                tri,
                q,
                cols.find(x => x.key === '2031-03-03')!
            )
        ).toContain('&lt;b&gt;Visite');
    });
});

describe('tri et période', () => {
    const liste = [
        dep({ id: 1, samu_name: 'SAMU 9', chef_projet_nom: null }),
        dep({ id: 2, samu_name: 'SAMU 10', chef_projet_nom: 'Abel', date_mise_en_service: '2020-01-01' }),
        dep({ id: 3, samu_name: 'SAMU 2', chef_projet_nom: 'Zoé' })
    ];
    const ids = (k: Parameters<typeof deploiementsTries>[1], masquees: string[] = [], retirees = new Set<number>()) =>
        deploiementsTries(contexte(liste, masquees), k, retirees, false, '2026-11-09').map(p => p.id);

    it('tri numérique, valeurs vides en bas, lignes retirées, SAMU déjà en service', () => {
        expect(ids({ key: 'samu', dir: 1 })).toEqual([3, 1, 2]);
        expect(ids({ key: 'samu', dir: -1 })).toEqual([2, 1, 3]);
        expect(ids({ key: 'chef', dir: 1 })).toEqual([2, 3, 1]);
        expect(ids({ key: 'chef', dir: -1 })).toEqual([3, 2, 1]);
        expect(ids({ key: 'samu', dir: 1 }, ['_past'])).toEqual([3, 1]);
        expect(ids({ key: 'samu', dir: 1 }, [], new Set([1]))).toEqual([3, 2]);
    });

    it('période automatique, bornes par échelle, bornes aberrantes', () => {
        expect(periodeAutomatique([dep({})])).toEqual({ min: '2031-01-03', max: '2031-04-08' });
        expect(periodeAutomatique([], '2031-05-20')).toEqual({ min: '2031-04-28', max: '2031-08-06' });
        expect(typeBorne('week')).toBe('week');
        expect(valeurBorne('month', '2031-03-15')).toBe('2031-03');
        expect(debutBorne('week', '2031-W10')).toBe('2031-03-03');
        expect(finBorne('week', '2031-W10')).toBe('2031-03-09');
        expect(finBorne('month', '2031-02')).toBe('2031-02-28');
        expect(finBorne('month', '2031-12')).toBe('2031-12-31');
        expect(bornesValides({ from: '0002-01-01', to: null })).toBeNull();
        expect(bornesValides({ from: '2031-01-01', to: '2031-02-01' })).toEqual({
            from: '2031-01-01',
            to: '2031-02-01'
        });
    });
});

describe('nom des fichiers exportés', () => {
    const d = new Date(2031, 2, 5, 9, 7);
    it('jetons, caractères interdits, valeur par défaut', () => {
        expect(nomFichierExport('Plan_{AAAAMMJJ}_{HHMM}_{ECHELLE}', { zoom: 'week' }, d)).toBe(
            'Plan_20310305_0907_semaine'
        );
        expect(
            nomFichierExport(
                '{TITRE} {DEBUT}-{FIN}',
                { title: 'Planning été', from: '2031-03-01', to: '2031-03-31' },
                d
            )
        ).toBe('Planning_ete_20310301-20310331');
        expect(nomFichierExport('a:b/c', null, d)).toBe('a_b_c');
        expect(nomFichierExport(undefined, null, d)).toBe('SI-SAMU_Planning_Déploiement_20310305_0907');
        expect(nomFichierExport('...', null, d)).toBe('planning-deploiements');
    });
});
