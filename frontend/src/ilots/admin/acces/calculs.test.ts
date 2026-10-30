import { describe, expect, it } from 'vitest';
import type { CompteAcces } from '@/api/acces';
import { grille, nomCompte, ONGLETS, PROFILS, suggestions, verrouillee } from './calculs';

const compte = (id: number, nom = 'Durand', prenom = 'Léa'): CompteAcces => ({
    id,
    nom,
    prenom,
    email: null,
    username: `u${id}`
});

describe('accès aux applications', () => {
    it('nom affiché : NOM Prénom', () => {
        expect(nomCompte(compte(1, "d'Artagnan", 'Charles'))).toBe("D'ARTAGNAN Charles");
    });

    it('suggestions : comptes déjà autorisés exclus', () => {
        expect(suggestions([compte(1), compte(2), compte(3)], [compte(2)]).map(c => c.id)).toEqual([1, 3]);
    });
});

describe('accès aux onglets', () => {
    it('grille complète : cases absentes décochées, Administration de l’administrateur toujours cochée', () => {
        const g = grille({ user: { evenements: true }, admin: { admin: false } });
        expect(Object.keys(g)).toEqual(PROFILS.map(([p]) => p));
        for (const [p] of PROFILS) expect(Object.keys(g[p] ?? {})).toEqual(ONGLETS.map(([t]) => t));
        expect(g.user?.evenements).toBe(true);
        expect(g.user?.cra).toBe(false);
        expect(g.admin?.admin).toBe(true);
        expect(verrouillee('admin', 'admin')).toBe(true);
        expect(verrouillee('rh', 'admin')).toBe(false);
    });
});
