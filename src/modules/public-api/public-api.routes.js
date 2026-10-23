// API publique par clé (événements) et gestion des clés
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import crypto from 'crypto';
import { Router } from 'express';
import { requireAdmin, requireApiKey } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';

const router = Router();

// Créer une clé API (admin uniquement)
router.post('/admin/api-keys', requireAdmin, (req, res) => {
    const { label } = req.body;
    if (!label) return res.status(400).json({ error: 'Libellé requis' });
    const rawKey = 'ans_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12) + '...';
    database.run(
        `INSERT INTO api_keys (label, key_hash, key_prefix, created_by) VALUES (?, ?, ?, ?)`,
        [label, keyHash, keyPrefix, req.session.userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID, key: rawKey, prefix: keyPrefix, label });
        }
    );
});

// Lister les clés API (admin uniquement)
router.get('/admin/api-keys', requireAdmin, (req, res) => {
    database.all(
        `SELECT ak.id, ak.label, ak.key_prefix, ak.created_at, ak.last_used_at, ak.revoked,
                u.nom as creator_nom, u.prenom as creator_prenom
         FROM api_keys ak LEFT JOIN users u ON ak.created_by = u.id
         ORDER BY ak.created_at DESC`,
        (err, rows) => (err ? res.status(500).json({ error: err.message }) : res.json(rows || []))
    );
});

// Révoquer une clé API (admin uniquement)
router.delete('/admin/api-keys/:id', requireAdmin, (req, res) => {
    database.run(`UPDATE api_keys SET revoked = 1 WHERE id = ?`, [req.params.id], err =>
        err ? res.status(500).json({ error: err.message }) : res.json({ success: true })
    );
});

// Endpoint public événements
router.get('/public/events', requireApiKey, async (req, res) => {
    try {
        const { from, to } = req.query;
        let where = `WHERE 1=1`;
        const params = [];
        if (from) {
            where += ` AND ce.end_date >= ?`;
            params.push(from);
        }
        if (to) {
            where += ` AND ce.start_date <= ?`;
            params.push(to);
        }

        const events = await new Promise((resolve, reject) => {
            database.all(
                `SELECT ce.id, ce.label as objet, ce.start_date, ce.end_date, ce.period,
                        CASE WHEN ce.grist = 1 THEN 1 ELSE 0 END as grist,
                        l.libelle_long as lieu, l.libelle_court as lieu_court, l.adresse as detail_lieu,
                        et.label_long AS type_long, et.label_short AS type_short, et.icon AS type_icon, et.is_other AS type_other
                 FROM custom_events ce
                 LEFT JOIN locations l ON ce.location_id = l.id
                 LEFT JOIN event_types et ON ce.type_id = et.id
                 ${where}
                 ORDER BY ce.start_date, ce.end_date`,
                params,
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });

        // Charger les participants pour chaque événement
        for (const ev of events) {
            const participants = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT u.nom, u.prenom, r.trigramme
                     FROM custom_event_participants cep
                     JOIN users u ON cep.user_id = u.id
                     LEFT JOIN resources r ON u.resource_id = r.id
                     WHERE cep.event_id = ?
                     ORDER BY u.nom, u.prenom`,
                    [ev.id],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });
            const periodLabel = { AM: 'Matin', PM: 'Après-midi', FULL: 'Journée entière' }[ev.period] || ev.period;
            ev.horaire = periodLabel;
            ev.participants = participants.map(p => ({
                nom: p.nom,
                prenom: p.prenom,
                trigramme: p.trigramme || null
            }));
            delete ev.period;
        }

        res.json({ events, count: events.length });
    } catch (error) {
        console.error('Erreur API publique événements:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
