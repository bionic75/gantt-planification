// Placement des étiquettes sans chevauchement (GIF) : chaque étiquette part de son point d'ancrage (centre du
// département) et s'en écarte, par anneaux successifs, jusqu'à trouver une place libre.

export interface EtiquetteAPlacer {
    id: string;
    /** Point d'ancrage (centre du département), en pixels */
    x: number;
    y: number;
    largeur: number;
    hauteur: number;
}
export interface EtiquettePlacee extends EtiquetteAPlacer {
    /** Centre de l'étiquette placée */
    cx: number;
    cy: number;
    /** Écartée de son ancrage au point d'avoir besoin d'un trait de rappel */
    deplacee: boolean;
}
interface Boite {
    g: number;
    h: number;
    d: number;
    b: number;
}

const boite = (cx: number, cy: number, l: number, h: number): Boite => ({
    g: cx - l / 2,
    h: cy - h / 2,
    d: cx + l / 2,
    b: cy + h / 2
});
const surface = (a: Boite, b: Boite) =>
    Math.max(0, Math.min(a.d, b.d) - Math.max(a.g, b.g)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.h, b.h));
const dehors = (b: Boite, l: number, h: number) =>
    Math.max(0, -b.g) + Math.max(0, b.d - l) + Math.max(0, -b.h) + Math.max(0, b.b - h);

/** Positions candidates : l'ancrage, puis des anneaux de 8 directions de plus en plus éloignés (plus larges que hauts) */
function* candidats(l: number, h: number) {
    yield [0, 0] as const;
    for (let anneau = 1; anneau <= 6; anneau++) {
        for (const [dx, dy] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1]
        ] as const)
            yield [dx * anneau * l * 0.55, dy * anneau * h * 1.05] as const;
    }
}

/**
 * Place les étiquettes dans une zone `largeur` × `hauteur` : première position sans chevauchement, à défaut celle
 * qui en a le moins. L'ordre d'entrée est l'ordre de priorité (la première étiquette garde son ancrage).
 */
export function placerEtiquettes(
    etiquettes: EtiquetteAPlacer[],
    largeur: number,
    hauteur: number,
    marge = 2
): EtiquettePlacee[] {
    const placees: Boite[] = [];
    return etiquettes.map(e => {
        let meilleur = { cx: e.x, cy: e.y, cout: Infinity };
        for (const [dx, dy] of candidats(e.largeur, e.hauteur)) {
            const b = boite(e.x + dx, e.y + dy, e.largeur + marge * 2, e.hauteur + marge * 2);
            const cout = placees.reduce((s, p) => s + surface(b, p), 0) + dehors(b, largeur, hauteur) * e.hauteur;
            if (cout < meilleur.cout) meilleur = { cx: e.x + dx, cy: e.y + dy, cout };
            if (cout === 0) break;
        }
        placees.push(boite(meilleur.cx, meilleur.cy, e.largeur + marge * 2, e.hauteur + marge * 2));
        const deplacee = Math.hypot(meilleur.cx - e.x, meilleur.cy - e.y) > e.hauteur * 0.6;
        return { ...e, cx: meilleur.cx, cy: meilleur.cy, deplacee };
    });
}
