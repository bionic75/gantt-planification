// Comptes rendus d'activité (CRA) : /api/cra, /api/automation/cra
// Gestionnaires repris à l'identique du code historique ; découpage contrôleur / service prévu
// lors du passage à Prisma (phase 2), qui réécrit les requêtes.
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { env as appEnv } from '../../config/env.js';
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';
import { emailConfig } from '../../lib/mailer.js';
import { puppeteer } from '../../lib/puppeteer.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { requireAdmin, requireAdminOrRh, requireAuth } from '../../middlewares/auth.js';
import { logUserAction } from '../../services/action-log.js';
import { enqueueEmail, newBatchId as generateICSUid } from '../../services/email-queue.js';
import { buildCraDocumentHtml, buildCraEmailHtml, generateCraPdf } from './cra.documents.js';
import {
    CRA_ACTIVITY_OBJETS,
    craHalfHours,
    craLoadForCollect,
    craMarkAdminModified,
    getCraConfig
} from './cra.service.js';

const router = Router();

router.get('/cra/experts-astreinte', requireAdmin, (req, res) => {
    database.all(
        `SELECT r.id as resource_id, r.nom, r.prenom, r.samu, r.es_rattachement, r.email, u.id as user_id
         FROM resources r
         LEFT JOIN users u ON u.resource_id = r.id AND u.is_expert = 1
         WHERE r.astreinte_volontaire = 1 AND r.actif = 1
         ORDER BY r.nom, r.prenom`,
        (err, rows) => (err ? res.status(500).json({ error: err.message }) : res.json(rows || []))
    );
});

router.post('/cra/rh-recipients', requireAdmin, async (req, res) => {
    const { recipients } = req.body;
    try {
        for (const [resourceId, emails] of Object.entries(recipients)) {
            await new Promise((resolve, reject) => {
                database.run(`DELETE FROM cra_rh_recipients WHERE resource_id = ?`, [resourceId], err =>
                    err ? reject(err) : resolve()
                );
            });
            for (const email of emails) {
                if (!email || !email.includes('@')) continue;
                await new Promise(resolve => {
                    database.run(
                        `INSERT OR IGNORE INTO cra_rh_recipients (resource_id, email) VALUES (?, ?)`,
                        [resourceId, email.trim()],
                        () => resolve()
                    );
                });
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/cra/my-list', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const profile = req.session.activeProfile;
    const isAdmin = profile === 'admin';
    const isRh = profile === 'rh';
    try {
        let rows;
        if (isAdmin) {
            // Admin : tous les CRA non archivés (toutes statuts)
            rows = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT c.*,
                            u.prenom || ' ' || u.nom as expert_nom,
                            u1.nom || ' ' || u1.prenom as vise_n1_nom,
                            u2.nom || ' ' || u2.prenom as vise_n2_nom
                     FROM cra c
                     LEFT JOIN users u ON c.user_id = u.id
                     LEFT JOIN users u1 ON c.vise_n1_by = u1.id
                     LEFT JOIN users u2 ON c.vise_n2_by = u2.id
                     WHERE (c.archived IS NULL OR c.archived = 0) AND (c.deleted IS NULL OR c.deleted = 0)
                     ORDER BY c.annee DESC, c.mois DESC`,
                    [],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });
        } else if (isRh) {
            // RH : tous les CRA signés (diffuse), non archivés, lecture seule
            rows = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT c.*,
                            u.prenom || ' ' || u.nom as expert_nom,
                            u1.nom || ' ' || u1.prenom as vise_n1_nom,
                            u2.nom || ' ' || u2.prenom as vise_n2_nom
                     FROM cra c
                     LEFT JOIN users u ON c.user_id = u.id
                     LEFT JOIN users u1 ON c.vise_n1_by = u1.id
                     LEFT JOIN users u2 ON c.vise_n2_by = u2.id
                     WHERE c.statut = 'diffuse' AND (c.archived IS NULL OR c.archived = 0) AND (c.deleted IS NULL OR c.deleted = 0)
                     ORDER BY c.annee DESC, c.mois DESC`,
                    [],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });
        } else {
            // Expert : ses propres CRA
            rows = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT c.*, u1.nom || ' ' || u1.prenom as vise_n1_nom, u2.nom || ' ' || u2.prenom as vise_n2_nom
                     FROM cra c
                     LEFT JOIN users u1 ON c.vise_n1_by = u1.id
                     LEFT JOIN users u2 ON c.vise_n2_by = u2.id
                     WHERE c.user_id = ? ORDER BY c.annee DESC, c.mois DESC`,
                    [userId],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/cra/admin/list', requireAdminOrRh, async (req, res) => {
    const { user_id, statut, mois, annee } = req.query;
    let where = '(c.archived IS NULL OR c.archived = 0)';
    const params = [];
    if (user_id) {
        where += ' AND c.user_id = ?';
        params.push(user_id);
    }
    if (statut) {
        const statuts = statut
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (statuts.length === 1) {
            where += ' AND c.statut = ?';
            params.push(statuts[0]);
        } else {
            where += ` AND c.statut IN (${statuts.map(() => '?').join(',')})`;
            params.push(...statuts);
        }
    }
    if (mois) {
        where += ' AND c.mois = ?';
        params.push(mois);
    }
    if (annee) {
        where += ' AND c.annee = ?';
        params.push(annee);
    }
    database.all(
        `SELECT c.*, u.prenom || ' ' || u.nom as expert_nom, u1.prenom || ' ' || u1.nom as vise_n1_nom, u2.prenom || ' ' || u2.nom as vise_n2_nom,
                (SELECT COUNT(*) FROM astreintes_hno h WHERE h.user_id = c.user_id AND h.date_debut <= printf('%04d-%02d-31', c.annee, c.mois) AND h.date_fin >= printf('%04d-%02d-01', c.annee, c.mois)) AS nb_lignes
         FROM cra c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN users u1 ON c.vise_n1_by = u1.id LEFT JOIN users u2 ON c.vise_n2_by = u2.id
         WHERE ${where} ORDER BY c.annee DESC, c.mois DESC, u.nom`,
        params,
        (err, rows) => (err ? res.status(500).json({ error: err.message }) : res.json(rows || []))
    );
});

// Liste tous les experts ayant au moins un CRA (actifs ou non) — pour le filtre Signatures CRA
// Tous les experts sans filtre astreinte (pour "CRA à lancer")
router.get('/cra/all-experts-full', requireAdmin, (req, res) => {
    database.all(
        `SELECT DISTINCT
             u.id as user_id,
             COALESCE(NULLIF(u.nom,''), r.nom) as nom,
             COALESCE(NULLIF(u.prenom,''), r.prenom) as prenom
         FROM resources r
         LEFT JOIN users u ON u.resource_id = r.id
         WHERE r.actif = 1 AND r.astreinte_volontaire = 1 AND u.id IS NOT NULL
         ORDER BY nom, prenom`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// Lancer manuellement un CRA pour un expert et un mois/année
router.post('/cra/launch', requireAdmin, async (req, res) => {
    const { user_id, mois, annee } = req.body;
    if (!user_id || !mois || !annee) return res.status(400).json({ error: 'Paramètres manquants' });
    try {
        const expert = await new Promise((resolve, reject) => {
            database.get(
                `SELECT u.id as user_id, u.nom, u.prenom, r.id as resource_id,
                        r.is_mad_volante, r.date_debut as mad_date_debut, r.date_fin_mad
                 FROM users u JOIN resources r ON u.resource_id = r.id
                 WHERE u.id = ? AND u.is_expert = 1`,
                [user_id],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!expert) return res.status(404).json({ error: 'Expert introuvable' });
        const existing = await new Promise((resolve, reject) => {
            database.get(
                `SELECT id, statut FROM cra WHERE user_id = ? AND mois = ? AND annee = ? AND (deleted IS NULL OR deleted = 0)`,
                [user_id, mois, annee],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (existing) {
            const label = existing.statut === 'diffuse' ? 'signé' : 'en cours de traitement';
            return res.status(409).json({ error: `Un CRA ${label} existe déjà pour cet expert sur cette période.` });
        }
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO cra (user_id, resource_id, mois, annee, statut) VALUES (?, ?, ?, ?, 'a_completer')`,
                [expert.user_id, expert.resource_id, mois, annee],
                err => (err ? reject(err) : resolve())
            );
        });

        // Pour les MAD volantes : pré-remplir les astreintes/HNO depuis le planning du mois
        if (expert.is_mad_volante) {
            const activityObjets = {
                3: 'SAMU (Déploiement)',
                4: 'SAMU (Dev. usages)',
                5: 'ANS (Déploiement)',
                6: 'ANS (Dev. usages)',
                7: 'Qualification',
                8: 'Divers'
            };
            const pad = n => String(n).padStart(2, '0');
            const monthPrefix = `${annee}-${pad(mois)}-`;

            // Lire les affectations du planning pour ce mois
            const scheduleRows = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT date_key, type, value FROM schedule_data
                     WHERE resource_id = ? AND date_key LIKE ? AND type IN ('activity', 'available', 'localisation')
                     ORDER BY date_key`,
                    [expert.resource_id, `${monthPrefix}%`],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });

            // Indexer par date_key (e.g. "2026-09-01_AM")
            const byKey = {};
            scheduleRows.forEach(r => {
                if (!byKey[r.date_key]) byKey[r.date_key] = {};
                byKey[r.date_key][r.type] = r.value;
            });

            // Regrouper les demi-journées consécutives de même objet en une seule ligne
            const halfDays = Object.keys(byKey).sort();
            // Collecter les blocs : {date, period, objet, samu}
            const blocs = [];
            for (const dk of halfDays) {
                const actVal = byKey[dk].activity;
                const availVal = byKey[dk].available;
                if (!actVal || parseInt(actVal) < 3) continue; // pas d'affectation réelle
                if (availVal !== '2') continue; // disponibilité non verte
                const [datePart, period] = dk.split('_');
                const objet = activityObjets[actVal] || 'Activité';
                blocs.push({ date: datePart, period, objet });
            }

            // Fusionner les demi-journées AM+PM du même jour et même objet en journée complète
            const merged = [];
            let i = 0;
            while (i < blocs.length) {
                const b = blocs[i];
                if (b.period === 'AM' && i + 1 < blocs.length) {
                    const next = blocs[i + 1];
                    if (next.date === b.date && next.period === 'PM' && next.objet === b.objet) {
                        merged.push({
                            date_debut: b.date,
                            date_fin: b.date,
                            heure_debut: '08:00',
                            heure_fin: '18:00',
                            objet: b.objet
                        });
                        i += 2;
                        continue;
                    }
                }
                const hd = b.period === 'AM' ? '08:00' : '13:00';
                const hf = b.period === 'AM' ? '12:00' : '18:00';
                merged.push({ date_debut: b.date, date_fin: b.date, heure_debut: hd, heure_fin: hf, objet: b.objet });
                i++;
            }

            // Insérer dans astreintes_hno
            for (const entry of merged) {
                await new Promise((resolve, reject) => {
                    database.run(
                        `INSERT INTO astreintes_hno (user_id, type, date_debut, date_fin, heure_debut, heure_fin, objet)
                         VALUES (?, 'activite_courante', ?, ?, ?, ?, ?)`,
                        [
                            expert.user_id,
                            entry.date_debut,
                            entry.date_fin,
                            entry.heure_debut,
                            entry.heure_fin,
                            entry.objet
                        ],
                        err => (err ? reject(err) : resolve())
                    );
                });
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/cra/all-experts', requireAdminOrRh, (req, res) => {
    database.all(
        `SELECT DISTINCT u.id as user_id, u.nom, u.prenom
         FROM users u
         JOIN resources r ON u.resource_id = r.id
         WHERE r.astreinte_volontaire = 1
         ORDER BY u.nom, u.prenom`,
        (err, rows) => (err ? res.status(500).json({ error: err.message }) : res.json(rows || []))
    );
});

// Trouver ou créer un CRA pour un utilisateur/mois (admin ou expert sur son propre CRA)
router.get('/cra/find-or-create', requireAuth, async (req, res) => {
    const { user_id, mois, annee } = req.query;
    if (!user_id || !mois || !annee) return res.status(400).json({ error: 'Paramètres manquants' });
    const isAdmin = req.session.activeProfile === 'admin';
    const isSelf = String(req.session.userId) === String(user_id);
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Accès refusé' });
    try {
        const existing = await new Promise((resolve, reject) => {
            database.get(
                `SELECT id, statut FROM cra WHERE user_id = ? AND mois = ? AND annee = ? AND (deleted IS NULL OR deleted = 0)`,
                [user_id, mois, annee],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (existing) return res.json({ id: existing.id, statut: existing.statut, created: false });
        // Créer un nouveau CRA
        const expert = await new Promise((resolve, reject) => {
            database.get(
                `SELECT u.id as user_id, r.id as resource_id FROM users u JOIN resources r ON u.resource_id = r.id WHERE u.id = ?`,
                [user_id],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!expert) return res.status(404).json({ error: 'Utilisateur introuvable' });
        const newId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO cra (user_id, resource_id, mois, annee, statut) VALUES (?, ?, ?, ?, 'a_completer')`,
                [expert.user_id, expert.resource_id, mois, annee],
                function (err) {
                    err ? reject(err) : resolve(this.lastID);
                }
            );
        });
        res.json({ id: newId, statut: 'a_completer', created: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Archiver un CRA
router.post('/cra/:id/archive', requireAdmin, (req, res) => {
    database.run('UPDATE cra SET archived = 1 WHERE id = ?', [req.params.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        logUserAction(req, 'Archivage CRA', { craId: req.params.id });
        res.json({ success: true });
    });
});

router.post('/cra/:id/unarchive', requireAdmin, (req, res) => {
    database.run('UPDATE cra SET archived = 0 WHERE id = ?', [req.params.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        logUserAction(req, 'Désarchivage CRA', { craId: req.params.id });
        res.json({ success: true });
    });
});

// Supprimer (soft delete) un CRA archivé
router.post('/cra/:id/soft-delete', requireAdmin, (req, res) => {
    database.get(
        'SELECT statut, archived FROM cra WHERE id = ? AND (deleted IS NULL OR deleted = 0)',
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'CRA introuvable' });
            database.run(
                'UPDATE cra SET deleted = 1, pre_delete_statut = ?, pre_delete_archived = ? WHERE id = ?',
                [row.statut, row.archived, req.params.id],
                err2 => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    logUserAction(req, 'Suppression (soft) CRA', { craId: req.params.id });
                    res.json({ success: true });
                }
            );
        }
    );
});

