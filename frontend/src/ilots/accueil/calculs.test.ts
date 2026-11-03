import { describe, expect, it } from 'vitest';
import type { Evenement } from '@/api/evenements';
import {
    astreinteAnsDuJour,
    astreintesDuJour,
    evenementsEntre,
    joursOuvres,
    lieuAffiche,
    lundiDe,
    memeMission,
    missionPeriode,
    ligneEvenement,
    presences,
    ressourcesActives
} from './calculs';

const evt = (champs: Partial<Evenement>): Evenement =>
    ({ id: 1, label: 'ÉVÉNEMENT', start_date: '2026-11-02', end_date: '2026-11-02', ...champs }) as Evenement;

describe('semaine', () => {
    it('lundi de la semaine, dimanche compris', () => {
        expect(lundiDe('2026-11-04')).toBe('2026-11-02');
        expect(lundiDe('2026-11-02')).toBe('2026-11-02');
        expect(lundiDe('2026-11-08')).toBe('2026-11-02');
        expect(lundiDe('2026-11-09')).toBe('2026-11-09');
    });

    it('cinq jours ouvrés, aujourd’hui repéré', () => {
        const jours = joursOuvres('2026-11-04', '2026-11-04');
        expect(jours.map(j => j.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
        expect(jours.filter(j => j.aujourdhui).map(j => j.date)).toEqual(['2026-11-04']);
        expect(jours[0]?.libelle).toBe('lun. 02/11');
    });
});

describe('mission', () => {
    const planning = {
        '1_available_2026-11-02_AM': '2',
        '1_activity_2026-11-02_AM': '3',
        '1_localisation_2026-11-02_AM': '🏠 Télétravail',
        '1_available_2026-11-02_PM': '2',
        '1_activity_2026-11-02_PM': '3',
        '1_localisation_2026-11-02_PM': '🏠 Télétravail',
        '2_available_2026-11-02_AM': '3',
        '2_activity_2026-11-02_AM': '3',
        '3_available_2026-11-02_AM': '2',
        '4_available_2026-11-02': '2',
        '4_activity_2026-11-02': '6'
    };

    it('disponible avec activité : libellé, couleur et lieu', () => {
        const m = missionPeriode(planning, 1, '2026-11-02', 'AM');
        expect(m).toMatchObject({ code: 3, libelle: 'SAMU (Déploiement)', lieu: 'Télétravail', enAttente: false });
    });

    it('congés ou non renseigné : pas de mission', () => {
        expect(missionPeriode(planning, 2, '2026-11-02', 'AM')).toBeNull();
        expect(missionPeriode(planning, 9, '2026-11-02', 'AM')).toBeNull();
    });

    it('disponible sans activité : en attente d’affectation', () => {
        expect(missionPeriode(planning, 3, '2026-11-02', 'AM')).toMatchObject({ enAttente: true });
    });

    it('ancien format sans période', () => {
        expect(missionPeriode(planning, 4, '2026-11-02', 'PM')).toMatchObject({ code: 6, lieu: null });
    });

    it('lieu : émoji de tête retiré, « - » vide', () => {
        expect(lieuAffiche('🚗 Déplacement')).toBe('Déplacement');
        expect(lieuAffiche('-')).toBeNull();
        expect(lieuAffiche(undefined)).toBeNull();
    });

    it('même mission matin et après-midi', () => {
        const matin = missionPeriode(planning, 1, '2026-11-02', 'AM');
        const apresMidi = missionPeriode(planning, 1, '2026-11-02', 'PM');
        expect(memeMission({ matin, apresMidi })).toBe(true);
        expect(memeMission({ matin, apresMidi: null })).toBe(false);
    });
});

describe('présences', () => {
    const planning = {
        '1_available_2026-11-02_AM': '2',
        '1_activity_2026-11-02_AM': '5',
        '2_available_2026-11-04_PM': '2',
        '2_activity_2026-11-04_PM': '7'
    };
    const ressources = [
        { id: 2, nom: 'Martin', prenom: 'Zoé' },
        { id: 1, nom: 'Dupont', prenom: 'Alice' },
        { id: 1, nom: 'Dupont', prenom: 'Alice' },
        { id: 3, nom: 'Inactif', prenom: 'Ian', actif: 0 }
    ];

    it('ne garde que les experts présents, une fois chacun, triés par nom', () => {
        const semaine = joursOuvres('2026-11-02', '2026-11-02').map(j => j.date);
        const lignes = presences(planning, ressources, semaine, '2026-11-02');
        expect(lignes.map(l => l.nom)).toEqual(['Alice DUPONT', 'Zoé MARTIN']);
        expect(lignes[1]?.jours[2]?.apresMidi?.libelle).toBe('Qualification');
    });

    it('journée : seuls les présents ce jour-là', () => {
        expect(presences(planning, ressources, ['2026-11-02'], '2026-11-02').map(l => l.nom)).toEqual(['Alice DUPONT']);
        expect(presences(planning, ressources, ['2026-11-03'], '2026-11-03')).toEqual([]);
    });

    it('ressource terminée exclue', () => {
        const liste = [{ id: 5, nom: 'Ancien', prenom: 'Ada', date_fin: '2026-10-01' }] as never;
        expect(ressourcesActives(liste, '2026-11-02')).toEqual([]);
    });
});

describe('événements', () => {
    const liste = [
        evt({ id: 1, label: 'B', start_date: '2026-11-03', end_date: '2026-11-03' }),
        evt({ id: 2, label: 'A', start_date: '2026-10-30', end_date: '2026-11-03' }),
        evt({ id: 3, label: 'C', start_date: '2026-11-10', end_date: '2026-11-10' })
    ];

    it('recoupe la période, bornes incluses, trié', () => {
        expect(evenementsEntre(liste, '2026-11-02', '2026-11-08').map(e => e.id)).toEqual([2, 1]);
        expect(evenementsEntre(liste, '2026-11-03', '2026-11-03').map(e => e.id)).toEqual([2, 1]);
        expect(evenementsEntre(liste, '2026-11-04', '2026-11-04')).toEqual([]);
    });

    it('ligne : localisation | type | libellé (dates) - participants', () => {
        const l = ligneEvenement(
            evt({
                label: 'WEBINAIRE',
                start_date: '2026-11-03',
                end_date: '2026-11-05',
                location_libelle_court: 'SAMU 56',
                type_long: 'Formation',
                participants: [{ user_id: 1, nom: 'Dupont', prenom: 'Alice', email: null }],
                external_participants: [{ nom: 'Durand', prenom: 'Léa', email: null }]
            })
        );
        expect(l).toEqual({
            localisation: 'SAMU 56',
            type: 'Formation',
            libelle: 'WEBINAIRE',
            dates: '03/11/2026 - 05/11/2026',
            participants: 'Alice DUPONT, Léa DURAND'
        });
    });

    it('ligne : un seul jour, sans localisation ni participant', () => {
        const l = ligneEvenement(evt({ participants: [], external_participants: [] }));
        expect(l).toMatchObject({ localisation: null, type: null, dates: '02/11/2026', participants: null });
    });
});

describe('astreintes HO', () => {
    const planning = {
        slots: [
            { date: '2026-11-03', period: 'AM' as const, resource_id: 2 },
            { date: '2026-11-03', period: 'AM' as const, resource_id: 1 },
            { date: '2026-11-03', period: 'PM' as const, resource_id: 1 },
            { date: '2026-11-04', period: 'AM' as const, resource_id: 2 }
        ],
        names: [
            { id: 1, nom: 'Dupont', prenom: 'Alice' },
            { id: 2, nom: 'Martin', prenom: 'Zoé' }
        ],
        me: { canEdit: true, isAdmin: false, resourceId: 1 }
    };

    it('experts du jour par demi-journée, triés', () => {
        expect(astreintesDuJour(planning, '2026-11-03')).toEqual({
            AM: ['Alice DUPONT', 'Zoé MARTIN'],
            PM: ['Alice DUPONT']
        });
    });

    it('jour sans inscription ou planning absent', () => {
        expect(astreintesDuJour(planning, '2026-11-05')).toEqual({ AM: [], PM: [] });
        expect(astreintesDuJour(null, '2026-11-03')).toEqual({ AM: [], PM: [] });
    });
});

describe('astreinte HO ANS du jour', () => {
    const planning = {
        slots: [],
        names: [],
        me: { canEdit: false, isAdmin: false, resourceId: null },
        ans: {
            slots: [{ date: '2026-11-03', user_id: 5 }],
            names: [{ id: 5, nom: 'Dupont', prenom: 'Alice' }]
        }
    };

    it('utilisateur désigné ou personne', () => {
        expect(astreinteAnsDuJour(planning, '2026-11-03')).toBe('Alice DUPONT');
        expect(astreinteAnsDuJour(planning, '2026-11-04')).toBeNull();
        expect(astreinteAnsDuJour(null, '2026-11-03')).toBeNull();
        expect(astreinteAnsDuJour({ ...planning, ans: undefined }, '2026-11-03')).toBeNull();
    });
});
