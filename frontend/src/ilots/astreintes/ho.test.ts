import { describe, expect, it } from 'vitest';
import type { MoisHo } from '@/api/astreintes';
import {
    avertissementEmail,
    basculer,
    basculerAns,
    changementsAns,
    choixAns,
    decalerMois,
    definirTitulaires,
    demiJourneeModifiable,
    droits,
    inscriptions,
    jourAnsModifiable,
    libelleMois,
    lundiDe,
    messageResultat,
    modifications,
    modificationsAns,
    semaineIso,
    titreAns,
    titreDemiJournee,
    titulaires,
    type EnAttente,
    type EnAttenteAns
} from './ho';

const SEMAINE = '2031-03-10';

function mois(me: Partial<MoisHo['me']> = {}, ansMe: Partial<MoisHo['ans']['me']> = {}): MoisHo {
    return {
        month: '2031-03',
        weeks: [{ monday: '2031-03-03', days: ['2031-03-03', '2031-03-04', '2031-03-05', '2031-03-06', '2031-03-07'] }],
        slots: [{ date: '2031-03-04', period: 'AM', resource_id: 1 }],
        names: [{ id: 9, nom: 'Ancien', prenom: 'Expert', trigramme: 'EAN' }],
        experts: [
            { resource_id: 1, nom: 'Martin', prenom: 'Léa', trigramme: 'LMA', user_id: 11, email: null },
            { resource_id: 2, nom: 'Durand', prenom: 'Paul', trigramme: 'PDU', user_id: 12, email: null }
        ],
        me: { today: '2031-03-12', currentWeek: SEMAINE, isAdmin: false, resourceId: 2, canEdit: true, ...me },
        updateMail: { enabled: true, recipients: 3 },
        ans: {
            slots: [{ date: '2031-03-06', user_id: 21 }],
            users: [
                { user_id: 21, nom: 'Petit', prenom: 'Anne', trigramme: 'APE', email: null },
                { user_id: 22, nom: 'Roux', prenom: 'Marc', trigramme: 'MRO', email: null }
            ],
            names: [],
            me: { today: '2031-03-12', currentWeek: SEMAINE, userId: 22, isAdmin: false, canEdit: true, ...ansMe },
            updateMail: { enabled: false, recipients: 0 }
        }
    };
}

describe('dates', () => {
    it('mois, lundi et semaine ISO', () => {
        expect(decalerMois('2031-12', 1)).toBe('2032-01');
        expect(decalerMois('2031-01', -1)).toBe('2030-12');
        expect(libelleMois('2031-03')).toBe('Mars 2031');
        expect(lundiDe('2031-03-07')).toBe('2031-03-03');
        expect(semaineIso('2031-03-03')).toBe(10);
        expect(semaineIso('2026-12-28')).toBe(53);
    });
});

describe('droits', () => {
    it('profil HO et ANS', () => {
        expect(droits(mois({ isAdmin: true }, { isAdmin: true }))).toEqual({ ho: 'admin', ans: 'admin' });
        expect(droits(mois())).toEqual({ ho: 'expert', ans: 'utilisateur' });
        expect(droits(mois({ canEdit: false }, { canEdit: false }))).toEqual({ ho: 'lecture', ans: null });
    });

    it('semaines passées modifiables par l’administrateur seulement', () => {
        expect(demiJourneeModifiable(mois(), '2031-03-04')).toBe(false);
        expect(demiJourneeModifiable(mois(), '2031-03-10')).toBe(true);
        expect(demiJourneeModifiable(mois({ isAdmin: true }), '2031-03-04')).toBe(true);
        expect(jourAnsModifiable(mois(), '2031-03-06')).toBe(false);
        expect(jourAnsModifiable(mois({}, { isAdmin: true }), '2031-03-06')).toBe(true);
    });
});

