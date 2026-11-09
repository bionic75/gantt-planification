import { describe, expect, it } from 'vitest';
import type { CandidatsActivite, ConfigAffectation, DeploiementAdmin } from '@/api/affectation';
import {
    bornesDeploiement,
    choixRegle,
    controler,
    corpsDuFormulaire,
    datesActivite,
    debutModifie,
    entitesProposees,
    finModifiee,
    formulaireDe,
    frise,
    joursEntre,
    joursModifies,
    libelleCandidat,
    lignePeriode,
    resumeParties,
    semaineChoisie,
    taille
} from './administration';

const CONFIG: ConfigAffectation = {
    stages: [
        { key: 'cadrage', label: 'Cadrage', kind: 'period', defaultColor: '#7e57c2' },
        { key: 'deploiement', label: 'Déploiement opérationnel', kind: 'period' },
        { key: 'gel', label: 'Période(s) de gel', kind: 'periods' },
        { key: 'mise_en_service', label: 'Mise en service', kind: 'date' },
        { key: 'mise_en_production', label: 'Mise en production', kind: 'date' },
        { key: 'reunion_lancement', label: 'Réunion de lancement stratégique', kind: 'milestone' },
        { key: 'visite_metier', label: 'Visite métier', kind: 'period', resources: true },
        { key: 'visite_ob', label: 'Visite OB', kind: 'milestone' },
        { key: 'test_prerequis', label: 'Test des prérequis', kind: 'period', resources: true },
        { key: 'vft', label: 'VFT', kind: 'period', resources: true },
        { key: 'formation_utilisateurs', label: 'Formation « Utilisateurs »', kind: 'period', resources: true },
        { key: 'accompagnement', label: 'Accompagnement', kind: 'period', resources: true }
    ],
    colors: { visite_metier: '#ab47bc', mise_en_service: '#e53935' },
    patterns: { gel: 'diag' }
};

const DEPLOIEMENT: DeploiementAdmin = {
    id: 7,
    samu_name: 'SAMU 75',
    location_id: 3,
    chef_projet_id: 12,
    chef_projet_nom: 'Jean Dupont',
    date_debut: '2031-01-06',
    date_mise_en_service: '2031-04-01',
    date_mise_en_production: null,
    periods: {
        visite_metier: [{ start: '2031-03-03', end: '2031-03-05', needed: 2 }],
        gel: [
            { start: '2031-02-10', end: '2031-02-14' },
            { start: '2031-05-01', end: '2031-05-02' }
        ],
        visite_ob: [{ start: '2031-03-20', end: '2031-03-20' }]
    }
};

describe('durées et frise', () => {
    it('compte les jours début et fin inclus', () => {
        expect(joursEntre('2031-03-03', '2031-03-05')).toBe(3);
        expect(joursEntre('2031-03-05', '2031-03-03')).toBe('');
        expect(joursEntre('', '2031-03-03')).toBe('');
    });

    it('situe les périodes et les jalons entre la première et la dernière date', () => {
        expect(bornesDeploiement(DEPLOIEMENT)).toEqual({ min: '2031-01-06', max: '2031-05-02' });
        const f = frise(DEPLOIEMENT, CONFIG, CONFIG.colors, CONFIG.patterns!);
        expect(f.debut).toBe('06/01/2031');
        expect(f.fin).toBe('02/05/2031');
        expect(f.segments.map(s => s.cle)).toEqual(['gel', 'gel', 'visite_metier']);
        const visite = f.segments[2]!;
        expect(visite.titre).toBe('Visite métier : 03/03/2031 → 05/03/2031');
        expect(visite.style).toContain('background-color:#ab47bc');
        expect(f.segments[0]!.style).toContain('background-image');
        // Largeur minimale d'un segment très court
        expect(f.segments[1]!.largeur).toBe(1.2);
        expect(f.reperes.map(r => r.titre)).toEqual(['Mise en service : 01/04/2031', 'Visite OB : 20/03/2031']);
        expect(f.reperes[0]!.position).toBeCloseTo((85 / 116) * 100, 5);
    });
});

