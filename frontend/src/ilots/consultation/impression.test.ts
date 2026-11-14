import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ajusterUnePage, imprimerCalendrierEvenements, imprimerCalendrierMensuel } from './impression';

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
            close: () => {},
            open: () => {},
            querySelectorAll: () => []
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

    it('ni entête « Vue Calendrier Mensuel » ni ligne du mois avec flèches', () => {
        const c = document.createElement('div');
        c.innerHTML =
            '<div class="gp-cm-entete"><div class="gp-cm-nav"><button>◀</button><h2>Septembre 2031</h2><button>▶</button></div><p>Sous-titre</p></div><table></table>';
        imprimerCalendrierMensuel('Vue Calendrier Mensuel', 'Septembre 2031', c);
        expect(fenetre.html).not.toContain('<h3');
        expect(fenetre.html).not.toContain('◀');
        expect(fenetre.html).not.toContain('▶');
        expect(fenetre.html).toContain('Sous-titre');
        expect(c.querySelector('.gp-cm-nav')).not.toBeNull();
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

describe('impression du calendrier des congés et événements', () => {
    it('une seule page A4 paysage, logo de calendrier, titre du mois et légende', () => {
        const legende = document.createElement('div');
        legende.innerHTML = '<span class="gp-ce-type">FORMATION</span>';
        imprimerCalendrierEvenements('Novembre 2026', contenu(), legende);
        expect(fenetre.html).toContain('class="gp-logo"');
        expect(fenetre.html).toContain('Novembre 2026');
        expect(fenetre.html).toContain('FORMATION');
        expect(fenetre.html).toContain('id="feuille"');
    });

    it('impression demandée puis fenêtre fermée', () => {
        imprimerCalendrierEvenements('Novembre 2026', contenu());
        vi.advanceTimersByTime(600);
        expect(fenetre.impressions).toBe(1);
    });

    it('tableau trop haut : réduit pour tenir dans la zone', () => {
        const table = document.createElement('table');
        const zone = document.createElement('div');
        zone.id = 'tableau';
        zone.appendChild(table);
        Object.defineProperty(zone, 'clientHeight', { value: 400 });
        Object.defineProperty(table, 'offsetHeight', { value: 800 });
        const doc = { getElementById: () => zone } as unknown as Document;
        ajusterUnePage(doc);
        expect(table.style.transform).toMatch(/^scale\(0\.49/);
        expect(table.style.width).toMatch(/^200/);
    });

    it('tableau qui tient : étiré sur la zone, sans réduction', () => {
        const table = document.createElement('table');
        const zone = document.createElement('div');
        zone.id = 'tableau';
        zone.appendChild(table);
        Object.defineProperty(zone, 'clientHeight', { value: 400 });
        Object.defineProperty(table, 'offsetHeight', { value: 300 });
        ajusterUnePage({ getElementById: () => zone } as unknown as Document);
        expect(table.style.transform).toBe('');
        expect(table.style.height).toBe('100%');
    });
});
