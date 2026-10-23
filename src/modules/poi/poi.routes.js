// Bonnes adresses autour des SAMU-SAS (hébergement, restaurant, bar) : /api/poi
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
    POI_CATS,
    poiBody,
    poiClean,
    poiIsAdmin,
    poiMapResult,
    poiName,
    poiNominatim,
    poiRouteCache,
    poiRouteOne,
    poiRows
} from './poi.service.js';
import { dbAll, dbGet, dbRun } from '../../db/database.js';
import { logUserAction } from '../../services/action-log.js';

const router = Router();

router.get('/poi/places', requireAuth, async (req, res) => {
    try {
        const q = poiClean(req.query.q, 120);
        if (q.length < 3) return res.json({ places: [] });
        const loc =
            Number(req.query.location_id) > 0
                ? await dbGet('SELECT latitude, longitude, libelle_court FROM locations WHERE id = ?', [
                      Number(req.query.location_id)
                  ])
                : null;
        const params = { q, countrycodes: 'fr' };
        if (loc && loc.latitude != null && loc.longitude != null)
            params.viewbox = `${loc.longitude - 0.35},${loc.latitude + 0.25},${loc.longitude + 0.35},${loc.latitude - 0.25}`;
        const raw = await poiNominatim(params);
        let places = raw
            .map(r => poiMapResult(r, loc && loc.latitude, loc && loc.longitude))
            .filter(x => x.name && !isNaN(x.latitude));
        // Les lieux les plus proches du SAMU-SAS et d'une catégorie connue d'abord
        places.sort(
            (a, b) =>
                (a.category ? 0 : 1) - (b.category ? 0 : 1) ||
                (a.distance_km == null ? 1e9 : a.distance_km) - (b.distance_km == null ? 1e9 : b.distance_km)
        );
        res.json({ places: places.slice(0, 8), reference: 'OpenStreetMap (Nominatim)' });
    } catch (e) {
        res.status(502).json({ error: e.message || 'Base de référence indisponible' });
    }
});

