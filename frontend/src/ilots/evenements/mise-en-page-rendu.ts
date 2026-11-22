// Dessin de la mise en page du GIF / MP4 sur un canvas : le même pour l'aperçu de la fenêtre de conception et pour
// chaque image exportée (ce que l'on voit est ce que l'on obtient).
import {
    BORNES,
    borner,
    dimensionsLogo,
    lignesLegende,
    police,
    REFERENCE_GIF,
    stylePolice,
    type Alignement,
    type BoiteElement,
    type LigneLegende,
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
    if (m.titre.visible && lignesDe(m.titre.texte).length) boites.push(titre(ctx, largeur, hauteur, m, e));
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

/** Abscisse de départ d'une ligne de largeur `l` dans [debut, debut + disponible] selon l'alignement */
const departLigne = (alignement: Alignement, debut: number, disponible: number, l: number) =>
    debut + (alignement === 'center' ? (disponible - l) / 2 : alignement === 'right' ? disponible - l : 0);

/** Lignes non vides d'un texte saisi (retours à la ligne), sans espaces en bordure */
const lignesDe = (texte: string) =>
    texte
        .split(/\r?\n/)
        .map(t => t.trim())
        .filter(Boolean);

function titre(ctx: Contexte, largeur: number, hauteur: number, m: MiseEnPage, e: number): BoiteElement {
    const t = m.titre;
    const tailleRef = borner(t.taille, BORNES.titre);
    const taille = tailleRef * e;
    const pad = taille * 0.4;
    const pas = taille * 1.25;
    const lignes = lignesDe(t.texte);
    ctx.font = police(stylePolice(t.gras, t.italique), tailleRef, largeur, t.police);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const x = t.x * largeur;
    const y = t.y * hauteur;
    const maxTexte = largeur * 0.94 - pad * 2;
    const l = Math.min(Math.max(...lignes.map(ligne => ctx.measureText(ligne).width)), maxTexte);
    const h = (lignes.length - 1) * pas + taille + pad * 2;
    ctx.fillStyle = 'rgba(26,35,126,0.92)';
    ctx.fillRect(x, y, l + pad * 2, h);
    ctx.fillStyle = '#ffffff';
    lignes.forEach((ligne, i) => {
        const w = Math.min(ctx.measureText(ligne).width, l);
        ctx.fillText(ligne, departLigne(t.alignement, x + pad, l, w), y + pad + taille / 2 + i * pas, l);
    });
    return { id: 'titre', x, y, largeur: l + pad * 2, hauteur: h };
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
    const ecartPuce = pad * 0.6;
    ctx.font = police(stylePolice(lg.gras, lg.italique), tailleRef, largeur, lg.police);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Largeur d'une ligne : puce (statuts) et texte
    const largeurLigne = (ligne: LigneLegende) =>
        (ligne.couleur ? puce + ecartPuce : 0) + ctx.measureText(ligne.texte).width;
    const interieur = Math.min(largeur * 0.6 - pad * 2, Math.max(...lignes.map(largeurLigne)));
    const l = interieur + pad * 2;
    const h = lignes.length * pas + pad * 2 - (pas - taille);
    const x = lg.x * largeur;
    const y = lg.y * hauteur;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x, y, l, h);
    lignes.forEach((ligne, i) => {
        const yl = y + pad + i * pas + taille / 2;
        const debut = departLigne(lg.alignement, x + pad, interieur, Math.min(largeurLigne(ligne), interieur));
        if (ligne.couleur) {
            ctx.fillStyle = ligne.couleur;
            ctx.fillRect(debut, yl - puce / 2, puce, puce);
            ctx.strokeStyle = '#37474f';
            ctx.lineWidth = 1;
            ctx.strokeRect(debut, yl - puce / 2, puce, puce);
        }
        ctx.fillStyle = '#263238';
        const decalage = ligne.couleur ? puce + ecartPuce : 0;
        ctx.fillText(ligne.texte, debut + decalage, yl, Math.max(10, interieur - decalage));
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
