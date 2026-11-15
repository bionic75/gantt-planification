import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDeploiements, type DeploiementCarte, type StatutDeploiement } from '@/api/deploiements';
import { ErreurApi } from '@/api/client';
import { emettre } from '@/evenements';
import { useDeploiementsStore } from './magasin-deploiements';

vi.mock('@/api/deploiements', () => ({
    apiDeploiements: {
        carte: vi.fn(),
        creer: vi.fn(),
        modifier: vi.fn(),
        supprimer: vi.fn(),
        reordonner: vi.fn(),
        affecter: vi.fn(),
        retirer: vi.fn(),
        importerMes: vi.fn()
    }
}));
vi.mock('@/evenements', () => ({ emettre: vi.fn() }));
const api = vi.mocked(apiDeploiements);

const service: StatutDeploiement = {
    id: 1,
    label: 'En service',
    color: '#2e7d32',
    pattern: 'plein',
    position: 0,
    is_service: 1,
    nb_samu: 2
};
const test: StatutDeploiement = {
    id: 2,
    label: 'En test',
    color: '#f9a825',
    pattern: 'diag',
    position: 1,
    is_service: 0,
    nb_samu: 0
};
const samu: DeploiementCarte = {
    id: 9,
    samu_name: 'SAMU 75',
    location_id: 3,
    latitude: 48.85,
    longitude: 2.35,
    status_id: null,
    date_mise_en_service: null
};

beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    api.carte.mockResolvedValue({
        statuses: [service, test],
        palette: ['#111111', '#222222'],
        patterns: ['plein', 'diag'],
        deployments: [samu]
    });
    api.retirer.mockResolvedValue({ success: true });
    api.affecter.mockResolvedValue({ success: true });
    api.reordonner.mockResolvedValue({ statuses: [test, service] });
    api.supprimer.mockResolvedValue({ success: true });
});

describe('déploiements (statuts)', () => {
    it('charge les statuts, la palette et les SAMU', async () => {
        const m = useDeploiementsStore();
        await m.charger();
        expect(m.palette).toEqual(['#111111', '#222222']);
        expect(m.motifs).toEqual(['plein', 'diag']);
        expect(m.statuts).toEqual([service, test]);
        expect(m.deploiements).toEqual([samu]);
    });

    it('envoie la date seulement pour un statut « En service »', async () => {
        const m = useDeploiementsStore();
        await m.charger();
        await m.affecter(9, 1, '2027-06-15');
        expect(api.affecter).toHaveBeenLastCalledWith(9, { status_id: 1, date_mise_en_service: '2027-06-15' });
        await m.affecter(9, 2, '2027-06-15');
        expect(api.affecter).toHaveBeenLastCalledWith(9, { status_id: 2 });
        await m.affecter(9, null);
        expect(api.affecter).toHaveBeenLastCalledWith(9, { status_id: null });
    });

    it('garde le message du serveur quand un statut utilisé ne se supprime pas', async () => {
        api.supprimer.mockRejectedValue(new ErreurApi(409, 'Statut utilisé par : SAMU 75'));
        const m = useDeploiementsStore();
        await m.charger();
        await m.supprimerStatut(2);
        expect(m.erreur).toBe('Statut utilisé par : SAMU 75');
        expect(emettre).not.toHaveBeenCalled();
    });

    it('déplace un statut d’un cran en envoyant l’ordre complet', async () => {
        const m = useDeploiementsStore();
        await m.charger();
        await m.deplacerStatut(2, -1);
        expect(api.reordonner).toHaveBeenCalledWith([2, 1]);
        await m.deplacerStatut(2, -1);
        expect(api.reordonner).toHaveBeenCalledTimes(1);
    });

    it('prévient la carte après une écriture réussie', async () => {
        const m = useDeploiementsStore();
        await m.charger();
        await m.affecter(9, 2);
        expect(emettre).toHaveBeenCalledWith('statuts-deploiements-modifies');
    });

    it('ajoute un SAMU sans statut, et le retire', async () => {
        const m = useDeploiementsStore();
        await m.charger();
        await m.ajouterSamu(12);
        expect(api.affecter).toHaveBeenLastCalledWith(12, { status_id: null });
        await m.retirerSamu(12);
        expect(api.retirer).toHaveBeenCalledWith(12);
    });

    it('annonce combien de mises en service ont été reprises des événements', async () => {
        const m = useDeploiementsStore();
        await m.charger();
        api.importerMes.mockResolvedValue({ imported: 3 });
        await m.reprendreMisesEnService();
        expect(m.information).toContain('3 SAMU');
        api.importerMes.mockResolvedValue({ imported: 0 });
        await m.reprendreMisesEnService();
        expect(m.information).toBe('Aucun SAMU à mettre à jour.');
    });

    it('crée et modifie un statut avec son motif', async () => {
        api.creer.mockResolvedValue(test);
        api.modifier.mockResolvedValue(test);
        const m = useDeploiementsStore();
        await m.charger();
        await m.ajouterStatut(' En test ', '#f9a825', 'diag');
        expect(api.creer).toHaveBeenCalledWith({ label: 'En test', color: '#f9a825', pattern: 'diag' });
        await m.modifierStatut(2, { label: 'En test', color: '#f9a825', pattern: 'points' });
        expect(api.modifier).toHaveBeenCalledWith(2, { label: 'En test', color: '#f9a825', pattern: 'points' });
    });

    it('dépose un statut à une nouvelle place et envoie l’ordre complet', async () => {
        const trois: StatutDeploiement = { ...test, id: 3, label: 'Troisième', position: 2 };
        api.carte.mockResolvedValue({ statuses: [service, test, trois], palette: [], patterns: [], deployments: [] });
        api.reordonner.mockResolvedValue({ statuses: [trois, service, test] });
        const m = useDeploiementsStore();
        await m.charger();
        await m.deposerStatut(3, 0);
        expect(api.reordonner).toHaveBeenCalledWith([3, 1, 2]);
        api.reordonner.mockClear();
        await m.deposerStatut(3, 0);
        expect(api.reordonner).not.toHaveBeenCalled();
    });
});
