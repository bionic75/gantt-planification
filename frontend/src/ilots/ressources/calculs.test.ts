import { describe, expect, it } from 'vitest';
import type { Ressource } from '@/api/ressources';
import {
    ajoutIncomplet,
    apresAjout,
    capitaliser,
    corpsAjout,
    datesMad,
    esDuSamu,
    formulaireVide,
    ordreAlphabetique,
    statutMad,
    suggestionsSamu,
    trierParTexte,
    trigrammePropose
} from './calculs';

const ressource = (champs: Partial<Ressource> = {}): Ressource => ({
    id: 1,
    nom: 'Martin',
    prenom: 'Léa',
    trigramme: 'LMA',
    taux: 50,
    samu: 'SAMU 75',
    es_rattachement: null,
    fonction: null,
    date_debut: '2026-01-01',
    date_fin: null,
    actif: 1,
    is_mad_volante: 0,
    astreinte_volontaire: 0,
    astreinte_ho: 0,
    astreinte_apd: 0,
    astreinte_date_activation: null,
    date_fin_mad: null,
    jours_max_mad: null,
    contacts_rh: null,
    user_id: null,
    ...champs
});

const MAINTENANT = new Date('2026-11-02T10:00:00');

describe('MAD', () => {
    it('dates : historique (première date de début, dernière date de fin), sinon la ressource', () => {
        const historique = [
            { id: 2, date_debut: '2026-07-01', date_fin: null, taux: 70 },
            { id: 1, date_debut: '2026-01-01', date_fin: '2026-06-30', taux: 50 }
        ];
        expect(datesMad(ressource(), historique)).toEqual({ debut: '2026-01-01', fin: null });
        expect(datesMad(ressource({ date_fin: '2027-01-01' }), [])).toEqual({ debut: '2026-01-01', fin: '2027-01-01' });
    });

    it('statut à la date du jour', () => {
        expect(statutMad(ressource({ date_debut: null }), [], MAINTENANT)).toEqual({
            texte: 'Non démarré',
            classe: 'pending'
        });
        expect(statutMad(ressource({ date_debut: '2026-12-01' }), [], MAINTENANT).texte).toBe('À venir');
        expect(statutMad(ressource({ date_fin: '2026-10-31' }), [], MAINTENANT)).toEqual({
            texte: 'Terminé',
            classe: 'inactive'
        });
        expect(statutMad(ressource({ date_fin: '2026-11-02' }), [], MAINTENANT)).toEqual({
            texte: 'En cours',
            classe: 'active'
        });
    });
});

describe('saisie', () => {
    it('trigramme proposé sans accents, espaces ni tirets ; rien sans nom ou prénom', () => {
        expect(trigrammePropose('Dupré-Lévy', 'Élodie')).toBe('EDU');
        expect(trigrammePropose(' Le Goff ', 'jean marc')).toBe('JLE');
        expect(trigrammePropose('', 'Jean')).toBeNull();
    });

    it('prénom capitalisé', () => {
        expect(capitaliser('éLODIE')).toBe('Élodie');
        expect(capitaliser('')).toBe('');
    });

    it('ES : adresse jusqu’à la première virgule', () => {
        expect(esDuSamu('CHU de Lyon, 5 place X')).toBe('CHU de Lyon');
        expect(esDuSamu(' Hôpital Nord ')).toBe('Hôpital Nord');
        expect(esDuSamu(null)).toBe('');
    });

    it('SAMU proposés : distincts, hors SAMU choisis, filtrés, triés, 10 au plus', () => {
        const libelles = [
            'SAMU 93',
            'SAMU 75',
            null,
            'SAMU 75',
            'SAMU 92',
            ...Array.from({ length: 12 }, (_, i) => `X${i}`)
        ];
        expect(suggestionsSamu(libelles, ['SAMU 92'], 'samu')).toEqual(['SAMU 75', 'SAMU 93']);
        expect(suggestionsSamu(libelles, [], '')).toHaveLength(10);
    });

    it('formulaire incomplet : messages de l’ancien écran, dans leur ordre', () => {
        const f = {
            ...formulaireVide(),
            nom: 'A',
            prenom: 'B',
            trigramme: 'BAA',
            samu: 'SAMU 75',
            dateDebut: '2026-01-01'
        };
        expect(ajoutIncomplet({ ...f, nom: ' ' })).toBe('Remplissez tous les champs obligatoires (*)');
        expect(ajoutIncomplet(f)).toBe('Remplissez le taux de MAD');
        expect(ajoutIncomplet({ ...f, madVolante: true })).toBe(
            'Remplissez la date de fin et les jours max pour une MAD volante'
        );
        expect(ajoutIncomplet({ ...f, taux: '80', astreinteHno: true })).toBe(
            "Veuillez saisir la date de démarrage du régime d'astreintes"
        );
        expect(ajoutIncomplet({ ...f, taux: '80' })).toBeNull();
    });

    it('corps envoyé : MAD volante au taux 0, trigramme en majuscules, champs vides à null', () => {
        const f = {
            ...formulaireVide(),
            nom: ' Martin ',
            prenom: 'Léa',
            trigramme: 'lma',
            madVolante: true,
            taux: '80',
            dateFinMad: '2027-03-31',
            joursMaxMad: '15',
            samu: 'SAMU 75',
            dateDebut: '2026-01-01',
            astreinteHno: true,
            dateAstreinte: '2026-11-01'
        };
        expect(corpsAjout(f)).toMatchObject({
            nom: 'Martin',
            trigramme: 'LMA',
            taux: 0,
            es_rattachement: null,
            fonction: null,
            astreinte_volontaire: 1,
            astreinte_ho: 0,
            astreinte_date_activation: '2026-11-01',
            is_mad_volante: 1,
            date_fin_mad: '2027-03-31',
            jours_max_mad: 15
        });
    });

    it('après un ajout : formulaire vidé sauf MAD volante, date de fin et jours max (anomalie conservée)', () => {
        const f = {
            ...formulaireVide(),
            nom: 'A',
            madVolante: true,
            dateFinMad: '2027-03-31',
            joursMaxMad: '15',
            astreinteHo: true
        };
        expect(apresAjout(f)).toEqual({
            ...formulaireVide(),
            madVolante: true,
            dateFinMad: '2027-03-31',
            joursMaxMad: '15'
        });
    });
});

describe('liste', () => {
    it('ordre alphabétique sur nom puis prénom', () => {
        const l = [
            ressource({ id: 1, nom: 'martin', prenom: 'Zoé' }),
            ressource({ id: 2, nom: 'Martin', prenom: 'Anne' })
        ];
        expect([...l].sort(ordreAlphabetique).map(r => r.id)).toEqual([2, 1]);
    });

    it('tri sur le texte : dates JJ/MM/AAAA, nombres, puis texte ; décroissant', () => {
        const dates = ['01/02/2026', '15/01/2026', '-'];
        expect(trierParTexte(dates, d => d, true)).toEqual(['-', '15/01/2026', '01/02/2026']);
        expect(trierParTexte(['10', '9', 'abc'], d => d, true)).toEqual(['9', '10', 'abc']);
        expect(trierParTexte(['b', 'A', 'c'], d => d, false)).toEqual(['c', 'b', 'A']);
    });
});