describe('inscriptions', () => {
    it('ajout, retour à l’état enregistré, retrait', () => {
        const d = mois({ isAdmin: true });
        const a: EnAttente = new Map();
        expect(basculer(d, a, '2031-03-04', 'AM', 2)).toBeNull();
        expect(inscriptions(d, a, '2031-03-04', 'AM')).toEqual([
            { rid: 1, etat: 'enregistre' },
            { rid: 2, etat: 'ajout' }
        ]);
        basculer(d, a, '2031-03-04', 'AM', 2);
        expect(a.size).toBe(0);
        basculer(d, a, '2031-03-04', 'AM', 1);
        expect(inscriptions(d, a, '2031-03-04', 'AM')).toEqual([{ rid: 1, etat: 'retrait' }]);
        expect(titreDemiJournee(d, a, '2031-03-04', 'AM')).toBe('mardi 04/03/2031 — matin : personne');
        expect(modifications(a)).toEqual([{ date: '2031-03-04', period: 'AM', resource_id: 1, action: 'remove' }]);
    });

    it('expert : ses propres inscriptions, pas les semaines passées', () => {
        const d = mois();
        const a: EnAttente = new Map();
        expect(basculer(d, a, '2031-03-11', 'PM', 1)).toBe('Vous ne pouvez modifier que vos propres inscriptions.');
        expect(basculer(d, a, '2031-03-04', 'PM', 2)).toBe('Les semaines passées ne sont plus modifiables.');
        expect(basculer(d, a, '2031-03-11', 'PM', 2)).toBeNull();
        expect(titreDemiJournee(d, a, '2031-03-11', 'PM')).toBe('mardi 11/03/2031 — après-midi : Paul Durand');
    });
});

describe('astreinte HO ANS (plusieurs utilisateurs par jour)', () => {
    it('administrateur : ajout d’un second utilisateur, retour à l’état enregistré, titre', () => {
        const d = mois({}, { isAdmin: true });
        const a: EnAttenteAns = new Map();
        definirTitulaires(d, a, '2031-03-06', [22, 21]);
        expect(titulaires(d, a, '2031-03-06')).toEqual([21, 22]);
        expect(titreAns(d, a, '2031-03-06')).toBe('Astreinte HO ANS — 06/03/2031 : Anne Petit, Marc Roux');
        expect(modificationsAns(a)).toEqual([{ date: '2031-03-06', user_ids: [21, 22] }]);
        expect(changementsAns(d, modificationsAns(a))).toEqual([{ date: '2031-03-06', userId: 22, ajout: true }]);
        definirTitulaires(d, a, '2031-03-06', [21]);
        expect(a.size).toBe(0);
        definirTitulaires(d, a, '2031-03-06', []);
        expect(changementsAns(d, modificationsAns(a))).toEqual([{ date: '2031-03-06', userId: 21, ajout: false }]);
        expect(titreAns(d, a, '2031-03-06')).toBe('Astreinte HO ANS — 06/03/2031 : personne');
    });

    it('utilisateur ANS : un clic l’ajoute ou le retire, les autres désignés sont conservés', () => {
        const d = mois();
        const a: EnAttenteAns = new Map();
        basculerAns(d, a, '2031-03-06');
        expect(titulaires(d, a, '2031-03-06')).toEqual([21, 22]);
        basculerAns(d, a, '2031-03-06');
        expect(a.size).toBe(0);
    });

    it('choix de l’administrateur : utilisateurs cochés, désigné sans la case conservé', () => {
        const d = mois({}, { isAdmin: true });
        d.ans.slots.push({ date: '2031-03-06', user_id: 99 });
        d.ans.names.push({ id: 99, nom: 'Ancien', prenom: 'Paul', trigramme: 'PAN' });
        const c = choixAns(d, new Map(), '2031-03-06');
        expect(c.map(u => [u.user_id, u.designe])).toEqual([
            [99, true],
            [21, true],
            [22, false]
        ]);
    });
});

describe('enregistrement', () => {
    it('avertissement e-mail seulement si la semaine en cours est modifiée', () => {
        const d = mois();
        expect(avertissementEmail(d, ['2031-03-17'], false)).toBeNull();
        expect(avertissementEmail(d, ['2031-03-12'], false)).toEqual({ envoi: true, destinataires: 3 });
        expect(avertissementEmail(d, ['2031-03-12'], true)).toEqual({ envoi: false, destinataires: 0 });
    });

    it('message de résultat', () => {
        expect(messageResultat({ success: true, applied: [1], ans: null })).toBe(
            'Planning HO enregistré (1 modification).'
        );
        expect(
            messageResultat({
                success: true,
                applied: [1, 2],
                mail: { sent: true, recipients: 3 },
                ans: { applied: [1], mail: { sent: true, recipients: 2 } }
            })
        ).toBe('Planning HO enregistré (3 modifications). E-mails de mise à jour envoyés (5 destinataires).');
    });
});