router.get('/poi/meta', requireAuth, async (req, res) => {
    try {
        const locations = await dbAll(
            `SELECT l.id, l.libelle_court, l.libelle_long, l.adresse, l.latitude, l.longitude, (SELECT COUNT(*) FROM poi p WHERE p.location_id = l.id) AS n_poi FROM locations l ORDER BY l.libelle_court COLLATE NOCASE`
        );
        const creators = await dbAll(
            `SELECT DISTINCT u.id, u.nom, u.prenom FROM poi p JOIN users u ON u.id = p.created_by ORDER BY u.nom, u.prenom`
        );
        const counts = {};
        (await dbAll('SELECT location_id, category, COUNT(*) AS n FROM poi GROUP BY location_id, category')).forEach(
            r => {
                (counts[r.location_id] = counts[r.location_id] || {})[r.category] = r.n;
            }
        );
        res.json({
            locations,
            creators: creators.map(c => ({ id: c.id, name: poiName(c.prenom, c.nom) })),
            categories: POI_CATS,
            counts
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/poi', requireAuth, async (req, res) => {
    try {
        const w = [],
            p = [];
        if (Number(req.query.location_id) > 0) {
            w.push('p.location_id = ?');
            p.push(Number(req.query.location_id));
        }
        if (POI_CATS.includes(String(req.query.category || ''))) {
            w.push('p.category = ?');
            p.push(String(req.query.category));
        }
        if (Number(req.query.creator) > 0) {
            w.push('p.created_by = ?');
            p.push(Number(req.query.creator));
        }
        const q = poiClean(req.query.q, 80);
        if (q) {
            const like = `%${q.replace(/[%_]/g, m => '\\' + m)}%`;
            w.push(
                `(p.name LIKE ? ESCAPE '\\' OR p.address LIKE ? ESCAPE '\\' OR p.comment LIKE ? ESCAPE '\\' OR l.libelle_court LIKE ? ESCAPE '\\' OR u.nom LIKE ? ESCAPE '\\' OR u.prenom LIKE ? ESCAPE '\\')`
            );
            p.push(like, like, like, like, like, like);
        }
        res.json({
            pois: await poiRows(req, w.length ? 'WHERE ' + w.join(' AND ') : '', p),
            isAdmin: poiIsAdmin(req),
            userId: req.session.userId
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/poi/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const [poi] = await poiRows(req, 'WHERE p.id = ?', [id]);
        if (!poi) return res.status(404).json({ error: 'Lieu introuvable' });
        const admin = poiIsAdmin(req),
            uid = req.session.userId;
        const comments = (
            await dbAll(
                `SELECT c.*, u.nom, u.prenom FROM poi_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.poi_id = ? ORDER BY c.created_at, c.id`,
                [id]
            )
        ).map(c => ({
            id: c.id,
            user_id: c.user_id,
            author: poiName(c.prenom, c.nom) || 'Utilisateur supprimé',
            text: c.text,
            created_at: c.created_at,
            updated_at: c.updated_at,
            can_edit: admin || c.user_id === uid
        }));
        const ratings = (
            await dbAll(
                `SELECT r.*, u.nom, u.prenom FROM poi_ratings r LEFT JOIN users u ON u.id = r.user_id WHERE r.poi_id = ? ORDER BY r.updated_at DESC`,
                [id]
            )
        ).map(r => ({
            user_id: r.user_id,
            author: poiName(r.prenom, r.nom) || 'Utilisateur supprimé',
            rating: r.rating,
            created_at: r.created_at,
            updated_at: r.updated_at,
            can_edit: admin || r.user_id === uid
        }));
        res.json({ poi, comments, ratings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/poi/:id/route', requireAuth, async (req, res) => {
    try {
        const row = await dbGet(
            'SELECT p.latitude AS la, p.longitude AS lo, l.latitude AS sla, l.longitude AS slo, l.libelle_court AS samu FROM poi p JOIN locations l ON l.id = p.location_id WHERE p.id = ?',
            [Number(req.params.id)]
        );
        if (!row) return res.status(404).json({ error: 'Lieu introuvable' });
        if (row.sla == null || row.slo == null)
            return res.status(400).json({ error: "Ce SAMU-SAS n'est pas géolocalisé" });
        const a = [row.la, row.lo],
            b = [row.sla, row.slo],
            out = { samu: row.samu, from: a, to: b };
        const key = `${a}|${b}|${new Date().toISOString().slice(0, 13)}`;
        if (poiRouteCache.has(key)) return res.json({ ...out, ...poiRouteCache.get(key) });
        const modes = {};
        await Promise.all(
            ['walk', 'car', 'transit'].map(async m => {
                try {
                    modes[m] = await poiRouteOne(m, a, b);
                } catch (e) {
                    modes[m] = { error: e.message };
                }
            })
        );
        if (Object.values(modes).some(m => !m.error)) {
            poiRouteCache.set(key, { modes });
            if (poiRouteCache.size > 200) poiRouteCache.delete(poiRouteCache.keys().next().value);
        }
        res.json({ ...out, modes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/poi', requireAuth, async (req, res) => {
    try {
        const r = await poiBody(req.body || {});
        if (r.error) return res.status(400).json({ error: r.error });
        const v = r.value;
        const ins = await dbRun(
            `INSERT INTO poi (location_id, category, name, address, latitude, longitude, comment, website, phone, osm_ref, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                v.location_id,
                v.category,
                v.name,
                v.address,
                v.latitude,
                v.longitude,
                v.comment,
                v.website,
                v.phone,
                v.osm_ref,
                req.session.userId
            ]
        );
        const rt = Number((req.body || {}).rating);
        if (rt >= 1 && rt <= 5)
            await dbRun('INSERT OR REPLACE INTO poi_ratings (poi_id, user_id, rating) VALUES (?,?,?)', [
                ins.lastID,
                req.session.userId,
                Math.round(rt)
            ]);
        logUserAction(req, "TripAdVisor : ajout d'un lieu", { id: ins.lastID, nom: v.name, categorie: v.category });
        res.json({ success: true, id: ins.lastID });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/poi/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const old = await dbGet('SELECT * FROM poi WHERE id = ?', [id]);
        if (!old) return res.status(404).json({ error: 'Lieu introuvable' });
        if (!poiIsAdmin(req) && old.created_by !== req.session.userId)
            return res.status(403).json({ error: 'Seul le créateur du lieu ou un administrateur peut le modifier' });
        const r = await poiBody(req.body || {}, old);
        if (r.error) return res.status(400).json({ error: r.error });
        const v = r.value;
        await dbRun(
            `UPDATE poi SET location_id=?, category=?, name=?, address=?, latitude=?, longitude=?, comment=?, website=?, phone=?, osm_ref=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [
                v.location_id,
                v.category,
                v.name,
                v.address,
                v.latitude,
                v.longitude,
                v.comment,
                v.website,
                v.phone,
                v.osm_ref,
                id
            ]
        );
        logUserAction(req, "TripAdVisor : modification d'un lieu", { id, nom: v.name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/poi/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const old = await dbGet('SELECT * FROM poi WHERE id = ?', [id]);
        if (!old) return res.status(404).json({ error: 'Lieu introuvable' });
        if (!poiIsAdmin(req) && old.created_by !== req.session.userId)
            return res.status(403).json({ error: 'Seul le créateur du lieu ou un administrateur peut le supprimer' });
        await dbRun('DELETE FROM poi_comments WHERE poi_id = ?', [id]);
        await dbRun('DELETE FROM poi_ratings WHERE poi_id = ?', [id]);
        await dbRun('DELETE FROM poi WHERE id = ?', [id]);
        logUserAction(req, "TripAdVisor : suppression d'un lieu", { id, nom: old.name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/poi/:id/rating', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id),
            rt = Math.round(Number((req.body || {}).rating));
        if (!(rt >= 1 && rt <= 5)) return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5' });
        if (!(await dbGet('SELECT id FROM poi WHERE id = ?', [id])))
            return res.status(404).json({ error: 'Lieu introuvable' });
        await dbRun(
            `INSERT INTO poi_ratings (poi_id, user_id, rating) VALUES (?,?,?) ON CONFLICT(poi_id, user_id) DO UPDATE SET rating = excluded.rating, updated_at = CURRENT_TIMESTAMP`,
            [id, req.session.userId, rt]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/poi/:id/rating', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const target =
            poiIsAdmin(req) && Number(req.query.user_id) > 0 ? Number(req.query.user_id) : req.session.userId;
        await dbRun('DELETE FROM poi_ratings WHERE poi_id = ? AND user_id = ?', [id, target]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/poi/:id/comments', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id),
            text = poiClean((req.body || {}).text, 2000);
        if (text.length < 1) return res.status(400).json({ error: 'Le commentaire est vide' });
        if (!(await dbGet('SELECT id FROM poi WHERE id = ?', [id])))
            return res.status(404).json({ error: 'Lieu introuvable' });
        const ins = await dbRun('INSERT INTO poi_comments (poi_id, user_id, text) VALUES (?,?,?)', [
            id,
            req.session.userId,
            text
        ]);
        res.json({ success: true, id: ins.lastID });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/poi/comments/:cid', requireAuth, async (req, res) => {
    try {
        const cid = Number(req.params.cid),
            text = poiClean((req.body || {}).text, 2000);
        const c = await dbGet('SELECT * FROM poi_comments WHERE id = ?', [cid]);
        if (!c) return res.status(404).json({ error: 'Commentaire introuvable' });
        if (!poiIsAdmin(req) && c.user_id !== req.session.userId)
            return res
                .status(403)
                .json({ error: "Seul l'auteur du commentaire ou un administrateur peut le modifier" });
        if (!text) return res.status(400).json({ error: 'Le commentaire est vide' });
        await dbRun('UPDATE poi_comments SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [text, cid]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/poi/comments/:cid', requireAuth, async (req, res) => {
    try {
        const cid = Number(req.params.cid);
        const c = await dbGet('SELECT * FROM poi_comments WHERE id = ?', [cid]);
        if (!c) return res.status(404).json({ error: 'Commentaire introuvable' });
        if (!poiIsAdmin(req) && c.user_id !== req.session.userId)
            return res
                .status(403)
                .json({ error: "Seul l'auteur du commentaire ou un administrateur peut le supprimer" });
        await dbRun('DELETE FROM poi_comments WHERE id = ?', [cid]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
