import { describe, expect, it } from 'vitest';
import type { EtatPlanning, RessourcePlanning } from '@/evenements';
import { optionLocalisation } from './icones-recherche';
import {
    classerCreneaux,
    detailExpert,
    expertsProposes,
    intervalleParDefaut,
    joursEntre,
    jourCreneau,
    localisationsProposees,
    rechercher,
    trigrammeExpert,
    type Criteres
} from './recherche';

const ressource = (champs: Partial<RessourcePlanning>): RessourcePlanning => ({
    id: 1,
    nom: 'Martin',
    prenom: 'Léa',
    trigramme: 'LMA',
    actif: 1,
    date_debut: '2026-01-01',
    date_fin: null,
    ...champs
});

const etat = (champs: Partial<EtatPlanning>): EtatPlanning => ({
    ressources: [],
    planning: {},
    datesParticulieres: [],
    conges: {},
    historiqueMad: {},
    annee: 2031,
    mois: 8,
    filtre: [],
    ...champs
});

const criteres = (champs: Partial<Criteres>): Criteres => ({
    experts: [],
    debut: '2031-09-01',
    fin: '2031-09-02',
    disponibilites: [],
    affectations: [],
    localisations: [],
    ...champs
});

describe('intervalle proposé', () => {
    it('du premier au dernier jour du mois courant, en dates locales', () => {
        // Minuit le 1er : l'ancien écran proposait la veille (conversion en UTC)
        expect(intervalleParDefaut(new Date(2026, 10, 1, 0, 0))).toEqual({ debut: '2026-11-01', fin: '2026-11-30' });
        expect(intervalleParDefaut(new Date(2028, 1, 15))).toEqual({ debut: '2028-02-01', fin: '2028-02-29' });
    });
});

describe('listes proposées', () => {
    it('experts actifs par nom et prénom', () => {
        const e = etat({
            ressources: [
                ressource({ id: 1, nom: 'Durand', prenom: 'Zoé' }),
                ressource({ id: 2, nom: 'Bernard', prenom: 'Paul' }),
                ressource({ id: 3, nom: 'Aubert', actif: 0 })
            ]
        });
        expect(expertsProposes(e).map(r => r.id)).toEqual([2, 1]);
    });

    it('localisations saisies, hors « - », sans doublon', () => {
        const e = etat({
            planning: {
                '1_localisation_2031-09-01_AM': 'SAMU 75',
                '1_localisation_2031-09-01_PM': '-',
                '2_localisation_2031-09-01_AM': 'SAMU 13',
                '2_localisation_2031-09-02_AM': 'SAMU 75',
                '2_activity_2031-09-02_AM': '3'
            }
        });
        expect(localisationsProposees(e)).toEqual(['SAMU 13', 'SAMU 75']);
    });

    it('localisation : émoji de tête remplacé par une icône, « Congés » pour la plage seule', () => {
        const api = {
            urlForEmoji: (e: string) => (e === '🚨' || e === '🏖' ? `url(${e})` : null),
            urlForSvg: () => '',
            urlForName: (n: string) => `url(${n})`
        };
        expect(optionLocalisation('🚨 SAMU 75', api)).toEqual({
            valeur: '🚨 SAMU 75',
            libelle: 'SAMU 75',
            icone: 'url(🚨)'
        });
        expect(optionLocalisation('🏖️', api)).toEqual({ valeur: '🏖️', libelle: 'Congés', icone: 'url(🏖)' });
        expect(optionLocalisation('Télétravail', api)).toEqual({
            valeur: 'Télétravail',
            libelle: 'Télétravail',
            icone: 'url(home)'
        });
        expect(optionLocalisation('🦄 Lieu', api).icone).toBeNull();
        expect(optionLocalisation('🚨 SAMU 75', undefined).libelle).toBe('🚨 SAMU 75');
    });
});

describe('recherche', () => {
    it('jours de l’intervalle, bornes comprises', () => {
        expect(joursEntre('2031-02-27', '2031-03-01')).toEqual(['2031-02-27', '2031-02-28', '2031-03-01']);
        expect(joursEntre('2031-03-02', '2031-03-01')).toEqual([]);
    });

    it('valeurs par défaut (« 1 », « 1 », « - ») et critères vides ignorés', () => {
        const e = etat({ ressources: [ressource({ id: 1 })] });
        expect(rechercher(e, criteres({}))[0]!.correspondances).toHaveLength(4);
        expect(
            rechercher(e, criteres({ disponibilites: ['1'], affectations: ['1'], localisations: ['-'] }))
        ).toHaveLength(1);
        expect(rechercher(e, criteres({ disponibilites: ['2'] }))).toEqual([]);
    });

    it('experts choisis et actifs ; correspondances par date puis demi-journée', () => {
        const e = etat({
            ressources: [ressource({ id: 1 }), ressource({ id: 2 }), ressource({ id: 3, actif: 0 })],
            planning: {
                '1_available_2031-09-01_AM': '2',
                '1_available_2031-09-02_PM': '2',
                '2_available_2031-09-01_AM': '2',
                '3_available_2031-09-01_AM': '2'
            }
        });
        const r = rechercher(e, criteres({ experts: [1, 3], disponibilites: ['2'] }));
        expect(r.map(x => x.ressource.id)).toEqual([1]);
        expect(r[0]!.correspondances).toEqual([
            { date: '2031-09-01', periode: 'AM' },
            { date: '2031-09-02', periode: 'PM' }
        ]);
    });

    it('détail : cinq dates au plus, puis le nombre restant', () => {
        const c = ['01', '01', '02', '03', '04', '05', '06'].map((j, i) => ({
            date: `2031-09-${j}`,
            periode: (i === 1 ? 'PM' : 'AM') as 'AM' | 'PM'
        }));
        expect(detailExpert(c)).toBe('01/09 (AM/PM), 02/09 (AM), 03/09 (AM), 04/09 (AM), 05/09 (AM), ... (+1)');
    });

    it('classement : nombre d’experts décroissant, ordre de découverte à égalité', () => {
        const a = ressource({ id: 1 });
        const b = ressource({ id: 2, trigramme: '', prenom: 'paul', nom: 'bernard' });
        const creneaux = classerCreneaux([
            {
                ressource: a,
                correspondances: [
                    { date: '2031-09-01', periode: 'AM' },
                    { date: '2031-09-01', periode: 'PM' }
                ]
            },
            { ressource: b, correspondances: [{ date: '2031-09-01', periode: 'PM' }] }
        ]);
        expect(creneaux.map(c => `${c.date} ${c.periode} ${c.experts.length}`)).toEqual([
            '2031-09-01 PM 2',
            '2031-09-01 AM 1'
        ]);
        expect(creneaux[0]!.experts.map(trigrammeExpert)).toEqual(['LMA', 'pBE']);
    });

    it('jour d’un créneau', () => {
        expect(jourCreneau('2031-09-01')).toEqual({ jour: 'lun.', date: '01/09/2031' });
    });
});