// Restaurer un CRA supprimé
router.post('/cra/:id/restore-deleted', requireAdmin, (req, res) => {
    database.get(
        'SELECT pre_delete_statut, pre_delete_archived FROM cra WHERE id = ? AND deleted = 1',
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'CRA supprimé introuvable' });
            database.run(
                'UPDATE cra SET deleted = 0, statut = ?, archived = ?, pre_delete_statut = NULL, pre_delete_archived = NULL WHERE id = ?',
                [row.pre_delete_statut || 'a_completer', row.pre_delete_archived || 0, req.params.id],
                err2 => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    logUserAction(req, 'Restauration CRA supprimé', { craId: req.params.id });
                    res.json({ success: true });
                }
            );
        }
    );
});

// Purger définitivement un CRA supprimé
router.delete('/cra/:id/purge', requireAdmin, (req, res) => {
    database.run('DELETE FROM cra WHERE id = ? AND deleted = 1', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'CRA non trouvé ou non supprimé' });
        logUserAction(req, 'Purge définitive CRA', { craId: req.params.id });
        res.json({ success: true });
    });
});

// Liste des CRA supprimés
router.get('/cra/admin/deleted', requireAdmin, (req, res) => {
    database.all(
        `SELECT c.*, u.prenom || ' ' || u.nom as expert_nom
         FROM cra c LEFT JOIN users u ON c.user_id = u.id
         WHERE c.deleted = 1
         ORDER BY c.annee DESC, c.mois DESC, u.nom`,
        (err, rows) => (err ? res.status(500).json({ error: err.message }) : res.json(rows || []))
    );
});

// Liste des CRA archivés
router.get('/cra/admin/archives', requireAdminOrRh, (req, res) => {
    const { user_id, mois, annee } = req.query;
    let where = 'c.archived = 1 AND (c.deleted IS NULL OR c.deleted = 0)';
    const params = [];
    if (user_id) {
        where += ' AND c.user_id = ?';
        params.push(user_id);
    }
    if (mois) {
        where += ' AND c.mois = ?';
        params.push(mois);
    }
    if (annee) {
        where += ' AND c.annee = ?';
        params.push(annee);
    }
    database.all(
        `SELECT c.*, u.prenom || ' ' || u.nom as expert_nom, u1.prenom || ' ' || u1.nom as vise_n1_nom, u2.prenom || ' ' || u2.nom as vise_n2_nom,
                (SELECT COUNT(*) FROM astreintes_hno h WHERE h.user_id = c.user_id AND h.date_debut <= printf('%04d-%02d-31', c.annee, c.mois) AND h.date_fin >= printf('%04d-%02d-01', c.annee, c.mois)) AS nb_lignes
         FROM cra c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN users u1 ON c.vise_n1_by = u1.id LEFT JOIN users u2 ON c.vise_n2_by = u2.id
         WHERE ${where} ORDER BY c.annee DESC, c.mois DESC, u.nom`,
        params,
        (err, rows) => (err ? res.status(500).json({ error: err.message }) : res.json(rows || []))
    );
});

