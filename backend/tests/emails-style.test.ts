// Emails d'événement et d'affectation : gabarit commun du site (icônes PNG jointes en « cid »)
import { describe, expect, it } from 'vitest';
import { piecesDeHtml } from '../src/lib/email-layout.ts';
import { mobilisationEmail, participantAddedEmail } from '../src/modules/events/events.emails.ts';
import { buildInvitationHTML } from '../src/modules/notifications/notifications.emails.ts';

const evenement = {
    label: 'SAMU 05 - REUNION DE LANCEMENT STRATÉGIQUE',
    attendeeName: 'Nicolas BILLAUDE',
    dateRangeLabel: '12/11/2025',
    locLabel: 'SAMU-SAS 05 - HAUTES-ALPES (GAP)',
    creatorFullName: 'Système Administrateur'
};
const cids = (html: string) => [...html.matchAll(/cid:([a-z-]+)@planification/g)].map(m => m[1]);

describe('pièces jointes des icônes', () => {
    it('une pièce par icône connue, sans doublon, les inconnues ignorées', () => {
        const pieces = piecesDeHtml(
            '<img src="cid:lieu@planification"><img src="cid:lieu@planification"><img src="cid:inconnue@planification"><img src="cid:horloge@planification">'
        );
        expect(pieces.map(p => p.cid)).toEqual(['lieu@planification', 'horloge@planification']);
        expect(pieces[0]).toMatchObject({ filename: 'lieu.png', contentType: 'image/png' });
    });
    it('aucune pièce sans icône', () => {
        expect(piecesDeHtml('<p>Bonjour</p>')).toEqual([]);
    });
});

describe('email « participant à un événement »', () => {
    const html = participantAddedEmail(evenement);
    it('reprend le gabarit du site avec ses icônes, sans émoji', () => {
        expect(html).toContain('Plateforme de Planification');
        expect(cids(html)).toEqual(
            expect.arrayContaining(['calendrier-grand', 'evenement', 'calendrier', 'lieu', 'utilisateur'])
        );
        expect(html).not.toMatch(/📅|📋|📍|👤/u);
    });
    it('présente événement, date, lieu et organisateur', () => {
        for (const t of [
            evenement.label,
            '12/11/2025',
            evenement.locLabel,
            'Système Administrateur',
            'Nicolas BILLAUDE'
        ])
            expect(html).toContain(t);
        expect(html).toContain('Vous êtes participant(e)');
    });
    it('n’affiche pas de lieu quand il est vide, et échappe le HTML', () => {
        const h = participantAddedEmail({ ...evenement, locLabel: '', label: '<b>x</b>' });
        expect(cids(h)).not.toContain('lieu');
        expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
        expect(h).not.toContain('<b>x</b>');
    });
});

describe('email « demande de mobilisation »', () => {
    it('reprend le gabarit du site', () => {
        const html = mobilisationEmail(evenement);
        expect(html).toContain('Demande de mobilisation');
        expect(cids(html)).toEqual(expect.arrayContaining(['calendrier-grand', 'lieu', 'utilisateur']));
    });
});

describe('emails d’affectation', () => {
    const groupe = {
        activity: 'Visite métier',
        location: 'SAMU 75',
        slots: [
            { date: '2027-06-01', period: 'AM' },
            { date: '2027-06-01', period: 'PM' }
        ]
    };
    it.each([
        ['new', 'mallette-grand', 'Nouvelle affectation'],
        ['modified', 'modifie-grand', 'Affectation modifiée'],
        ['cancelled', 'annule-grand', 'Affectation annulée']
    ] as const)('invitation %s : icône %s et titre', (type, icone, titre) => {
        const html = buildInvitationHTML('Jeanne Expert', 'Chef Projet', groupe, type);
        expect(cids(html)[0]).toBe(icone);
        expect(html).toContain(titre);
        for (const t of [
            'Jeanne Expert',
            'Chef Projet',
            'Visite métier',
            'SAMU 75',
            '01/06/2027',
            'Matin (8h-12h)',
            'Après-midi (14h-18h)'
        ])
            expect(html).toContain(t);
        expect(html).not.toMatch(/📅|📍|❌|🔄/u);
    });
    it('invitation sans localisation : pas de ligne de lieu', () => {
        expect(cids(buildInvitationHTML('A', 'B', { ...groupe, location: '-' }, 'new'))).not.toContain('lieu');
    });
});
