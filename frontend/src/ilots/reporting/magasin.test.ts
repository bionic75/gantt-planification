import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiReporting, type RessourceReporting } from '@/api/reporting';
import { useSessionStore } from '@/stores/session';
import type { Session } from '@/api/types';
import { useReportingStore } from './magasin';

vi.mock('@/api/reporting', () => ({ apiReporting: { ressources: vi.fn(), comptes: vi.fn() } }));
const api = vi.mocked(apiReporting);

const ressource = (id: number, nom: string, fonction: string | null, actif = 1) =>
    ({ id, nom, prenom: 'P', fonction, actif }) as RessourceReporting;

function profil(activeProfile: string) {
    vi.spyOn(useSessionStore(), 'charger').mockResolvedValue({ activeProfile } as Session);
}

beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    api.ressources.mockResolvedValue([
        ressource(1, 'Zed', 'Formateur'),
        ressource(2, 'Abel', 'Coordinateur'),
        ressource(3, 'Inactif', 'Autre', 0),
        ressource(4, 'Bob', 'Formateur')
    ]);
    api.comptes.mockResolvedValue([
        { id: 9, nom: 'Durand', prenom: 'Lea', username: 'ldurand' },
        { id: 8, nom: 'Albert', prenom: 'Jo', username: 'jalbert' }
    ]);
});

describe('référentiels du reporting', () => {
    it('administrateur : experts actifs triés, fonctions uniques triées, comptes de tous les utilisateurs', async () => {
        profil('admin');
        const s = useReportingStore();
        await s.charger();
        expect(s.experts.map(e => e.nom)).toEqual(['Abel', 'Bob', 'Zed']);
        expect(s.fonctions).toEqual(['Coordinateur', 'Formateur']);
        expect(api.comptes).toHaveBeenCalledWith(true);
        expect(s.comptesConnexions.map(c => c.nom)).toEqual(['Albert', 'Durand']);
    });

    it('autre profil (comme l’ancien écran) : pas d’experts, participants de la liste publique', async () => {
        profil('rh');
        const s = useReportingStore();
        await s.charger();
        expect(api.ressources).not.toHaveBeenCalled();
        expect(s.experts).toEqual([]);
        expect(api.comptes).toHaveBeenCalledWith(false);
        expect(s.participants).toHaveLength(2);
        expect(s.comptesConnexions).toEqual([]);
    });

    it('chargement une seule fois (appels simultanés regroupés)', async () => {
        profil('admin');
        const s = useReportingStore();
        await Promise.all([s.charger(), s.charger()]);
        await s.charger();
        expect(api.ressources).toHaveBeenCalledTimes(1);
    });
});
