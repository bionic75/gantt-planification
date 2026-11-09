import { describe, expect, it } from 'vitest';
import type { Retroplanning, UtilisateurAteliers } from '@/api/ateliers';
import {
    ajouterPastille,
    avancement,
    corpsRetroplanning,
    dateCourte,
    dateLongue,
    formulaireDuSamu,
    formulaireVide,
    indicationZone,
    libelleBoutonSondage,
    libelleCreneau,
    objetCourriel,
    pastilleDeCourriel,
    pastilleLibre,
    prochainJalon,
    propositions,
    uneHeureApres
} from './ateliers';

const RETRO: Retroplanning = {
    id: 3,
    samu_name: 'SAMU 44',
    mep_date: '2032-09-15',
    zone: 'B',
    nb_ateliers: 3,
    delai_visite_atelier: 21,
    delai_mep: 28,
    lignes: {
        ecarts: { ecart12: 10 },
        planifiees: { a1: '2032-06-01' },
        heures: { a1: '10:00' },
        teams: 'https://teams.example/x',
        destinataires: { userIds: [4], emails: [] }
    },
    jalons: [
        {
            key: 'visite',
            ordre: 0,
            jalon: 'Visite métier',
            contenu: '',
            cible: null,
            proposee: '2032-05-03',
            planifiee: '2032-05-03',
            statut: '',
            niveau: 'ok',
            ecart: 0
        },
        {
            key: 'a1',
            ordre: 1,
            jalon: 'Atelier 1',
            contenu: '',
            cible: null,
            proposee: '2032-05-24',
            planifiee: null,
            statut: '',
            niveau: 'ok',
            ecart: null
        },
        {
            key: 'a2',
            ordre: 2,
            jalon: 'Atelier 2',
            contenu: '',
            cible: null,
            proposee: '2032-06-07',
            planifiee: null,
            statut: '',
            niveau: 'ok',
            ecart: null
        },
        {
            key: 'livrables',
            ordre: 3,
            jalon: 'Livrables prêts',
            contenu: '',
            cible: null,
            proposee: '2032-06-07',
            planifiee: null,
            statut: '',
            niveau: 'info',
            ecart: null
        },
        {
            key: 'mep',
            ordre: 4,
            jalon: 'MEP',
            contenu: '',
            cible: null,
            proposee: '2032-09-15',
            planifiee: null,
            statut: '',
            niveau: 'fix',
            ecart: null
        }
    ],
    warnings: [],
    last_sent_at: null,
    updated_at: '2032-04-01 08:00:00'
};

const UTILISATEURS: UtilisateurAteliers[] = [
    { id: 4, nom: 'Durand', prenom: 'Anne', email: 'anne.durand@example.invalid' },
    { id: 5, nom: 'Martin', prenom: 'Éric', email: 'eric.martin@example.invalid' },
    { id: 6, nom: 'Sans', prenom: 'Adresse', email: null }
];

describe('formulaire de la simulation', () => {
    it('SAMU enregistré : rétroplanning repris ; sinon MEP et zone du déploiement, délais conservés', () => {
        const avant = { ...formulaireVide(), nb: 5, delaiVisite: 10 as const };
        expect(formulaireDuSamu(avant, 'SAMU 44', RETRO, undefined)).toMatchObject({
            id: 3,
            mep: '2032-09-15',
            nb: 3,
            zone: 'B',
            delaiVisite: 21,
            ecart12: 10,
            ecartAteliers: 14,
            planifiees: { a1: '2032-06-01' },
            teams: 'https://teams.example/x',
            destinataires: { userIds: [4], emails: [] }
        });
        const projet = { project_id: 1, samu_name: 'SAMU 13', zone: 'B', mep: '2032-10-01', saved: false };
        expect(formulaireDuSamu(avant, 'SAMU 13', undefined, projet)).toMatchObject({
            id: null,
            mep: '2032-10-01',
            zone: 'B',
            nb: 5,
            delaiVisite: 10
        });
    });

    it('corps envoyé : délais vides remplacés par leur valeur par défaut', () => {
        const f = {
            ...formulaireVide(),
            samu: 'SAMU 44',
            mep: '2032-09-15',
            zone: 'A',
            delaiVisite: '' as const,
            ecart12: '' as const
        };
        expect(corpsRetroplanning(f)).toMatchObject({
            delaiVisite: 14,
            delaiMep: 28,
            ecart12: 7,
            ecartAteliers: 14,
            nb: 4
        });
    });

    it('indication de la zone', () => {
        const p = { project_id: 1, samu_name: 'SAMU 44', zone: 'B', mep: null, saved: false };
        expect(indicationZone(undefined, '').texte).toBe('La zone est proposée selon le département du SAMU.');
        expect(indicationZone({ ...p, zone: null }, '').texte).toContain('Zone non déterminée');
        expect(indicationZone(p, 'B')).toEqual({
            texte: 'Zone B : zone scolaire de ce SAMU (corrigeable).',
            reprendre: false
        });
        expect(indicationZone(p, 'A')).toEqual({ texte: 'Zone proposée pour ce SAMU : B.', reprendre: true });
    });
});

