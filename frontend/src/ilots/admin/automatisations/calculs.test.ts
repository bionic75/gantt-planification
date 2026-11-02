import { describe, expect, it } from 'vitest';
import type { EnvoiAutomatisation } from '@/api/automatisations';
import {
    configRappel,
    configSauvegarde,
    destinatairesEnvoi,
    formulaireRappel,
    formulaireSauvegarde,
    libelleMois,
    parametresSauvegarde,
    testIncomplet,
    type ListesSauvegarde
} from './calculs';

const COMPTES = [
    { valeur: '12', libelle: 'Ada Lovelace (ada@ex.fr)' },
    { valeur: '7', libelle: 'Alan Turing (alan@ex.fr)' }
];

const LISTES: ListesSauvegarde = {
    comptes: [
        { valeur: 12, libelle: 'Ada' },
        { valeur: 7, libelle: 'Alan' }
    ],
    ressources: [
        { valeur: 3, libelle: 'R3' },
        { valeur: 1, libelle: 'R1' }
    ],
    mois: [
        { valeur: '2031-01', libelle: 'Janvier 2031' },
        { valeur: '2031-02', libelle: 'Février 2031' }
    ]
};

describe('automatisation n°1', () => {
    it('sans configuration : inactive, 5 jours, sans copie', () => {
        expect(formulaireRappel({}, COMPTES)).toEqual({ actif: false, jours: '5', copie: '' });
    });

    it('configuration enregistrée relue puis réenregistrée à l’identique (copie en texte)', () => {
        const f = formulaireRappel({ enabled: true, days: 10, copyUserId: '7' }, COMPTES);
        expect(f).toEqual({ actif: true, jours: '10', copie: '7' });
        expect(configRappel(f)).toEqual({ enabled: true, days: 10, copyUserId: '7' });
    });

    it('valeurs absentes des listes : aucune (copie retirée, jours non renseignés)', () => {
        const f = formulaireRappel({ days: 4, copyUserId: 99 }, COMPTES);
        expect(f).toEqual({ actif: false, jours: '', copie: '' });
        expect(configRappel(f)).toEqual({ enabled: false, days: null, copyUserId: null });
    });
});

describe('automatisation n°2', () => {
    it('sans configuration : valeurs initiales de l’écran', () => {
        expect(formulaireSauvegarde({}, LISTES)).toEqual({
            actif: false,
            groupeAdmin: false,
            groupeUtilisateur: false,
            groupeExpert: false,
            destinataires: [],
            frequence: 'daily',
            jourSemaine: '1',
            jourMois: '1',
            heure: '8',
            tousLesMois: true,
            mois: [],
            tousLesExperts: true,
            experts: [],
            exclureVides: true,
            format: 'csv'
        });
    });

    it('sélections relues dans l’ordre des listes, inconnues ignorées ; mois et experts si tous ne sont pas retenus', () => {
        const c = {
            enabled: true,
            groupAdmin: true,
            recipients: [7, 12, 99],
            frequency: 'weekly',
            weekDay: '3',
            hour: '18',
            allMonths: false,
            selectedMonths: ['2031-02', '2030-12'],
            allExperts: false,
            expertsList: [1, 3],
            excludeEmpty: false,
            format: 'xlsx'
        };
        const f = formulaireSauvegarde(c, LISTES);
        expect(f).toMatchObject({ destinataires: [12, 7], mois: ['2031-02'], experts: [3, 1], heure: '18' });
        expect(configSauvegarde(f, LISTES)).toEqual({
            enabled: true,
            groupAdmin: true,
            groupUser: false,
            groupExpert: false,
            recipients: [12, 7],
            frequency: 'weekly',
            weekDay: '3',
            monthDay: '1',
            hour: '18',
            allMonths: false,
            selectedMonths: ['2031-02'],
            allExperts: false,
            expertsList: [3, 1],
            excludeEmpty: false,
            format: 'xlsx'
        });
        expect(formulaireSauvegarde({ ...c, allMonths: true, allExperts: true }, LISTES)).toMatchObject({
            mois: [],
            experts: []
        });
    });

    it('test refusé sans destinataire, sans mois ou sans expert', () => {
        const p = parametresSauvegarde(formulaireSauvegarde({}, LISTES), LISTES);
        expect(testIncomplet(p)).toBe('❌ Veuillez sélectionner au moins un destinataire');
        expect(testIncomplet({ ...p, recipients: [7] })).toBeNull();
        expect(testIncomplet({ ...p, groupUser: true, allMonths: false })).toBe(
            '❌ Veuillez sélectionner au moins un mois ou cocher "Toutes les données"'
        );
        expect(testIncomplet({ ...p, groupUser: true, allExperts: false })).toBe(
            '❌ Veuillez sélectionner au moins un expert ou cocher "Tous les experts"'
        );
    });

    it('données incluses du récapitulatif', () => {
        const p = parametresSauvegarde(formulaireSauvegarde({}, LISTES), LISTES);
        expect(libelleMois(p, 'Toutes les données (4 mois)')).toBe('Toutes les données (4 mois)');
        expect(libelleMois(p, undefined)).toBe('Toutes les données');
        expect(libelleMois({ ...p, allMonths: false, selectedMonths: ['2031-01', '2031-12'] }, 'x')).toBe(
            'Janvier 2031, Décembre 2031'
        );
        expect(libelleMois({ ...p, allMonths: false }, undefined)).toBe('Aucun mois');
    });
});

describe('historique', () => {
    const envoi = (e: Partial<EnvoiAutomatisation>): EnvoiAutomatisation => ({
        id: 1,
        sent_at: '2031-01-01T08:00:00Z',
        expert_name: null,
        expert_email: null,
        target_month: null,
        recipients_list: null,
        recipients_count: 0,
        file_id: 1,
        filename: null,
        ...e
    });

    it('destinataires d’une sauvegarde : nombre et noms, liste illisible ou vide ignorée', () => {
        expect(destinatairesEnvoi(envoi({ recipients_list: '["Ada","Alan"]', recipients_count: 2 }))).toEqual({
            nombre: '2 destinataire(s)',
            noms: ['Ada', 'Alan']
        });
        expect(destinatairesEnvoi(envoi({ recipients_list: '[', recipients_count: 0 }))).toEqual({
            nombre: '-',
            noms: []
        });
        expect(destinatairesEnvoi(envoi({ recipients_list: '[]' }))).toEqual({ nombre: '-', noms: [] });
    });
});
