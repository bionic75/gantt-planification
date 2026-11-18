// Invitations calendrier (audit de sécurité, lot 2) : une donnée saisie ne peut pas ajouter de ligne au fichier ICS
import { describe, expect, it } from 'vitest';
import { buildICS, icsText } from '../src/lib/ics.ts';

describe('fichier ICS', () => {
    it('texte échappé selon la RFC 5545', () => {
        expect(icsText('a;b,c\\d\r\ne\nf')).toBe('a\\;b\\,c\\\\d\\ne\\nf');
        expect(icsText(null)).toBe('');
    });

    it('libellé, lieu, noms et adresses saisis : aucune ligne ajoutée', () => {
        const ics = buildICS({
            uid: 'u@test',
            summary: 'Déploiement\r\nATTENDEE:mailto:pirate@exterieur.example',
            description: 'Ligne 1\nBEGIN:VALARM',
            location: 'SAMU 13\nORGANIZER:mailto:pirate@exterieur.example',
            dtstart: '20270601T060000Z',
            dtend: '20270601T100000Z',
            organizer: 'chef@example.test\r\nX:y',
            organizerName: 'Chef"\r\nATTENDEE:mailto:pirate@exterieur.example',
            attendee: 'expert@example.test',
            attendeeName: 'Expert'
        });
        const lignes = ics.split('\r\n');
        const proprietes = lignes.map(l => l.split(/[:;]/)[0]);
        expect(proprietes).toEqual([
            'BEGIN',
            'VERSION',
            'PRODID',
            'METHOD',
            'CALSCALE',
            'BEGIN',
            'UID',
            'DTSTAMP',
            'DTSTART',
            'DTEND',
            'SUMMARY',
            'DESCRIPTION',
            'LOCATION',
            'ORGANIZER',
            'ATTENDEE',
            'SEQUENCE',
            'STATUS',
            'END',
            'END'
        ]);
        expect(ics).not.toContain('\nATTENDEE:mailto:pirate');
        expect(lignes.find(l => l.startsWith('ORGANIZER'))).toBe(
            'ORGANIZER;CN="ChefATTENDEE:mailto:pirate@exterieur.example":mailto:chef@example.testXy'
        );
        expect(lignes.find(l => l.startsWith('SUMMARY'))).toBe(
            'SUMMARY:Déploiement\\nATTENDEE:mailto:pirate@exterieur.example'
        );
    });
});
