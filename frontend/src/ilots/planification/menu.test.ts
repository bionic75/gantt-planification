import { describe, expect, it } from 'vitest';
import type { AstreintePlanning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import { enteteMenu, entreesMenu, menuAutorise, positionMenu, questionSuppression } from './menu';

const ressource = (champs: Partial<Ressource>) =>
    ({ id: 1, nom: 'MARTIN', prenom: 'Léa', user_id: 10, ...champs }) as Ressource;

const astreinte = (champs: Partial<AstreintePlanning>): AstreintePlanning => ({
    id: 5,
    resource_id: 1,
    type: 'astreinte',
    date_debut: '2027-03-01',
    date_fin: '2027-03-01',
    heure_debut: '18:00',
    heure_fin: '23:00',
    samu: 'SAMU 75',
    tous_samu: 0,
    objet: 'Astreinte du soir pour le SAMU',
    ...champs
});

describe('menu d’une demi-journée', () => {
    it('droits : profil administrateur actif, ou expert sur sa ligne', () => {
        expect(menuAutorise('admin', 1, ressource({ user_id: null }))).toBe(true);
        expect(menuAutorise('expert', 10, ressource({}))).toBe(true);
        expect(menuAutorise('expert', 11, ressource({}))).toBe(false);
        expect(menuAutorise('expert', 10, ressource({ user_id: null }))).toBe(false);
        // Compte administrateur connecté sous un autre profil : pas de menu sur les autres lignes
        expect(menuAutorise('user', 1, ressource({}))).toBe(false);
    });

    it('verrou du CRA : une seule entrée, statut lisible', () => {
        expect(entreesMenu({ locked: true, statut: 'vise_n1' }, [astreinte({})])).toEqual([
            { cle: 'verrou', type: 'verrou', libelle: 'CRA visé N1 — modifications verrouillées' }
        ]);
        expect(entreesMenu({ locked: true, statut: 'autre' }, [])[0]).toMatchObject({
            libelle: 'CRA autre — modifications verrouillées'
        });
    });

    it('entrées : ajout seul, ou modifier / supprimer chaque astreinte (objet abrégé) puis ajouter', () => {
        expect(entreesMenu({ locked: false }, []).map(e => e.type)).toEqual(['ajouter']);
        const entrees = entreesMenu({ locked: false }, [
            astreinte({}),
            astreinte({ id: 6, type: 'hno', objet: 'Nuit' })
        ]);
        expect(entrees.map(e => e.type)).toEqual([
            'modifier',
            'supprimer',
            'separateur',
            'modifier',
            'supprimer',
            'separateur',
            'ajouter'
        ]);
        expect(entrees[0]).toMatchObject({ libelle: 'Modifier — 🔔 Astreinte Astreinte du soir pour…' });
        expect(entrees[4]).toMatchObject({ libelle: 'Supprimer — ⏰ HNO Nuit' });
    });

    it('question de suppression, en-tête, position dans la fenêtre', () => {
        expect(questionSuppression(astreinte({ tous_samu: 1, samu: null, objet: 'X' }))).toBe(
            'Supprimer cette Astreinte ?\nX | Tous SAMU\n2027-03-01 → 2027-03-01'
        );
        expect(enteteMenu(ressource({}), '2027-03-01', 'AM')).toBe('MARTIN Léa — 01/03/2027 (AM)');
        expect(positionMenu(100, 100, 1, 1400, 900)).toEqual({ x: 100, y: 100 });
        expect(positionMenu(1300, 850, 1, 1400, 900)).toEqual({ x: 1145, y: 732 });
    });
});
