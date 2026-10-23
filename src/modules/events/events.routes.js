// Événements personnalisés et types d'événements
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';
import {
    evtOtherType,
    evtResolveForUpdate,
    evtResolveType,
    evtSyncColors,
    evtTypeBody,
    loadExternalParticipants,
    saveExternalParticipants
} from './events.service.js';
import { logUserAction } from '../../services/action-log.js';
import { formatDateFR } from '../../lib/utils.js';
import { buildICS, formatDateICS, generateICSUid } from '../../lib/ics.js';
import { enqueueEmail } from '../../services/email-queue.js';
import { sendTeamsNotificationFromServer } from '../notifications/notifications.service.js';

const router = Router();

router.get('/event-types', requireAuth, async (req, res) => {
    try {
        res.json({
            types: await dbAll(
                'SELECT et.*, (SELECT COUNT(*) FROM custom_events c WHERE c.type_id = et.id) AS events_count FROM event_types et ORDER BY et.is_other, et.sort_order, et.label_long'
            )
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/event-types', requireAdmin, async (req, res) => {
    try {
        const r = evtTypeBody(req.body || {});
        if (r.error) return res.status(400).json({ error: r.error });
        const v = r.value;
        if (await dbGet('SELECT 1 AS x FROM event_types WHERE lower(label_long) = lower(?)', [v.long]))
            return res.status(400).json({ error: 'Un type porte déjà ce libellé long' });
        const max = await dbGet('SELECT COALESCE(MAX(sort_order), 0) AS m FROM event_types WHERE is_other = 0');
        const ins = await dbRun(
            'INSERT INTO event_types (label_long, label_short, icon, bg_color, text_color, border_color, is_other, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
            [v.long, v.short, v.icon, v.bg, v.tx, v.bd, (max.m || 0) + 10]
        );
        logUserAction(req, "Création d'un type d'événement", { id: ins.lastID, libelle: v.long });
        res.json({ success: true, id: ins.lastID });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/event-types/:id', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const t = await dbGet('SELECT * FROM event_types WHERE id = ?', [id]);
        if (!t) return res.status(404).json({ error: 'Type introuvable' });
        if (t.is_other) return res.status(403).json({ error: "Le type « Autre(s) » n'est pas modifiable" });
        const r = evtTypeBody(req.body || {});
        if (r.error) return res.status(400).json({ error: r.error });
        const v = r.value;
        if (await dbGet('SELECT 1 AS x FROM event_types WHERE lower(label_long) = lower(?) AND id <> ?', [v.long, id]))
            return res.status(400).json({ error: 'Un autre type porte déjà ce libellé long' });
        await dbRun(
            'UPDATE event_types SET label_long = ?, label_short = ?, icon = ?, bg_color = ?, text_color = ?, border_color = ? WHERE id = ?',
            [v.long, v.short, v.icon, v.bg, v.tx, v.bd, id]
        );
        const n = await evtSyncColors(id);
        logUserAction(req, "Modification d'un type d'événement", { id, libelle: v.long });
        res.json({ success: true, events: n });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Suppression : les événements associés basculent sur « Autre(s) »
router.delete('/event-types/:id', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const t = await dbGet('SELECT * FROM event_types WHERE id = ?', [id]);
        if (!t) return res.status(404).json({ error: 'Type introuvable' });
        if (t.is_other) return res.status(403).json({ error: "Le type « Autre(s) » n'est pas supprimable" });
        const other = await evtOtherType();
        const moved = (await dbGet('SELECT COUNT(*) AS n FROM custom_events WHERE type_id = ?', [id])).n;
        await dbRun('UPDATE custom_events SET type_id = ? WHERE type_id = ?', [other.id, id]);
        await evtSyncColors(other.id);
        await dbRun('DELETE FROM event_types WHERE id = ?', [id]);
        logUserAction(req, "Suppression d'un type d'événement", {
            id,
            libelle: t.label_long,
            evenementsBascules: moved
        });
        res.json({ success: true, moved });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reprise des données : tous les événements en base (seuls le type et le libellé sont modifiables)
router.get('/event-types/events', requireAdmin, async (req, res) => {
    try {
        const events = await dbAll(`
            SELECT ce.id, ce.label, ce.start_date, ce.end_date, ce.period, ce.type_id, ce.grist,
                   l.libelle_court AS location_court, l.libelle_long AS location_long,
                   u.nom AS creator_nom, u.prenom AS creator_prenom
            FROM custom_events ce
            LEFT JOIN locations l ON ce.location_id = l.id
            LEFT JOIN users u ON ce.created_by = u.id
            ORDER BY ce.start_date, ce.id`);
        const parts = await dbAll(
            `SELECT cep.event_id, u.nom, u.prenom FROM custom_event_participants cep JOIN users u ON cep.user_id = u.id ORDER BY u.nom, u.prenom`
        );
        const ext = await dbAll(`SELECT event_id, nom, prenom, email FROM custom_event_external_participants`);
        const by = {};
        parts.forEach(p => {
            (by[p.event_id] = by[p.event_id] || []).push(`${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim());
        });
        ext.forEach(p => {
            (by[p.event_id] = by[p.event_id] || []).push(
                `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || p.email || 'Externe'
            );
        });
        events.forEach(e => {
            e.participants = by[e.id] || [];
        });
        res.json({ events });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/event-types/events/bulk', requireAdmin, async (req, res) => {
    try {
        const updates = Array.isArray(req.body && req.body.updates) ? req.body.updates.slice(0, 5000) : [];
        let n = 0;
        for (const u of updates) {
            const id = Number(u.id);
            const ev =
                id > 0 ? await dbGet('SELECT id, label, config, type_id FROM custom_events WHERE id = ?', [id]) : null;
            if (!ev) continue;
            const label = u.label === undefined ? ev.label : String(u.label).trim();
            if (!label) continue;
            let cfg = {};
            try {
                cfg = JSON.parse(ev.config || '{}') || {};
            } catch (e) {
                cfg = {};
            }
            let typeId = ev.type_id;
            if (u.type_id !== undefined) {
                const r = await evtResolveType(u.type_id, cfg);
                typeId = r.typeId;
                cfg = r.config;
            }
            if (label === ev.label && typeId === ev.type_id) continue;
            await dbRun('UPDATE custom_events SET label = ?, type_id = ?, config = ? WHERE id = ?', [
                label,
                typeId,
                JSON.stringify(cfg),
                id
            ]);
            n++;
        }
        logUserAction(req, 'Reprise des données des événements (type / libellé)', { modifies: n });
        res.json({ success: true, updated: n });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/custom-events/search', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate, label, participantIds } = req.query;

        // Construire la requête avec filtres dynamiques
        let conditions = [];
        let params = [];

        if (startDate) {
            conditions.push(`ce.end_date >= ?`);
            params.push(startDate);
        }
        if (endDate) {
            conditions.push(`ce.start_date <= ?`);
            params.push(endDate);
        }
        if (label && label.trim()) {
            conditions.push(`UPPER(ce.label) LIKE ?`);
            params.push(`%${label.trim().toUpperCase()}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom,
                   l.libelle_long as location_libelle_long, l.libelle_court as location_libelle_court, l.adresse as location_adresse
            FROM custom_events ce
            LEFT JOIN users u ON ce.created_by = u.id
            LEFT JOIN locations l ON ce.location_id = l.id
            ${whereClause}
            ORDER BY ce.start_date DESC
        `;

        let events = await new Promise((resolve, reject) => {
            database.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });

        // Charger les participants pour chaque événement
        if (events.length > 0) {
            const eventIds = events.map(e => e.id);
            const participants = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT cep.event_id, cep.user_id, u.nom, u.prenom, u.email
                     FROM custom_event_participants cep
                     JOIN users u ON cep.user_id = u.id
                     WHERE cep.event_id IN (${eventIds.map(() => '?').join(',')})
                     ORDER BY u.nom, u.prenom`,
                    eventIds,
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });

            const participantsByEvent = {};
            for (const p of participants) {
                if (!participantsByEvent[p.event_id]) participantsByEvent[p.event_id] = [];
                participantsByEvent[p.event_id].push(p);
            }
            events.forEach(e => {
                e.participants = participantsByEvent[e.id] || [];
            });

            // Filtrer par participants si demandé
            if (participantIds) {
                const ids = participantIds.split(',').map(Number).filter(Boolean);
                if (ids.length > 0) {
                    events = events.filter(e => ids.every(id => (e.participants || []).some(p => p.user_id === id)));
                }
            }
        } else {
            events.forEach(e => {
                e.participants = [];
            });
        }

        res.json({ events });
    } catch (error) {
        console.error('Erreur recherche événements:', error);
        res.status(500).json({ error: error.message });
    }
});

// Lister tous les événements personnalisés (admin uniquement - pour l'administration)
router.get('/custom-events', requireAdmin, async (req, res) => {
    try {
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all('PRAGMA table_info(custom_events)', (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });

        const hasCreatedBy = columns.some(col => col.name === 'created_by');

        let query;
        if (hasCreatedBy) {
            query = `
                SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom, r.trigramme as creator_trigramme,
                       et.label_long AS type_long, et.label_short AS type_short, et.icon AS type_icon, et.is_other AS type_other
                FROM custom_events ce
                LEFT JOIN users u ON ce.created_by = u.id
                LEFT JOIN resources r ON u.resource_id = r.id
                LEFT JOIN event_types et ON ce.type_id = et.id
                ORDER BY ce.start_date
            `;
        } else {
            query = `SELECT * FROM custom_events ORDER BY start_date`;
        }

        const events = await new Promise((resolve, reject) => {
            database.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Charger les participants pour chaque événement
        const allEventIds = events.map(e => e.id);
        const externalByEvent = await loadExternalParticipants(allEventIds);
        for (const event of events) {
            try {
                const participants = await new Promise((resolve, reject) => {
                    database.all(
                        `SELECT cep.user_id, u.nom, u.prenom, u.email, u.profile_photo
                         FROM custom_event_participants cep
                         JOIN users u ON cep.user_id = u.id
                         WHERE cep.event_id = ?
                         ORDER BY u.nom, u.prenom`,
                        [event.id],
                        (err, rows) => (err ? reject(err) : resolve(rows || []))
                    );
                });
                event.participants = participants;
                event.external_participants = externalByEvent[event.id] || [];
            } catch (e) {
                event.participants = [];
                event.external_participants = [];
            }
        }

        res.json({ events });
    } catch (error) {
        console.error('Erreur liste événements personnalisés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Lister les événements personnalisés de l'utilisateur connecté (pour experts/utilisateurs)
// Endpoint mobile : tous les événements (pas de filtrage par expert)
router.get('/mobile-events', requireAuth, async (req, res) => {
    try {
        const events = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT DISTINCT ce.*,
                       l.libelle_court as location_libelle_court,
                       et.label_long AS type_long, et.label_short AS type_short, et.icon AS type_icon, et.is_other AS type_other, et.code AS type_code
                FROM custom_events ce
                LEFT JOIN locations l ON ce.location_id = l.id
                LEFT JOIN event_types et ON ce.type_id = et.id
                ORDER BY ce.start_date
            `,
                [],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });

        for (const event of events) {
            try {
                event.participants = await new Promise((resolve, reject) => {
                    database.all(
                        `SELECT cep.user_id, u.nom, u.prenom
                         FROM custom_event_participants cep
                         JOIN users u ON cep.user_id = u.id
                         WHERE cep.event_id = ?
                         ORDER BY u.nom, u.prenom`,
                        [event.id],
                        (err, rows) => (err ? reject(err) : resolve(rows || []))
                    );
                });
            } catch (e) {
                event.participants = [];
            }
        }

        console.log(`[mobile-events] ${events.length} événements retournés`);
        res.json({ events });
    } catch (e) {
        console.error('Erreur mobile-events:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/my-custom-events', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const isAdmin = req.session.activeProfile === 'admin';

        // Tous les profils voient tous les événements
        // La colonne is_creator est calculée côté serveur pour le contrôle d'accès côté client
        const events = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT ce.*,
                       u.nom as creator_nom, u.prenom as creator_prenom,
                       r.trigramme as creator_trigramme,
                       l.libelle_long as location_libelle_long,
                       l.libelle_court as location_libelle_court,
                       et.label_long AS type_long, et.label_short AS type_short, et.icon AS type_icon, et.is_other AS type_other,
                       1 as can_edit,
                       CASE WHEN (ce.created_by = ? OR ? = 1) THEN 1 ELSE 0 END as is_creator
                FROM custom_events ce
                LEFT JOIN users u ON ce.created_by = u.id
                LEFT JOIN resources r ON u.resource_id = r.id
                LEFT JOIN locations l ON ce.location_id = l.id
                LEFT JOIN event_types et ON ce.type_id = et.id
                ORDER BY ce.start_date
            `,
                [userId, isAdmin ? 1 : 0],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });

        // Charger les participants pour chaque événement
        for (const event of events) {
            try {
                event.participants = await new Promise((resolve, reject) => {
                    database.all(
                        `SELECT cep.user_id, u.nom, u.prenom, u.email, u.profile_photo
                         FROM custom_event_participants cep
                         JOIN users u ON cep.user_id = u.id
                         WHERE cep.event_id = ?
                         ORDER BY u.nom, u.prenom`,
                        [event.id],
                        (err, rows) => (err ? reject(err) : resolve(rows || []))
                    );
                });
            } catch (e) {
                event.participants = [];
            }
        }

        const allEventIds = events.map(e => e.id);
        const externalByEvent = await loadExternalParticipants(allEventIds);
        for (const event of events) {
            event.external_participants = externalByEvent[event.id] || [];
        }

        res.json({ events, isAdmin, userId });
    } catch (error) {
        console.error('Erreur liste mes événements personnalisés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ajouter un événement personnalisé (admin via interface admin)
router.post('/custom-events', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, label, config, participants, external_participants, period, location_id, type_id } =
            req.body;
        const createdBy = req.session.userId;

        if (!startDate || !label) {
            return res.status(400).json({ error: 'Date de début et libellé requis' });
        }

        const finalPeriod = period && startDate === (endDate || startDate) ? period : 'FULL';
        const _ty = await evtResolveType(type_id, config);

        const eventId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO custom_events (label, start_date, end_date, config, created_by, period, location_id, type_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    label,
                    startDate,
                    endDate || startDate,
                    JSON.stringify(_ty.config),
                    createdBy,
                    finalPeriod,
                    location_id || null,
                    _ty.typeId
                ],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        if (participants && Array.isArray(participants) && participants.length > 0) {
            for (const userId of participants) {
                try {
                    await new Promise((resolve, reject) => {
                        database.run(
                            `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                            [eventId, userId],
                            err => (err ? reject(err) : resolve())
                        );
                    });
                } catch (e) {
                    console.error(`❌ Erreur ajout participant ${userId}:`, e.message);
                }
            }
        }
        await saveExternalParticipants(eventId, external_participants || []);

        console.log(`✅ Événement admin ajouté (ID: ${eventId}, period: ${finalPeriod})`);
        res.json({ success: true, eventId });
    } catch (error) {
        console.error('Erreur ajout événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ajouter un événement personnalisé (utilisateurs/experts via pop-up planification)
router.post('/my-custom-events', requireAuth, async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            label,
            config,
            participants,
            external_participants,
            period,
            location_id,
            needs_resources,
            resources_count,
            notify_user_ids,
            grist,
            type_id
        } = req.body;
        const createdBy = req.session.userId;

        if (!startDate || !label) {
            return res.status(400).json({ error: 'Date de début et libellé requis' });
        }

        const finalPeriod = period && startDate === (endDate || startDate) ? period : 'FULL';
        const _ty = await evtResolveType(type_id, config);

        const eventId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO custom_events (label, start_date, end_date, config, created_by, period, location_id, needs_resources, resources_count, grist, type_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    label,
                    startDate,
                    endDate || startDate,
                    JSON.stringify(_ty.config),
                    createdBy,
                    finalPeriod,
                    location_id || null,
                    needs_resources ? 1 : 0,
                    resources_count || 1,
                    grist ? 1 : 0,
                    _ty.typeId
                ],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Sauvegarder les participants
        if (participants && Array.isArray(participants) && participants.length > 0) {
            for (const userId of participants) {
                try {
                    await new Promise((resolve, reject) => {
                        database.run(
                            `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                            [eventId, userId],
                            err => (err ? reject(err) : resolve())
                        );
                    });
                } catch (e) {
                    console.error(`❌ Erreur ajout participant ${userId}:`, e.message);
                }
            }
        }
        await saveExternalParticipants(eventId, external_participants || []);

        // --- Récupérer localisation et créateur (communs aux deux blocs email) ---
        let locLabel = '';
        if (location_id) {
            const loc = await new Promise(resolve => {
                database.get(
                    `SELECT libelle_long, libelle_court FROM locations WHERE id = ?`,
                    [location_id],
                    (err, row) => resolve(row)
                );
            });
            locLabel = loc?.libelle_long || loc?.libelle_court || '';
        }
        const creatorInfo = await new Promise(resolve => {
            database.get(`SELECT nom, prenom, email FROM users WHERE id = ?`, [createdBy], (err, row) => resolve(row));
        });
        const creatorFullName = creatorInfo ? `${creatorInfo.prenom} ${creatorInfo.nom}` : 'Plateforme ANS';
        const creatorMail = creatorInfo?.email || '';
        const dateRangeLabel =
            startDate === (endDate || startDate)
                ? formatDateFR(startDate)
                : `du ${formatDateFR(startDate)} au ${formatDateFR(endDate || startDate)}`;

        // --- PARTIE 6 : Email simple de notification aux participants à la création (sans ICS) ---
        if (participants && participants.length > 0) {
            const participantPlaceholders = participants.map(() => '?').join(',');
            const participantUsers = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE id IN (${participantPlaceholders}) AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    participants,
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });

            const notifBatchId = generateICSUid();
            for (const participant of participantUsers) {
                const attendeeName = `${participant.prenom} ${participant.nom}`;
                const htmlNotif = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #ff9800; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h2 style="color: white; margin: 0;">📅 ${label}</h2>
                        </div>
                        <div style="background-color: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0;">
                            <p>Bonjour <strong>${attendeeName}</strong>,</p>
                            <p>Vous avez été ajouté(e) comme participant(e) à l'événement suivant sur la Plateforme de Planification ANS :</p>
                            <div style="background: white; border-left: 4px solid #ff9800; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0;">
                                <p style="margin: 5px 0;"><strong>📋 Événement :</strong> ${label}</p>
                                <p style="margin: 5px 0;"><strong>📅 Date(s) :</strong> ${dateRangeLabel}</p>
                                ${locLabel ? `<p style="margin: 5px 0;"><strong>📍 Lieu :</strong> ${locLabel}</p>` : ''}
                                <p style="margin: 5px 0;"><strong>👤 Organisateur :</strong> ${creatorFullName}</p>
                            </div>
                            <p>Pour confirmer votre participation ou obtenir plus d'informations, connectez-vous à la plateforme.</p>
                            <p>Cordialement,<br><strong>${creatorFullName}</strong><br><em>Via la Plateforme de Planification ANS</em></p>
                        </div>
                    </div>`;
                await enqueueEmail({
                    batchId: notifBatchId,
                    recipientEmail: participant.email,
                    recipientName: attendeeName,
                    senderName: creatorFullName,
                    senderEmail: creatorMail,
                    subject: `Vous êtes participant(e) — ${label} — ${dateRangeLabel}`,
                    htmlBody: htmlNotif,
                    icsContent: null,
                    icsMethod: null,
                    icsFilename: null,
                    actionType: 'event_notification'
                });
            }
        }

        // --- PARTIE 4 : Emails de mobilisation ---
        if (needs_resources && notify_user_ids && notify_user_ids.length > 0) {
            const placeholders = notify_user_ids.map(() => '?').join(',');
            const usersToNotify = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE id IN (${placeholders}) AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    notify_user_ids,
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });

            const batchId = generateICSUid();
            for (const user of usersToNotify) {
                const attendeeName = `${user.prenom} ${user.nom}`;
                const htmlBody = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #1D70B7; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h2 style="color: white; margin: 0;">Demande de mobilisation</h2>
                        </div>
                        <div style="background-color: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0;">
                            <p>Bonjour <strong>${attendeeName}</strong>,</p>
                            <p>Un événement a été créé sur la Plateforme de Planification ANS et nous souhaiterions savoir si vous êtes disponible pour y participer.</p>
                            <div style="background: white; border-left: 4px solid #1D70B7; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0;">
                                <p style="margin: 5px 0;"><strong>📋 Événement :</strong> ${label}</p>
                                <p style="margin: 5px 0;"><strong>📅 Date(s) :</strong> ${dateRangeLabel}</p>
                                <p style="margin: 5px 0;"><strong>📍 Lieu :</strong> ${locLabel || 'Non précisée'}</p>
                                <p style="margin: 5px 0;"><strong>👤 Organisateur :</strong> ${creatorFullName}</p>
                            </div>
                            <p>Si vous êtes disponible et souhaitez participer, merci de vous connecter à la plateforme et <strong>d'inscrire votre nom dans la liste des participants</strong> de cet événement.</p>
                            <p style="color: #666; font-size: 13px;">Cette demande est faite à titre informatif. Votre inscription est libre et sans obligation.</p>
                            <p>Cordialement,<br><strong>${creatorFullName}</strong><br><em>Via la Plateforme de Planification ANS</em></p>
                        </div>
                    </div>`;
                const icsContent = buildICS({
                    uid: generateICSUid(),
                    summary: label,
                    description: `Demande de mobilisation\\nOrganisateur: ${creatorFullName}\\nLieu: ${locLabel || 'Non précisée'}`,
                    location: locLabel || 'Non précisée',
                    dtstart: formatDateICS(startDate, 8, 0),
                    dtend: formatDateICS(endDate || startDate, 18, 0),
                    organizer: creatorMail,
                    organizerName: creatorFullName,
                    attendee: user.email,
                    attendeeName,
                    method: 'REQUEST'
                });
                await enqueueEmail({
                    batchId,
                    recipientEmail: user.email,
                    recipientName: attendeeName,
                    senderName: creatorFullName,
                    senderEmail: creatorMail,
                    subject: `${label} - sollicitation`,
                    htmlBody,
                    icsContent,
                    icsMethod: 'REQUEST',
                    icsFilename: 'invitation.ics',
                    actionType: 'mobilisation'
                });
            }
        }

        sendTeamsNotificationFromServer('evenement', {
            name: label,
            date: `${formatDateFR(startDate)}${endDate && endDate !== startDate ? ' au ' + formatDateFR(endDate) : ''}`,
            createdBy: `${req.session.prenom} ${req.session.nom}`
        });

        console.log(
            `✅ Événement personnalisé ajouté (ID: ${eventId}, period: ${finalPeriod}, ${participants?.length || 0} participant(s))`
        );
        res.json({ success: true, eventId });
    } catch (error) {
        console.error('Erreur ajout événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// S'inscrire comme participant à un événement existant (avec maj planning expert)
router.post('/my-custom-events/:id/join', requireAuth, async (req, res) => {
    const eventId = req.params.id;
    const userId = req.session.userId;
    const resourceId = req.session.resourceId;
    const isExpert = req.session.activeProfile === 'expert';
    console.log(`[JOIN] userId=${userId} resourceId=${resourceId} isExpert=${isExpert} eventId=${eventId}`);

    try {
        const event = await new Promise((resolve, reject) => {
            database.get(
                `SELECT ce.*, l.libelle_long as location_libelle, l.libelle_court as location_court
                 FROM custom_events ce
                 LEFT JOIN locations l ON ce.location_id = l.id
                 WHERE ce.id = ?`,
                [eventId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!event) return res.status(404).json({ error: 'Événement introuvable' });

        await new Promise((resolve, reject) => {
            database.run(
                `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                [eventId, userId],
                err => (err ? reject(err) : resolve())
            );
        });

        let planningUpdates = [];
        if (isExpert && resourceId) {
            const start = new Date(event.start_date);
            const end = new Date(event.end_date || event.start_date);
            const dates = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(d.toISOString().split('T')[0]);
            }
            const periods = event.period === 'AM' ? ['AM'] : event.period === 'PM' ? ['PM'] : ['AM', 'PM'];

            for (const dateStr of dates) {
                for (const period of periods) {
                    const dateKey = `${dateStr}_${period}`;
                    const availRow = await new Promise(resolve => {
                        database.get(
                            `SELECT value FROM schedule_data WHERE resource_id=? AND date_key=? AND type='available'`,
                            [resourceId, dateKey],
                            (err, row) => resolve(row)
                        );
                    });
                    const actRow = await new Promise(resolve => {
                        database.get(
                            `SELECT value FROM schedule_data WHERE resource_id=? AND date_key=? AND type='activity'`,
                            [resourceId, dateKey],
                            (err, row) => resolve(row)
                        );
                    });
                    const availVal = availRow?.value || '1';
                    const actVal = actRow?.value || '1';
                    // available → toujours '2' si était '1'
                    const newAvail = availVal === '1' ? '2' : availVal;
                    // activity → '8' seulement si était '1' (sinon on conserve)
                    const newAct = actVal === '1' ? '8' : actVal;
                    const changed = newAvail !== availVal || newAct !== actVal;
                    if (changed) {
                        await new Promise(resolve => {
                            database.run(
                                `INSERT INTO schedule_data (resource_id, date_key, type, value, notification) VALUES (?, ?, 'available', ?, '0')
                                 ON CONFLICT(resource_id, date_key, type) DO UPDATE SET value = excluded.value`,
                                [resourceId, dateKey, newAvail],
                                resolve
                            );
                        });
                        await new Promise(resolve => {
                            database.run(
                                `INSERT INTO schedule_data (resource_id, date_key, type, value, notification) VALUES (?, ?, 'activity', ?, '0')
                                 ON CONFLICT(resource_id, date_key, type) DO UPDATE SET value = excluded.value`,
                                [resourceId, dateKey, newAct],
                                resolve
                            );
                        });
                        planningUpdates.push({ dateStr, period, newAvail, newAct });
                    }
                }
            }
        }

        res.json({
            success: true,
            planningUpdated: planningUpdates.length > 0,
            planningUpdates,
            isExpert,
            eventLabel: event.label
        });
    } catch (error) {
        console.error('Erreur join event:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier un événement personnalisé (admin)
router.put('/custom-events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            startDate,
            endDate,
            label,
            config,
            createdBy,
            participants,
            external_participants,
            period,
            location_id,
            grist,
            type_id
        } = req.body;

        const finalPeriod = period && startDate === (endDate || startDate) ? period : 'FULL';
        const _ty = await evtResolveForUpdate(id, type_id, config);

        if (createdBy !== undefined) {
            await new Promise((resolve, reject) => {
                database.run(
                    `UPDATE custom_events SET label = ?, start_date = ?, end_date = ?, config = ?, created_by = ?, period = ?, location_id = ?, grist = ?, type_id = ? WHERE id = ?`,
                    [
                        label,
                        startDate,
                        endDate || startDate,
                        JSON.stringify(_ty.config),
                        createdBy,
                        finalPeriod,
                        location_id || null,
                        grist ? 1 : 0,
                        _ty.typeId,
                        id
                    ],
                    err => (err ? reject(err) : resolve())
                );
            });
        } else {
            await new Promise((resolve, reject) => {
                database.run(
                    `UPDATE custom_events SET label = ?, start_date = ?, end_date = ?, config = ?, period = ?, location_id = ?, grist = ?, type_id = ? WHERE id = ?`,
                    [
                        label,
                        startDate,
                        endDate || startDate,
                        JSON.stringify(_ty.config),
                        finalPeriod,
                        location_id || null,
                        grist ? 1 : 0,
                        _ty.typeId,
                        id
                    ],
                    err => (err ? reject(err) : resolve())
                );
            });
        }

        if (participants !== undefined) {
            await new Promise((resolve, reject) => {
                database.run(`DELETE FROM custom_event_participants WHERE event_id = ?`, [id], err =>
                    err ? reject(err) : resolve()
                );
            });
            if (Array.isArray(participants)) {
                for (const uid of participants) {
                    try {
                        await new Promise((resolve, reject) => {
                            database.run(
                                `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                                [id, uid],
                                err => (err ? reject(err) : resolve())
                            );
                        });
                    } catch (e) {
                        /* ignore */
                    }
                }
            }
        }
        await saveExternalParticipants(id, external_participants || []);

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier un événement personnalisé (utilisateur - seulement ses propres événements)
router.put('/my-custom-events/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            startDate,
            endDate,
            label,
            config,
            participants,
            external_participants,
            period,
            location_id,
            grist,
            type_id
        } = req.body;
        const userId = req.session.userId;
        const isAdmin = req.session.activeProfile === 'admin';

        // Modification ouverte à tous les utilisateurs authentifiés

        const finalPeriod = period && startDate === (endDate || startDate) ? period : 'FULL';

        const _ty = await evtResolveForUpdate(id, type_id, config);
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE custom_events SET label = ?, start_date = ?, end_date = ?, config = ?, period = ?, location_id = ?, grist = ?, type_id = ? WHERE id = ?`,
                [
                    label,
                    startDate,
                    endDate || startDate,
                    JSON.stringify(_ty.config),
                    finalPeriod,
                    location_id || null,
                    grist ? 1 : 0,
                    _ty.typeId,
                    id
                ],
                err => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        if (participants !== undefined) {
            await new Promise((resolve, reject) => {
                database.run(`DELETE FROM custom_event_participants WHERE event_id = ?`, [id], err =>
                    err ? reject(err) : resolve()
                );
            });
            if (Array.isArray(participants)) {
                for (const uid of participants) {
                    try {
                        await new Promise((resolve, reject) => {
                            database.run(
                                `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                                [id, uid],
                                err => (err ? reject(err) : resolve())
                            );
                        });
                    } catch (e) {
                        /* ignore duplicates */
                    }
                }
            }
        }
        await saveExternalParticipants(id, external_participants || []);

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification mon événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un événement personnalisé (admin)
router.delete('/custom-events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM custom_events WHERE id = ?`, [id], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un événement personnalisé (utilisateur - seulement ses propres événements)
router.delete('/my-custom-events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM custom_events WHERE id = ?`, [id], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression mon événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