// Déclarer "rien à déclarer" pour un CRA
router.post('/cra/:id/rien-a-declarer', requireAuth, async (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    try {
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET rien_a_declarer = 1, statut = 'soumis', submitted_at = ?, modifie_admin_at = NULL, modifie_admin_nom = NULL WHERE id = ? AND user_id = ? AND statut = 'a_completer'`,
                [now, id, req.session.userId],
                function (err) {
                    err ? reject(err) : resolve(this.changes);
                }
            );
        }).then(changes => {
            if (!changes)
                throw Object.assign(
                    new Error("Seul l'expert concerné peut déclarer « rien à déclarer » sur un CRA à compléter."),
                    { status: 403 }
                );
        });
        // Insérer la signature rang=1 (expert) — absente sinon dans cra_signatures
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT OR IGNORE INTO cra_signatures (cra_id, rang, signer_user_id, signer_name, signer_email, signed_at, ip_address, user_agent, token_used) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    id,
                    req.session.userId,
                    `${req.session.prenom} ${req.session.nom}`,
                    req.session.email || '',
                    now,
                    req.ip,
                    req.headers['user-agent'] || ''
                ],
                err => (err ? reject(err) : resolve())
            );
        });
        res.json({ success: true });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/cra/:id/pdf
router.get('/cra/:id/pdf', requireAuth, async (req, res) => {
    const craId = req.params.id;
    const userId = req.session.userId;
    const isAdmin = req.session.activeProfile === 'admin';
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, u.nom || ' ' || u.prenom as expert_nom FROM cra c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (!isAdmin && req.session.activeProfile !== 'rh' && cra.user_id !== userId)
            return res.status(403).json({ error: 'Accès interdit' });
        const dateStart = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`;
        const dateEnd = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`;
        const astreintes = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM astreintes_hno WHERE user_id=? AND date_debut>=? AND date_debut<=? ORDER BY date_debut`,
                [cra.user_id, dateStart, dateEnd],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
        const signatures = await new Promise((resolve, reject) => {
            database.all(`SELECT * FROM cra_signatures WHERE cra_id=? ORDER BY rang`, [craId], (err, rows) =>
                err ? reject(err) : resolve(rows || [])
            );
        });
        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const pdfBuffer = await generateCraPdf(cra, astreintes, signatures, moisNom);
        const filename = `CRA_${(cra.expert_nom || 'expert').replace(/\s+/g, '_')}_${moisNom.replace(/\s+/g, '_')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Erreur génération PDF CRA:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/cra/:id/diffusion-log', requireAuth, async (req, res) => {
    const craId = req.params.id;
    try {
        const rows = await new Promise((resolve, reject) => {
            database.all(
                `SELECT d.id, d.recipient_email, d.recipient_name, d.recipient_type, d.sent_at, d.email_batch_id,
                        eq.status as email_status, eq.error_message, eq.processed_at
                 FROM cra_diffusion_log d
                 LEFT JOIN (
                     SELECT batch_id,
                            MAX(CASE WHEN status='sent' THEN 'sent' WHEN status='failed' THEN 'failed' ELSE status END) as status,
                            MAX(error_message) as error_message,
                            MAX(processed_at) as processed_at
                     FROM email_queue GROUP BY batch_id
                 ) eq ON eq.batch_id = d.email_batch_id
                 WHERE d.cra_id = ? ORDER BY d.sent_at`,
                [craId],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Renvoyer le CRA à tous les destinataires précédents
router.post('/cra/:id/diffusion-resend-all', requireAdmin, async (req, res) => {
    const craId = req.params.id;
    try {
        const [cra, logs] = await Promise.all([
            new Promise((resolve, reject) =>
                database.get(
                    `SELECT c.*, u.prenom || ' ' || u.nom as expert_nom FROM cra c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
                    [craId],
                    (err, row) => (err ? reject(err) : resolve(row))
                )
            ),
            new Promise((resolve, reject) =>
                database.all(
                    `SELECT DISTINCT recipient_email, recipient_name FROM cra_diffusion_log WHERE cra_id = ? AND COALESCE(recipient_type, '') != 'expert'`,
                    [craId],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                )
            )
        ]);
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (logs.length === 0)
            return res.status(400).json({ error: 'Aucun destinataire RH trouvé dans le log de diffusion' });

        // Répondre immédiatement : la génération PDF (Puppeteer) peut prendre plusieurs
        // dizaines de secondes et ferait sinon expirer le proxy Render (504). L'envoi
        // réel des emails passe de toute façon par la file d'attente asynchrone.
        res.json({ success: true, sent: logs.length });

        const senderName = `${req.session.prenom} ${req.session.nom}`;
        const senderEmail = req.session.email || '';
        const appUrl = appEnv.APP_URL || `${req.protocol}://${req.get('host')}`;

        (async () => {
            try {
                const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
                    month: 'long',
                    year: 'numeric'
                });
                const [astreintes, signatures, resourceRow] = await Promise.all([
                    new Promise((resolve, reject) =>
                        database.all(
                            `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ? ORDER BY date_debut`,
                            [
                                cra.user_id,
                                `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`,
                                `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`
                            ],
                            (err, r) => (err ? reject(err) : resolve(r || []))
                        )
                    ),
                    new Promise((resolve, reject) =>
                        database.all(
                            `SELECT * FROM cra_signatures WHERE cra_id = ? ORDER BY rang`,
                            [craId],
                            (err, r) => (err ? reject(err) : resolve(r || []))
                        )
                    ),
                    new Promise((resolve, reject) =>
                        database.get(
                            `SELECT es_rattachement FROM resources WHERE id = ?`,
                            [cra.resource_id],
                            (err, r) => (err ? reject(err) : resolve(r))
                        )
                    )
                ]);
                const craHtml = buildCraDocumentHtml({
                    cra,
                    astreintes,
                    signatures,
                    moisNom,
                    esRattachement: resourceRow?.es_rattachement || '',
                    appUrl,
                    logoSrc: 'cid:ans-logo'
                });
                const subject = `AGENCE DU NUMERIQUE EN SANTE - ${cra.expert_nom} - ${moisNom} - Compte-Rendu d'Activité (Renvoi)`;

                // Utiliser le PDF sauvegardé sur disque si disponible
                let pdfBase64 = null;
                let pdfFilenameUsed = cra.pdf_filename || null;
                if (pdfFilenameUsed) {
                    try {
                        const { readFileSync } = await import('fs');
                        const pdfBuffer = readFileSync(`./data/pdfs/${pdfFilenameUsed}`);
                        pdfBase64 = pdfBuffer.toString('base64');
                        console.log(`📄 PDF CRA chargé depuis disque pour renvoi: ${pdfFilenameUsed}`);
                    } catch (e) {
                        console.warn('⚠️ PDF sur disque introuvable, renvoi sans PDF:', e.message);
                        pdfFilenameUsed = null;
                    }
                }

                const newBatchId = generateICSUid();
                if (logs.length > 0) {
                    const [firstDest, ...otherDests] = logs;
                    const ccEmails = otherDests.length > 0 ? otherDests.map(d => d.recipient_email).join(', ') : null;
                    await enqueueEmail({
                        batchId: newBatchId,
                        recipientEmail: firstDest.recipient_email,
                        recipientName: firstDest.recipient_name,
                        ccEmails,
                        senderName,
                        senderEmail,
                        subject,
                        htmlBody: craHtml,
                        pdfAttachment: pdfBase64,
                        pdfFilename: pdfFilenameUsed,
                        actionType: 'cra_diffusion'
                    });
                }
                console.log(
                    `✅ Renvoi CRA ${craId}: ${logs.length} email(s) mis en file (PDF: ${pdfBase64 ? 'oui' : 'non'})`
                );
            } catch (bgErr) {
                console.error(`❌ Renvoi CRA ${craId}: échec en arrière-plan:`, bgErr.message);
            }
        })();

        logUserAction(req, 'Renvoi email diffusion CRA (tous destinataires)', { craId, count: logs.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Renvoyer un email de diffusion CRA en échec
router.post('/cra/:id/diffusion-resend/:logId', requireAdmin, async (req, res) => {
    const { id: craId, logId } = req.params;
    try {
        const [cra, logEntry] = await Promise.all([
            new Promise((resolve, reject) =>
                database.get(
                    `SELECT c.*, u.prenom || ' ' || u.nom as expert_nom, u.email as expert_email
                 FROM cra c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
                    [craId],
                    (err, row) => (err ? reject(err) : resolve(row))
                )
            ),
            new Promise((resolve, reject) =>
                database.get(`SELECT * FROM cra_diffusion_log WHERE id = ?`, [logId], (err, row) =>
                    err ? reject(err) : resolve(row)
                )
            )
        ]);
        if (!cra || !logEntry) return res.status(404).json({ error: 'CRA ou log introuvable' });
        if (logEntry.recipient_type === 'expert') {
            // l'expert reçoit la notification (sans PDF), pas le document RH
            const mn = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric'
            });
            const appUrl = appEnv.APP_URL || `${req.protocol}://${req.get('host')}`;
            const nb = generateICSUid();
            await enqueueEmail({
                batchId: nb,
                recipientEmail: logEntry.recipient_email,
                recipientName: logEntry.recipient_name,
                senderName: `${req.session.prenom} ${req.session.nom}`,
                senderEmail: req.session.email || '',
                subject: `CRA ${mn} — diffusé auprès de la RH`,
                htmlBody: buildCraEmailHtml({
                    title: 'CRA diffusé',
                    expertNom: cra.expert_nom,
                    moisNom: mn,
                    craUrl: `${appUrl}/?tab=cra`,
                    action: 'Votre CRA a été doublement visé et diffusé auprès de la RH.'
                }),
                actionType: 'cra_diffusion_expert'
            });
            await new Promise((resolve, reject) =>
                database.run(
                    `UPDATE cra_diffusion_log SET email_batch_id = ?, sent_at = datetime('now') WHERE id = ?`,
                    [nb, logId],
                    err => (err ? reject(err) : resolve())
                )
            );
            logUserAction(req, "Renvoi notification de diffusion CRA à l'expert", { craId, logId });
            return res.json({ success: true });
        }
        const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const moisNomCap = moisNom.charAt(0).toUpperCase() + moisNom.slice(1);
        const newBatchId = generateICSUid();
        const signatures = await new Promise((resolve, reject) =>
            database.all(`SELECT * FROM cra_signatures WHERE cra_id = ? ORDER BY rang`, [craId], (err, r) =>
                err ? reject(err) : resolve(r || [])
            )
        );
        const dateStart = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`;
        const dateEnd = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`;
        const astreintes = await new Promise((resolve, reject) =>
            database.all(
                `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ? ORDER BY date_debut`,
                [cra.user_id, dateStart, dateEnd],
                (err, r) => (err ? reject(err) : resolve(r || []))
            )
        );
        const resourceRow = await new Promise((resolve, reject) =>
            database.get(`SELECT es_rattachement FROM resources WHERE id = ?`, [cra.resource_id], (err, r) =>
                err ? reject(err) : resolve(r)
            )
        );
        const craHtml = buildCraDocumentHtml({
            cra,
            astreintes,
            signatures,
            moisNom,
            esRattachement: resourceRow?.es_rattachement || '',
            appUrl: appEnv.APP_URL || `${req.protocol}://${req.get('host')}`,
            logoSrc: 'cid:ans-logo'
        });
        const craHtmlPdf = buildCraDocumentHtml({
            cra,
            astreintes,
            signatures,
            moisNom,
            esRattachement: resourceRow?.es_rattachement || ''
        });
        const rhSubject = `AGENCE DU NUMERIQUE EN SANTE - ${cra.expert_nom} - ${moisNom} - Compte-Rendu d'Activité (Renvoi)`;
        const pdfFilename = `CRA_${(cra.expert_nom || '').replace(/\s+/g, '_')}_${moisNomCap}.pdf`;

        await new Promise((resolve, reject) =>
            database.run(
                `UPDATE cra_diffusion_log SET email_batch_id = ?, sent_at = datetime('now') WHERE id = ?`,
                [newBatchId, logId],
                err => (err ? reject(err) : resolve())
            )
        );
        logUserAction(req, 'Renvoi email diffusion CRA', { craId, logId });

        // Répondre immédiatement : la génération PDF (Puppeteer) peut prendre plusieurs
        // dizaines de secondes et ferait sinon expirer le proxy Render (504). L'envoi
        // réel de l'email passe de toute façon par la file d'attente asynchrone.
        res.json({ success: true });

        const senderName = req.session.prenom + ' ' + req.session.nom;
        const senderEmail = req.session.email || '';

        (async () => {
            let pdfBase64 = null;
            if (puppeteer) {
                try {
                    const browser = await puppeteer.launch({
                        executablePath: appEnv.PUPPETEER_EXECUTABLE_PATH,
                        headless: true,
                        protocolTimeout: 120000,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                    });
                    const page = await browser.newPage();
                    await page.setContent(craHtmlPdf, { waitUntil: 'domcontentloaded' });
                    const pdfBuffer = await page.pdf({
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
                    });
                    await browser.close();
                    pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
                    console.log(
                        `📄 PDF CRA généré pour renvoi: ${pdfFilename} (${Math.round(pdfBuffer.length / 1024)}Ko)`
                    );
                } catch (e) {
                    console.warn('⚠️ PDF non généré pour renvoi:', e.message);
                }
            } else {
                console.warn('⚠️ Puppeteer non chargé — renvoi CRA sans PDF');
            }

            try {
                await enqueueEmail({
                    batchId: newBatchId,
                    recipientEmail: logEntry.recipient_email,
                    recipientName: logEntry.recipient_name,
                    senderName,
                    senderEmail,
                    subject: rhSubject,
                    htmlBody: craHtml,
                    pdfAttachment: pdfBase64,
                    pdfFilename: pdfBase64 ? pdfFilename : null,
                    actionType: 'cra_diffusion'
                });
                console.log(`✅ Renvoi CRA ${craId} (log ${logId}) mis en file (PDF: ${pdfBase64 ? 'oui' : 'non'})`);
            } catch (bgErr) {
                console.error(
                    `❌ Renvoi CRA ${craId} (log ${logId}): échec mise en file en arrière-plan:`,
                    bgErr.message
                );
            }
        })();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/cra/pdf-saved/:filename — sert un PDF sauvegardé sur disque (doit être avant /api/cra/:id)
router.get('/cra/pdf-saved/:filename', requireAuth, async (req, res) => {
    const filename = path.basename(req.params.filename);
    // Même répertoire que l'écriture (prepare-pdf) et le dump : ./data/pdfs
    const filepath = path.resolve('data', 'pdfs', filename);
    // Servir directement si le fichier existe
    if (fs.existsSync(filepath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(fs.readFileSync(filepath));
    }
    // Fichier absent : retrouver le CRA et régénérer
    try {
        const cra = await new Promise((resolve, reject) =>
            database.get(
                `SELECT c.*, r.es_rattachement, u.prenom || ' ' || u.nom as expert_nom, u.nom as expert_nom_seul, u.prenom as expert_prenom
             FROM cra c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN resources r ON u.resource_id = r.id
             WHERE c.pdf_filename = ?`,
                [filename],
                (err, row) => (err ? reject(err) : resolve(row))
            )
        );
        if (!cra) return res.status(404).json({ error: 'CRA introuvable pour ce fichier' });
        if (!puppeteer) return res.status(503).json({ error: 'Puppeteer non disponible pour la régénération' });

        const [astreintes, signatures] = await Promise.all([
            new Promise((resolve, reject) =>
                database.all(
                    `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ? ORDER BY date_debut`,
                    [
                        cra.user_id,
                        `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`,
                        `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`
                    ],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                )
            ),
            new Promise((resolve, reject) =>
                database.all(`SELECT * FROM cra_signatures WHERE cra_id = ? ORDER BY rang`, [cra.id], (err, rows) =>
                    err ? reject(err) : resolve(rows || [])
                )
            )
        ]);

        const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const craHtmlPdf = buildCraDocumentHtml({
            cra,
            astreintes,
            signatures,
            moisNom,
            esRattachement: cra.es_rattachement || ''
        });

        fs.mkdirSync(path.resolve('data', 'pdfs'), { recursive: true });
        const browser = await puppeteer.launch({
            executablePath: appEnv.PUPPETEER_EXECUTABLE_PATH,
            headless: true,
            protocolTimeout: 180000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(120000);
        await page.setContent(craHtmlPdf, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });
        await browser.close();

        fs.writeFileSync(filepath, pdfBuffer);
        console.log(`📄 PDF CRA régénéré depuis reprise : ${filename}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        // Puppeteer ≥ 22 renvoie un Uint8Array : res.send() le sérialiserait en JSON
        res.send(Buffer.from(pdfBuffer));
    } catch (e) {
        console.error('[pdf-saved] Erreur régénération:', e.message);
        res.status(500).json({ error: 'Erreur lors de la régénération du PDF' });
    }
});

router.get('/cra/:id', requireAuth, async (req, res) => {
    const craId = req.params.id;
    const userId = req.session.userId;
    const isAdmin = req.session.activeProfile === 'admin';
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, u.nom || ' ' || u.prenom as expert_nom, u.resource_id,
                        r.es_rattachement, r.samu as expert_samu,
                        u1.nom || ' ' || u1.prenom as vise_n1_nom, u2.nom || ' ' || u2.prenom as vise_n2_nom
                 FROM cra c LEFT JOIN users u ON c.user_id = u.id
                 LEFT JOIN resources r ON u.resource_id = r.id
                 LEFT JOIN users u1 ON c.vise_n1_by = u1.id LEFT JOIN users u2 ON c.vise_n2_by = u2.id
                 WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (!isAdmin && req.session.activeProfile !== 'rh' && cra.user_id !== userId)
            return res.status(403).json({ error: 'Accès interdit' });
        const dateStart = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`;
        const dateEnd = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`;
        const rawAstreintes = await new Promise((resolve, reject) => {
            // Inclure les astreintes qui chevauchent le mois (pas seulement celles débutant dans le mois)
            database.all(
                `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut <= ? AND date_fin >= ? ORDER BY date_debut`,
                [cra.user_id, dateEnd, dateStart],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
        // Clipper les dates au mois en cours : ne montrer que la portion qui appartient au mois
        const astreintes = rawAstreintes.map(a => ({
            ...a,
            date_debut: a.date_debut < dateStart ? dateStart : a.date_debut,
            date_fin: a.date_fin > dateEnd ? dateEnd : a.date_fin
        }));
        const signatures = await new Promise((resolve, reject) => {
            database.all(`SELECT * FROM cra_signatures WHERE cra_id = ? ORDER BY rang`, [craId], (err, rows) =>
                err ? reject(err) : resolve(rows || [])
            );
        });
        res.json({ ...cra, astreintes_hno: astreintes, signatures });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/cra/:id/collect', requireAuth, async (req, res) => {
    try {
        const { cra, resourceId, isMad } = await craLoadForCollect(req);
        if (!isMad || !resourceId) return res.json({ allowed: false, lines: [] });
        const pad = n => String(n).padStart(2, '0');
        const prefix = `${cra.annee}-${pad(cra.mois)}-`;
        const locs = await dbAll('SELECT libelle_court FROM locations');
        const samuByNo = {};
        locs.forEach(l => {
            const n = affSamuNumber(l.libelle_court);
            if (n && !samuByNo[n]) samuByNo[n] = l.libelle_court;
        });
        const rows = await dbAll(
            `SELECT date_key, type, value FROM schedule_data WHERE resource_id = ? AND date_key LIKE ? AND type IN ('activity','available','localisation') ORDER BY date_key`,
            [resourceId, prefix + '%']
        );
        const byKey = {};
        rows.forEach(r => {
            (byKey[r.date_key] = byKey[r.date_key] || {})[r.type] = r.value;
        });
        const days = {};
        Object.keys(byKey)
            .sort()
            .forEach(k => {
                const c = byKey[k];
                if (!c.activity || parseInt(c.activity) < 3 || c.available !== '2') return; // pas d'activité réelle ou pas disponible ANS
                const [date, half] = k.split('_');
                const samu =
                    c.activity === '3' || c.activity === '4' ? samuByNo[affSamuNumber(c.localisation)] || '' : '';
                (days[date] = days[date] || {})[half] = { act: c.activity, samu };
            });
        const lines = [];
        Object.keys(days)
            .sort()
            .forEach(date => {
                const d = days[date];
                const full = d.AM && d.PM && d.AM.act === d.PM.act && d.AM.samu === d.PM.samu;
                const parts = full
                    ? [['FULL', d.AM]]
                    : [
                          ['AM', d.AM],
                          ['PM', d.PM]
                      ].filter(x => x[1]);
                parts.forEach(([period, v]) => {
                    const [hd, hf] = craHalfHours(period);
                    lines.push({
                        type: 'activite_courante',
                        date_debut: date,
                        date_fin: date,
                        heure_debut: hd,
                        heure_fin: hf,
                        samu: v.samu,
                        objet: CRA_ACTIVITY_OBJETS[v.act] || 'Activité',
                        origin: { kind: 'activity', date, period, activity: v.act, samu: v.samu }
                    });
                });
            });
        // Astreintes du planning d'astreinte (soir 18h-08h, journée complète)
        const roster = await dbAll(
            'SELECT date, type_creneau FROM astreinte_planning WHERE resource_id = ? AND date LIKE ? ORDER BY date',
            [resourceId, prefix + '%']
        );
        roster.forEach(a => {
            const next = new Date(Date.parse(a.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
            const sameMonth = next.startsWith(prefix);
            const soir = a.type_creneau === 'soir';
            lines.push({
                type: 'astreinte',
                date_debut: a.date,
                date_fin: soir && sameMonth ? next : a.date,
                heure_debut: soir ? '18:00' : '08:00',
                heure_fin: soir ? (sameMonth ? '08:00' : '23:59') : '18:00',
                samu: '',
                objet: soir ? 'Astreinte (soir 18h-08h)' : 'Astreinte (journée)',
                origin: { kind: 'astreinte', date: a.date, creneau: a.type_creneau }
            });
        });
        res.json({ allowed: true, lines });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// Report, après accord de l'utilisateur, des corrections du CRA vers la planification
router.post('/cra/:id/propagate', requireAuth, async (req, res) => {
    try {
        const { cra, resourceId, isMad } = await craLoadForCollect(req);
        if (!isMad || !resourceId) return res.status(400).json({ error: 'Report réservé aux MAD volantes' });
        if (cra.statut !== 'a_completer') return res.status(400).json({ error: 'CRA non modifiable dans ce statut' });
        const prefix = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-`;
        const out = { activity: 0, astreinte: 0, skipped: [] };
        const halves = (hd, hf) => {
            const h = s => Number((s || '00:00').slice(0, 2));
            return h(hf) <= 12 ? ['AM'] : h(hd) >= 13 ? ['PM'] : ['AM', 'PM'];
        };
        const up = (key, type, value) =>
            dbRun(
                `INSERT INTO schedule_data (resource_id, date_key, type, value, notification) VALUES (?,?,?,?, '1')
            ON CONFLICT(resource_id, date_key, type) DO UPDATE SET value = excluded.value, notification = '1'`,
                [resourceId, key, type, value]
            );
        for (const c of Array.isArray(req.body.corrections) ? req.body.corrections : []) {
            const o = c.origin || {};
            if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '') || !o.date.startsWith(prefix)) continue;
            if (o.kind === 'activity') {
                const oldHalves = o.period === 'FULL' ? ['AM', 'PM'] : [o.period];
                const nl = c.line; // null = ligne supprimée
                const newOk = nl && /^\d{4}-\d{2}-\d{2}$/.test(nl.date_debut) && nl.date_debut === nl.date_fin;
                if (nl && !newOk) {
                    out.skipped.push(`${o.date} : activité étalée sur plusieurs jours, non reportée`);
                    continue;
                }
                for (const h of oldHalves) await up(`${o.date}_${h}`, 'activity', '2'); // retour « en attente d'affectation »
                if (nl) {
                    for (const h of halves(nl.heure_debut, nl.heure_fin)) {
                        await up(`${nl.date_debut}_${h}`, 'available', '2');
                        await up(`${nl.date_debut}_${h}`, 'activity', o.activity);
                        if (o.samu)
                            await up(
                                `${nl.date_debut}_${h}`,
                                'localisation',
                                '🚨 ' + String(o.samu).replace(/^SAMU-SAS/, 'SAMU')
                            );
                    }
                }
                out.activity++;
            } else if (o.kind === 'astreinte') {
                const nl = c.line;
                if (nl && nl.date_debut === o.date) continue; // seules les heures changent : le créneau du planning reste identique
                if (nl) {
                    const taken = await dbGet(
                        'SELECT resource_id FROM astreinte_planning WHERE date = ? AND type_creneau = ?',
                        [nl.date_debut, o.creneau]
                    );
                    if (taken && taken.resource_id && taken.resource_id !== resourceId) {
                        out.skipped.push(`${nl.date_debut} : créneau d'astreinte déjà tenu par un(e) autre expert`);
                        continue;
                    }
                }
                await dbRun(
                    'UPDATE astreinte_planning SET resource_id = NULL WHERE date = ? AND type_creneau = ? AND resource_id = ?',
                    [o.date, o.creneau, resourceId]
                );
                if (nl) {
                    const d = new Date(nl.date_debut + 'T00:00:00Z');
                    await dbRun(
                        `INSERT INTO astreinte_planning (date, type_creneau, resource_id, year, month) VALUES (?,?,?,?,?)
                        ON CONFLICT(date, type_creneau) DO UPDATE SET resource_id = excluded.resource_id`,
                        [nl.date_debut, o.creneau, resourceId, d.getUTCFullYear(), d.getUTCMonth() + 1]
                    );
                }
                out.astreinte++;
            }
        }
        logUserAction(req, 'Report de corrections CRA vers la planification', { craId: cra.id, ...out });
        res.json(out);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/cra/:id/return-to-expert', requireAdmin, async (req, res) => {
    try {
        const cra = await dbGet('SELECT * FROM cra WHERE id = ? AND (deleted IS NULL OR deleted = 0)', [req.params.id]);
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (cra.user_id === req.session.userId)
            return res.status(400).json({ error: 'Ce CRA est le vôtre : soumettez-le directement.' });
        if (cra.statut !== 'a_completer')
            return res.status(400).json({ error: "Seul un CRA à compléter peut être renvoyé à l'expert." });
        const mailed = await craMarkAdminModified(req, cra, true);
        res.json({ success: true, mailed });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/cra/:id/astreintes', requireAuth, async (req, res) => {
    const craId = req.params.id;
    const sessionUserId = req.session.userId;
    const isAdmin = req.session.activeProfile === 'admin';
    const { lignes } = req.body;

    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(`SELECT * FROM cra WHERE id = ?`, [craId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        // Seul l'admin ou le propriétaire du CRA peut modifier
        if (!isAdmin && cra.user_id !== sessionUserId) return res.status(403).json({ error: 'Accès interdit' });
        if (cra.statut !== 'a_completer') return res.status(400).json({ error: 'CRA non modifiable dans ce statut' });

        const targetUserId = cra.user_id;

        // Supprimer toutes les lignes qui chevauchent le mois (même condition que le GET)
        const dateStart = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`;
        const dateEnd = `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`;
        await new Promise((resolve, reject) => {
            database.run(
                `DELETE FROM astreintes_hno WHERE user_id = ? AND date_debut <= ? AND date_fin >= ?`,
                [targetUserId, dateEnd, dateStart],
                err => (err ? reject(err) : resolve())
            );
        });

        // Insérer les nouvelles lignes
        for (const l of lignes || []) {
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO astreintes_hno (user_id, type, date_debut, date_fin, heure_debut, heure_fin, samu, objet)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        targetUserId,
                        l.type,
                        l.date_debut,
                        l.date_fin,
                        l.heure_debut || null,
                        l.heure_fin || null,
                        l.samu || null,
                        l.objet
                    ],
                    err => (err ? reject(err) : resolve())
                );
            });
        }
        if (isAdmin && cra.user_id !== sessionUserId) await craMarkAdminModified(req, cra, false);
        res.json({ success: true, inserted: (lignes || []).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/cra/:id/submit', requireAuth, async (req, res) => {
    const craId = req.params.id;
    const userId = req.session.userId;
    const { commentaire } = req.body;
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(`SELECT * FROM cra WHERE id = ? AND user_id = ?`, [craId, userId], (err, row) =>
                err ? reject(err) : resolve(row)
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (cra.statut !== 'a_completer') return res.status(400).json({ error: 'CRA déjà soumis' });
        const now = new Date().toISOString();
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET statut = 'soumis', submitted_at = ?, commentaire_expert = ?, modifie_admin_at = NULL, modifie_admin_nom = NULL WHERE id = ?`,
                [now, commentaire || null, craId],
                err => (err ? reject(err) : resolve())
            );
        });
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO cra_signatures (cra_id, rang, signer_user_id, signer_name, signer_email, signed_at, ip_address, user_agent, token_used) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    craId,
                    userId,
                    `${req.session.prenom} ${req.session.nom}`,
                    req.session.email || '',
                    now,
                    req.ip,
                    req.headers['user-agent'] || ''
                ],
                err => (err ? reject(err) : resolve())
            );
        });
        const config = await getCraConfig();
        if (config?.admin_n1_email) {
            const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric'
            });
            const appUrl = appEnv.APP_URL || `${req.protocol}://${req.get('host')}`;
            await enqueueEmail({
                batchId: generateICSUid(),
                recipientEmail: config.admin_n1_email,
                recipientName: config.admin_n1_nom,
                senderName: `${req.session.prenom} ${req.session.nom}`,
                senderEmail: req.session.email || '',
                subject: `CRA ${moisNom} — visa niveau 1 requis — ${req.session.prenom} ${req.session.nom}`,
                htmlBody: buildCraEmailHtml({
                    title: 'Visa niveau 1 requis',
                    expertNom: `${req.session.prenom} ${req.session.nom}`,
                    moisNom,
                    craUrl: `${appUrl}/?tab=cra&cra_id=${craId}`,
                    action: "Le CRA a été soumis par l'expert et nécessite votre visa de niveau 1."
                }),
                actionType: 'cra_visa_n1'
            });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rappel CRA : l'expert retire sa soumission avant tout visa
router.post('/cra/:id/recall', requireAuth, async (req, res) => {
    const craId = req.params.id;
    const userId = req.session.userId;
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(`SELECT * FROM cra WHERE id = ?`, [craId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (cra.user_id !== userId) return res.status(403).json({ error: 'Non autorisé' });
        if (cra.statut !== 'soumis')
            return res.status(400).json({ error: 'Le CRA ne peut être rappelé que si son statut est "soumis"' });
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET statut = 'a_completer', submitted_at = NULL, refuse_at = datetime('now') WHERE id = ?`,
                [craId],
                err => (err ? reject(err) : resolve())
            );
        });
        // Supprimer la signature de soumission initiale
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM cra_signatures WHERE cra_id = ? AND rang = 1`, [craId], err =>
                err ? reject(err) : resolve()
            );
        });
        logUserAction(req, 'Rappel CRA (correction)', { craId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/cra/:id/visa/:niveau', requireAdmin, async (req, res) => {
    const craId = req.params.id;
    const niveau = req.params.niveau;
    const userId = req.session.userId;
    const now = new Date().toISOString();
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, u.email as expert_email, u.prenom || ' ' || u.nom as expert_nom FROM cra c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        const expectedStatut = niveau === 'n1' ? 'soumis' : 'vise_n1';
        if (cra.statut !== expectedStatut) return res.status(400).json({ error: `Statut incorrect (${cra.statut})` });
        const newStatut = niveau === 'n1' ? 'vise_n1' : 'vise_n2';
        const rang = niveau === 'n1' ? 2 : 3;
        const updateField = niveau === 'n1' ? 'vise_n1_at = ?, vise_n1_by = ?' : 'vise_n2_at = ?, vise_n2_by = ?';
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET statut = ?, ${updateField} WHERE id = ?`,
                [newStatut, now, userId, craId],
                err => (err ? reject(err) : resolve())
            );
        });
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO cra_signatures (cra_id, rang, signer_user_id, signer_name, signer_email, signed_at, ip_address, user_agent, token_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    craId,
                    rang,
                    userId,
                    `${req.session.prenom} ${req.session.nom}`,
                    req.session.email || '',
                    now,
                    req.ip,
                    req.headers['user-agent'] || ''
                ],
                err => (err ? reject(err) : resolve())
            );
        });
        const config = await getCraConfig();
        const appUrl = appEnv.APP_URL || `${req.protocol}://${req.get('host')}`;
        const craUrl = `${appUrl}/?tab=cra&cra_id=${craId}`;
        const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const signerNom = `${req.session.prenom} ${req.session.nom}`;
        if (niveau === 'n1' && config?.admin_n2_email) {
            await enqueueEmail({
                batchId: generateICSUid(),
                recipientEmail: config.admin_n2_email,
                recipientName: config.admin_n2_nom,
                senderName: signerNom,
                senderEmail: req.session.email || '',
                subject: `CRA ${moisNom} — visa niveau 2 requis — ${cra.expert_nom}`,
                htmlBody: buildCraEmailHtml({
                    title: 'Visa niveau 2 requis',
                    expertNom: cra.expert_nom,
                    moisNom,
                    craUrl,
                    action: `Le CRA a été visé par ${signerNom} (N1) et nécessite votre visa de niveau 2.`
                }),
                actionType: 'cra_visa_n2'
            });
        } else if (niveau === 'n2') {
            // Visa N2 → le CRA passe en "vise_n2", la diffusion est manuelle via le bouton "A diffuser"
            // Notification à l'expert que son CRA est prêt à être diffusé
            if (cra.expert_email) {
                await enqueueEmail({
                    batchId: generateICSUid(),
                    recipientEmail: cra.expert_email,
                    recipientName: cra.expert_nom,
                    senderName: signerNom,
                    senderEmail: req.session.email || '',
                    subject: `CRA ${moisNom} — doublement visé, en attente de diffusion`,
                    htmlBody: buildCraEmailHtml({
                        title: 'CRA visé N2',
                        expertNom: cra.expert_nom,
                        moisNom,
                        craUrl,
                        action: `Votre CRA a été doublement visé par ${signerNom}. Il sera prochainement diffusé auprès de la RH.`
                    }),
                    actionType: 'cra_visa_n2'
                });
            }
            logUserAction(req, 'CRA visé N2 — en attente de diffusion manuelle', { craId });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/cra/:id/refuser/:niveau — refuser et renvoyer à l'expert
router.post('/cra/:id/refuser/:niveau', requireAdmin, async (req, res) => {
    const craId = req.params.id;
    const niveau = req.params.niveau; // 'n1' ou 'n2'
    const { commentaire } = req.body;
    const userId = req.session.userId;
    const now = new Date().toISOString();

    if (!commentaire || !commentaire.trim()) {
        return res.status(400).json({ error: 'Un commentaire de refus est obligatoire' });
    }

    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, u.email as expert_email, u.prenom || ' ' || u.nom as expert_nom
                 FROM cra c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });

        const expectedStatut = niveau === 'n1' ? 'soumis' : 'vise_n1';
        if (cra.statut !== expectedStatut) {
            return res.status(400).json({ error: `Statut incorrect (${cra.statut})` });
        }

        // Remettre à l'état a_completer + enregistrer le commentaire de refus
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET statut = 'a_completer', submitted_at = NULL,
                 commentaire_refus = ?, refuse_at = ?, refuse_by = ?,
                 vise_n1_at = NULL, vise_n1_by = NULL, vise_n2_at = NULL, vise_n2_by = NULL
                 WHERE id = ?`,
                [commentaire.trim(), now, userId, craId],
                err => (err ? reject(err) : resolve())
            );
        });

        // Supprimer les signatures existantes pour ce CRA (repart de zéro)
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM cra_signatures WHERE cra_id = ?`, [craId], err =>
                err ? reject(err) : resolve()
            );
        });

        // Notifier l'expert par email
        const appUrl = appEnv.APP_URL || global._detectedAppUrl || 'http://localhost:3000';
        const craUrl = `${appUrl}/?tab=cra&cra_id=${craId}`;
        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const refuseurNom = `${req.session.prenom} ${req.session.nom}`;
        const niveauLabel = niveau === 'n1' ? 'niveau 1' : 'niveau 2';

        if (cra.expert_email) {
            await enqueueEmail({
                batchId: generateICSUid(),
                recipientEmail: cra.expert_email,
                recipientName: cra.expert_nom,
                senderName: refuseurNom,
                senderEmail: req.session.email || emailConfig?.user || '',
                subject: `CRA ${moisNom} — refusé par le viseur ${niveauLabel}, modifications requises`,
                htmlBody: buildCraEmailHtml({
                    title: `CRA refusé — modifications requises`,
                    expertNom: cra.expert_nom,
                    moisNom,
                    craUrl,
                    action: `Votre CRA a été refusé par <strong>${refuseurNom}</strong> (viseur ${niveauLabel}).<br><br>
                        <div style="background:#fff3cd;border-left:4px solid #f39c12;padding:12px 16px;border-radius:0 6px 6px 0;margin:10px 0;">
                            <strong>Motif du refus :</strong><br>${commentaire.trim()}
                        </div><br>
                        Merci de vous connecter pour corriger votre CRA et le soumettre à nouveau.`
                }),
                actionType: 'cra_refuse'
            });
        }

        res.json({ success: true, message: `CRA renvoyé à l'expert avec motif de refus` });
    } catch (e) {
        console.error('Erreur refus CRA:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/cra/:id/admin-correction — admin remet CRA à zéro (reset toutes validations)
router.post('/cra/:id/admin-correction', requireAdmin, async (req, res) => {
    const craId = parseInt(req.params.id);
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get('SELECT * FROM cra WHERE id = ? AND (deleted IS NULL OR deleted = 0)', [craId], (err, row) =>
                err ? reject(err) : resolve(row)
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (cra.statut === 'vise_n2' || cra.statut === 'diffuse') {
            return res
                .status(400)
                .json({ error: 'Modification impossible : les 3 visas ont été obtenus ou le CRA a déjà été diffusé.' });
        }
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET statut = 'a_completer', submitted_at = NULL,
                 vise_n1_at = NULL, vise_n1_by = NULL, vise_n2_at = NULL, vise_n2_by = NULL,
                 refuse_at = NULL, commentaire_refus = NULL
                 WHERE id = ?`,
                [craId],
                err => (err ? reject(err) : resolve())
            );
        });
        await new Promise((resolve, reject) => {
            database.run('DELETE FROM cra_signatures WHERE cra_id = ?', [craId], err =>
                err ? reject(err) : resolve()
            );
        });
        res.json({ success: true, statut: 'a_completer' });
    } catch (e) {
        console.error('Erreur admin-correction CRA:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/cra/:id/diffusion-recipients — destinataires pré-remplis pour la popup diffusion
router.get('/cra/:id/diffusion-recipients', requireAdmin, async (req, res) => {
    const craId = req.params.id;
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, r.id as resource_id, r.contacts_rh, u.email as expert_email, u.prenom || ' ' || u.nom as expert_nom
                 FROM cra c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN resources r ON u.resource_id = r.id WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        const config = await getCraConfig();
        let rhEs = [];
        if (cra.contacts_rh) {
            rhEs = cra.contacts_rh
                .split('\n')
                .map(e => e.trim())
                .filter(e => e.includes('@'))
                .map(e => ({ email: e, nom: '' }));
        } else if (cra.resource_id) {
            rhEs = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT email, nom FROM cra_rh_recipients WHERE resource_id = ?`,
                    [cra.resource_id],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });
        }
        const drhAns = (config?.drh_ans_infos || [])
            .filter(d => d.email)
            .map(d => ({ email: d.email, nom: d.nom || '' }));
        const expert = cra.expert_email ? [{ email: cra.expert_email, nom: cra.expert_nom || '' }] : [];
        res.json({ expert, rh_es: rhEs, drh_ans: drhAns });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/cra/:id/prepare-pdf — génère le PDF et le sauvegarde sur disque
router.post('/cra/:id/prepare-pdf', requireAdminOrRh, async (req, res) => {
    const craId = req.params.id;
    try {
        if (!puppeteer) return res.status(503).json({ error: 'Puppeteer non disponible' });
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, r.es_rattachement, u.prenom || ' ' || u.nom as expert_nom, u.nom as expert_nom_seul, u.prenom as expert_prenom
                 FROM cra c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN resources r ON u.resource_id = r.id WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (!['vise_n2', 'diffuse'].includes(cra.statut))
            return res.status(400).json({ error: 'CRA non encore doublement visé' });

        const [astreintes, signatures] = await Promise.all([
            new Promise((resolve, reject) =>
                database.all(
                    `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ? ORDER BY date_debut`,
                    [
                        cra.user_id,
                        `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`,
                        `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`
                    ],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                )
            ),
            new Promise((resolve, reject) =>
                database.all(`SELECT * FROM cra_signatures WHERE cra_id = ? ORDER BY rang`, [craId], (err, rows) =>
                    err ? reject(err) : resolve(rows || [])
                )
            )
        ]);
        const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const craHtmlPdf = buildCraDocumentHtml({
            cra,
            astreintes,
            signatures,
            moisNom,
            esRattachement: cra.es_rattachement || ''
        });

        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const nomSafe = (cra.expert_nom_seul || '').replace(/\s+/g, '_').toUpperCase();
        const prenomSafe = (cra.expert_prenom || '').replace(/\s+/g, '_');
        const moisCap = moisNom.charAt(0).toUpperCase() + moisNom.slice(1).replace(/\s+/g, '_');
        const pdfFilename = `SI-SAMU_CRA_${nomSafe}_${prenomSafe}_${moisCap}_${ts}.pdf`;
        const pdfPath = `./data/pdfs/${pdfFilename}`;

        const { mkdirSync } = await import('fs');
        try {
            mkdirSync('./data/pdfs', { recursive: true });
        } catch (e) {
            /* déjà existant */
        }

        const browser = await puppeteer.launch({
            executablePath: appEnv.PUPPETEER_EXECUTABLE_PATH,
            headless: true,
            protocolTimeout: 180000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(120000);
        await page.setContent(craHtmlPdf, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });
        await browser.close();

        const { writeFileSync } = await import('fs');
        writeFileSync(pdfPath, pdfBuffer);
        await new Promise((resolve, reject) =>
            database.run(`UPDATE cra SET pdf_filename = ? WHERE id = ?`, [pdfFilename, craId], err =>
                err ? reject(err) : resolve()
            )
        );
        console.log(`📄 PDF CRA sauvegardé: ${pdfFilename} (${Math.round(pdfBuffer.length / 1024)}Ko)`);
        res.json({ success: true, pdfFilename });
    } catch (e) {
        console.error('❌ Erreur génération PDF CRA:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.post('/cra/:id/diffuser', requireAdmin, async (req, res) => {
    const craId = req.params.id;
    const now = new Date().toISOString();
    // recipients: { expert:[{email,nom}], rh_es:[{email,nom}], drh_ans:[{email,nom}] }
    const { recipients, pdfFilename } = req.body;
    try {
        const cra = await new Promise((resolve, reject) => {
            database.get(
                `SELECT c.*, r.es_rattachement, u.prenom || ' ' || u.nom as expert_nom, u.email as expert_email
                 FROM cra c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN resources r ON u.resource_id = r.id WHERE c.id = ?`,
                [craId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
        if (!cra) return res.status(404).json({ error: 'CRA introuvable' });
        if (cra.statut !== 'vise_n2') return res.status(400).json({ error: 'CRA non encore doublement visé' });
        if (!pdfFilename) return res.status(400).json({ error: "PDF non généré — veuillez d'abord générer le PDF" });

        // Charger le PDF depuis le disque
        let pdfBase64 = null;
        try {
            const { readFileSync } = await import('fs');
            const pdfBuffer = readFileSync(`./data/pdfs/${pdfFilename}`);
            pdfBase64 = pdfBuffer.toString('base64');
        } catch (e) {
            return res.status(400).json({ error: `Fichier PDF introuvable: ${pdfFilename}` });
        }

        const [astreintes, signatures] = await Promise.all([
            new Promise((resolve, reject) =>
                database.all(
                    `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ? ORDER BY date_debut`,
                    [
                        cra.user_id,
                        `${cra.annee}-${String(cra.mois).padStart(2, '0')}-01`,
                        `${cra.annee}-${String(cra.mois).padStart(2, '0')}-31`
                    ],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                )
            ),
            new Promise((resolve, reject) =>
                database.all(`SELECT * FROM cra_signatures WHERE cra_id = ? ORDER BY rang`, [craId], (err, rows) =>
                    err ? reject(err) : resolve(rows || [])
                )
            )
        ]);
        const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const craHtml = buildCraDocumentHtml({
            cra,
            astreintes,
            signatures,
            moisNom,
            esRattachement: cra.es_rattachement || '',
            appUrl: appEnv.APP_URL || `${req.protocol}://${req.get('host')}`,
            logoSrc: 'cid:ans-logo'
        });
        const rhSubject = `AGENCE DU NUMERIQUE EN SANTE - ${cra.expert_nom} - ${moisNom} - Compte-Rendu d'Activité`;
        const batchId = generateICSUid();
        const senderName = `${req.session.prenom} ${req.session.nom}`;
        const senderEmail = req.session.email || '';

        const allRhRecipients = [...(recipients?.rh_es || []), ...(recipients?.drh_ans || [])];
        const expertRecipients = recipients?.expert || [];
        const totalSent = allRhRecipients.length + expertRecipients.length;

        // Email RH (RH ES + DRH ANS) avec PDF en pièce jointe
        if (allRhRecipients.length > 0) {
            const [firstRh, ...otherRh] = allRhRecipients;
            const ccEmails = otherRh.length > 0 ? otherRh.map(r => r.email).join(', ') : null;
            await enqueueEmail({
                batchId,
                recipientEmail: firstRh.email,
                recipientName: firstRh.nom || firstRh.email,
                ccEmails,
                senderName,
                senderEmail,
                subject: rhSubject,
                htmlBody: craHtml,
                pdfAttachment: pdfBase64,
                pdfFilename,
                actionType: 'cra_diffusion'
            });
        }

        // Email à l'expert (sans PDF)
        for (const exp of expertRecipients) {
            const appUrl = appEnv.APP_URL || `${req.protocol}://${req.get('host')}`;
            await enqueueEmail({
                batchId: (exp._batch = generateICSUid()),
                recipientEmail: exp.email,
                recipientName: exp.nom || exp.email,
                senderName,
                senderEmail,
                subject: `CRA ${moisNom} — diffusé auprès de la RH`,
                htmlBody: buildCraEmailHtml({
                    title: 'CRA diffusé',
                    expertNom: cra.expert_nom,
                    moisNom,
                    craUrl: `${appUrl}/?tab=cra`,
                    action: `Votre CRA a été doublement visé et diffusé auprès de la RH (${allRhRecipients.length} destinataire(s)).`
                }),
                actionType: 'cra_diffusion_expert'
            });
        }

        // Log de diffusion
        for (const rh of recipients?.rh_es || []) {
            await new Promise((resolve, reject) =>
                database.run(
                    `INSERT INTO cra_diffusion_log (cra_id, recipient_email, recipient_name, recipient_type, sent_at, email_batch_id) VALUES (?, ?, ?, 'rh_es', ?, ?)`,
                    [craId, rh.email, rh.nom || rh.email, now, batchId],
                    err => (err ? reject(err) : resolve())
                )
            );
        }
        for (const rh of recipients?.drh_ans || []) {
            await new Promise((resolve, reject) =>
                database.run(
                    `INSERT INTO cra_diffusion_log (cra_id, recipient_email, recipient_name, recipient_type, sent_at, email_batch_id) VALUES (?, ?, ?, 'drh_ans', ?, ?)`,
                    [craId, rh.email, rh.nom || rh.email, now, batchId],
                    err => (err ? reject(err) : resolve())
                )
            );
        }
        // L'expert concerné (notification sans PDF, lot d'envoi distinct) apparaît lui aussi dans le statut de diffusion
        for (const exp of expertRecipients) {
            await new Promise((resolve, reject) =>
                database.run(
                    `INSERT INTO cra_diffusion_log (cra_id, recipient_email, recipient_name, recipient_type, sent_at, email_batch_id) VALUES (?, ?, ?, 'expert', ?, ?)`,
                    [craId, exp.email, exp.nom || exp.email, now, exp._batch || batchId],
                    err => (err ? reject(err) : resolve())
                )
            );
        }

        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE cra SET statut = 'diffuse', diffuse_at = ?, pdf_filename = ? WHERE id = ?`,
                [now, pdfFilename, craId],
                err => (err ? reject(err) : resolve())
            );
        });

        logUserAction(req, 'CRA diffusé manuellement', { craId, sent: totalSent, pdfFilename });
        res.json({ success: true, sent: totalSent });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/automation/cra/trigger', requireAdmin, async (req, res) => {
    const logs = [];
    const log = msg => {
        logs.push(msg);
        console.log('[CRA TEST]', msg);
    };
    try {
        const config = await getCraConfig();
        log(`Config : enabled=${config?.enabled}, day=${config?.day}`);
        if (!config?.enabled) {
            log('⛔ Automation désactivée — cocher la case et sauvegarder');
            return res.json({ success: true, sent: 0, logs });
        }

        const now = new Date();
        log(`Jour actuel : ${now.getDate()} (configuré : ${config.day}) — vérification ignorée en mode test`);

        const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const targetMois = targetDate.getMonth() + 1;
        const targetAnnee = targetDate.getFullYear();
        log(`Mois cible : ${targetMois}/${targetAnnee}`);

        const filterUserId = req.body?.user_id ? parseInt(req.body.user_id) : null;
        let query = `SELECT r.id as resource_id, r.nom, r.prenom, u.id as user_id, u.email
                     FROM resources r JOIN users u ON u.resource_id = r.id AND u.is_expert = 1
                     WHERE r.astreinte_volontaire = 1 AND r.actif = 1`;
        const params = [];
        if (filterUserId) {
            query += ` AND u.id = ?`;
            params.push(filterUserId);
        }

        const experts = await new Promise((resolve, reject) => {
            database.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
        log(
            `Experts astreinte trouvés : ${experts.length}${filterUserId ? ` (filtré sur user_id=${filterUserId})` : ''}`
        );
        experts.forEach(e => log(`  • ${e.prenom} ${e.nom} — email: ${e.email || '⚠️ MANQUANT'}`));

        const appUrl = appEnv.APP_URL || global._detectedAppUrl || 'http://localhost:3000';
        log(`URL app : ${appUrl}`);
        log(`SMTP expéditeur : ${emailConfig?.user || '⚠️ non configuré'}`);

        let sent = 0;
        for (const expert of experts) {
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT OR IGNORE INTO cra (user_id, resource_id, mois, annee, statut) VALUES (?, ?, ?, ?, 'a_completer')`,
                    [expert.user_id, expert.resource_id, targetMois, targetAnnee],
                    err => (err ? reject(err) : resolve())
                );
            });
            const cra = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT id, statut FROM cra WHERE user_id = ? AND mois = ? AND annee = ?`,
                    [expert.user_id, targetMois, targetAnnee],
                    (e, row) => (e ? reject(e) : resolve(row))
                );
            });
            log(`  ${expert.prenom} ${expert.nom} → CRA id=${cra?.id} statut=${cra?.statut}`);
            if (!cra || cra.statut !== 'a_completer') {
                log(`    ↳ Skip (statut=${cra?.statut}, déjà soumis)`);
                continue;
            }
            if (!expert.email) {
                log(`    ↳ Skip (email manquant)`);
                continue;
            }

            const moisNom = targetDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            const expertNom = `${expert.prenom} ${expert.nom}`;
            try {
                await enqueueEmail({
                    batchId: generateICSUid(),
                    recipientEmail: expert.email,
                    recipientName: expertNom,
                    senderName: 'Plateforme de Planification ANS',
                    senderEmail: emailConfig?.user || '',
                    subject: `[TEST] CRA ${moisNom} — action requise`,
                    htmlBody: buildCraEmailHtml({
                        title: `[TEST] CRA ${moisNom} à compléter`,
                        expertNom,
                        moisNom,
                        craUrl: `${appUrl}/?tab=cra&cra_id=${cra.id}`,
                        action: `[EMAIL DE TEST] Votre compte-rendu d'activité pour ${moisNom} est disponible.`
                    }),
                    actionType: 'cra_rappel'
                });
                log(`    ✅ Email mis en queue → ${expert.email}`);
                sent++;
            } catch (emailErr) {
                log(`    ❌ Erreur enqueueEmail : ${emailErr.message}`);
            }
        }

        log(`─── Bilan ───`);
        log(`Admin N1 : ${config.admin_n1_email || '⚠️ non configuré'}`);
        log(`Admin N2 : ${config.admin_n2_email || '⚠️ non configuré'}`);
        log(`Destinataires RH : ${JSON.stringify(config.rh_recipients || {})}`);
        log(`Total emails : ${sent} rappel(s) mis en queue`);

        res.json({ success: true, sent, logs });
    } catch (e) {
        log(`❌ Erreur fatale : ${e.message}`);
        res.status(500).json({ error: e.message, logs });
    }
});

export default router;
