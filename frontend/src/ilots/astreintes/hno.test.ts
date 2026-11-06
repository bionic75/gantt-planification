import { describe, expect, it } from 'vitest';
import type { Ressource } from '@/api/ressources';
import {
    alertes,
    compteurs,
    creneau,
    csvPlanning,
    expertsDisponibles,
    moisProposes,
    niveauHeures,
    niveauJour,
    refusAttribution,
    refusDisponibilite,
    ressourcesActives,
    semainesDuMois
} from './hno';

const ressource = (champs: Partial<Ressource>) =>
    ({
        id: 1,
        nom: 'Martin',
        prenom: 'Léa',
        trigramme: 'LMA',
        actif: 1,
        astreinte_volontaire: 1,
        ...champs
    }) as Ressource;

// Mars 2031 : le 1er est un samedi
const MARS = { annee: 2031, mois: 3 };

describe('mois et ressources', () => {
    it('mois courant et trois suivants', () => {
        expect(moisProposes(new Date(2026, 10, 6))).toEqual([
            { valeur: '2026-11', libelle: 'Novembre 2026' },
            { valeur: '2026-12', libelle: 'Décembre 2026' },
            { valeur: '2027-01', libelle: 'Janvier 2027' },
            { valeur: '2027-02', libelle: 'Février 2027' }
        ]);
    });

    it('ressources actives triées, volontaires seulement si demandé', () => {
        const liste = [
            ressource({ id: 1, nom: 'Zola', astreinte_volontaire: 0 }),
            ressource({ id: 2, nom: 'Abel' }),
            ressource({ id: 3, nom: 'Bert', actif: 0 })
        ];
        expect(ressourcesActives(liste).map(r => r.id)).toEqual([2, 1]);
        expect(ressourcesActives(liste, true).map(r => r.id)).toEqual([2]);
    });
});

describe('disponibilités et règles FPH', () => {
    it('compteurs : 14 h en semaine, 24 h le week-end ; jours hors du mois ignorés', () => {
        const c = compteurs(['2031-03-01', '2031-03-02', '2031-03-03', '2031-04-01'], MARS.annee, MARS.mois);
        expect(c).toEqual({ jours: 3, heures: 62, samedis: 1, dimanches: 1 });
        expect([niveauHeures(62), niveauHeures(101), niveauHeures(145)]).toEqual(['ok', 'attention', 'alerte']);
        expect([niveauJour(0), niveauJour(1), niveauJour(2)]).toEqual(['neutre', 'ok', 'alerte']);
    });

    it('second samedi ou dimanche refusé ; plus de 144 h refusé', () => {
        expect(refusDisponibilite(['2031-03-01'], '2031-03-08', MARS.annee, MARS.mois)[0]).toMatch(
            /déjà déclaré 1 samedi ce mois/
        );
        expect(refusDisponibilite(['2031-03-02'], '2031-03-09', MARS.annee, MARS.mois)[0]).toMatch(/1 dimanche/);
        expect(refusDisponibilite([], '2031-03-08', MARS.annee, MARS.mois)).toEqual([]);
        // 10 soirs de semaine = 140 h : un onzième soir dépasse 144 h
        const soirs = ['03', '04', '05', '06', '07', '10', '11', '12', '13', '14'].map(j => `2031-03-${j}`);
        expect(refusDisponibilite(soirs, '2031-03-17', MARS.annee, MARS.mois)[0]).toMatch(/154h/);
        expect(alertes({ jours: 2, heures: 150, samedis: 2, dimanches: 0 })).toHaveLength(2);
    });

    it('calendrier du lundi au dimanche, cases vides avant le 1er', () => {
        const s = semainesDuMois(MARS.annee, MARS.mois);
        expect(s[0]!.slice(0, 5)).toEqual([null, null, null, null, null]);
        expect(s[0]![5]).toEqual({ jour: 1, date: '2031-03-01' });
        expect(s.flat().filter(Boolean)).toHaveLength(31);
    });
});

describe('planning', () => {
    it('libellés d’un créneau', () => {
        expect(creneau({ date: '2031-03-01', type_creneau: 'journee' })).toEqual({
            date: '01/03/2031',
            jour: 'samedi',
            weekEnd: true,
            libelle: '☀️ Journée'
        });
        expect(creneau({ date: '2031-03-03', type_creneau: 'soir' }).libelle).toBe('🌙 Soir (18h-08h)');
    });

    it('experts proposés : volontaires disponibles ce jour, hors expert assigné', () => {
        const liste = [ressource({ id: 1, nom: 'A' }), ressource({ id: 2, nom: 'B' }), ressource({ id: 3, nom: 'C' })];
        const dispos = [
            { resource_id: 1, date: '2031-03-03', type_creneau: 'soir' as const },
            { resource_id: 2, date: '2031-03-03', type_creneau: 'soir' as const }
        ];
        expect(expertsDisponibles(liste, dispos, '2031-03-03', 1).map(r => r.id)).toEqual([2]);
    });

    it('attribution refusée au-delà d’un samedi par mois', () => {
        const planning = [{ id: 1, date: '2031-03-01', type_creneau: 'journee' as const, resource_id: 7 }];
        expect(refusAttribution(planning, 7, '2031-03-08')).toEqual([
            "Maximum d'1 samedi par mois atteint (1 samedi déjà assigné)"
        ]);
        expect(refusAttribution(planning, 8, '2031-03-08')).toEqual([]);
    });

    it('export CSV', () => {
        const csv = csvPlanning(
            [
                { id: 1, date: '2031-03-03', type_creneau: 'soir', resource_id: 1 },
                { id: 2, date: '2031-03-04', type_creneau: 'soir', resource_id: null }
            ],
            [ressource({ id: 1 })]
        );
        expect(csv.split('\n')).toEqual([
            '﻿Date;Jour;Créneau;Expert;Trigramme',
            '03/03/2031;lundi;Soir (18h-08h);MARTIN Léa;LMA',
            '04/03/2031;mardi;Soir (18h-08h);Non assigné;-',
            ''
        ]);
    });
});
