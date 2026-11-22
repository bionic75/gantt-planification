// Dessin de la mise en page du GIF / MP4 sur un canvas : le même pour l'aperçu de la fenêtre de conception et pour
// chaque image exportée (ce que l'on voit est ce que l'on obtient).
import {
    BORNES,
    borner,
    dimensionsLogo,
    lignesLegende,
    police,
    REFERENCE_GIF,
    type BoiteElement,
    type MiseEnPage
} from './mise-en-page';

export interface DonneesRendu {
    /** Images des logos, par identifiant */
    images: ReadonlyMap<number, CanvasImageSource>;
    /** Statuts de la carte (couleurs de la légende) */
    statuts: { statut: string; couleur: string; masque: boolean }[];
    /** Textes du compteur : date puis « n / total libellé » */
    compteur: { date: string; detail: string };
}

type Contexte = CanvasRenderingContext2D;

/** Dessine les éléments visibles ; renvoie leurs rectangles (pixels), dans l'ordre de dessin (le dernier est au-dessus) */
export function dessinerMiseEnPage(
    ctx: Contexte,
    largeur: number,
    hauteur: number,
    m: MiseEnPage,
    d: DonneesRendu
): BoiteElement[] {
    const e = largeur / REFERENCE_GIF;
    const boites: BoiteElement[] = [];
    ctx.save();
    if (m.legende.visible) {
        const b = legende(ctx, largeur, hauteur, m, d, e);
        if (b) boites.push(b);
    }
    if (m.compteur.visible) boites.push(compteur(ctx, largeur, hauteur, m, d, e));
    if (m.titre.visible && m.titre.texte.trim()) boites.push(titre(ctx, largeur, hauteur, m, e));
    for (const l of m.logos) {
        const image = d.images.get(l.id);
        if (!image) continue;
        const { largeur: w, hauteur: h } = dimensionsLogo(l, largeur);
        const pad = Math.round(4 * e);
        const x = l.x * largeur;
        const y = l.y * hauteur;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(x, y, w + pad * 2, h + pad * 2);
        ctx.drawImage(image, x + pad, y + pad, w, h);
        boites.push({ id: `logo-${l.id}`, x, y, largeur: w + pad * 2, hauteur: h + pad * 2 });
    }
    ctx.restore();
    return boites;
}

function titre(ctx: Contexte, largeur: number, hauteur: number, m: MiseEnPage, e: number): BoiteElement {
    const t = m.titre;
    const tailleRef = borner(t.taille, BORNES.titre);
    const taille = tailleRef * e;
    const pad = taille * 0.4;
    ctx.font = police('bold', tailleRef, largeur, t.police);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const x = t.x * largeur;
    const y = t.y * hauteur;
    const texte = t.texte.trim();
    const l = Math.min(ctx.measureText(texte).width, largeur * 0.94 - pad * 2);
    ctx.fillStyle = 'rgba(26,35,126,0.92)';
    ctx.fillRect(x, y, l + pad * 2, taille + pad * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(texte, x + pad, y + pad + taille / 2, l);
    return { id: 'titre', x, y, largeur: l + pad * 2, hauteur: taille + pad * 2 };
}

function legende(
    ctx: Contexte,
    largeur: number,
    hauteur: number,
    m: MiseEnPage,
    d: DonneesRendu,
    e: number
): BoiteElement | null {
    const lg = m.legende;
    const lignes = lignesLegende(d.statuts, lg.statuts, lg.texte);
    if (!lignes.length) return null;
    const tailleRef = borner(lg.taille, BORNES.legende);
    const taille = tailleRef * e;
    const pas = taille * 1.45;
    const pad = taille * 0.6;
    const puce = taille * 0.9;
    ctx.font = police('', tailleRef, largeur, lg.police);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const texteMax = Math.max(...lignes.map(l => ctx.measureText(l.texte).width));
    const l = Math.min(largeur * 0.6, texteMax + puce + pad * 3);
    const h = lignes.length * pas + pad * 2 - (pas - taille);
    const x = lg.x * largeur;
    const y = lg.y * hauteur;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x, y, l, h);
    lignes.forEach((ligne, i) => {
        const yl = y + pad + i * pas + taille / 2;
        if (ligne.couleur) {
            ctx.fillStyle = ligne.couleur;
            ctx.fillRect(x + pad, yl - puce / 2, puce, puce);
            ctx.strokeStyle = '#37474f';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + pad, yl - puce / 2, puce, puce);
        }
        ctx.fillStyle = '#263238';
        ctx.fillText(ligne.texte, x + pad + (ligne.couleur ? puce + pad * 0.6 : 0), yl, l - pad * 2);
    });
    return { id: 'legende', x, y, largeur: l, hauteur: h };
}

function compteur(
    ctx: Contexte,
    largeur: number,
    hauteur: number,
    m: MiseEnPage,
    d: DonneesRendu,
    e: number
): BoiteElement {
    const taille = borner(m.compteur.taille, BORNES.compteur) * e;
    const marge = taille * 0.5;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.round(taille)}px sans-serif`;
    const l1 = ctx.measureText(d.compteur.date).width;
    ctx.font = `${Math.round(taille * 0.6)}px sans-serif`;
    const l2 = ctx.measureText(d.compteur.detail).width;
    const l = Math.max(l1, l2) + marge * 2;
    const h = taille * 1.9 + marge * 1.5;
    const x = m.compteur.x * largeur;
    const y = m.compteur.y * hauteur;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(x, y, l, h);
    ctx.font = `bold ${Math.round(taille)}px sans-serif`;
    ctx.fillStyle = '#1a237e';
    ctx.fillText(d.compteur.date, x + l - marge, y + marge * 0.6);
    ctx.font = `${Math.round(taille * 0.6)}px sans-serif`;
    ctx.fillStyle = '#37474f';
    ctx.fillText(d.compteur.detail, x + l - marge, y + marge * 0.6 + taille * 1.2);
    return { id: 'compteur', x, y, largeur: l, hauteur: h };
}

/** Image préparée (fond de carte cadré) : dessine une image à une date donnée, mise en page comprise */
export interface Rendu {
    largeur: number;
    hauteur: number;
    /** Date de l'image d'aperçu : la fin de la période animée */
    dateApercu: string;
    /** Dessine l'image de la date (carte, noms, mise en page) ; renvoie les rectangles des éléments de la mise en page */
    dessiner(ctx: CanvasRenderingContext2D, date: string, m: MiseEnPage): BoiteElement[];
}
