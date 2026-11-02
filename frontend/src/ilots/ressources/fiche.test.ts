import { describe, expect, it } from 'vitest';
import type { Ressource } from '@/api/ressources';
import {
    corpsFiche,
    depuisMois,
    estEmail,
    ficheIncomplete,
    formulaireFiche,
    lignesEmail,
    particulariteIncomplete,
    periodeIncomplete,
    tauxEnregistre
} from './fiche';

const ressource = (champs: Partial<Ressource> = {}): Ressource => ({
    id: 1,
    nom: 'Martin',
    prenom: 'Léa',
    trigramme: 'LMA',
    taux: 50,
    samu: 'SAMU 75',
    es_rattachement: 'CHU',
    fonction: null,
    date_debut: '2026-01-01',
    date_fin: '2027-12-31',
    actif: 1,
    is_mad_volante: 0,
    astreinte_volontaire: 1,
    astreinte_ho: 0,
    astreinte_apd: 0,
    astreinte_date_activation: '2026-03-01',
    date_fin_mad: null,
    jours_max_mad: null,
    contacts_rh: null,
    user_id: null,
    ...champs
});

describe('contacts RH', () => {
    it('adresses e-mail', () => {
        expect(estEmail('rh.e2e@etablissement.fr')).toBe(true);
        expect(estEmail('drh.e2e@hopital')).toBe(false);
        expect(estEmail('texte libre')).toBe(false);
        expect(estEmail('a@b@c.fr')).toBe(false);
    });

    it('une adresse par ligne : doublons (casse ignorée) et lignes vides retirés, lignes invalides relevées', () => {
        expect(lignesEmail(' rh@x.fr \n\nRH@X.FR\ntexte libre\ndrh@y.fr')).toEqual({
            valides: ['rh@x.fr', 'drh@y.fr'],
            invalides: ['texte libre']
        });
    });
});

describe('fiche', () => {
    it('formulaire : SAMU inconnu des localisations retiré, affectations copiées', () => {
        const aff = { principal: ['SAMU 75'], secondaire: ['SAMU 93'] };
        const f = formulaireFiche(ressource(), aff, ['SAMU 75']);
        expect(f).toMatchObject({ samu: 'SAMU 75', es: 'CHU', astreinteHno: true, dateAstreinte: '2026-03-01' });
        f.principal.push('X');
        expect(aff.principal).toEqual(['SAMU 75']);
        expect(formulaireFiche(ressource(), undefined, []).samu).toBe('');
    });

    it('contrôles : dates de la MAD volante, puis contacts RH', () => {
        const f = formulaireFiche(ressource(), undefined, []);
        expect(ficheIncomplete({ ...f, madVolante: true, dateDebutMad: '' })?.message).toBe(
            'Renseignez la date de début de la MAD.'
        );
        expect(ficheIncomplete({ ...f, madVolante: true, dateFinMad: '2025-12-31' })?.message).toBe(
            'La date de fin de la MAD précède sa date de début.'
        );
        // Dates de la MAD non volante non contrôlées
        expect(ficheIncomplete({ ...f, dateFinMad: '2025-12-31' })).toBeNull();
        expect(ficheIncomplete({ ...f, contacts: 'ok@x.fr\nko' })).toEqual({
            message:
                'Contacts RH : adresse(s) e-mail invalide(s)\n\nko\n\nCorrigez ou supprimez ces lignes (une adresse par ligne).',
            contacts: true
        });
    });

    it('taux enregistré : période en cours, sinon celle qui commence le plus tard (aussi si le taux en cours vaut 0)', () => {
        const historique = [
            { id: 1, date_debut: '2026-01-01', date_fin: '2026-06-30', taux: 50 },
            { id: 2, date_debut: '2026-07-01', date_fin: null, taux: 70 }
        ];
        expect(tauxEnregistre(historique, '2026-03-01')).toBe(50);
        expect(tauxEnregistre(historique, '2025-01-01')).toBe(70);
        expect(tauxEnregistre([{ ...historique[0]!, taux: 0 }, historique[1]!], '2026-03-01')).toBe(70);
        expect(tauxEnregistre([], '2026-03-01')).toBe(0);
    });

    it('corps : date de fin de la ressource conservée, contacts nettoyés, astreintes en booléens', () => {
        const f = { ...formulaireFiche(ressource(), undefined, []), contacts: 'a@x.fr\nA@X.FR', joursMaxMad: '12' };
        expect(corpsFiche(f, ressource(), 50)).toMatchObject({
            taux: 50,
            date_debut: '2026-01-01',
            date_fin: '2027-12-31',
            contacts_rh: 'a@x.fr',
            astreinte_volontaire: true,
            astreinte_ho: false,
            is_mad_volante: 0,
            jours_max_mad: 12
        });
    });

    it('ancienneté du régime d’astreintes', () => {
        expect(depuisMois('2026-03-01', new Date('2026-11-02'))).toBe(' (depuis 8 mois)');
        expect(depuisMois('2026-11-01', new Date('2026-11-02'))).toBe('');
        expect(depuisMois(null)).toBe('');
    });
});

describe('périodes et particularités', () => {
    it('contrôles des périodes de MAD', () => {
        expect(periodeIncomplete('', '', '50')).toBe('Veuillez remplir la date de début et le taux');
        expect(periodeIncomplete('2026-01-01', '', '')).toBe('Veuillez remplir la date de début et le taux');
        expect(periodeIncomplete('2026-02-01', '2026-01-01', '0')).toBe(
            'La date de fin doit être postérieure à la date de début'
        );
        expect(periodeIncomplete('2026-01-01', '', '0')).toBeNull();
    });

    it('contrôles des particularités ajoutées', () => {
        expect(particulariteIncomplete('2026-01-01', '', '0')).toBe('Veuillez remplir les dates et le taux');
        expect(particulariteIncomplete('2026-02-01', '2026-01-01', '0')).toBe(
            'La date de fin doit être postérieure à la date de début'
        );
        expect(particulariteIncomplete('2026-01-01', '2026-01-01', '0')).toBeNull();
    });
});
