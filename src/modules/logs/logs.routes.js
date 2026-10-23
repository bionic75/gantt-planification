// Journaux : connexions, actions, sessions actives, purge
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { activeSessions } from '../../state/sessions.js';
import { database } from '../../db/database.js';
import { logUserAction } from '../../services/action-log.js';

const router = Router();

// Endpoint pour récupérer les sessions actives (utilisateurs connectés) - accessible à tous les utilisateurs authentifiés
router.get('/active-sessions', requireAuth, async (req, res) => {
    const activeUsers = [];
    const now = Date.now();
    const timeout = 15 * 60 * 1000; // 15 minutes

    // Collecter les IDs des utilisateurs actifs
    const activeUserIds = [];
    for (const [userId, session] of activeSessions) {
        if (now - session.lastActivity <= timeout) {
            activeUserIds.push(userId);
        }
    }

    if (activeUserIds.length === 0) {
        return res.json({ activeUsers: [] });
    }

    // Récupérer les infos complètes des utilisateurs actifs (nom, prénom, photo, trigramme)
    try {
        const placeholders = activeUserIds.map(() => '?').join(',');
        const users = await new Promise((resolve, reject) => {
            database.all(
                `SELECT u.id, u.nom, u.prenom, u.profile_photo, r.trigramme 
                 FROM users u 
                 LEFT JOIN resources r ON u.resource_id = r.id 
                 WHERE u.id IN (${placeholders})`,
                activeUserIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Créer un map pour accès rapide
        const userInfoMap = new Map();
        users.forEach(u => userInfoMap.set(u.id, u));

        for (const [userId, session] of activeSessions) {
            if (now - session.lastActivity <= timeout) {
                const userInfo = userInfoMap.get(userId) || {};
                activeUsers.push({
                    userId: userId,
                    profile: session.profile,
                    username: session.username,
                    nom: userInfo.nom || '',
                    prenom: userInfo.prenom || '',
                    trigramme: userInfo.trigramme || '',
                    profilePhoto: userInfo.profile_photo || null,
                    lastActivity: session.lastActivity
                });
            }
        }

        res.json({ activeUsers });
    } catch (error) {
        console.error('Erreur récupération sessions actives:', error);
        res.status(500).json({ error: error.message });
    }
});

// Récupération des logs de connexion (20 derniers)
// Reporting : suivi des connexions par utilisateur sur une période
router.get('/reporting/connections', requireAdmin, (req, res) => {
    const { dateStart, dateEnd, userIds } = req.query;
    if (!dateStart || !dateEnd) {
        return res.status(400).json({ error: 'dateStart et dateEnd requis' });
    }

    let sql = `
        SELECT username, nom, prenom, profile,
               COUNT(*) as nb_connexions,
               MAX(login_time) as derniere_connexion
        FROM connection_logs
        WHERE DATE(login_time) >= ? AND DATE(login_time) <= ?
          AND COALESCE(profile, '') <> 'system'
    `;
    const params = [dateStart, dateEnd];

    if (userIds && userIds.trim() !== '') {
        const ids = userIds
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);
        if (ids.length > 0) {
            sql += ` AND user_id IN (${ids.map(() => '?').join(',')})`;
            params.push(...ids);
        }
    }

    sql += ' GROUP BY user_id, username, nom, prenom, profile ORDER BY nb_connexions DESC';

    database.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erreur reporting connexions:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ rows });
    });
});

// Récupération des logs d'actions filtrés par utilisateur
router.get('/logs/actions', requireAdmin, (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId requis' });
    }

    database.all(
        `SELECT id, user_id, action_type, details, created_at 
         FROM action_logs 
         WHERE user_id = ?
         ORDER BY created_at DESC 
         LIMIT 100`,
        [userId],
        (err, logs) => {
            if (err) {
                console.error('Erreur récupération action logs:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ logs });
            }
        }
    );
});

