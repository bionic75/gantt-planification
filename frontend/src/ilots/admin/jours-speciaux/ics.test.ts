import { describe, expect, it } from 'vitest';
import { apparence, dateIcs, lireIcs, zones, zonesDuResume } from './ics';

const ICS = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20311018',
    'DTEND;VALUE=DATE:20311103',
    'SUMMARY:Vacances de la Toussaint - Zone A',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20311220T000000Z',
    'SUMMARY;LANGUAGE=fr:Vacances de Noël -',
    '  zone b',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20310101',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Sans début',
    'END:VEVENT',
    'END:VCALENDAR'
].join('\r\n');

describe('fichiers .ics', () => {
    it('dates AAAAMMJJ, avec heure ou fuseau', () => {
        expect(dateIcs('20311018')).toBe('2031-10-18');
        expect(dateIcs('20311220T083000Z')).toBe('2031-12-20');
        expect(dateIcs('2031')).toBeNull();
    });

    it('événements comme l’ancien écran : lignes repliées, fin et résumé par défaut, sans début ignorés', () => {
        expect(lireIcs(ICS)).toEqual([
            {
                summary: 'Vacances de la Toussaint - Zone A',
                start: '2031-10-18',
                dtstart: '2031-10-18',
                end: '2031-11-03',
                dtend: '2031-11-03'
            },
            { summary: 'Vacances de Noël - zone b', start: '2031-12-20', dtstart: '2031-12-20', end: '2031-12-20' },
            { summary: 'Événement', start: '2031-01-01', dtstart: '2031-01-01', end: '2031-01-01' }
        ]);
    });

    it('congés classés par zone d’après le résumé, sans tenir compte de la casse', () => {
        const { zoneA, zoneB, zoneC, total } = zones(lireIcs(ICS));
        expect(zoneA.map(e => e.start)).toEqual(['2031-10-18']);
        expect(zoneB.map(e => e.start)).toEqual(['2031-12-20']);
        expect(zoneC).toEqual([]);
        expect(total).toBe(2);
    });

    it('zones citées par un résumé : zone unique, plusieurs zones, toutes zones', () => {
        expect(zonesDuResume('Vacances de la Toussaint - Zone A')).toEqual(['a']);
        expect(zonesDuResume('Vacances d’été - Zones A/B/C')).toEqual(['a', 'b', 'c']);
        expect(zonesDuResume('Pont - zones A, B et C')).toEqual(['a', 'b', 'c']);
        expect(zonesDuResume('Hiver - Zone A et Zone B')).toEqual(['a', 'b']);
        expect(zonesDuResume('Printemps - zone B ou C')).toEqual(['b', 'c']);
        expect(zonesDuResume('Vacances - Zones A-B')).toEqual(['a', 'b']);
        expect(zonesDuResume('Vacances - toutes zones')).toEqual(['a', 'b', 'c']);
        expect(zonesDuResume('Zone A (Besançon, Bordeaux)')).toEqual(['a']);
        expect(zonesDuResume('Vacances scolaires')).toEqual([]);
    });

    it('un congé commun à plusieurs zones est rattaché à chacune', () => {
        const ev = [
            { summary: 'Vacances d’été - Zones A/B/C', start: '2031-07-05', end: '2031-09-01' },
            { summary: 'Vacances de Noël - Zone C', start: '2031-12-20', end: '2032-01-05' },
            { summary: 'Hiver - Zones A et B', start: '2032-02-07', end: '2032-02-23' }
        ];
        const z = zones(ev);
        expect(z.zoneA.map(e => e.start)).toEqual(['2031-07-05', '2032-02-07']);
        expect(z.zoneB.map(e => e.start)).toEqual(['2031-07-05', '2032-02-07']);
        expect(z.zoneC.map(e => e.start)).toEqual(['2031-07-05', '2031-12-20']);
        expect(z.total).toBe(6);
    });

    it('apparence enregistrée complétée par les valeurs par défaut', () => {
        expect(apparence(undefined)).toEqual({
            label: 'JF',
            bgColor: '#ffeb3b',
            textColor: '#000000',
            borderColor: '#fbc02d'
        });
        expect(apparence({ label: 'FÉRIÉ', bgColor: '#e53935' })).toEqual({
            label: 'FÉRIÉ',
            bgColor: '#e53935',
            textColor: '#000000',
            borderColor: '#fbc02d'
        });
    });
});
