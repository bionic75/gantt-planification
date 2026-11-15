// Départements de la carte : département d'un déploiement (point dans contour) et couleur selon son statut
import type { DeploiementCarte, StatutDeploiement } from '@/api/deploiements';

/** Anneau de coordonnées GeoJSON [longitude, latitude] */
type Anneau = number[][];

export interface Contours {
    features: Array<{
        properties: { code: string; nom: string };
        geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
    }>;
}

/** Le point (x = longitude, y = latitude) est-il dans l'anneau ? (rayon horizontal, nombre de croisements) */
function dansAnneau(x: number, y: number, anneau: Anneau) {
    let dedans = false;
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
        const [xi, yi] = anneau[i];
        const [xj, yj] = anneau[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
}

/** Polygone = anneau extérieur, puis trous éventuels */
const dansPolygone = (x: number, y: number, [exterieur, ...trous]: Anneau[]) =>
    !!exterieur && dansAnneau(x, y, exterieur) && !trous.some(trou => dansAnneau(x, y, trou));

/** Département contenant le point, ou null (mer, hors métropole) */
export function departementDe(lat: number, lng: number, contours: Contours) {
    for (const f of contours.features) {
        const g = f.geometry;
        const polygones = g.type === 'Polygon' ? [g.coordinates as Anneau[]] : (g.coordinates as Anneau[][]);
        if (polygones.some(p => dansPolygone(lng, lat, p))) return { code: f.properties.code, nom: f.properties.nom };
    }
    return null;
}

export interface CouleurDepartement {
    couleur: string;
    statut: string;
    samu: string[];
}

/** Couleur de chaque département (clé = code) : statut de plus petite position parmi ses déploiements */
export function couleursDepartements(
    deploiements: DeploiementCarte[],
    statuts: StatutDeploiement[],
    contours: Contours
) {
    const parId = new Map(statuts.map(s => [s.id, s]));
    const retenus = new Map<string, { statut: StatutDeploiement; samu: string[] }>();
    for (const d of deploiements) {
        const statut = d.status_id == null ? undefined : parId.get(d.status_id);
        if (!statut || d.latitude == null || d.longitude == null) continue;
        const dep = departementDe(d.latitude, d.longitude, contours);
        if (!dep) continue;
        const actuel = retenus.get(dep.code);
        if (!actuel || statut.position < actuel.statut.position) retenus.set(dep.code, { statut, samu: [d.samu_name] });
        else if (statut.id === actuel.statut.id) actuel.samu.push(d.samu_name);
    }
    const res = new Map<string, CouleurDepartement>();
    for (const [code, { statut, samu }] of retenus)
        res.set(code, { couleur: statut.color, statut: statut.label, samu });
    return res;
}
