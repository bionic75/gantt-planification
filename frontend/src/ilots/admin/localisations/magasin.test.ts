import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiLocalisations, type Localisation } from '@/api/localisations';
import { emettre } from '@/liaison';
import { useLocalisationsStore } from './magasin';

vi.mock('@/api/localisations', () => ({
    apiLocalisations: {
        liste: vi.fn(),
        creer: vi.fn(),
        modifier: vi.fn(),
        supprimer: vi.fn(),
        usage: vi.fn(),
        importer: vi.fn()
    }
}));
vi.mock('@/liaison', () => ({ emettre: vi.fn() }));
const api = vi.mocked(apiLocalisations);

const chu: Localisation = { id: 7, libelle_long: 'CHU', libelle_court: 'C', adresse: null, latitude: 1, longitude: 2 };
const donnees = { libelle_long: 'X', libelle_court: 'Y', adresse: null, latitude: null, longitude: null };

beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    api.liste.mockResolvedValue({ locations: [chu] });
});

describe('localisations (administration)', () => {
    it('chargement ; liste vide si l’appel échoue', async () => {
        const s = useLocalisationsStore();
        await s.charger();
        expect(s.localisations).toEqual([chu]);
        expect(s.charge).toBe(true);
        api.liste.mockRejectedValue(new Error('x'));
        await s.charger();
        expect(s.localisations).toEqual([]);
    });

    it('enregistrement : création, ou modification de la localisation en cours ; ancien code prévenu', async () => {
        const s = useLocalisationsStore();
        await s.enregistrer(donnees);
        expect(api.creer).toHaveBeenCalledWith(donnees);
        s.modifier(chu);
        expect(s.ouvertureFormulaire).toBe(1);
        await s.enregistrer(donnees);
        expect(api.modifier).toHaveBeenCalledWith(7, donnees);
        expect(s.edition).toBeNull();
        expect(emettre).toHaveBeenCalledWith('localisations-modifiees');
    });

    it('usages nommés, localisation ignorée si son usage est illisible', async () => {
        const s = useLocalisationsStore();
        await s.charger();
        api.usage.mockResolvedValueOnce({ count: 1, events: [] }).mockRejectedValueOnce(new Error('x'));
        expect(await s.usages([7, 8])).toEqual([{ id: 7, nom: 'CHU', count: 1, events: [] }]);
    });

    it('suppression une à une : échecs non comptés, planning prévenu, message', async () => {
        const s = useLocalisationsStore();
        api.supprimer.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'));
        await s.supprimer([1, 2]);
        expect(api.supprimer).toHaveBeenCalledTimes(2);
        expect(emettre).toHaveBeenCalledWith('evenements-modifies');
        expect(s.statut?.texte).toBe('✅ 1 localisation(s) supprimée(s).');
    });

    it('import sans conflit', async () => {
        const s = useLocalisationsStore();
        api.importer.mockResolvedValue({ inserted: 1 });
        await s.importer('ll;lc;lat;lng\nNEUF;N;1;2');
        expect(api.importer).toHaveBeenCalledWith([
            { libelle_long: 'NEUF', libelle_court: 'N', adresse: '', latitude: 1, longitude: 2 }
        ]);
        expect(s.statut?.texte).toBe('✅ 1 localisation(s) importée(s) avec succès.');
        expect(s.conflits).toEqual([]);
    });

    it('import : fichier illisible signalé avec son détail ; erreur réseau', async () => {
        const s = useLocalisationsStore();
        await s.importer('a;b\n1;2');
        expect(s.statut).toEqual({
            texte: '⚠️ Colonnes libelle_long et libelle_court introuvables.',
            detail: { separateur: ';', entetes: ['a', 'b'] }
        });
        api.importer.mockRejectedValue(new Error('hors ligne'));
        await s.importer('ll;lc;lat;lng\nNEUF;N;1;2');
        expect(s.statut?.texte).toBe('❌ Erreur réseau : hors ligne');
    });

    it('import avec conflit, puis choix appliqués', async () => {
        const s = useLocalisationsStore();
        await s.charger();
        api.importer.mockResolvedValue({ inserted: 1 });
        await s.importer('ll;lc;lat;lng\nNEUF;N;1;2\nCHU;Z;1;2');
        expect(s.statut?.texte).toBe(
            "⚠️ 1 ajouté(s) | 1 avec données différentes — choisissez l'action pour chaque entrée existante."
        );
        expect(s.conflits).toHaveLength(1);
        s.conflits[0]!.action = 'overwrite';
        await s.appliquerConflits();
        expect(api.modifier).toHaveBeenCalledWith(7, expect.objectContaining({ libelle_court: 'Z' }));
        expect(s.conflits).toEqual([]);
        expect(s.statut?.texte).toBe('✅ 1 localisation(s) mise(s) à jour avec les données du CSV.');
    });

    it('choix appliqués avec une erreur', async () => {
        const s = useLocalisationsStore();
        await s.charger();
        await s.importer('ll;lc;lat;lng\nCHU;Z;1;2');
        s.conflits[0]!.action = 'manual';
        api.modifier.mockRejectedValue(new Error('x'));
        await s.appliquerConflits();
        expect(s.statut?.texte).toBe('⚠️ 0 mise(s) à jour, 1 erreur(s).');
    });
});
