// Bonnes adresses : géocodage (Nominatim), itinéraires, notes et commentaires
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { dbAll, dbGet } from '../../db/database.js';

export const POI_CATS = ['hebergement', 'restaurant', 'bar'];

export const poiIsAdmin = req => req.session && req.session.activeProfile === 'admin';

export const poiName = (prenom, nom) => `${prenom || ''} ${(nom || '').toUpperCase()}`.trim();

export const poiKm = (la1, lo1, la2, lo2) => {
    if ([la1, lo1, la2, lo2].some(v => v == null || isNaN(Number(v)))) return null;
    const R = 6371,
        rad = d => (Number(d) * Math.PI) / 180,
        dLa = rad(la2 - la1),
        dLo = rad(lo2 - lo1);
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
};

export const poiClean = (v, max) =>
    String(v == null ? '' : v)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .trim()
        .slice(0, max);

// Base de référence : OpenStreetMap (Nominatim). Requêtes espacées (≥ 1,1 s) et mises en cache, avec identification de l'application (règle d'usage)
export let poiLastCall = 0,
    poiQueue = Promise.resolve();

export const poiCache = new Map();

export function poiCategoryOf(r) {
    const c = r.category || r.class,
        t = r.type;
    if (
        c === 'tourism' &&
        [
            'hotel',
            'hostel',
            'guest_house',
            'motel',
            'apartment',
            'chalet',
            'camp_site',
            'caravan_site',
            'resort'
        ].includes(t)
    )
        return 'hebergement';
    if (c === 'amenity' && ['restaurant', 'fast_food', 'food_court'].includes(t)) return 'restaurant';
    if (c === 'amenity' && ['bar', 'pub', 'cafe', 'nightclub', 'biergarten'].includes(t)) return 'bar';
    return null;
}

export function poiNominatim(params) {
    const url =
        'https://nominatim.openstreetmap.org/search?' +
        new URLSearchParams({
            format: 'jsonv2',
            addressdetails: '1',
            extratags: '1',
            limit: '10',
            dedupe: '1',
            'accept-language': 'fr',
            ...params
        }).toString();
    if (poiCache.has(url) && poiCache.get(url).t > Date.now() - 600000) return Promise.resolve(poiCache.get(url).v);
    const run = async () => {
        const wait = poiLastCall + 1100 - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        poiLastCall = Date.now();
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'ANS-Plateforme-Planification/1.0 (bonnes adresses SAMU-SAS)',
                Accept: 'application/json'
            },
            signal: AbortSignal.timeout(9000)
        });
        if (!r.ok) throw new Error(`Base de référence indisponible (${r.status})`);
        const v = await r.json();
        poiCache.set(url, { t: Date.now(), v });
        if (poiCache.size > 300) poiCache.delete(poiCache.keys().next().value);
        return v;
    };
    const p = poiQueue.then(run, run);
    poiQueue = p.catch(() => {});
    return p;
}

