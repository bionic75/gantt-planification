import { describe, expect, it } from 'vitest';
import type { EvenementAffectation } from '@/api/affectation';
import {
    aujourdhui,
    basculerTri,
    comparaisonPlanning,
    confirmationSuppression,
    datesEvenement,
    demiJournee,
    filtrer,
    nomsParticipants,
    samusPresents,
    trier
} from './evenements';

const ev = (e: Partial<EvenementAffectation>): EvenementAffectation => ({
    id: 1,
    project_id: 1,
    samu: 'SAMU 25',
    label: 'Visite',
    start: '2031-03-03',
    end: '2031-03-05',
    period: 'FULL',
    stage: 'visite_metier',
    stage_label: 'Visite métier',
    type: { id: 1, label: 'Visite métier', short: null, icon: null, bg: '#fff', color: '#000', border: '#ccc' },
    participants: [],
    participants_jours: {},
    planned: { start: '2031-03-03', end: '2031-03-05' },
    ...e
});

describe('onglet Événements de l’aide à l’affectation', () => {
    it('dates, demi-journée, participants avec leurs jours', () => {
        expect(datesEvenement(ev({}))).toBe('03/03/2031 → 05/03/2031');
        expect(datesEvenement(ev({ end: '2031-03-03' }))).toBe('03/03/2031');
        expect([demiJournee('AM'), demiJournee('PM'), demiJournee('FULL'), demiJournee(null)]).toEqual([
            'matin',
            'après-midi',
            '',
            ''
        ]);
        expect(
            nomsParticipants(
                ev({ participants: ['Léa Martin', 'Paul Roux'], participants_jours: { 'Paul Roux': '04/03' } })
            )
        ).toEqual(['Léa Martin', 'Paul Roux (04/03)']);
    });

    it('comparaison avec le planning des déploiements', () => {
        expect(comparaisonPlanning(ev({}))).toBe('memes-dates');
        expect(comparaisonPlanning(ev({ start: '2031-03-10', end: '2031-03-10' }))).toBe('autres-dates');
        expect(comparaisonPlanning(ev({ planned: null }))).toBe('non-datee');
    });

    it('filtres : SAMU, activité, recherche sans accents (intitulé, type, participants)', () => {
        const liste = [
            ev({ id: 1 }),
            ev({
                id: 2,
                samu: 'SAMU 13',
                stage: 'mise_en_service',
                label: 'Démarrage',
                type: { ...ev({}).type, label: 'Mise en service' }
            }),
            ev({ id: 3, participants: ['Hélène Petit'] })
        ];
        const ids = (f: Partial<Parameters<typeof filtrer>[1]>) =>
            filtrer(liste, { samu: '', stage: '', q: '', ...f }).map(e => e.id);
        expect(ids({ samu: 'SAMU 13' })).toEqual([2]);
        expect(ids({ stage: 'visite_metier' })).toEqual([1, 3]);
        expect(ids({ q: 'demarrage' })).toEqual([2]);
        expect(ids({ q: 'HELENE' })).toEqual([3]);
        expect(ids({ q: 'visite métier' })).toEqual([1, 3]);
    });

    it('tri : colonne, sens, puis date de début et SAMU ; numéros de SAMU dans l’ordre', () => {
        const liste = [
            ev({ id: 1, label: 'b', samu: 'SAMU 9', start: '2031-01-02', end: '2031-01-02', participants: ['x'] }),
            ev({ id: 2, label: 'a', samu: 'SAMU 10', start: '2031-01-01', end: '2031-01-01', planned: null }),
            ev({ id: 3, label: 'a', samu: 'SAMU 2', start: '2031-01-01', end: '2031-01-01' })
        ];
        const ids = (k: Parameters<typeof basculerTri>[1], dir: 1 | -1 = 1) => trier(liste, { k, dir }).map(e => e.id);
        expect(ids('start')).toEqual([3, 2, 1]);
        expect(ids('label')).toEqual([3, 2, 1]);
        expect(ids('label', -1)).toEqual([1, 3, 2]);
        expect(ids('samu')).toEqual([3, 1, 2]);
        expect(ids('part', -1)).toEqual([1, 3, 2]);
        expect(ids('plan')).toEqual([3, 1, 2]);
        expect(basculerTri({ k: 'label', dir: 1 }, 'label')).toEqual({ k: 'label', dir: -1 });
        expect(basculerTri({ k: 'label', dir: -1 }, 'samu')).toEqual({ k: 'samu', dir: 1 });
        expect(samusPresents(liste)).toEqual(['SAMU 2', 'SAMU 9', 'SAMU 10']);
    });

    it('confirmation de la suppression, date du jour', () => {
        expect(confirmationSuppression(ev({ label: 'Visite A' }))).toMatch(
            /^Supprimer l'événement « Visite A » \(SAMU 25, 03\/03\/2031 → 05\/03\/2031\) \?/
        );
        expect(aujourdhui(new Date(2031, 0, 5, 23, 30))).toBe('2031-01-05');
    });
});