describe('formulaire', () => {
    it('reprend un déploiement : chef, dates, jalons, périodes (une ligne vide par étape sans période)', () => {
        const f = formulaireDe(CONFIG, DEPLOIEMENT);
        expect(f).toMatchObject({ id: 7, samu_name: 'SAMU 75', chef: '12', date_debut: '2031-01-06' });
        expect(f.dates).toEqual({ mise_en_service: '2031-04-01', mise_en_production: '' });
        expect(f.jalons).toEqual({ reunion_lancement: '', visite_ob: '2031-03-20' });
        expect(f.periodes.visite_metier).toEqual([
            { start: '2031-03-03', end: '2031-03-05', jours: '3', needed: '2', auto: false }
        ]);
        expect(f.periodes.gel).toHaveLength(2);
        expect(f.periodes.cadrage).toEqual([lignePeriode()]);
        expect(formulaireDe(CONFIG, null)).toMatchObject({ id: null, chef: '', samu_name: '' });
    });

    it('début choisi : fin calée sur le début, puis recalculée par le nombre de jours', () => {
        const l = lignePeriode();
        l.start = '2034-03-06';
        debutModifie(l);
        expect(l).toMatchObject({ end: '2034-03-06', jours: '1', auto: true });
        l.jours = '3';
        joursModifies(l);
        expect(l).toMatchObject({ end: '2034-03-08', auto: false });
        // Nouveau début : la durée est conservée
        l.start = '2034-03-13';
        debutModifie(l);
        expect(l.end).toBe('2034-03-15');
    });

    it('fin choisie : nombre de jours recalculé ; début effacé : fin automatique effacée', () => {
        const l = lignePeriode({ start: '2034-03-06', end: '2034-03-06' });
        l.end = '2034-03-10';
        finModifiee(l);
        expect(l.jours).toBe('5');
        const auto = lignePeriode();
        auto.start = '2034-03-06';
        debutModifie(auto);
        auto.start = '';
        debutModifie(auto);
        expect(auto).toMatchObject({ end: '', jours: '', auto: false });
        // Fin choisie conservée si le début change sans nombre de jours
        const choisie = lignePeriode({ start: '2034-03-06', end: '2034-03-20' });
        choisie.jours = '';
        choisie.start = '2034-03-10';
        debutModifie(choisie);
        expect(choisie).toMatchObject({ end: '2034-03-20', jours: '11' });
    });

    it('semaine choisie : la période commence le lundi de la semaine ISO', () => {
        const l = lignePeriode();
        semaineChoisie(l, '2034-W10');
        expect(l).toMatchObject({ start: '2034-03-06', end: '2034-03-06' });
        semaineChoisie(l, '2026-W01');
        expect(l.start).toBe('2025-12-29');
        semaineChoisie(l, '');
        expect(l.start).toBe('');
    });

    it('propose les entités dont le libellé contient la saisie, sans accents ni casse', () => {
        const entites = [
            { id: 1, libelle_court: 'SAMU 75', libelle_long: 'SAMU de Paris' },
            { id: 2, libelle_court: 'SAMU 13', libelle_long: 'SAMU des Bouches-du-Rhône' }
        ];
        expect(entitesProposees(entites, 'rhone').map(e => e.id)).toEqual([2]);
        expect(entitesProposees(entites, 'samu 7').map(e => e.id)).toEqual([1]);
        expect(entitesProposees(entites, '')).toHaveLength(2);
    });

    it("envoie l'entité reconnue, les périodes saisies (lignes vides ignorées) et les jalons d'un jour", () => {
        const f = formulaireDe(CONFIG, DEPLOIEMENT);
        f.samu_name = ' samu 75 ';
        f.chef = '';
        f.jalons.reunion_lancement = '2031-01-20';
        f.periodes.gel!.push(lignePeriode());
        expect(corpsDuFormulaire(f, [{ id: 3, libelle_court: 'SAMU 75' }])).toEqual({
            samu_name: 'samu 75',
            location_id: 3,
            chef_projet_id: null,
            date_debut: '2031-01-06',
            date_mise_en_service: '2031-04-01',
            date_mise_en_production: null,
            periods: {
                gel: [
                    { start: '2031-02-10', end: '2031-02-14' },
                    { start: '2031-05-01', end: '2031-05-02' }
                ],
                visite_metier: [{ start: '2031-03-03', end: '2031-03-05', needed: 2 }],
                reunion_lancement: [{ start: '2031-01-20', end: '2031-01-20' }],
                visite_ob: [{ start: '2031-03-20', end: '2031-03-20' }]
            }
        });
        expect(corpsDuFormulaire(f, []).location_id).toBeNull();
    });

    it('liste les oublis dans l’ordre des champs, avec le champ à corriger', () => {
        const f = formulaireDe(CONFIG, null);
        f.dates.mise_en_service = '2030-01-01';
        f.periodes.visite_metier = [lignePeriode({ start: '2034-03-08', end: '2034-03-06' })];
        f.periodes.vft = [{ ...lignePeriode(), needed: '1' }];
        expect(controler(f, CONFIG)).toEqual([
            { message: 'Nom du SAMU : à renseigner.', champ: 'samu' },
            { message: 'Date de début du projet : à renseigner.', champ: 'debut' },
            { message: 'Visite métier : la date de fin précède la date de début.', champ: 'visite_metier:0:end' },
            {
                message: 'Visite métier : nombre de ressources nécessaires à renseigner.',
                champ: 'visite_metier:0:needed'
            },
            { message: 'VFT : date de début à renseigner.', champ: 'vft:0:start' },
            { message: 'VFT : date de fin à renseigner.', champ: 'vft:0:end' }
        ]);
        f.samu_name = 'SAMU 75';
        f.date_debut = '2031-01-06';
        f.jalons.visite_ob = '2031-01-01';
        expect(controler(f, CONFIG).map(o => o.message)).toEqual([
            'Mise en service : la date (01/01/2030) précède le début du projet.',
            'Visite OB : la date (01/01/2031) précède le début du projet.',
            'Visite métier : la date de fin précède la date de début.',
            'Visite métier : nombre de ressources nécessaires à renseigner.',
            'VFT : date de début à renseigner.',
            'VFT : date de fin à renseigner.'
        ]);
    });

    it("dates de l'activité : date, jalon ou première période", () => {
        const f = formulaireDe(CONFIG, DEPLOIEMENT);
        expect(datesActivite(f, 'mise_en_service')).toEqual({ start: '2031-04-01', end: '2031-04-01' });
        expect(datesActivite(f, 'mise_en_production')).toBeNull();
        expect(datesActivite(f, 'visite_ob')).toEqual({ start: '2031-03-20', end: '2031-03-20' });
        expect(datesActivite(f, 'visite_metier')).toEqual({ start: '2031-03-03', end: '2031-03-05' });
        expect(datesActivite(f, 'vft')).toBeNull();
    });
});