describe('libellés', () => {
    it('dates, objet des courriels, fin d’un atelier', () => {
        expect(dateLongue('2032-09-15')).toBe('mer. 15/09/2032');
        expect(dateLongue(null)).toBe('—');
        expect(dateCourte('2032-09-15')).toBe('15/09/2032');
        expect(objetCourriel('SAMU 44', { key: 'a2', jalon: 'Atelier 2', contenu: 'Formation' })).toBe(
            '[SI-SAMU] SAMU 44 - Atelier Métier #2 | Formation'
        );
        expect(objetCourriel('SAMU-SAS 2A', { key: 'visite', jalon: 'Visite métier', contenu: '' })).toBe(
            '[SI-SAMU] SAMU 2A - Visite métier | Configuration téléphonique du CRRA'
        );
        expect(uneHeureApres('10:30')).toBe('11:30');
        expect(uneHeureApres('23:15')).toBe('23:59');
    });

    it('avancement, prochain jalon, bouton du sondage, créneau', () => {
        expect(avancement(RETRO)).toEqual({ texte: '1/3 planifiés', niveau: 'info' });
        expect(prochainJalon(RETRO, '2032-05-10')).toBe('Atelier 1 — 24/05/2032');
        expect(prochainJalon(RETRO, '2032-12-01')).toBe('Terminé');
        expect(libelleBoutonSondage(undefined)).toBe('Sondage');
        expect(libelleBoutonSondage({ statut: 'reponses', reponses: 3 })).toBe('Réponses en cours (3)');
        expect(libelleBoutonSondage({ statut: 'termine', reponses: 3 })).toBe('Sondage terminé');
        expect(libelleCreneau({ date: '2032-06-08', heure: '14:00', heure_fin: '16:00' })).toBe(
            'mar. 08/06/2032 · 14:00 – 16:00'
        );
    });
});

describe('destinataires en pastilles', () => {
    it('propositions : utilisateurs avec adresse (sans accents ni casse), puis adresse libre', () => {
        expect(propositions(UTILISATEURS, [], 'eric', true).map(p => p.label)).toEqual(['Éric MARTIN']);
        expect(propositions(UTILISATEURS, [], 'adresse', true)).toEqual([]);
        expect(propositions(UTILISATEURS, [], 'autre@example.invalid', true).map(p => p.id)).toEqual([
            'eautre@example.invalid'
        ]);
        expect(propositions(UTILISATEURS, [], 'autre@example.invalid', false)).toEqual([]);
        // Utilisateur déjà choisi : plus proposé
        const anne = pastilleDeCourriel(UTILISATEURS, 'ANNE.DURAND@example.invalid');
        expect(anne).toMatchObject({ uid: 4, label: 'Anne DURAND', initials: 'AD' });
        expect(propositions(UTILISATEURS, [anne], 'durand', true)).toEqual([]);
    });

    it('ajout sans doublon d’identifiant ni d’adresse', () => {
        const anne = pastilleDeCourriel(UTILISATEURS, 'anne.durand@example.invalid');
        const choisies = ajouterPastille([], anne);
        expect(ajouterPastille(choisies, pastilleLibre('Anne.Durand@example.invalid'))).toHaveLength(1);
        expect(ajouterPastille(choisies, pastilleLibre('x@example.invalid'))).toHaveLength(2);
    });
});
