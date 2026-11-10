import { describe, expect, it } from 'vitest';
import {
    activite,
    datesEvenement,
    decompte,
    deplacer,
    distanceKm,
    enConge,
    evenementsEntre,
    grilleMois,
    iconeDuLibelle,
    iconeEvenement,
    ICONES_EVENEMENTS,
    joursSemaine,
    libelleEvenement,
    libellePeriode,
    lundiDe,
    numeroSemaine,
    versIso,
    type EvenementMobile
} from './planning';

describe('dates et périodes', () => {
    it('lundi, numéro de semaine ISO, jours ouvrés', () => {
        expect(versIso(lundiDe(new Date(2031, 2, 9)))).toBe('2031-03-03'); // dimanche → lundi précédent
        expect(numeroSemaine(new Date(2031, 2, 3))).toBe(10);
        expect(numeroSemaine(new Date(2026, 0, 1))).toBe(1);
        expect(joursSemaine(new Date(2031, 2, 5)).map(versIso)).toEqual([
            '2031-03-03',
            '2031-03-04',
            '2031-03-05',
            '2031-03-06',
            '2031-03-07'
        ]);
    });

    it('libellé et navigation selon la vue', () => {
        const c = new Date(2031, 2, 5);
        expect(libellePeriode('month', c)).toBe('Mars 2031');
        expect(libellePeriode('week', c)).toBe('Sem 10 — 3 Mar › 7 Mar');
        expect(libellePeriode('day', c)).toBe('mercredi 5 mars (Sem 10)');
        expect(versIso(deplacer('day', c, 1))).toBe('2031-03-06');
        expect(versIso(deplacer('week', c, -1))).toBe('2031-02-26');
        expect(versIso(deplacer('month', c, 1))).toBe('2031-04-01');
    });

    it('grille du mois : semaines ISO, jours hors du mois vides', () => {
        const l = grilleMois(new Date(2031, 2, 15)); // mars 2031 commence un samedi
        expect(l).toHaveLength(6);
        expect(l[0]!.semaine).toBe(9);
        expect(l[0]!.jours.slice(0, 5)).toEqual([null, null, null, null, null]);
        expect(l[0]!.jours[5]?.getDate()).toBe(1);
        expect(l[5]!.jours.filter(Boolean).map(d => d!.getDate())).toEqual([31]);
    });
});

describe('planification', () => {
    const p = {
        '7_available_2031-03-03_AM': '2',
        '7_activity_2031-03-03_AM': '5',
        '7_available_2031-03-04_PM': '3'
    };

    it('activité d’une demi-journée : « Indisponible » par défaut, aucune un jour de congé', () => {
        expect(activite(p, 7, '2031-03-03', 'AM')).toBe('5');
        expect(activite(p, 7, '2031-03-03', 'PM')).toBe('1');
        expect(activite(p, 7, '2031-03-04', 'PM')).toBeNull();
        expect(activite(p, 7, '2031-03-04', 'AM')).toBe('1');
        expect(enConge(p, 7, '2031-03-04')).toBe(true);
        expect(enConge(p, 7, '2031-03-03')).toBe(false);
    });
});

describe('événements', () => {
    const e = (x: Partial<EvenementMobile>): EvenementMobile => ({
        id: 1,
        label: 'Visite métier SAMU 75',
        start_date: '2031-03-03',
        end_date: '2031-03-05',
        ...x
    });

    it('période, libellé affiché, dates', () => {
        expect(evenementsEntre([e({})], '2031-03-05', '2031-03-09')).toHaveLength(1);
        expect(evenementsEntre([e({})], '2031-03-06', '2031-03-09')).toHaveLength(0);
        expect(libelleEvenement(e({ type_long: 'Visite métier', type_short: 'VM' }))).toEqual({
            affiche: 'VM',
            detail: 'Visite métier SAMU 75'
        });
        expect(libelleEvenement(e({ type_long: 'Autre(s)', type_other: 1 })).affiche).toBe('Visite métier SAMU 75');
        expect(datesEvenement(e({ period: 'PM' }))).toBe('03/03 → 05/03 (Après-midi)');
        expect(datesEvenement(e({ end_date: '2031-03-03', period: 'FULL' }))).toBe('03/03');
    });

    it('icône : celle du type, sinon d’après le début du libellé (épingle par défaut)', () => {
        expect(iconeDuLibelle('Visite métier SAMU 75')).toBe(ICONES_EVENEMENTS.briefcase);
        expect(iconeDuLibelle('Réunion de lancement stratégique')).toBe(ICONES_EVENEMENTS.rocket);
        expect(iconeDuLibelle('Autre chose')).toBe(ICONES_EVENEMENTS.pin);
        expect(iconeEvenement(e({ type_long: 'Formation', type_code: 'graduation' }))).toBe(
            ICONES_EVENEMENTS.graduation
        );
    });
});

describe('carte « Autour de moi »', () => {
    it('distance et décompte des lieux', () => {
        expect(distanceKm(48.8566, 2.3522, 45.764, 4.8357)).toBeCloseTo(391.5, 0);
        expect(decompte([3.2, 12, 80], 25, 50)).toBe('2 lieux dans un rayon de 25 km — le plus proche à 3.2 km');
        expect(decompte([80], 10, 50)).toBe(
            '0 lieu dans un rayon de 10 km — le plus proche est à 80 km (affiché sur la carte)'
        );
        expect(decompte([3.2], 0, 5000)).toBe(
            '1 lieu en France — le plus proche à 3.2 km · position approximative ±5 km'
        );
        expect(decompte(null, 50, 0, 4)).toBe('4 lieux en France (position inconnue).');
    });
});