// Mise à jour des modifications dans le log
router.post('/logs/add-modification', requireAuth, (req, res) => {
    const { modification } = req.body;

    if (!req.session.logId) {
        return res.json({ success: false, error: 'Aucun log actif' });
    }

    // Récupérer les modifications actuelles
    database.get('SELECT modifications FROM connection_logs WHERE id = ?', [req.session.logId], (err, row) => {
        if (err) {
            console.error('Erreur récup modifications:', err);
            return res.status(500).json({ error: err.message });
        }

        const currentMods = row && row.modifications ? row.modifications : '';
        const timestamp = new Date().toLocaleString('fr-FR');
        const newMod = `${timestamp} - ${modification}`;
        const updatedMods = currentMods ? `${currentMods}\n${newMod}` : newMod;

        // Mettre à jour les modifications
        database.run(
            'UPDATE connection_logs SET modifications = ? WHERE id = ?',
            [updatedMods, req.session.logId],
            err => {
                if (err) {
                    console.error('Erreur update modifications:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true });
            }
        );
    });
});

// Endpoint de diagnostic pour les logs de planning (temporaire)
router.get('/logs/planning-debug', requireAdmin, (req, res) => {
    // Compter les logs de planning par user_id
    database.all(
        `SELECT 
            user_id,
            COUNT(*) as count
         FROM action_logs 
         WHERE action_type = 'planning_modification'
         GROUP BY user_id
         ORDER BY count DESC`,
        [],
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Récupérer quelques exemples de logs avec user_id NULL
            database.all(
                `SELECT id, user_id, created_at, details
                 FROM action_logs
                 WHERE action_type = 'planning_modification' AND user_id IS NULL
                 LIMIT 10`,
                [],
                (err2, nullLogs) => {
                    if (err2) {
                        return res.status(500).json({ error: err2.message });
                    }

                    res.json({
                        stats: stats,
                        nullLogsCount: nullLogs.length,
                        nullLogsExamples: nullLogs,
                        message: stats.find(s => s.user_id === null)
                            ? '⚠️ Des logs de planning ont user_id NULL'
                            : '✅ Tous les logs de planning ont un user_id'
                    });
                }
            );
        }
    );
});

router.delete('/logs/raz', requireAdmin, (req, res) => {
    const { type, userId } = req.body;

    console.log(`🗑️ RAZ logs demandée: type=${type}, userId=${userId}`);

    if (!type || !userId) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }

    // Récupérer d'abord le username de l'utilisateur
    database.get(`SELECT username FROM users WHERE id = ?`, [userId], (errUser, user) => {
        if (errUser || !user) {
            console.error('❌ Utilisateur non trouvé:', userId);
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        console.log(`👤 Username trouvé: ${user.username}`);

        let query;
        let params;

        switch (type) {
            case 'connexions':
                // Supprimer par username au lieu de user_id pour gérer les logs avec user_id NULL
                query = 'DELETE FROM connection_logs WHERE username = ?';
                params = [user.username];
                break;

            case 'planning':
                // Supprimer par username pour cohérence (les anciens logs peuvent avoir user_id NULL)
                query = `DELETE FROM action_logs WHERE user_id = ? AND action_type = ?`;
                params = [userId, 'planning_modification'];
                // Note: Les logs de planning n'ont pas de champ username, on utilise user_id
                // Si des logs anciens ont user_id NULL, ils ne seront pas supprimés
                // mais ce n'est normalement pas le cas pour les logs de planning
                break;

            case 'emails':
                // Supprimer par user_id (les logs d'emails ont toujours un user_id valide)
                query = 'DELETE FROM action_logs WHERE user_id = ? AND action_type = ?';
                params = [userId, 'email_request'];
                break;

            default:
                return res.status(400).json({ error: 'Type de log inconnu' });
        }

        // Faire la suppression
        database.run(query, params, function (err) {
            if (err) {
                console.error('Erreur suppression logs:', err);
                return res.status(500).json({ error: err.message });
            }

            // Logger cette action
            const actionDescription = {
                connexions: 'Suppression connexions',
                planning: 'Suppression modifications planning',
                emails: 'Suppression demandes affectation'
            };

            logUserAction(req, actionDescription[type], {
                targetUserId: userId,
                targetUsername: user.username,
                deletedCount: this.changes
            });

            res.json({
                success: true,
                deleted: this.changes,
                message: `${this.changes} enregistrement(s) supprimé(s)`
            });
        });
    });
});

// Endpoint de purge complète des logs (pour tous les utilisateurs)
router.delete('/logs/purge-all', requireAdmin, (req, res) => {
    const { table, type } = req.body;

    if (!table) {
        return res.status(400).json({ error: 'Paramètre table manquant' });
    }

    let query;
    let params = [];

    if (table === 'connection_logs') {
        query = 'DELETE FROM connection_logs';
    } else if (table === 'action_logs') {
        if (type) {
            query = 'DELETE FROM action_logs WHERE action_type = ?';
            params = [type];
        } else {
            query = 'DELETE FROM action_logs';
        }
    } else {
        return res.status(400).json({ error: 'Table invalide' });
    }

    // Faire la suppression
    database.run(query, params, function (err) {
        if (err) {
            console.error('Erreur purge logs:', err);
            return res.status(500).json({ error: err.message });
        }

        // Logger cette action critique
        logUserAction(req, 'Purge complète logs', {
            table,
            type: type || 'all',
            deletedCount: this.changes
        });

        res.json({
            success: true,
            deleted: this.changes,
            table,
            message: `${this.changes} enregistrement(s) supprimé(s) de ${table}`
        });
    });
});

export default router;
