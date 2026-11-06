import { afterEach, describe, expect, it, vi } from 'vitest';
import { imprimerCalendrierRessource, moisTelechargeables, nomFichierPlanning } from './exports';

describe('téléchargement du planning', () => {
    it('douze mois passés, mois courant présélectionné, trois mois à venir', () => {
        const mois = moisTelechargeables(new Date(2026, 10, 6));
        expect(mois).toHaveLength(16);
        expect(mois[0]).toEqual({ valeur: '2025-11', libelle: 'Novembre 2025', courant: false });
        expect(mois[12]).toEqual({ valeur: '2026-11', libelle: 'Novembre 2026', courant: true });
        expect(mois.map(m => m.valeur).slice(-3)).toEqual(['2026-12', '2027-01', '2027-02']);
        expect(mois.filter(m => m.courant)).toHaveLength(1);
    });

    it('nom du fichier : mois exporté et horodatage local', () => {
        expect(nomFichierPlanning('2026-03', new Date(2026, 10, 6, 9, 5))).toBe(
            'Expert_Planning_202603_Sauvegarde_de_2026-11-06_09-05.csv'
        );
    });
});

describe('impression du calendrier d’une ressource', () => {
    afterEach(() => vi.useRealTimers());

    it('impression demandée une seule fois (chargement de la page, ou 500 ms à défaut)', () => {
        vi.useFakeTimers();
        const fenetre = {
            document: { write: vi.fn(), close: vi.fn() },
            print: vi.fn(),
            onload: null as null | (() => void)
        };
        vi.spyOn(window, 'open').mockReturnValue(fenetre as unknown as Window);
        imprimerCalendrierRessource('<table></table>');
        expect(fenetre.document.write.mock.calls[0]?.[0]).toContain('<table></table>');
        fenetre.onload?.();
        vi.advanceTimersByTime(600);
        expect(fenetre.print).toHaveBeenCalledTimes(1);
    });
});
