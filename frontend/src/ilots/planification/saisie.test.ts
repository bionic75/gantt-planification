import { describe, expect, it } from 'vitest';
import type { CompteGrille, Planning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import type { ExpertEnAttente } from '@/evenements';
import {
    MESSAGES,
    appliquer,
    basculerDisponibilite,
    changerAffectation,
    choisirLocalisation,
    compteursEnAttente,
    controlerAffectation,
    ouvrirLocalisation,
    suivreAffectation,
    type Cellule,
    type ContexteSaisie
} from './saisie';

const r = {
    id: 1,
    nom: 'Martin',
    prenom: 'Léa',
    trigramme: 'LMA',
    actif: 1,
    date_debut: '2026-01-01',
    date_fin: null
} as Ressource;
const c: Cellule = { ressource: r, date: '2027-02-01', periode: 'AM' };
const k = (type: string) => `1_${type}_2027-02-01_AM`;
const admin: ContexteSaisie = { profil: 'admin', ressourceId: null, prenom: 'Paul', nom: 'Admin' };
const expert: ContexteSaisie = { profil: 'expert', ressourceId: 1, prenom: 'Léa', nom: 'Martin' };
const utilisateur: ContexteSaisie = { ...admin, profil: 'user' };

describe('disponibilité', () => {
    it('administrateur : 1 → 2 → 1, localisation effacée', () => {
        expect(basculerDisponibilite(admin, {}, undefined, c)).toEqual({
            changements: { [k('available')]: '2', [k('activity')]: '2' },
            suivi: { affectation: '2', localisation: '-' }
        });
        const p = { [k('available')]: '2', [k('activity')]: '5', [k('localisation')]: '🗼 PSC' };
        expect(basculerDisponibilite(admin, p, undefined, c)).toEqual({
            changements: { [k('available')]: '1', [k('activity')]: '1', [k('localisation')]: null },
            suivi: { affectation: '1', localisation: '-' }
        });
        expect(basculerDisponibilite(admin, { [k('available')]: '3' }, undefined, c)).toEqual({
            erreur: MESSAGES.congesExpert
        });
    });

    it('expert : 1 → 2 → 3 (congés) → 1, sa ligne seulement', () => {
        const p2 = { [k('available')]: '2' };
        expect(basculerDisponibilite(expert, p2, undefined, c)).toMatchObject({
            changements: { [k('available')]: '3', [k('activity')]: '1', [k('localisation')]: '🏖️' }
        });
        const p3 = { [k('available')]: '3', [k('localisation')]: '🏖️' };
        expect(basculerDisponibilite(expert, p3, undefined, c)).toMatchObject({
            changements: { [k('available')]: '1', [k('activity')]: '1', [k('localisation')]: null }
        });
        expect(basculerDisponibilite({ ...expert, ressourceId: 2 }, {}, undefined, c)).toEqual({ ignore: true });
    });

    it('refus : profil utilisateur, hors MAD, quota de MAD volante', () => {
        expect(basculerDisponibilite(utilisateur, {}, undefined, c)).toEqual({ erreur: MESSAGES.dispoInterdite });
        expect(
            basculerDisponibilite(admin, {}, [{ id: 1, date_debut: '2028-01-01', date_fin: null, taux: 100 }], c)
        ).toEqual({
            erreur: MESSAGES.horsMad
        });
        const volante = { ...r, is_mad_volante: 1, jours_max_mad: 0.5, date_fin_mad: null } as Ressource;
        const p = { '1_available_2027-01-04_AM': '2', '1_activity_2027-01-04_AM': '3' };
        expect(basculerDisponibilite(admin, p, undefined, { ...c, ressource: volante })).toMatchObject({
            erreur: expect.stringContaining('Quota MAD volante atteint')
        });
    });
});

describe('affectation', () => {
    it('contrôles : utilisateur en lecture seule, indisponible, congés', () => {
        expect(controlerAffectation(utilisateur, {}, undefined, c, false)).toEqual({ erreur: MESSAGES.lectureSeule });
        expect(controlerAffectation(admin, {}, undefined, c, false)).toEqual({ erreur: MESSAGES.indisponible });
        expect(controlerAffectation(admin, { [k('available')]: '3' }, undefined, c, false)).toEqual({
            erreur: MESSAGES.enConges
        });
        expect(controlerAffectation(admin, { [k('available')]: '2' }, undefined, c, false)).toEqual({ direct: true });
    });

    it('affectation existante : confirmation (administrateur), sauf demi-journée déjà modifiée', () => {
        const p = { [k('available')]: '2', [k('activity')]: '5', [k('author')]: 'Autre.Personne' };
        expect(controlerAffectation(admin, p, undefined, c, false)).toEqual({
            confirmation: { affectation: '5', localisation: '', auteur: 'Autre.Personne', propre: false }
        });
        expect(controlerAffectation(admin, p, undefined, c, true)).toEqual({ direct: true });
        expect(controlerAffectation(expert, p, undefined, c, false)).toEqual({ direct: true });
        const propre = { ...p, [k('author')]: 'Paul.Admin' };
        expect(controlerAffectation(admin, propre, undefined, c, false)).toMatchObject({
            confirmation: { propre: true }
        });
    });

    it('cycle 2 → 3 … 8 → 2, localisation effacée en quittant ou en retrouvant « En attente », auteur', () => {
        const p: Planning = { [k('available')]: '2', [k('localisation')]: '🗼 PSC' };
        expect(changerAffectation(admin, p, c)).toEqual({
            changements: { [k('activity')]: '3', [k('author')]: 'Paul.Admin', [k('localisation')]: null },
            suivi: { affectation: '3', localisation: '-' }
        });
        const p8 = { ...p, [k('activity')]: '8', [k('localisation')]: '🚨 SAMU 75' };
        expect(changerAffectation(admin, p8, c)).toMatchObject({
            changements: { [k('activity')]: '2', [k('localisation')]: null }
        });
        const p4 = { ...p, [k('activity')]: '4', [k('localisation')]: '🚨 SAMU 75' };
        expect(changerAffectation(admin, p4, c)).toEqual({
            changements: { [k('activity')]: '5', [k('author')]: 'Paul.Admin' },
            suivi: { affectation: '5', localisation: '🚨 SAMU 75' }
        });
    });
});

describe('localisation', () => {
    it('contrôles et options selon l’affectation', () => {
        expect(ouvrirLocalisation(utilisateur, {}, undefined, c)).toEqual({ erreur: MESSAGES.lectureSeule });
        expect(ouvrirLocalisation(admin, {}, undefined, c)).toEqual({ erreur: MESSAGES.localisationDispo });
        const dispo = { [k('available')]: '2', [k('activity')]: '2' };
        const r2 = ouvrirLocalisation(admin, dispo, undefined, c);
        expect('titre' in r2 && r2.titre).toBe('Où êtes-vous disponible ? (AM)');
        const samu = ouvrirLocalisation(admin, { ...dispo, [k('activity')]: '3' }, undefined, c);
        expect('options' in samu && samu.options.map(o => o.libelle)).toEqual([
            'Télétravail',
            'SAMU (cliquer pour sélectionner)',
            'PSC',
            'Autres (Congrès, CFARM, EHESP...)'
        ]);
        const ans = ouvrirLocalisation(admin, { ...dispo, [k('activity')]: '5' }, undefined, c);
        expect('options' in ans && ans.options).toHaveLength(3);
    });

    it('choix : affectation suivie pour une vraie affectation', () => {
        expect(choisirLocalisation({ [k('activity')]: '2' }, c, '🗼 PSC')).toEqual({
            changements: { [k('localisation')]: '🗼 PSC' },
            suivi: null
        });
        expect(choisirLocalisation({ [k('activity')]: '3' }, c, '🚨 SAMU 75')).toMatchObject({
            suivi: { affectation: '3', localisation: '🚨 SAMU 75' }
        });
    });

    it('planning après changements, cellules supprimées retirées', () => {
        expect(appliquer({ a: '1', b: '2' }, { a: null, b: '3', c: '4' })).toEqual({ b: '3', c: '4' });
    });
});

describe('affectations en attente d’invitation', () => {
    const comptes = [
        { id: 10, nom: 'Martin', prenom: 'Léa', email: 'lea@example.org', resource_id: 1, is_expert: 1 }
    ] as CompteGrille[];

    it('nouvelle, modifiée, supprimée, retirée au retour à l’état initial', () => {
        const attente: Record<string, ExpertEnAttente> = {};
        const dispo = { [k('available')]: '2' };
        suivreAffectation(attente, dispo, { ...dispo, [k('activity')]: '3' }, r, comptes, c.date, 'AM', {
            affectation: '3',
            localisation: '-'
        });
        expect(attente['1']!.assignments).toEqual([
            expect.objectContaining({ actionType: 'new', activity: '📞 SAMU (Déploiement)', activityCode: '3' })
        ]);
        expect(compteursEnAttente(attente)).toEqual({ nouvelles: 1, modifications: 0, suppressions: 0 });
        // Retour à l'état initial
        suivreAffectation(attente, dispo, dispo, r, comptes, c.date, 'AM', { affectation: '1', localisation: '-' });
        expect(attente).toEqual({});

        const affecte = { ...dispo, [k('activity')]: '5', [k('localisation')]: '🗼 PSC' };
        suivreAffectation(attente, affecte, affecte, r, comptes, c.date, 'AM', {
            affectation: '6',
            localisation: '🗼 PSC'
        });
        expect(attente['1']!.assignments[0]).toMatchObject({
            actionType: 'modified',
            oldActivity: 'ANS (Déploiement)'
        });
        suivreAffectation(attente, affecte, affecte, r, comptes, c.date, 'AM', { affectation: '2', localisation: '-' });
        expect(attente['1']!.assignments).toEqual([
            expect.objectContaining({ actionType: 'deleted', activityCode: '5', oldLocation: '🗼 PSC' })
        ]);
    });

    it('ressource sans compte expert : rien à notifier', () => {
        const attente: Record<string, ExpertEnAttente> = {};
        suivreAffectation(attente, {}, {}, r, [], c.date, 'AM', { affectation: '3', localisation: '-' });
        expect(attente).toEqual({});
    });
});
