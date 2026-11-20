// Carte « France seule » : départements d'outre-mer rapprochés de la métropole, dans des encarts à l'ouest
import type { Contours } from './departements';

export interface Encart {
    /** Centre de l'encart (degrés) et côté du carré qui reçoit le territoire */
    lng: number;
    lat: number;
    cote: number;
}

const COTE = 3;
const COLONNES = [-12.2, -8.8];
const LIGNES = [49.5, 46.5, 43.5];

/** Encart de chaque territoire : deux colonnes à l'ouest de la Bretagne et de l'Aquitaine */
export const ENCARTS: Record<string, Encart> = {
    '971': { lng: COLONNES[0]!, lat: LIGNES[0]!, cote: COTE },
    '972': { lng: COLONNES[1]!, lat: LIGNES[0]!, cote: COTE },
    '973': { lng: COLONNES[0]!, lat: LIGNES[1]!, cote: COTE },
    '974': { lng: COLONNES[1]!, lat: LIGNES[1]!, cote: COTE },
    '976': { lng: COLONNES[0]!, lat: LIGNES[2]!, cote: COTE }
};

/** Agrandissement maximal des petits territoires (Mayotte, Martinique) */
const ECHELLE_MAX = 6;
/** Part du côté de l'encart occupée par le territoire */
const REMPLISSAGE = 0.88;

const rad = (d: number) => (d * Math.PI) / 180;

type Anneau = number[][];

/** Contours avec les départements d'outre-mer déplacés (et redimensionnés) dans leurs encarts */
export function rapprocherOutreMer(contours: Contours): Contours {
    return {
        features: contours.features.map(f => {
            const encart = ENCARTS[f.properties.code];
            if (!encart) return f;
            const g = f.geometry;
            const polygones = g.type === 'Polygon' ? [g.coordinates as Anneau[]] : (g.coordinates as Anneau[][]);
            const pts = polygones.flat(2);
            const xs = pts.map(p => p[0] ?? 0);
            const ys = pts.map(p => p[1] ?? 0);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            // Mercator étire les latitudes élevées : les écarts verticaux sont corrigés pour garder la forme du territoire
            const hauteur = Math.cos(rad(encart.lat)) / Math.cos(rad(cy));
            const echelle = Math.min(
                ECHELLE_MAX,
                (encart.cote * REMPLISSAGE) / Math.max(x1 - x0, (y1 - y0) * hauteur, 1e-9)
            );
            const deplacer = ([x = 0, y = 0]: number[]) => [
                encart.lng + (x - cx) * echelle,
                encart.lat + (y - cy) * echelle * hauteur
            ];
            // `...f` : garde les autres champs GeoJSON (type « Feature »), nécessaires à Leaflet
            return {
                ...f,
                geometry: {
                    type: 'MultiPolygon' as const,
                    coordinates: polygones.map(p => p.map(a => a.map(deplacer)))
                }
            };
        })
    };
}