export function poiAddress(a) {
    if (!a) return '';
    const street = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
    const town = a.city || a.town || a.village || a.municipality || a.hamlet || '';
    return [street, [a.postcode, town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function poiMapResult(r, lat, lng) {
    const ex = r.extratags || {};
    const lt = Number(r.lat),
        ln = Number(r.lon);
    return {
        name: (r.name || (r.display_name || '').split(',')[0] || '').trim(),
        address:
            poiAddress(r.address) ||
            String(r.display_name || '')
                .split(',')
                .slice(1, 4)
                .join(',')
                .trim(),
        latitude: lt,
        longitude: ln,
        category: poiCategoryOf(r),
        kind: `${r.category || r.class || ''}:${r.type || ''}`,
        website: ex.website || ex['contact:website'] || '',
        phone: ex.phone || ex['contact:phone'] || '',
        osm_ref: r.osm_type && r.osm_id ? `${String(r.osm_type)[0]}${r.osm_id}` : '',
        distance_km: poiKm(lat, lng, lt, ln)
    };
}

export async function poiRows(req, where, params) {
    const uid = req.session.userId,
        admin = poiIsAdmin(req);
    const rows = await dbAll(
        `SELECT p.*, l.libelle_court AS loc_court, l.libelle_long AS loc_long, l.latitude AS loc_lat, l.longitude AS loc_lng, u.nom AS cnom, u.prenom AS cprenom,
        (SELECT AVG(r.rating) FROM poi_ratings r WHERE r.poi_id = p.id) AS avg_rating, (SELECT COUNT(*) FROM poi_ratings r WHERE r.poi_id = p.id) AS n_ratings,
        (SELECT COUNT(*) FROM poi_comments c WHERE c.poi_id = p.id) AS n_comments, (SELECT r.rating FROM poi_ratings r WHERE r.poi_id = p.id AND r.user_id = ?) AS my_rating
        FROM poi p JOIN locations l ON l.id = p.location_id LEFT JOIN users u ON u.id = p.created_by ${where} ORDER BY p.created_at DESC, p.id DESC`,
        [uid, ...params]
    );
    return rows.map(r => ({
        id: r.id,
        location_id: r.location_id,
        loc_court: r.loc_court,
        loc_long: r.loc_long,
        loc_lat: r.loc_lat,
        loc_lng: r.loc_lng,
        category: r.category,
        name: r.name,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        comment: r.comment,
        website: r.website,
        phone: r.phone,
        osm_ref: r.osm_ref,
        created_by: r.created_by,
        creator: poiName(r.cprenom, r.cnom) || 'Utilisateur supprimé',
        created_at: r.created_at,
        updated_at: r.updated_at,
        avg_rating: r.avg_rating == null ? null : Math.round(r.avg_rating * 10) / 10,
        n_ratings: r.n_ratings,
        n_comments: r.n_comments,
        my_rating: r.my_rating,
        distance_km: poiKm(r.loc_lat, r.loc_lng, r.latitude, r.longitude),
        can_edit: admin || r.created_by === uid
    }));
}

export const poiRouteCache = new Map();

export function poiDecodePoly(str, prec) {
    const f = Math.pow(10, prec),
        out = [];
    let i = 0,
        lat = 0,
        lng = 0;
    while (i < str.length) {
        for (const axis of [0, 1]) {
            let sh = 0,
                res = 0,
                b;
            do {
                b = str.charCodeAt(i++) - 63;
                res |= (b & 31) << sh;
                sh += 5;
            } while (b >= 32);
            const d = res & 1 ? ~(res >> 1) : res >> 1;
            if (axis === 0) lat += d;
            else lng += d;
        }
        out.push([lat / f, lng / f]);
    }
    return out;
}

export async function poiRouteOne(mode, a, b) {
    const ua = { 'User-Agent': 'ANS-Plateforme-Planification/1.0 (trajets SAMU-SAS)', Accept: 'application/json' };
    if (mode === 'transit') {
        const q = new URLSearchParams({
            fromPlace: `${a[0]},${a[1]}`,
            toPlace: `${b[0]},${b[1]}`,
            time: new Date().toISOString(),
            transitModes: 'TRANSIT',
            numItineraries: '1',
            maxTransfers: '4',
            detailedTransfers: 'false'
        });
        const r = await fetch('https://api.transitous.org/api/v5/plan?' + q, {
            headers: ua,
            signal: AbortSignal.timeout(20000)
        });
        if (!r.ok) throw new Error('Service de transports indisponible');
        const d = await r.json(),
            it = (d.itineraries || [])[0];
        if (!it) return { error: 'Aucun trajet en transport en commun trouvé maintenant' };
        const legs = it.legs.map(l => ({
            mode: l.mode,
            line: l.routeShortName || l.displayName || '',
            from: l.from && l.from.name,
            to: l.to && l.to.name,
            duration: l.duration,
            path: l.legGeometry ? poiDecodePoly(l.legGeometry.points, l.legGeometry.precision || 6) : []
        }));
        return { duration: it.duration, transfers: it.transfers, legs, path: legs.flatMap(l => l.path) };
    }
    const prof = mode === 'walk' ? 'routed-foot' : 'routed-car';
    const r = await fetch(
        `https://routing.openstreetmap.de/${prof}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`,
        { headers: ua, signal: AbortSignal.timeout(15000) }
    );
    if (!r.ok) throw new Error("Service d'itinéraire indisponible");
    const d = await r.json(),
        rt = d.routes && d.routes[0];
    if (!rt) return { error: 'Aucun itinéraire trouvé' };
    return {
        duration: Math.round(rt.duration),
        distance: Math.round(rt.distance),
        path: rt.geometry.coordinates.map(c => [c[1], c[0]])
    };
}

export async function poiBody(b, existing) {
    const out = {};
    out.category = POI_CATS.includes(b.category) ? b.category : null;
    if (!out.category) return { error: 'Choisissez une typologie (hébergement, restaurant ou bar)' };
    out.name = poiClean(b.name, 120);
    if (out.name.length < 2) return { error: 'Le nom du lieu est obligatoire' };
    out.location_id = Number(b.location_id);
    if (!(out.location_id > 0) || !(await dbGet('SELECT id FROM locations WHERE id = ?', [out.location_id])))
        return { error: 'Choisissez le SAMU-SAS auquel rattacher ce lieu' };
    out.address = poiClean(b.address, 250);
    out.comment = poiClean(b.comment, 2000);
    out.website = poiClean(b.website, 250);
    out.phone = poiClean(b.phone, 40);
    out.osm_ref = poiClean(b.osm_ref, 20);
    let lat = Number(b.latitude),
        lng = Number(b.longitude);
    if (!(isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng))) {
        lat = lng = null;
        if (out.address || out.name) {
            // adresse saisie sans suggestion : géolocalisation par la base de référence
            try {
                const r = (await poiNominatim({ q: out.address || out.name, countrycodes: 'fr', limit: '1' }))[0];
                if (r) {
                    lat = Number(r.lat);
                    lng = Number(r.lon);
                }
            } catch (e) {
                /* géolocalisation indisponible */
            }
        }
        if (lat == null)
            return {
                error: "Adresse introuvable : choisissez une suggestion de la liste ou précisez l'adresse pour pouvoir placer le lieu sur la carte"
            };
    }
    out.latitude = lat;
    out.longitude = lng;
    return { value: out };
}
