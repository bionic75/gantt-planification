import { describe, expect, it } from 'vitest';
import type { AstreintePlanning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import {
    affichageLocalisation,
    anneesProposees,
    astreintesDeLaCellule,
    couleurAffectation,
    dateAccessible,
    joursAttendus,
    joursDisponibles,
    joursDuMois,
    joursMadVolanteConsommes,
    moisVoisin,
    pastilleAstreinte,
    ressourcesAffichees,
    semainesDuMois
} from './grille';

const ressource = (champs: Partial<Ressource>) =>
    ({
        id: 1,
        nom: 'Martin',
        prenom: 'Léa',
        trigramme: 'LMA',
        taux: 100,
        actif: 1,
        fonction: null,
        date_debut: '2026-01-01',
        date_fin: null,
        ...champs
    }) as Ressource;

const astreinte = (champs: Partial<AstreintePlanning>): AstreintePlanning => ({
    id: 1,
    resource_id: 1,
    type: 'astreinte',
    date_debut: '2027-02-01',
    date_fin: '2027-02-01',
    heure_debut: '18:00',
    heure_fin: '23:00',
    samu: 'SAMU 75',
    tous_samu: 0,
    objet: 'Objet',
    ...champs
});

describe('mois et années', () => {
    it('années : de 2025 à deux ans après l’année courante, année affichée comprise', () => {
        expect(anneesProposees(2026, 2026)).toEqual([2025, 2026, 2027, 2028]);
        expect(anneesProposees(2026, 2029)).toEqual([2025, 2026, 2027, 2028, 2029]);
        expect(anneesProposees(2030, 2030).at(-1)).toBe(2032);
        expect(moisVoisin(2028, 11, 1)).toEqual({ annee: 2029, mois: 0 });
    });

    it('jours (data-date sans zéros) et semaines ISO du mois', () => {
        const jours = joursDuMois(2027, 1, new Date(2027, 1, 3));
        expect(jours).toHaveLength(28);
        expect(jours[0]).toMatchObject({ date: '2027-02-01', dateCourte: '2027-2-1', nom: 'Lun', weekend: false });
        expect(jours[2]!.aujourdhui).toBe(true);
        expect(jours[5]!.weekend).toBe(true);
        expect(semainesDuMois(2027, 1)).toEqual([
            { numero: 5, jours: 7 },
            { numero: 6, jours: 7 },
            { numero: 7, jours: 7 },
            { numero: 8, jours: 7 }
        ]);
    });
});

describe('ressources et cellules', () => {
    it('ressources actives, filtres des ressources (« » : toutes) et des fonctions', () => {
        const rs = [ressource({ id: 1, fonction: 'IDE' }), ressource({ id: 2 }), ressource({ id: 3, actif: 0 })];
        expect(ressourcesAffichees(rs, [], []).map(r => r.id)).toEqual([1, 2]);
        expect(ressourcesAffichees(rs, ['', '2'], []).map(r => r.id)).toEqual([1, 2]);
        expect(ressourcesAffichees(rs, ['2'], []).map(r => r.id)).toEqual([2]);
        expect(ressourcesAffichees(rs, [], ['IDE']).map(r => r.id)).toEqual([1]);
    });

    it('localisation affichée', () => {
        const v = (dispo: string, affectation: string, localisation: string) => ({
            dispo,
            affectation,
            localisation,
            auteur: ''
        });
        expect(affichageLocalisation(v('3', '1', '🏖️')).conges).toBe(true);
        expect(affichageLocalisation(v('1', '1', 'PSC')).texte).toBe('-');
        expect(affichageLocalisation(v('2', '1', '🗼 PSC')).texte).toBe('-');
        expect(affichageLocalisation(v('2', '2', '🗼 PSC'))).toMatchObject({ icone: 'tower', texte: 'PSC' });
        expect(affichageLocalisation(v('2', '3', '🚨 SAMU 75'))).toMatchObject({ icone: 'siren', texte: '75' });
        expect(affichageLocalisation(v('2', '5', 'Lieu inconnu')).texte).toBe('Lieu inc...');
        expect(couleurAffectation('3', '5')).toBe('#00bcd4');
        expect(couleurAffectation('2', '5')).toBe('#3498db');
    });

    it('période d’accès : jour près, dernier jour de la MAD compris', () => {
        const r = ressource({ date_debut: '2027-01-01', date_fin: '2027-02-28' });
        expect(dateAccessible(r, '2027-02-28', undefined)).toBe(true);
        expect(dateAccessible(r, '2027-03-01', undefined)).toBe(false);
        const historique = [{ id: 1, date_debut: '2027-01-01', date_fin: '2027-02-28', taux: 100 }];
        expect(dateAccessible(ressource({}), '2027-02-01', historique)).toBe(true);
        expect(dateAccessible(ressource({}), '2027-03-01', historique)).toBe(false);
    });
});

describe('compteurs', () => {
    it('jours attendus : historique au jour près (MAD commençant le lundi 1er février 2027)', () => {
        const historique = [{ id: 1, date_debut: '2027-02-01', date_fin: null, taux: 100 }];
        expect(joursAttendus(ressource({}), 2027, 1, historique, [])).toBe('20.0');
        const demi = [{ id: 1, date_debut: '2027-02-15', date_fin: null, taux: 50 }];
        expect(joursAttendus(ressource({}), 2027, 1, demi, [])).toBe('5.0');
        const particularite = [{ date_debut: '2027-02-01', date_fin: '2027-02-05', taux: 0 }];
        expect(joursAttendus(ressource({}), 2027, 1, historique, particularite)).toBe('15.0');
    });

    it('jours attendus sans historique : période de la ressource à son taux', () => {
        expect(joursAttendus(ressource({ taux: 50 }), 2027, 1, undefined, undefined)).toBe('10.0');
        expect(joursAttendus(ressource({ date_debut: '2028-01-01' }), 2027, 1, [], undefined)).toBe('0');
    });

    it('disponibles et MAD volante consommée', () => {
        const planning = {
            '1_available_2027-02-01_AM': '2',
            '1_available_2027-02-01_PM': '2',
            '1_activity_2027-02-01_AM': '3',
            '1_activity_2027-02-01_PM': '2',
            '1_available_2027-03-01_AM': '2',
            '1_activity_2027-03-01_AM': '5'
        };
        expect(joursDisponibles(planning, 1, 2027, 1)).toBe(1);
        expect(joursMadVolanteConsommes(planning, 1, '2027-01-01', null)).toBe(1);
        expect(joursMadVolanteConsommes(planning, 1, '2027-01-01', '2027-02-28')).toBe(0.5);
    });
});

describe('astreintes / HNO', () => {
    it('demi-journées couvertes selon les heures', () => {
        expect(astreintesDeLaCellule([astreinte({})], 1, '2027-02-01', 'AM')).toEqual([]);
        expect(astreintesDeLaCellule([astreinte({})], 1, '2027-02-01', 'PM')).toHaveLength(1);
        const longue = astreinte({ date_fin: '2027-02-03', heure_debut: '08:00', heure_fin: '11:00' });
        expect(astreintesDeLaCellule([longue], 1, '2027-02-02', 'AM')).toHaveLength(1);
        expect(astreintesDeLaCellule([longue], 1, '2027-02-03', 'PM')).toEqual([]);
        expect(astreintesDeLaCellule([astreinte({ resource_id: 2 })], 1, '2027-02-01', 'PM')).toEqual([]);
    });

    it('pastille ASTR, HNO ou les deux ; aucune pour une activité courante', () => {
        const a = astreintesDeLaCellule([astreinte({})], 1, '2027-02-01', 'PM');
        expect(pastilleAstreinte(a)).toEqual({
            libelle: 'ASTR',
            infobulle: '🔔 Astreinte 18:00–23:00: Objet | SAMU 75'
        });
        const deux = astreintesDeLaCellule([astreinte({}), astreinte({ id: 2, type: 'hno' })], 1, '2027-02-01', 'PM');
        expect(pastilleAstreinte(deux)!.libelle).toBe('ASTR\nHNO');
        expect(
            pastilleAstreinte(astreintesDeLaCellule([astreinte({ type: 'activite_courante' })], 1, '2027-02-01', 'PM'))
        ).toBeNull();
    });
});
