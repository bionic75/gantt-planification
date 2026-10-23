// Localisations (SAMU-SAS et autres lieux)
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';

const router = Router();

// Lister toutes les localisations
router.get('/locations', requireAuth, (req, res) => {
    database.all(`SELECT * FROM locations ORDER BY libelle_long ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ locations: rows });
    });
});

// Créer une localisation
router.post('/locations', requireAuth, (req, res) => {
    const { libelle_long, libelle_court, adresse, latitude, longitude } = req.body;
    if (!libelle_long || !libelle_court) {
        return res.status(400).json({ error: 'Libellé long et libellé court requis' });
    }
    database.run(
        `INSERT INTO locations (libelle_long, libelle_court, adresse, latitude, longitude) VALUES (?, ?, ?, ?, ?)`,
        [
            libelle_long.toUpperCase(),
            libelle_court.toUpperCase(),
            adresse ? adresse.toUpperCase() : null,
            latitude || null,
            longitude || null
        ],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE'))
                    return res.status(409).json({ error: 'Ce libellé long existe déjà' });
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Modifier une localisation
router.put('/locations/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { libelle_long, libelle_court, adresse, latitude, longitude } = req.body;
    if (!libelle_long || !libelle_court) {
        return res.status(400).json({ error: 'Libellé long et libellé court requis' });
    }
    database.run(
        `UPDATE locations SET libelle_long=?, libelle_court=?, adresse=?, latitude=?, longitude=?, updated_at=datetime('now') WHERE id=?`,
        [
            libelle_long.toUpperCase(),
            libelle_court.toUpperCase(),
            adresse ? adresse.toUpperCase() : null,
            latitude || null,
            longitude || null,
            id
        ],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Localisation non trouvée' });
            res.json({ success: true });
        }
    );
});

// Vérifier si une localisation est utilisée par des événements
router.get('/locations/:id/usage', requireAdmin, (req, res) => {
    const { id } = req.params;
    database.all(
        `SELECT id, label, start_date, end_date FROM custom_events WHERE location_id = ? ORDER BY start_date`,
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: rows.length, events: rows });
        }
    );
});

// Supprimer une localisation (garde l'orphelin location_id dans custom_events → "NON DÉFINI" à l'affichage)
router.delete('/locations/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    database.run(`DELETE FROM locations WHERE id=?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Import CSV de localisations — détection des conflits
router.post('/locations/import', requireAdmin, async (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Aucune ligne fournie' });
    }

    const conflicts = [];
    const clean = [];

    for (const row of rows) {
        if (!row.libelle_long || !row.libelle_court) continue;

        const ll = String(row.libelle_long).toUpperCase().trim();
        const lc = String(row.libelle_court).toUpperCase().trim();
        const ad = row.adresse ? String(row.adresse).toUpperCase().trim() : '';
        const lat =
            row.latitude !== null && row.latitude !== undefined && row.latitude !== '' ? Number(row.latitude) : null;
        const lng =
            row.longitude !== null && row.longitude !== undefined && row.longitude !== ''
                ? Number(row.longitude)
                : null;

        const incoming = {
            libelle_long: ll,
            libelle_court: lc,
            adresse: ad,
            latitude: isNaN(lat) ? null : lat,
            longitude: isNaN(lng) ? null : lng
        };

        const existingRow = await new Promise((resolve, reject) => {
            database.get(`SELECT * FROM locations WHERE libelle_long = ?`, [ll], (err, r) => {
                if (err) reject(err);
                else resolve(r || null);
            });
        });

        if (existingRow) {
            // Signaler s'il y a des différences réelles
            const sameData =
                existingRow.libelle_court === lc &&
                (existingRow.adresse || '') === ad &&
                existingRow.latitude == incoming.latitude &&
                existingRow.longitude == incoming.longitude;

            // Toujours signaler comme conflit, même si identique (l'utilisateur choisit)
            conflicts.push({ incoming, existing: { ...existingRow }, identical: sameData });
        } else {
            clean.push(incoming);
        }
    }

    // Insérer les lignes sans conflit
    for (const row of clean) {
        await new Promise(resolve => {
            database.run(
                `INSERT OR IGNORE INTO locations (libelle_long, libelle_court, adresse, latitude, longitude) VALUES (?, ?, ?, ?, ?)`,
                [row.libelle_long, row.libelle_court, row.adresse || null, row.latitude, row.longitude],
                () => resolve()
            );
        });
    }

    res.json({ success: true, inserted: clean.length, conflicts });
});

// Résoudre un conflit d'import (écraser ou saisir manuellement)
router.post('/locations/import/resolve', requireAdmin, async (req, res) => {
    const { resolutions } = req.body;
    if (!Array.isArray(resolutions)) return res.status(400).json({ error: 'Format invalide' });
    if (resolutions.length === 0) return res.json({ success: true, updated: 0 });

    let updated = 0;
    for (const r of resolutions) {
        if (r.action === 'overwrite' || r.action === 'manual') {
            const lat =
                r.latitude !== null && r.latitude !== undefined && r.latitude !== '' ? Number(r.latitude) : null;
            const lng =
                r.longitude !== null && r.longitude !== undefined && r.longitude !== '' ? Number(r.longitude) : null;
            await new Promise(resolve => {
                database.run(
                    `UPDATE locations SET libelle_court=?, adresse=?, latitude=?, longitude=?, updated_at=datetime('now') WHERE libelle_long=?`,
                    [
                        r.libelle_court ? String(r.libelle_court).toUpperCase() : null,
                        r.adresse ? String(r.adresse).toUpperCase() : null,
                        lat !== null && !isNaN(lat) ? lat : null,
                        lng !== null && !isNaN(lng) ? lng : null,
                        r.libelle_long
                    ],
                    err => {
                        if (err) console.error('Erreur résolution conflit:', err);
                        resolve();
                    }
                );
            });
            updated++;
        }
    }

    res.json({ success: true, updated });
});

export default router;