describe('événements, modèle, correspondance', () => {
    const evt = {
        id: 1,
        label: 'Visite',
        start: '2031-03-03',
        end: '2031-03-05',
        participants: 2,
        type: 'Visite métier'
    };

    it('libellés des événements proposés et résumé des parties reliées', () => {
        expect(libelleCandidat(evt)).toBe('03/03/2031 → 05/03/2031 · Visite · 2 part. · Visite métier');
        expect(libelleCandidat({ ...evt, end: evt.start, participants: 0, type: null })).toBe('03/03/2031 · Visite');
        const c: CandidatsActivite = {
            multi: true,
            linkedIds: [1],
            typeId: 4,
            typeLong: 'VFT',
            matching: [evt],
            others: [{ ...evt, id: 2 }],
            linked: null
        };
        expect(resumeParties(c)).toBe('1 partie(s) : 03/03/2031 → 05/03/2031');
        expect(resumeParties({ ...c, linkedIds: [] })).toBe('— Aucun événement lié —');
    });

    it('taille du modèle et choix de la règle Asana', () => {
        expect(taille(2 * 1048576 + 524288)).toBe('2,5 Mo');
        expect(taille(40960)).toBe('40 ko');
        const connues = [{ value: '5.1' }, { value: 'title:Visite' }];
        expect(choixRegle('', connues)).toBe('');
        expect(choixRegle('5.1', connues)).toBe('5.1');
        expect(choixRegle('title:Autre tâche', connues)).toBe('__custom');
    });
});
