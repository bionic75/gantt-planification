import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUtilisateurs, type Utilisateur } from '@/api/utilisateurs';
import { emettre } from '@/liaison';
import { useUtilisateursStore } from './magasin';

vi.mock('@/api/utilisateurs', () => ({
    apiUtilisateurs: { liste: vi.fn(), ressources: vi.fn(), journaliser: vi.fn() }
}));
vi.mock('@/liaison', () => ({ emettre: vi.fn() }));
const api = vi.mocked(apiUtilisateurs);

beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    api.liste.mockResolvedValue([{ id: 1 } as Utilisateur]);
    api.journaliser.mockResolvedValue(undefined);
});

describe('gestion des utilisateurs', () => {
    it('chargement ; liste conservée si l’appel échoue', async () => {
        const s = useUtilisateursStore();
        await s.charger();
        expect(s.utilisateurs).toHaveLength(1);
        expect(s.charge).toBe(true);
        api.liste.mockRejectedValue(new Error('x'));
        await s.charger();
        expect(s.utilisateurs).toHaveLength(1);
    });

    it('après une modification : liste relue, ancien code prévenu, journal si demandé', async () => {
        const s = useUtilisateursStore();
        await s.apresModification();
        expect(api.liste).toHaveBeenCalledTimes(1);
        expect(emettre).toHaveBeenCalledWith('utilisateurs-modifies');
        expect(api.journaliser).not.toHaveBeenCalled();
        await s.apresModification(true);
        expect(api.journaliser).toHaveBeenCalledWith('Modification du planning');
    });
});
