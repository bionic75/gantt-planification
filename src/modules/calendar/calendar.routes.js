// Calendrier : vacances scolaires et dates particulières (fichiers ICS)
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';

const router = Router();

// Sauvegarder les congés scolaires
router.post('/school-holidays', requireAdmin, (req, res) => {
    const { holidays } = req.body;

    if (!holidays) {
        return res.status(400).json({ success: false, error: 'Données manquantes' });
    }

    // Sauvegarder dans la table settings
    const holidaysJson = JSON.stringify(holidays);

    database.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('school_holidays', ?)`, [holidaysJson], err => {
        if (err) {
            console.error('Erreur sauvegarde congés scolaires:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        console.log('📅 Congés scolaires sauvegardés');
        res.json({ success: true });
    });
});

// Récupérer les congés scolaires
router.get('/school-holidays', requireAuth, (req, res) => {
    database.get(`SELECT value FROM settings WHERE key = 'school_holidays'`, (err, row) => {
        if (err) {
            console.error('Erreur lecture congés scolaires:', err);
            return res.status(500).json({ success: false, error: err.message });
        }

        if (row && row.value) {
            try {
                const holidays = JSON.parse(row.value);
                res.json({ success: true, holidays });
            } catch (e) {
                res.json({ success: true, holidays: { zoneA: [], zoneB: [], zoneC: [] } });
            }
        } else {
            res.json({ success: true, holidays: { zoneA: [], zoneB: [], zoneC: [] } });
        }
    });
});

// Lister les fichiers de congés scolaires
router.get('/ics-files/school-holidays', requireAdmin, async (req, res) => {
    try {
        const files = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT f.id, f.filename, f.imported_at,
                       (SELECT COUNT(*) FROM ics_events WHERE file_id = f.id) as periods_count
                FROM ics_files f
                WHERE f.type = 'school-holidays'
                ORDER BY f.imported_at DESC
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        res.json({ files });
    } catch (error) {
        console.error('Erreur liste fichiers congés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Importer un fichier de congés scolaires
router.post('/ics-files/school-holidays', requireAdmin, async (req, res) => {
    try {
        const { filename, content, zoneA, zoneB, zoneC } = req.body;

        // Insérer le fichier
        const fileId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO ics_files (type, filename, content) VALUES (?, ?, ?)`,
                ['school-holidays', filename, content],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Insérer les événements
        const insertEvent = (event, zone) => {
            return new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO ics_events (file_id, event_date, event_end_date, summary, zone) VALUES (?, ?, ?, ?, ?)`,
                    [fileId, event.start, event.end, event.summary, zone],
                    err => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        };

        for (const event of zoneA) await insertEvent(event, 'zoneA');
        for (const event of zoneB) await insertEvent(event, 'zoneB');
        for (const event of zoneC) await insertEvent(event, 'zoneC');

        res.json({ success: true, fileId });
    } catch (error) {
        console.error('Erreur import fichier congés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un fichier de congés scolaires
router.delete('/ics-files/school-holidays/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_events WHERE file_id = ?`, [id], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_files WHERE id = ? AND type = 'school-holidays'`, [id], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression fichier congés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Récupérer toutes les périodes de congés scolaires (tous les fichiers combinés)
router.get('/ics-files/school-holidays/all-periods', requireAuth, async (req, res) => {
    try {
        const events = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT event_date, event_end_date, summary, zone
                FROM ics_events e
                JOIN ics_files f ON e.file_id = f.id
                WHERE f.type = 'school-holidays'
                ORDER BY event_date
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        const periods = { zoneA: [], zoneB: [], zoneC: [] };
        events.forEach(e => {
            if (periods[e.zone]) {
                periods[e.zone].push({ start: e.event_date, end: e.event_end_date, name: e.summary });
            }
        });

        res.json({ periods });
    } catch (error) {
        console.error('Erreur récupération périodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Lister les fichiers de dates particulières
router.get('/ics-files/special-dates', requireAdmin, async (req, res) => {
    try {
        const files = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT f.id, f.filename, f.config, f.imported_at,
                       (SELECT COUNT(*) FROM ics_events WHERE file_id = f.id) as dates_count
                FROM ics_files f
                WHERE f.type = 'special-dates'
                ORDER BY f.imported_at DESC
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Parser la config JSON
        files.forEach(f => {
            try {
                f.config = f.config ? JSON.parse(f.config) : {};
            } catch (e) {
                f.config = {};
            }
        });

        res.json({ files });
    } catch (error) {
        console.error('Erreur liste fichiers dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// Importer un fichier de dates particulières
router.post('/ics-files/special-dates', requireAdmin, async (req, res) => {
    try {
        const { filename, content, events, config } = req.body;

        console.log(`📅 Import special-dates: ${filename}, ${events ? events.length : 0} événements`);

        // Filtrer les événements sans date
        const validEvents = (events || []).filter(e => e && e.start);
        console.log(`📅 Événements valides: ${validEvents.length}`);

        if (validEvents.length === 0) {
            return res.status(400).json({ error: 'Aucun événement valide trouvé dans le fichier' });
        }

        // Insérer le fichier
        const fileId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO ics_files (type, filename, content, config) VALUES (?, ?, ?, ?)`,
                ['special-dates', filename, content, JSON.stringify(config)],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Insérer les événements
        for (const event of validEvents) {
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO ics_events (file_id, event_date, event_end_date, summary) VALUES (?, ?, ?, ?)`,
                    [fileId, event.start, event.end || event.start, event.summary || 'Événement'],
                    err => {
                        if (err) {
                            console.error('Erreur insertion événement:', err, event);
                            reject(err);
                        } else resolve();
                    }
                );
            });
        }

        console.log(`📅 Import réussi: ${validEvents.length} événements insérés`);
        res.json({ success: true, fileId, count: validEvents.length });
    } catch (error) {
        console.error('Erreur import fichier dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier la config d'un fichier de dates particulières
router.put('/ics-files/special-dates/:id/config', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;

        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE ics_files SET config = ? WHERE id = ? AND type = 'special-dates'`,
                [JSON.stringify(config), id],
                err => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un fichier de dates particulières
router.delete('/ics-files/special-dates/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_events WHERE file_id = ?`, [id], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_files WHERE id = ? AND type = 'special-dates'`, [id], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression fichier dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// Récupérer toutes les dates particulières (pour l'affichage Gantt)
// Inclut les fichiers ICS ET les événements personnalisés
router.get('/ics-files/special-dates/all', requireAuth, async (req, res) => {
    try {
        const result = [];

        // 1. Récupérer les dates des fichiers ICS
        const files = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT f.id, f.config
                FROM ics_files f
                WHERE f.type = 'special-dates'
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        for (const file of files) {
            const config = file.config ? JSON.parse(file.config) : {};
            const events = await new Promise((resolve, reject) => {
                database.all(
                    `
                    SELECT event_date, event_end_date, summary
                    FROM ics_events
                    WHERE file_id = ?
                `,
                    [file.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            events.forEach(e => {
                result.push({
                    date: e.event_date,
                    endDate: e.event_end_date,
                    summary: e.summary,
                    config: config
                });
            });
        }

        // 2. Récupérer les événements personnalisés avec les infos du créateur
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all('PRAGMA table_info(custom_events)', (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });

        const hasCreatedBy = columns.some(col => col.name === 'created_by');

        let customEventsQuery;
        if (hasCreatedBy) {
            customEventsQuery = `
                SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom, r.trigramme as creator_trigramme,
                       l.libelle_court as location_libelle_court,
                       et.label_long AS type_long, et.label_short AS type_short, et.icon AS type_icon, et.is_other AS type_other
                FROM custom_events ce
                LEFT JOIN users u ON ce.created_by = u.id
                LEFT JOIN resources r ON u.resource_id = r.id
                LEFT JOIN locations l ON ce.location_id = l.id
                LEFT JOIN event_types et ON ce.type_id = et.id
            `;
        } else {
            customEventsQuery = `SELECT * FROM custom_events`;
        }

        const customEvents = await new Promise((resolve, reject) => {
            database.all(customEventsQuery, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        customEvents.forEach(e => {
            const config = e.config ? JSON.parse(e.config) : {};
            config.label = e.label;
            config.eventId = e.id;
            // Type : libellé court (à défaut long) et icône ; « Autre(s) » ou sans type : le libellé de l'événement
            if (e.type_long && !e.type_other) {
                config.typeId = e.type_id;
                config.typeLong = e.type_long;
                config.typeShort = e.type_short || '';
                config.typeIcon = e.type_icon;
                config.shown = e.type_short || e.type_long;
            } else config.shown = e.label;
            // Transmettre location_id même si la localisation a été supprimée
            // → permet au client d'afficher "NON DÉFINI" quand location_id est set mais libelle_court null
            if (e.location_id) config.locationId = e.location_id;
            if (e.location_libelle_court) config.locationLibelleCourt = e.location_libelle_court;
            result.push({
                date: e.start_date,
                endDate: e.end_date,
                summary: e.label,
                period: e.period || 'FULL',
                config: config
            });
        });

        // 3. Charger les participants pour les événements personnalisés
        const eventIds = customEvents.map(e => e.id);
        if (eventIds.length > 0) {
            const participants = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT cep.event_id, u.nom, u.prenom
                     FROM custom_event_participants cep
                     JOIN users u ON cep.user_id = u.id
                     WHERE cep.event_id IN (${eventIds.map(() => '?').join(',')})
                     ORDER BY u.nom, u.prenom`,
                    eventIds,
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });

            // Grouper par event_id
            const participantsByEvent = {};
            for (const p of participants) {
                if (!participantsByEvent[p.event_id]) participantsByEvent[p.event_id] = [];
                participantsByEvent[p.event_id].push(`${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim());
            }

            // Injecter dans les résultats
            for (const r of result) {
                if (r.config && r.config.eventId && participantsByEvent[r.config.eventId]) {
                    r.config.participants = participantsByEvent[r.config.eventId];
                }
            }
        }

        console.log(`📅 Dates particulières chargées: ${result.length} (ICS + personnalisés)`);
        res.json({ dates: result });
    } catch (error) {
        console.error('Erreur récupération dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
