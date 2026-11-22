import { describe, expect, it } from 'vitest';
import { miseEnPageParDefaut } from './mise-en-page';
import { dessinerMiseEnPage, type DonneesRendu } from './mise-en-page-rendu';

/** Contexte factice : 6 px par caractère, aucun dessin */
function faux() {
    const appels: string[] = [];
    const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 6 }) } as Record<string, unknown>, {
        get: (cible, nom: string) => cible[nom] ?? ((...a: unknown[]) => void appels.push(`${nom}:${a.join(',')}`)),
        set: (cible, nom: string, valeur) => {
            cible[nom] = valeur;
            appels.push(`set:${nom}=${valeur}`);
            return true;
        }
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, appels };
}
const donnees = (images = new Map<number, CanvasImageSource>()): DonneesRendu => ({
    images,
    statuts: [{ statut: 'En service', couleur: '#2e7d32', masque: false }],
    compteur: { date: '01/02/2027', detail: '3 / 10 mise(s) en service' }
});

describe('dessin de la mise en page', () => {
    it('par défaut : le compteur seul (titre vide, légende masquée), dans l’image', () => {
        const { ctx } = faux();
        const boites = dessinerMiseEnPage(ctx, 800, 600, miseEnPageParDefaut(), donnees());
        expect(boites.map(b => b.id)).toEqual(['compteur']);
        const b = boites[0]!;
        expect(b.x).toBeCloseTo(0.72 * 800);
        expect(b.y).toBeCloseTo(0.86 * 600);
    });

    it('titre, légende et logo visibles : une boîte chacun, le logo au-dessus (dernier)', () => {
        const { ctx } = faux();
        const m = miseEnPageParDefaut();
        m.titre.texte = 'Déploiement SI-SAMU';
        m.legende.visible = true;
        m.logos = [{ id: 7, nom: 'a.png', largeur: 200, hauteur: 100, taille: 60, x: 0.5, y: 0.5 }];
        const boites = dessinerMiseEnPage(ctx, 800, 600, m, donnees(new Map([[7, {} as CanvasImageSource]])));
        expect(boites.map(b => b.id)).toEqual(['legende', 'compteur', 'titre', 'logo-7']);
        const titre = boites.find(b => b.id === 'titre')!;
        expect(titre.x).toBeCloseTo(0.03 * 800);
        expect(titre.largeur).toBeGreaterThan('Déploiement SI-SAMU'.length * 6);
        const logo = boites.at(-1)!;
        // 120 × 60 de logo + 4 px de marge de chaque côté
        expect([logo.largeur, logo.hauteur]).toEqual([128, 68]);
    });

    it('titre sur plusieurs lignes : boîte aussi large que la plus longue, plus haute qu’une ligne seule', () => {
        const { ctx } = faux();
        const m = miseEnPageParDefaut();
        m.titre.texte = 'Déploiement';
        const une = dessinerMiseEnPage(ctx, 800, 600, m, donnees()).find(b => b.id === 'titre')!;
        m.titre.texte = 'Déploiement\n\nSI-SAMU\n  national ';
        const trois = dessinerMiseEnPage(ctx, 800, 600, m, donnees()).find(b => b.id === 'titre')!;
        // Lignes vides ignorées : trois lignes
        expect(trois.hauteur).toBeGreaterThan(une.hauteur * 2);
        expect(trois.largeur).toBeCloseTo(une.largeur);
    });

    it('alignement du titre : à gauche, centré ou à droite dans sa boîte', () => {
        const x = (alignement: 'left' | 'center' | 'right') => {
            const { ctx, appels } = faux();
            const m = miseEnPageParDefaut();
            m.titre.texte = 'AAAAAAAA\nBB';
            m.titre.alignement = alignement;
            dessinerMiseEnPage(ctx, 800, 600, m, donnees());
            // Abscisse du texte « BB » (la ligne courte)
            const appel = appels.find(a => a.startsWith('fillText:BB'))!;
            return Number(appel.split(',')[1]);
        };
        expect(x('left')).toBeLessThan(x('center'));
        expect(x('center')).toBeLessThan(x('right'));
    });

    it('couleurs choisies : fond (avec opacité) et texte du titre, fond du compteur', () => {
        const { ctx, appels } = faux();
        const m = miseEnPageParDefaut();
        m.titre.texte = 'T';
        m.titre.couleurFond = '#ff0000';
        m.titre.opaciteFond = 0.5;
        m.titre.couleurTexte = '#00ff00';
        m.compteur.couleurFond = '#0000ff';
        m.compteur.couleurTexte = '#123456';
        dessinerMiseEnPage(ctx, 800, 600, m, donnees());
        expect(appels).toContain('set:fillStyle=rgba(255,0,0,0.5)');
        expect(appels).toContain('set:fillStyle=#00ff00');
        expect(appels).toContain('set:fillStyle=rgba(0,0,255,0.88)');
        expect(appels).toContain('set:fillStyle=#123456');
    });

    it('couleur invalide : couleur par défaut, jamais une chaîne arbitraire dans le canvas', () => {
        const { ctx, appels } = faux();
        const m = miseEnPageParDefaut();
        m.titre.texte = 'T';
        m.titre.couleurTexte = 'url(javascript:alert(1))';
        dessinerMiseEnPage(ctx, 800, 600, m, donnees());
        expect(appels.some(a => a.includes('javascript'))).toBe(false);
        expect(appels).toContain('set:fillStyle=#ffffff');
    });

    it('légende sans aucune ligne (statuts masqués, pas de texte) : pas de boîte ; logo sans image : ignoré', () => {
        const { ctx } = faux();
        const m = miseEnPageParDefaut();
        m.legende.visible = true;
        m.logos = [{ id: 1, nom: 'x', largeur: 10, hauteur: 10, taille: 40, x: 0, y: 0 }];
        const d = donnees();
        d.statuts = [{ statut: 'Prévu', couleur: '#f00', masque: true }];
        expect(dessinerMiseEnPage(ctx, 800, 600, m, d).map(b => b.id)).toEqual(['compteur']);
    });

    it('la taille suit la largeur de l’image exportée', () => {
        const { ctx } = faux();
        const m = miseEnPageParDefaut();
        const petit = dessinerMiseEnPage(ctx, 800, 600, m, donnees())[0]!;
        const grand = dessinerMiseEnPage(ctx, 1600, 1200, m, donnees())[0]!;
        expect(grand.hauteur / petit.hauteur).toBeCloseTo(2, 1);
    });
});
