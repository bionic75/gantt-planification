import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiLieux, type Lieu, type ListeLieux, type MetaLieux, type TrajetsLieu } from '@/api/poi';
import { useLieuxStore } from './magasin';

vi.mock('@/api/poi', () => ({
    apiLieux: {
        meta: vi.fn(),
        liste: vi.fn(),
        trajets: vi.fn(),
        noter: vi.fn(),
        supprimer: vi.fn()
    }
}));

const api = vi.mocked(apiLieux);

const META: MetaLieux = {
    locations: [],
    creators: [],
    categories: ['hebergement', 'restaurant', 'bar'],
    counts: { 1: { restaurant: 2, bar: 1 }, 2: { hebergement: 4 } }
};
const lieu = (id: number) => ({ id, name: `Lieu ${id}` }) as Lieu;
const LISTE: ListeLieux = { pois: [lieu(1), lieu(2)], isAdmin: false, userId: 7 };

beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    api.meta.mockResolvedValue(META);
    api.liste.mockResolvedValue(LISTE);
});
afterEach(() => vi.useRealTimers());

describe('magasin TripAdVisor', () => {
    it('charge les SAMU-SAS et les lieux ; compteurs par typologie selon le SAMU-SAS choisi', async () => {
        const s = useLieuxStore();
        await s.charger();
        expect(s.lieux).toHaveLength(2);
        expect(s.userId).toBe(7);
        expect(s.compteurs).toEqual({ parCategorie: { hebergement: 4, restaurant: 2, bar: 1 }, total: 7 });

        await s.filtrer('loc', '1');
        expect(s.compteurs).toEqual({ parCategorie: { hebergement: 0, restaurant: 2, bar: 1 }, total: 3 });
    });

    it('choisir un SAMU-SAS remet les autres filtres à zéro', async () => {
        const s = useLieuxStore();
        await s.filtrer('cat', 'bar');
        await s.filtrer('creator', '3');
        expect(s.sansFiltre).toBe(false);
        await s.filtrer('loc', '2');
        expect(s.filtres).toEqual({ loc: '2', cat: '', creator: '', q: '' });
        expect(api.liste).toHaveBeenLastCalledWith({ loc: '2', cat: '', creator: '', q: '' });
    });

    it('recherche lancée après une pause dans la saisie', async () => {
        vi.useFakeTimers();
        const s = useLieuxStore();
        s.rechercher('bi');
        s.rechercher('bistrot');
        expect(api.liste).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300);
        expect(api.liste).toHaveBeenCalledTimes(1);
        expect(api.liste).toHaveBeenCalledWith(expect.objectContaining({ q: 'bistrot' }));
    });

    it('erreur de chargement conservée pour affichage', async () => {
        api.liste.mockRejectedValue(new Error('Erreur 500'));
        const s = useLieuxStore();
        await s.charger();
        expect(s.erreur).toBe('Erreur 500');
    });

    it('une action recharge la liste (avis ouverts mis à jour) et efface le trajet affiché', async () => {
        const s = useLieuxStore();
        api.trajets.mockResolvedValue({ modes: { walk: { error: 'x' }, car: {}, transit: {} } } as TrajetsLieu);
        await s.basculerTrajet(1);
        expect(s.trajet?.mode).toBe('car');
        const version = s.version;

        await s.noter(1, 4);
        expect(api.noter).toHaveBeenCalledWith(1, 4);
        expect(s.version).toBe(version + 1);
        expect(s.trajet).toBeNull();
    });

    it('un seul trajet ouvert ; second clic sur le même lieu : fermé', async () => {
        const s = useLieuxStore();
        api.trajets.mockRejectedValue(new Error("Ce SAMU-SAS n'est pas géolocalisé"));
        await s.basculerTrajet(1);
        expect(s.trajet).toMatchObject({ id: 1, erreur: "Ce SAMU-SAS n'est pas géolocalisé" });
        await s.basculerTrajet(2);
        expect(s.trajet?.id).toBe(2);
        await s.basculerTrajet(2);
        expect(s.trajet).toBeNull();
    });

    it('suppression : avis du lieu refermés', async () => {
        const s = useLieuxStore();
        s.basculerAvis(1);
        s.basculerAvis(2);
        await s.supprimer(1);
        expect(api.supprimer).toHaveBeenCalledWith(1);
        expect(s.avisOuverts).toEqual([2]);
    });
});
