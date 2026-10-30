import { describe, expect, it } from 'vitest';
import type { ActionCompte, RessourceCompte, Utilisateur } from '@/api/utilisateurs';
import {
    activite,
    badges,
    capitaliser,
    compteur,
    csvJournaux,
    demandesAffectation,
    derniereConnexion,
    erreurSaisie,
    genererMotDePasse,
    loginPropose,
    messageCreation,
    modificationsPlanning,
    nomFichierJournaux,
    parNom,
    peutValidationRh,
    profilConnexion,
    roles,
    trier,
    trigramme
} from './calculs';

const compte = (extra: Partial<Utilisateur> = {}): Utilisateur => ({
    id: 1,
    username: 'lea.durand',
    nom: 'DURAND',
    prenom: 'Léa',
    email: 'lea@example.org',
    telephone: null,
    trigramme: null,
    resource_id: null,
    is_admin: 0,
    is_expert: 0,
    is_user: 1,
    is_rh: 0,
    has_reporting_access: 0,
    actif: 1,
    last_login: null,
    ...extra
});

describe('saisie', () => {
    it('prénom capitalisé, login « prénom.nom » sans accents, espaces ni tirets', () => {
        expect(capitaliser('jEAN')).toBe('Jean');
        expect(loginPropose('DE LA FONTAINE', 'Jean-Hélène')).toBe('jeanhelene.delafontaine');
        expect(loginPropose('', 'Léa')).toBeNull();
    });

    it('mot de passe de 12 caractères avec majuscule, minuscule, chiffre et symbole', () => {
        for (let i = 0; i < 20; i++) {
            const m = genererMotDePasse();
            expect(m).toHaveLength(12);
            expect(m).toMatch(/[A-Z]/);
            expect(m).toMatch(/[a-z]/);
            expect(m).toMatch(/\d/);
            expect(m).toMatch(/[!@#$%&*]/);
        }
    });

    it('contrôles dans l’ordre de l’ancien écran', () => {
        const base = {
            username: 'u',
            nom: 'N',
            prenom: 'P',
            email: 'e@x',
            password: 'p',
            is_admin: false,
            is_expert: false,
            is_user: true,
            is_rh: false,
            resource_id: null
        };
        expect(erreurSaisie(base)).toBeNull();
        expect(erreurSaisie({ ...base, password: '' })).toBe('Veuillez remplir tous les champs requis');
        expect(erreurSaisie({ ...base, is_user: false })).toBe('Veuillez sélectionner au moins un profil');
        expect(erreurSaisie({ ...base, is_expert: true })).toBe(
            'Veuillez sélectionner une ressource pour le profil Expert Métier'
        );
        // Modification : pas de mot de passe
        expect(erreurSaisie({ ...base, password: undefined })).toBeNull();
    });

    it('message après création selon l’envoi par e-mail', () => {
        expect(messageCreation(false, false).texte).toBe('✅ Utilisateur créé avec succès !');
        expect(messageCreation(true, true).texte).toContain('mot de passe envoyé par email');
        expect(messageCreation(true, false)).toMatchObject({ type: 'warning' });
    });
});

describe('liste', () => {
    it('trigramme du compte, sinon déduit du prénom et du nom', () => {
        expect(trigramme(compte({ trigramme: 'XYZ' }))).toBe('XYZ');
        expect(trigramme(compte())).toBe('LDU');
    });

    it('badges de profil, validation RH réservée', () => {
        expect(badges(compte({ is_admin: 1, is_rh: 1 })).map(b => b.libelle)).toEqual(['Admin', 'Utilisateur', 'RH']);
        expect(peutValidationRh(compte({ is_user: 0, is_expert: 1 }))).toBe(false);
        expect(peutValidationRh(compte())).toBe(true);
    });

    it('dernière connexion et compteur', () => {
        expect(derniereConnexion(null)).toBe('-');
        expect(derniereConnexion('2026-10-30T08:05:09')).toBe('30/10/2026 08:05:09');
        expect(compteur([compte(), compte({ id: 2, actif: 0 })])).toBe('(1 actif / 2 au total)');
        expect(compteur([compte(), compte({ id: 2 })])).toBe('(2 actifs / 2 au total)');
    });

    it('ordre initial par nom puis prénom ; tri du texte affiché, croissant ou décroissant', () => {
        const liste = [
            compte({ id: 1, nom: 'B', prenom: 'Z', username: 'b' }),
            compte({ id: 2, nom: 'A', prenom: 'Y', username: 'c' }),
            compte({ id: 3, nom: 'B', prenom: 'A', username: 'a' })
        ];
        expect(parNom(liste).map(u => u.id)).toEqual([2, 3, 1]);
        expect(trier(liste, 'username', true).map(u => u.id)).toEqual([3, 1, 2]);
        expect(trier(liste, 'username', false).map(u => u.id)).toEqual([2, 1, 3]);
    });
});

describe('détails', () => {
    const ressources: RessourceCompte[] = [{ id: 5, nom: 'Martin', prenom: 'Paul', trigramme: 'PMA', actif: 1 }];
    const action = (id: number, type: string, details: object, created_at: string): ActionCompte => ({
        id,
        action_type: type,
        details: JSON.stringify(details),
        created_at
    });

    it('anomalies conservées : rôles sans RH, connexion RH affichée « Utilisateur »', () => {
        expect(roles(compte({ is_admin: 1, is_rh: 1 }))).toBe('Administrateur, Utilisateur');
        expect(profilConnexion('rh')).toBe('Utilisateur');
        expect(activite('3')).toBe('📞 SAMU (Déploiement)');
    });

    it('modifications : la plus récente par demi-journée, avec l’expert concerné', () => {
        const actions = [
            action(
                1,
                'planning_modification',
                { resourceId: 5, date: '2031-03-03', period: 'AM', activity: '3', location: 'SAMU 75' },
                '2026-10-01 10:00:00'
            ),
            action(
                2,
                'planning_modification',
                { resourceId: 5, date: '2031-03-03', period: 'AM', activity: '1' },
                '2026-10-02 10:00:00'
            ),
            action(3, 'email_request', { resourceId: 5, date: '2031-03-04' }, '2026-10-03 10:00:00')
        ];
        const m = modificationsPlanning(compte(), actions, ressources);
        expect(m).toHaveLength(1);
        expect(m?.[0]).toMatchObject({
            periode: 'AM',
            expert: 'Paul Martin',
            affectation: '❓ Indisponible',
            localisation: '-'
        });
        expect(demandesAffectation(compte(), actions, ressources)?.[0]).toMatch(/ - Paul Martin$/);
        // Profil RH seul : sections absentes
        expect(modificationsPlanning(compte({ is_user: 0, is_rh: 1 }), actions, ressources)).toBeNull();
    });

    it('export CSV : sections, « undefined » des connexions regroupées (anomalie conservée), nom de fichier', () => {
        const csv = csvJournaux(
            compte(),
            [{ username: 'lea.durand', profile: 'user', nb_connexions: 2, derniere_connexion: '2026-10-30' }],
            []
        );
        expect(csv.startsWith('\uFEFFExport des logs - Léa DURAND (lea.durand)\n')).toBe(true);
        expect(csv).toContain('=== LOGS DE CONNEXION ===\nDate/Heure;Type\nundefined;Connexion\n');
        expect(csv).toContain('Aucune modification de planning');
        expect(csv).toContain('Aucune demande envoyée');
        expect(nomFichierJournaux('lea.durand', new Date('2026-10-30T12:00:00Z'))).toBe(
            'logs_lea.durand_2026-10-30.csv'
        );
    });
});
