// Export de l'animation des mises en service en GIF animé : images dessinées sur un canvas, encodées dans le navigateur
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import type { Contours } from './departements';

/** Projection d'un point (longitude, latitude) vers le canvas, en pixels */
export type Projection = (lng: number, lat: number) => [number, number];

type Anneau = number[][];

/** Trace les contours d'un jeu de polygones (remplis si `remplissage`) */
export function tracerContours(
    ctx: CanvasRenderingContext2D,
    contours: Pick<Contours, 'features'>,
    projeter: Projection,
    style: { trait: string; epaisseur: number; remplissage?: string; opacite?: number },
    codes?: ReadonlySet<string>
) {
    ctx.save();
    ctx.strokeStyle = style.trait;
    ctx.lineWidth = style.epaisseur;
    ctx.lineJoin = 'round';
    if (style.remplissage) ctx.fillStyle = style.remplissage;
    ctx.globalAlpha = style.opacite ?? 1;
    for (const f of contours.features) {
        if (codes && !codes.has(f.properties.code)) continue;
        const g = f.geometry;
        const polygones = g.type === 'Polygon' ? [g.coordinates as Anneau[]] : (g.coordinates as Anneau[][]);
        ctx.beginPath();
        for (const polygone of polygones)
            for (const anneau of polygone) {
                anneau.forEach(([lng = 0, lat = 0], i) => {
                    const [x, y] = projeter(lng, lat);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.closePath();
            }
        if (style.remplissage) ctx.fill('evenodd');
        ctx.stroke();
    }
    ctx.restore();
}

/** Laisse le navigateur respirer entre deux images (l'interface ne se fige pas) */
const respirer = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * GIF animé à partir d'une suite de dessins : `dessiner(i, ctx)` peint l'image i sur le canvas fourni.
 * `progression(i, total)` est appelée après chaque image.
 */
export async function genererGif(options: {
    largeur: number;
    hauteur: number;
    images: number;
    delaiMs: number;
    /** Dernière image maintenue plus longtemps */
    pauseFinMs?: number;
    dessiner: (i: number, ctx: CanvasRenderingContext2D) => void;
    progression?: (i: number, total: number) => void;
}): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = options.largeur;
    canvas.height = options.hauteur;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas indisponible');
    const gif = GIFEncoder();
    for (let i = 0; i < options.images; i++) {
        options.dessiner(i, ctx);
        const { data } = ctx.getImageData(0, 0, options.largeur, options.hauteur);
        const palette = quantize(data, 256);
        const dernier = i === options.images - 1;
        gif.writeFrame(applyPalette(data, palette), options.largeur, options.hauteur, {
            palette,
            delay: dernier ? (options.pauseFinMs ?? options.delaiMs) : options.delaiMs
        });
        options.progression?.(i + 1, options.images);
        await respirer();
    }
    gif.finish();
    return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}

/** Nom de fichier et texte du compteur par défaut du GIF */
export const NOM_FICHIER_GIF = 'cartographie-mises-en-service';
export const LIBELLE_COMPTEUR_GIF = 'mise(s) en service';

/** Nom de fichier saisi, rendu valide : caractères interdits remplacés par « - », extension .gif ajoutée */
export function nomFichierGif(saisie: string) {
    const nom = saisie
        .trim()
        .replace(/\.gif$/i, '')
        .replace(/[\\/:*?"<>|\s]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return `${nom || NOM_FICHIER_GIF}.gif`;
}

/** Télécharge un fichier généré dans le navigateur */
export function telecharger(blob: Blob, nom: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
