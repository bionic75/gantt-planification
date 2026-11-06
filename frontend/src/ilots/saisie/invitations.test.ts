import { describe, expect, it } from 'vitest';
import type { AffectationEnAttente, ExpertEnAttente } from '@/liaison';
import { compter, invitationsDe, jourCourt, messageFinEnvoi, parDate, resume } from './invitations';

const affectation = (champs: Partial<AffectationEnAttente>): AffectationEnAttente => ({
    date: '2027-01-04',
    period: 'AM',
    activity: '📞 SAMU (Déploiement)',
    activityCode: '3',
    location: '-',
    actionType: 'new',
    ...champs
});

const expert = (assignments: AffectationEnAttente[], champs: Partial<ExpertEnAttente> = {}): ExpertEnAttente => ({
    expertId: 10,
    expertEmail: 'lea@example.org',
    expertNom: 'Martin',
    expertPrenom: 'Léa',
    resourceNom: 'MARTIN',
    resourcePrenom: 'Léa',
    assignments,
    ...champs
});

describe('invitations Outlook', () => {
    it('compteurs et résumé (sans type : nouvelle)', () => {
        const a = [
            affectation({}),
            affectation({ actionType: undefined }),
            affectation({ actionType: 'modified' }),
            affectation({ actionType: 'deleted' })
        ];
        expect(compter(a)).toEqual({ nouvelles: 2, modifications: 1, suppressions: 1 });
        expect(resume([expert(a), expert([affectation({})])])).toBe(
            '2 expert(s) - 3 nouvelle(s), 1 modification(s), 1 suppression(s)'
        );
        expect(resume([expert([affectation({ actionType: 'deleted' })])])).toBe('1 expert(s) - 1 suppression(s)');
    });

    it('affectations par date, le matin d’abord ; jour court', () => {
        const triees = parDate([
            affectation({ date: '2027-01-05', period: 'AM' }),
            affectation({ date: '2027-01-04', period: 'PM' }),
            affectation({ date: '2027-01-04', period: 'AM' })
        ]);
        expect(triees.map(a => `${a.date} ${a.period}`)).toEqual(['2027-01-04 AM', '2027-01-04 PM', '2027-01-05 AM']);
        expect(jourCourt('2027-01-04')).toBe('lun. 04/01');
    });

    it('corps de l’envoi : experts cochés, noms de la ressource à défaut de ceux du compte', () => {
        const experts = {
            '5': expert([affectation({ actionType: undefined, oldActivity: undefined })], { expertNom: '' }),
            '6': expert([affectation({})])
        };
        expect(invitationsDe(experts, ['5', '9'])).toEqual([
            {
                resourceId: 5,
                email: 'lea@example.org',
                expertNom: 'MARTIN',
                expertPrenom: 'Léa',
                assignments: [
                    {
                        date: '2027-01-04',
                        period: 'AM',
                        activity: '📞 SAMU (Déploiement)',
                        activityCode: '3',
                        location: '-',
                        actionType: 'new',
                        oldActivity: null,
                        oldActivityCode: null,
                        oldLocation: null
                    }
                ]
            }
        ]);
    });

    it('message de fin d’envoi', () => {
        expect(messageFinEnvoi(2, 0, 2, ['Léa Martin'])).toEqual({
            succes: true,
            titre: 'Invitations envoyées (2/2)',
            detail: 'Léa Martin'
        });
        expect(messageFinEnvoi(1, 1, 2, [])).toEqual({
            succes: false,
            titre: 'Invitations partiellement envoyées (1/2)',
            detail: '2 email(s)'
        });
    });
});
