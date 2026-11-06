import { describe, expect, it } from 'vitest';
import type { Ressource } from '@/api/ressources';
import {
    ERREUR_DATES,
    destinatairesPossibles,
    erreurDates,
    libelleDestinataire,
    preremplissage,
    propositions,
    type Destinataire
} from './demande';

const ressource = (champs: Partial<Ressource>) =>
    ({
        id: 1,
        nom: 'Martin',
        prenom: 'Léa',
        trigramme: 'LMA',
        actif: 1,
        email: 'lea@example.org',
        ...champs
    }) as Ressource;

const expert = (id: number, nom: string, prenom: string, trigramme: string): Destinataire => ({
    id,
    nom,
    prenom,
    trigramme,
    email: `${trigramme}@example.org`
});

describe('demande d’affectation', () => {
    it('destinataires : ressources actives avec une adresse e-mail', () => {
        const d = destinatairesPossibles([
            ressource({ id: 1 }),
            ressource({ id: 2, actif: 0 }),
            ressource({ id: 3, email: '  ' }),
            ressource({ id: 4, email: null })
        ]);
        expect(d.map(e => e.id)).toEqual([1]);
        expect(libelleDestinataire(d[0]!)).toBe('Léa Martin (LMA)');
    });

    it('propositions : non choisies, recherche sur prénom, nom ou trigramme, par nom, 10 au plus', () => {
        const tous = [
            expert(1, 'Martin', 'Léa', 'LMA'),
            expert(2, 'Bernard', 'Paul', 'PBE'),
            expert(3, 'Durand', 'Zoé', 'ZDU')
        ];
        expect(propositions(tous, [], '').map(e => e.id)).toEqual([2, 3, 1]);
        expect(propositions(tous, [tous[1]!], '').map(e => e.id)).toEqual([3, 1]);
        expect(propositions(tous, [], ' lma ').map(e => e.id)).toEqual([1]);
        const nombreux = Array.from({ length: 12 }, (_, i) => expert(i, `Nom${i}`, 'P', `T${i}`));
        expect(propositions(nombreux, [], '')).toHaveLength(10);
    });

    it('préremplissage au nom de l’expéditeur (nom en majuscules)', () => {
        const p = preremplissage('Léa', 'Martin');
        expect(p.expediteur).toBe('Léa MARTIN');
        expect(p.sujet).toBe("De la part de Léa MARTIN: demande d'affectation");
        expect(p.message.startsWith('Bonjour,\n\n')).toBe(true);
        expect(p.message.endsWith('En te remerciant par avance,\nLéa MARTIN')).toBe(true);
    });

    it('fin avant le début refusée', () => {
        expect(erreurDates('2031-08-04', '2031-08-01')).toBe(ERREUR_DATES);
        expect(erreurDates('2031-08-04', '2031-08-04')).toBe('');
        expect(erreurDates('', '2031-08-01')).toBe('');
    });
});
