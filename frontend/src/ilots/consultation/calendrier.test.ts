import { describe, expect, it } from 'vitest';
import type { EtatPlanning, RessourcePlanning } from '@/liaison';
import {
    couleurExpert,
    dateAccessible,
    datesDuJour,
    disponibles,
    grilleMois,
    moisVoisin,
    pastille,
    ressourcesAffichees,
    semaineIso,
    titreMois,
    zonesEnConges
} from './calendrier';

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

describe('grille du mois', () => {
    it('septembre 2031 : commence un lundi, semaines ISO 36 à 40', () => {
        const g = grilleMois(2031, 8, new Date(2031, 8, 2));
        expect(g.map(s => s.numero)).toEqual([36, 37, 38, 39, 40]);
        expect(g[0]!.cases[0]).toEqual({ jour: 1, date: '2031-09-01', weekend: false, aujourdhui: false });
        expect(g[0]!.cases[1]!.aujourdhui).toBe(true);
        expect(g[0]!.cases[5]!.weekend).toBe(true);
        // 30 jours : la dernière ligne s'arrête au mardi
        expect(g[4]!.cases.map(c => c?.jour ?? null)).toEqual([29, 30, null, null, null, null, null]);
    });

    it('cases vides avant le 1er ; semaine ISO de fin d’année', () => {
        // 1er janvier 2027 : vendredi, semaine 53 de 2026
        const g = grilleMois(2027, 0);
        expect(g[0]!.cases.slice(0, 4)).toEqual([null, null, null, null]);
        expect(g[0]!.cases[4]!.date).toBe('2027-01-01');
        expect(g[0]!.numero).toBe(53);
        expect(g[1]!.numero).toBe(1);
    });

    it('semaine ISO, mois voisins et titre', () => {
        expect(semaineIso(new Date(2031, 0, 1))).toBe(1);
        expect(semaineIso(new Date(2030, 11, 30))).toBe(1);
        expect(moisVoisin(2031, 0, -1)).toEqual({ annee: 2030, mois: 11 });
        expect(moisVoisin(2031, 11, 1)).toEqual({ annee: 2032, mois: 0 });
        expect(titreMois(2031, 8)).toBe('Septembre 2031');
    });
});

describe('congés et dates particulières', () => {
    it('congés : début inclus, fin exclue', () => {
        const conges = { zoneA: [{ start: '2031-10-18', end: '2031-11-03' }], zoneC: [] };
        expect(zonesEnConges(conges, '2031-10-18')).toEqual(['zoneA']);
        expect(zonesEnConges(conges, '2031-11-03')).toEqual([]);
    });

    it('dates couvrant le jour, fin incluse', () => {
        const dates = [{ date: '2031-09-10', endDate: '2031-09-12' }, { date: '2031-09-12' }];
        expect(datesDuJour(dates, '2031-09-12')).toHaveLength(2);
        expect(datesDuJour(dates, '2031-09-13')).toHaveLength(0);
    });

    it('pastille : lieu, « NON DÉFINI » pour un événement sans lieu, infobulle du type', () => {
        expect(pastille({ date: '2031-09-10', summary: 'Férié', config: {} }, 'JF', 0)).toMatchObject({
            libelle: 'Férié',
            infobulle: 'Férié',
            fond: '#ffeb3b',
            texte: '#000',
            bordure: '#fbc02d'
        });
        expect(pastille({ date: '2031-09-10', config: { label: 'Réunion', eventId: 4 } }, 'JF', 0).libelle).toBe(
            'NON DÉFINI | Réunion'
        );
        const typee = pastille(
            {
                date: '2031-09-10',
                config: {
                    label: 'Visite du SAMU',
                    shown: 'VT',
                    typeLong: 'Visite terrain',
                    typeIcon: 'flag',
                    locationLibelleCourt: 'SAMU 75',
                    eventId: 5,
                    bgColor: '#0011ff'
                }
            },
            'JF',
            0
        );
        expect(typee).toMatchObject({
            libelle: 'SAMU 75 | VT',
            infobulle: 'SAMU 75 | Visite terrain — Visite du SAMU',
            icone: 'flag',
            fond: '#0011ff'
        });
    });
});

describe('experts disponibles', () => {
    it('période d’accès : historique des MAD, à défaut dates de la ressource', () => {
        const r = ressource({ date_debut: '2031-01-01', date_fin: '2031-06-30' });
        expect(dateAccessible(r, '2030-12-31', {})).toBe(false);
        expect(dateAccessible(r, '2031-06-30', {})).toBe(true);
        expect(dateAccessible(r, '2031-07-01', {})).toBe(false);
        const historique = {
            1: [
                { date_debut: '2031-07-01', date_fin: null },
                { date_debut: '2030-01-01', date_fin: '2031-06-30' }
            ]
        };
        expect(dateAccessible(r, '2032-01-01', historique)).toBe(true);
        expect(dateAccessible(ressource({ date_debut: null }), '2031-01-01', {})).toBe(false);
    });

    it('ressources actives, restreintes au filtre (« » : toutes)', () => {
        const ressources = [ressource({ id: 1 }), ressource({ id: 2 }), ressource({ id: 3, actif: 0 })];
        expect(ressourcesAffichees(etat({ ressources })).map(r => r.id)).toEqual([1, 2]);
        expect(ressourcesAffichees(etat({ ressources, filtre: ['', '2'] })).map(r => r.id)).toEqual([1, 2]);
        expect(ressourcesAffichees(etat({ ressources, filtre: ['2', '3'] })).map(r => r.id)).toEqual([2]);
    });

    it('disponibles pour l’ANS (« 2 ») sur la demi-journée, dans leur période d’accès', () => {
        const a = ressource({ id: 1 });
        const b = ressource({ id: 2, date_debut: '2032-01-01' });
        const e = etat({
            ressources: [a, b],
            planning: {
                '1_available_2031-09-01_AM': '2',
                '1_available_2031-09-01_PM': '3',
                '2_available_2031-09-01_AM': '2'
            }
        });
        expect(disponibles(e, [a, b], '2031-09-01', 'AM').map(r => r.id)).toEqual([1]);
        expect(disponibles(e, [a, b], '2031-09-01', 'PM')).toEqual([]);
    });

    it('couleurs des experts : 15 couleurs reprises en boucle', () => {
        expect(couleurExpert(0)).toBe('#e74c3c');
        expect(couleurExpert(15)).toBe('#e74c3c');
    });
});
