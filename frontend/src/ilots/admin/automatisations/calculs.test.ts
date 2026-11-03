import { describe, expect, it } from 'vitest';
import type { EnvoiAutomatisation } from '@/api/automatisations';
import {
    configCra,
    configHo,
    configTeams,
    couleurJournal,
    formulaireCra,
    formulaireHo,
    formulaireTeams,
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

describe('automatisation n°3', () => {
    it('sans configuration : inactive, adresse vide (plus d’adresse réelle par défaut), aucun type', () => {
        expect(formulaireTeams({})).toEqual({ actif: false, adresse: '', notifications: [] });
    });

    it('types relus et enregistrés dans l’ordre de la liste, inconnus ignorés', () => {
        const f = formulaireTeams({
            enabled: true,
            teamsEmail: 'canal@x.fr',
            notifications: ['evenement', 'x', 'demande']
        });
        expect(f).toEqual({ actif: true, adresse: 'canal@x.fr', notifications: ['demande', 'evenement'] });
        expect(configTeams({ ...f, notifications: ['evenement', 'affectation'] })).toEqual({
            enabled: true,
            teamsEmail: 'canal@x.fr',
            notifications: ['affectation', 'evenement']
        });
    });
});

describe('automatisation n°4', () => {
    const RH = [
        { id: 3, nom: 'Martin', prenom: 'Léa', email: 'lea@ex.fr' },
        { id: 8, nom: null, prenom: 'Sam', email: null }
    ];

    it('sans configuration : jour 1, aucun viseur ni DRH', () => {
        expect(formulaireCra({}, RH)).toEqual({ actif: false, jour: '1', n1: '', n2: '', drh: [] });
    });

    it('configuration relue ; viseur inconnu retiré', () => {
        expect(
            formulaireCra({ enabled: true, day: 27, admin_n1_id: '3', admin_n2_id: '99', drh_ans_ids: [8, 3, 5] }, RH)
        ).toEqual({ actif: true, jour: '27', n1: '3', n2: '', drh: [3, 8] });
    });

    it('configuration enregistrée comme l’ancien écran (viseur absent : nom « »)', () => {
        expect(configCra({ actif: true, jour: '27', n1: '3', n2: '', drh: [8] }, RH)).toEqual({
            enabled: true,
            day: 27,
            admin_n1_id: '3',
            admin_n1_email: 'lea@ex.fr',
            admin_n1_nom: 'Léa Martin',
            admin_n2_id: null,
            admin_n2_email: '',
            admin_n2_nom: ' ',
            drh_ans_ids: [8],
            drh_ans_infos: [{ id: 8, email: 'null', nom: 'Sam null' }]
        });
    });

    it('couleur des lignes du journal', () => {
        expect(couleurJournal('✅ envoyé')).toBe('ok');
        expect(couleurJournal('⚠️ sans e-mail')).toBe('erreur');
        expect(couleurJournal('─── Expert')).toBe('etape');
        expect(couleurJournal('  • détail')).toBe('detail');
        expect(couleurJournal('Début')).toBe('normal');
    });
});

describe('automatisations n°5 et n°6', () => {
    const MODELE = { subject: 'Sujet', body: 'Corps' };
    const DEST = [
        { valeur: 4, libelle: 'A' },
        { valeur: 2, libelle: 'B' }
    ];

    it('sans configuration : valeurs initiales et modèles du serveur', () => {
        expect(formulaireHo(5, {}, MODELE, DEST)).toMatchObject({
            actif: false,
            heure: '9',
            jour: '4',
            tousLesExperts: true,
            sujet: 'Sujet',
            corps: 'Corps',
            destinataires: []
        });
        expect(formulaireHo(6, {}, MODELE, DEST)).toMatchObject({ heure: '8', jours: ['1'], semaine: 'current' });
    });

    it('n°7 et n°8 (astreintes HO ANS) : mêmes formulaires que n°5 et n°6', () => {
        expect(formulaireHo(7, {}, MODELE, DEST)).toMatchObject({ heure: '9', jour: '4', tousLesExperts: true });
        expect(formulaireHo(8, {}, MODELE, DEST)).toMatchObject({ heure: '8', jours: ['1'], semaine: 'current' });
        const f7 = formulaireHo(
            7,
            { enabled: true, hour: 10, weekDay: 3, allExperts: false, recipients: [2] },
            MODELE,
            DEST
        );
        expect(configHo(7, f7, DEST)).toMatchObject({
            enabled: true,
            hour: 10,
            weekDay: 3,
            allExperts: false,
            recipients: [2]
        });
        const f8 = formulaireHo(8, { weekDays: [1, 3], week: 'next', groupAdmin: true }, MODELE, DEST);
        expect(configHo(8, f8, DEST)).toMatchObject({ weekDays: [1, 3], week: 'next', groupAdmin: true });
    });

    it('n°5 : configuration relue et enregistrée (destinataires dans l’ordre de la liste, sujet sans espaces)', () => {
        const f = formulaireHo(
            5,
            { enabled: true, hour: 21, weekDay: 0, recipients: ['2', 4], subject: ' S ' },
            MODELE,
            DEST
        );
        expect(f).toMatchObject({ heure: '21', jour: '0', destinataires: [4, 2], sujet: ' S ' });
        expect(configHo(5, f, DEST)).toEqual({
            enabled: true,
            hour: 21,
            subject: 'S',
            body: 'Corps',
            weekDay: 0,
            allExperts: true,
            recipients: [4, 2]
        });
    });

    it('n°6 : jours dans l’ordre lundi → dimanche, semaine et groupes', () => {
        const f = formulaireHo(6, { weekDays: ['0', 3], week: 'next', groupUser: true }, MODELE, DEST);
        expect(f).toMatchObject({ jours: ['3', '0'], semaine: 'next', groupeUtilisateur: true });
        expect(configHo(6, f, DEST)).toEqual({
            enabled: false,
            hour: 8,
            subject: 'Sujet',
            body: 'Corps',
            weekDays: [3, 0],
            week: 'next',
            groupAdmin: false,
            groupUser: true,
            groupExpert: false,
            recipients: []
        });
    });

    it('heure inconnue : aucune (null enregistré)', () => {
        expect(configHo(5, formulaireHo(5, { hour: 30 }, MODELE, DEST), DEST)).toMatchObject({ hour: null });
    });
});
