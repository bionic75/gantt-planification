import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imprimerCalendrierMensuel } from './impression';

/** Fenêtre d'impression simulée : document écrit et nombre de demandes d'impression */
function fenetreSimulee() {
    const fenetre = {
        html: '',
        impressions: 0,
        onload: null as null | (() => void),
        document: {
            write: (h: string) => {
                fenetre.html += h;
            },
            close: () => {}
        },
        focus: () => {},
        print: () => {
            fenetre.impressions++;
        },
        close: () => {}
    };
    return fenetre;
}

let fenetre: ReturnType<typeof fenetreSimulee>;

beforeEach(() => {
    vi.useFakeTimers();
    fenetre = fenetreSimulee();
    vi.spyOn(window, 'open').mockReturnValue(fenetre as unknown as Window);
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const contenu = () => {
    const div = document.createElement('div');
    div.innerHTML = '<span>Aucun</span><table></table>';
    return div;
};

describe('impression du calendrier mensuel', () => {
    it('sous-titre : le mois affiché (pas le premier texte du calendrier)', () => {
        imprimerCalendrierMensuel('Vue Calendrier Mensuel', 'Septembre 2031', contenu());
        expect(fenetre.html).toContain('<title>Vue Calendrier Mensuel</title>');
        expect(fenetre.html).toMatch(/<h2[^>]*>Septembre 2031<\/h2>/);
    });

    it('impression demandée une seule fois, au chargement de la page', () => {
        imprimerCalendrierMensuel('Vue Calendrier Mensuel', 'Septembre 2031', contenu());
        fenetre.onload?.();
        vi.advanceTimersByTime(1000);
        expect(fenetre.impressions).toBe(1);
    });

    it('impression demandée une seule fois après 500 ms, sans chargement signalé', () => {
        imprimerCalendrierMensuel('Vue Calendrier Mensuel', 'Septembre 2031', contenu());
        vi.advanceTimersByTime(499);
        expect(fenetre.impressions).toBe(0);
        vi.advanceTimersByTime(1);
        fenetre.onload?.();
        expect(fenetre.impressions).toBe(1);
    });
});
