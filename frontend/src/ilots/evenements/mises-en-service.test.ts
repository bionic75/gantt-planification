import { describe, expect, it } from 'vitest';
import type { DeploiementCarte, StatutDeploiement } from '@/api/deploiements';
import {
    dateALaPositionCompressee,
    datesDeMisesEnService,
    datesDesImagesCompressees,
    datesDesImages,
    misesEnServiceA,
    plageMisesEnService
} from './mises-en-service';

const statut = (id: number, service: boolean): StatutDeploiement => ({
    id,
    label: service ? 'En service' : `S${id}`,
    color: '#111111',
    pattern: 'plein',
    position: id,
    is_service: service ? 1 : 0,
    nb_samu: 0
});
const statuts = [statut(1, false), statut(2, true)];
const samu = (
    id: number,
    status_id: number | null,
    date: string | null,
    suggeree: string | null = null
): DeploiementCarte => ({
    id,
    samu_name: `SAMU ${id}`,
    location_id: id,
    latitude: 1,
    longitude: 1,
    status_id,
    date_mise_en_service: date,
    date_suggeree: suggeree
});
const liste = [
    samu(1, 2, '2031-09-10'),
    samu(2, 2, null, '2031-09-20'),
    samu(3, 2, '2031-10-05'),
    samu(4, 1, '2031-09-15'),
    samu(5, 2, null)
];

describe('plageMisesEnService', () => {
    it('va de la première à la dernière mise en service des SAMU en service datés', () => {
        expect(plageMisesEnService(liste, statuts)).toEqual({ debut: '2031-09-10', fin: '2031-10-05', jours: 25 });
    });
    it('vaut null sans SAMU en service daté', () => {
        expect(plageMisesEnService([samu(4, 1, '2031-09-15'), samu(5, 2, null)], statuts)).toBeNull();
    });
});

describe('misesEnServiceA', () => {
    const plage = { debut: '2031-09-01', fin: '2031-09-30', jours: 29 };
    it('ne garde que les SAMU en service déjà mis en service à la date, dans la période', () => {
        expect(misesEnServiceA(liste, statuts, plage, '2031-09-12').map(d => d.id)).toEqual([1]);
        expect(misesEnServiceA(liste, statuts, plage, '2031-09-30').map(d => d.id)).toEqual([1, 2]);
    });
    it('ignore les mises en service hors période et les autres statuts', () => {
        expect(misesEnServiceA(liste, statuts, plage, '2031-12-31').map(d => d.id)).toEqual([1, 2]);
    });
});

describe('datesDesImages', () => {
    it('répartit les images sur la période, première et dernière dates comprises', () => {
        expect(datesDesImages({ debut: '2031-09-01', fin: '2031-09-11', jours: 10 }, 3)).toEqual([
            '2031-09-01',
            '2031-09-06',
            '2031-09-11'
        ]);
    });
    it('n’en fait pas plus que de jours', () => {
        expect(datesDesImages({ debut: '2031-09-01', fin: '2031-09-03', jours: 2 }, 30)).toEqual([
            '2031-09-01',
            '2031-09-02',
            '2031-09-03'
        ]);
    });
});

describe('animation sans les périodes creuses', () => {
    const plage = { debut: '2031-09-01', fin: '2031-09-30', jours: 29 };
    it('liste les dates distinctes de mise en service dans la période, triées', () => {
        const l = [...liste, samu(6, 2, '2031-09-10')];
        expect(datesDeMisesEnService(l, statuts, plage)).toEqual(['2031-09-10', '2031-09-20']);
    });
    it('chaque mise en service occupe la même part de la lecture', () => {
        const dates = ['2031-09-10', '2031-09-20', '2031-09-21'];
        expect(dateALaPositionCompressee(dates, 0)).toBe('2031-09-10');
        expect(dateALaPositionCompressee(dates, 0.4)).toBe('2031-09-20');
        expect(dateALaPositionCompressee(dates, 0.7)).toBe('2031-09-21');
        expect(dateALaPositionCompressee(dates, 1)).toBe('2031-09-21');
        expect(dateALaPositionCompressee([], 0.5)).toBe('');
    });
    it('GIF : toutes les dates si elles sont peu nombreuses, sinon un échantillon qui garde la première et la dernière', () => {
        expect(datesDesImagesCompressees(['a', 'b'], 5)).toEqual(['a', 'b']);
        const dates = Array.from({ length: 10 }, (_, i) => `d${i}`);
        expect(datesDesImagesCompressees(dates, 4)).toEqual(['d0', 'd3', 'd6', 'd9']);
    });
});
