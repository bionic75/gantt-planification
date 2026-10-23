// Automatisations : configuration, journaux, rappels (n°1) et sauvegarde des plannings (n°2)
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';

const router = Router();

// Récupérer la configuration d'une automatisation
router.get('/automation/config/:id', requireAdmin, (req, res) => {
    const { id } = req.params;

    database.get(`SELECT value FROM settings WHERE key = ?`, [`automation_${id}_config`], (err, row) => {
        if (err) {
            console.error('Erreur lecture config automation:', err);
            return res.status(500).json({ error: err.message });
        }

        if (row && row.value) {
            try {
                const config = JSON.parse(row.value);
                res.json({ success: true, config });
            } catch (e) {
                res.json({ success: true, config: {} });
            }
        } else {
            res.json({ success: true, config: {} });
        }
    });
});

// Sauvegarder la configuration d'une automatisation
router.post('/automation/config/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { config } = req.body;

    const configJson = JSON.stringify(config);

    database.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        [`automation_${id}_config`, configJson],
        err => {
            if (err) {
                console.error('Erreur sauvegarde config automation:', err);
                return res.status(500).json({ error: err.message });
            }

            console.log(`📧 Configuration automatisation ${id} sauvegardée:`, config);
            res.json({ success: true });
        }
    );
});

// Récupérer les logs d'une automatisation
router.get('/automation/logs/:id', requireAdmin, (req, res) => {
    const { id } = req.params;

    database.all(
        `SELECT id, automation_id, expert_id, expert_name, expert_email, target_month, sent_at, recipients_list, filename FROM automation_logs WHERE automation_id = ? ORDER BY sent_at DESC LIMIT 100`,
        [id],
        (err, rows) => {
            if (err) {
                // Table n'existe peut-être pas encore
                console.error('Erreur lecture logs automation:', err);
                return res.json({ success: true, logs: [] });
            }

            // Ajouter file_id pour savoir si le fichier est téléchargeable
            const logsWithFileId = (rows || []).map(row => ({
                ...row,
                file_id: row.id, // On utilise l'ID comme file_id
                recipients_count: row.recipients_list ? JSON.parse(row.recipients_list).length : 0
            }));

            res.json({ success: true, logs: logsWithFileId });
        }
    );
});

// Télécharger un fichier de sauvegarde depuis les logs
router.get('/automation/download/2/:logId', requireAdmin, (req, res) => {
    const { logId } = req.params;

    database.get(
        `SELECT filename, file_content FROM automation_logs WHERE id = ? AND automation_id = 2`,
        [logId],
        (err, row) => {
            if (err) {
                console.error('Erreur récupération fichier:', err);
                return res.status(500).json({ error: err.message });
            }

            if (!row || !row.file_content) {
                return res.status(404).json({ error: 'Fichier non trouvé' });
            }

            const filename = row.filename || 'Expert_Planning_Sauvegarde.csv';

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(row.file_content);
        }
    );
});

// Supprimer les logs d'une automatisation
router.delete('/automation/logs/:id', requireAdmin, (req, res) => {
    const { id } = req.params;

    database.run(`DELETE FROM automation_logs WHERE automation_id = ?`, [id], err => {
        if (err) {
            console.error('Erreur suppression logs automation:', err);
            return res.status(500).json({ error: err.message });
        }

        res.json({ success: true });
    });
});

// Tester l'automatisation n°1 : trouver les experts sans disponibilités pour M+1
router.get('/automation/test/1', requireAdmin, async (req, res) => {
    try {
        // Calculer le mois M+1
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const year = nextMonth.getFullYear();
        const month = nextMonth.getMonth(); // 0-indexed
        const monthNames = [
            'Janvier',
            'Février',
            'Mars',
            'Avril',
            'Mai',
            'Juin',
            'Juillet',
            'Août',
            'Septembre',
            'Octobre',
            'Novembre',
            'Décembre'
        ];
        const targetMonth = `${monthNames[month]} ${year}`;

        // Calculer le premier et dernier jour du mois M+1 pour vérifier la période MAD
        const firstDayNextMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayNextMonth = new Date(year, month + 1, 0); // Dernier jour du mois
        const lastDayNextMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNextMonth.getDate()).padStart(2, '0')}`;

        // Récupérer tous les experts actifs avec leur ressource active et dont la période MAD couvre le mois M+1
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT u.id, u.nom, u.prenom, u.email, u.resource_id, r.date_debut, r.date_fin
                 FROM users u 
                 LEFT JOIN resources r ON u.resource_id = r.id
                 WHERE u.is_expert = 1 
                 AND u.actif = 1
                 AND u.email IS NOT NULL 
                 AND u.email != ''
                 AND u.resource_id IS NOT NULL
                 AND r.actif = 1
                 AND (r.date_debut IS NULL OR r.date_debut <= ?)
                 AND (r.date_fin IS NULL OR r.date_fin >= ?)`,
                [lastDayNextMonthStr, firstDayNextMonth],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        console.log(`🔍 ${experts.length} expert(s) actif(s) avec MAD couvrant ${targetMonth}`);

        // Pour chaque expert, vérifier s'il a des disponibilités pour le mois M+1
        const expertsWithoutAvailability = [];

        for (const expert of experts) {
            // Chercher des entrées de disponibilité (type='available', value='2') pour ce mois
            // Format date_key: YYYY-MM-DD_AM ou YYYY-MM-DD_PM
            const hasAvailability = await new Promise((resolve, reject) => {
                const monthStr = String(month + 1).padStart(2, '0');
                const pattern = `${year}-${monthStr}-%`;

                database.get(
                    `SELECT COUNT(*) as count FROM schedule_data 
                     WHERE resource_id = ? 
                     AND date_key LIKE ? 
                     AND type = 'available' 
                     AND value = '2'`,
                    [expert.resource_id, pattern],
                    (err, row) => {
                        if (err) {
                            console.error('Erreur requête disponibilités:', err);
                            reject(err);
                        } else {
                            console.log(
                                `🔍 Expert ${expert.prenom} ${expert.nom} (resource_id=${expert.resource_id}): ${row?.count || 0} disponibilités pour ${year}-${monthStr}`
                            );
                            resolve(row && row.count > 0);
                        }
                    }
                );
            });

            if (!hasAvailability) {
                expertsWithoutAvailability.push({
                    id: expert.id,
                    nom: expert.nom,
                    prenom: expert.prenom,
                    email: expert.email,
                    resource_id: expert.resource_id
                });
            }
        }

        res.json({
            success: true,
            targetMonth,
            year,
            month: month + 1,
            expertsWithoutAvailability
        });
    } catch (error) {
        console.error('Erreur test automation 1:', error);
        res.status(500).json({ error: error.message });
    }
});

// Envoyer des rappels aux experts
router.post('/automation/send-reminder', requireAdmin, async (req, res) => {
    const { experts, targetMonth } = req.body;

    if (!experts || experts.length === 0) {
        return res.status(400).json({ error: 'Aucun expert sélectionné' });
    }

    const transporter = createEmailTransporter();
    if (!transporter) {
        return res.status(500).json({ error: 'Configuration email non disponible' });
    }

    const senderName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    let sent = 0;
    let failed = 0;

    // Récupérer l'email de copie si configuré
    let copyEmail = null;
    try {
        const configRow = await new Promise((resolve, reject) => {
            database.get(`SELECT value FROM settings WHERE key = 'automation_1_config'`, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (configRow && configRow.value) {
            const config = JSON.parse(configRow.value);
            if (config.copyUserId) {
                const copyUser = await new Promise((resolve, reject) => {
                    database.get(`SELECT email FROM users WHERE id = ?`, [config.copyUserId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
                if (copyUser) copyEmail = copyUser.email;
            }
        }
    } catch (e) {
        console.error('Erreur récupération email copie:', e);
    }

    console.log(`📧 Envoi de rappels à ${experts.length} expert(s) pour ${targetMonth}`);

    for (const expert of experts) {
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: expert.email,
            cc: copyEmail || undefined,
            subject: `Rappel : Saisie des disponibilités pour ${targetMonth}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #ff9800; border-bottom: 2px solid #ff9800; padding-bottom: 10px;">
                            📅 Rappel de saisie des disponibilités
                        </h2>
                        
                        <p>Bonjour ${expert.prenom} ${expert.nom},</p>
                        
                        <p>Nous vous rappelons que vos disponibilités pour le mois de <strong>${targetMonth}</strong> n'ont pas encore été renseignées dans l'application de planification.</p>
                        
                        <div style="margin: 20px 0; padding: 15px; background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
                            <p style="margin: 0;"><strong>Action requise :</strong></p>
                            <p style="margin: 5px 0 0 0;">Merci de vous connecter à l'application et de saisir vos disponibilités pour le mois à venir.</p>
                        </div>
                        
                        <p>Cordialement,<br>${senderName}<br>Système de planification SI-SAMU</p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                            Cet email a été envoyé automatiquement depuis le système SI-SAMU de planification des ressources.
                        </p>
                    </div>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Rappel envoyé à ${expert.email}`);
            sent++;

            // Enregistrer dans les logs
            database.run(
                `INSERT INTO automation_logs (automation_id, expert_id, expert_name, expert_email, target_month, sent_at)
                 VALUES (?, ?, ?, ?, ?, datetime('now'))`,
                [1, expert.id, `${expert.prenom} ${expert.nom}`, expert.email, targetMonth]
            );
        } catch (error) {
            console.error(`❌ Erreur envoi à ${expert.email}:`, error.message);
            failed++;
        }
    }

    res.json({ success: true, sent, failed });
});

// Récupérer les mois qui ont des données (hors lignes vides 1-1)
router.get('/automation/available-months', requireAdmin, async (req, res) => {
    try {
        // Récupérer les mois distincts où il y a des données NON vides
        // On ne compte que les lignes où available != '1' OU activity != '1'
        const monthsData = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT DISTINCT substr(date_key, 1, 7) as month 
                FROM schedule_data 
                WHERE (type = 'available' AND value != '1')
                   OR (type = 'activity' AND value != '1')
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        console.log(
            '📅 Mois bruts trouvés:',
            monthsData.map(r => r.month)
        );

        // Filtrer, normaliser et trier les mois chronologiquement
        const monthNames = [
            'Janvier',
            'Février',
            'Mars',
            'Avril',
            'Mai',
            'Juin',
            'Juillet',
            'Août',
            'Septembre',
            'Octobre',
            'Novembre',
            'Décembre'
        ];

        const formattedMonths = monthsData
            .map(row => {
                // Normaliser le format du mois (gérer "2025-9-" -> "2025-09")
                let monthStr = row.month;
                if (!monthStr) return null;

                // Nettoyer les caractères en trop
                monthStr = monthStr.replace(/-$/, ''); // Enlever le tiret final s'il existe

                // Parser année et mois
                const parts = monthStr.split('-');
                if (parts.length < 2) return null;

                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);

                // Vérifier la validité
                if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;

                // Retourner le format normalisé
                return `${year}-${String(month).padStart(2, '0')}`;
            })
            .filter(m => m !== null)
            // Supprimer les doublons après normalisation
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort((a, b) => {
                // Tri chronologique: comparer année puis mois
                const [yearA, monthA] = a.split('-').map(Number);
                const [yearB, monthB] = b.split('-').map(Number);
                if (yearA !== yearB) return yearA - yearB;
                return monthA - monthB;
            })
            .map(monthStr => {
                const [year, month] = monthStr.split('-');
                return {
                    value: monthStr, // "2025-01"
                    label: `${monthNames[parseInt(month) - 1]} ${year}` // "Janvier 2025"
                };
            });

        console.log(
            '📅 Mois formatés:',
            formattedMonths.map(m => `${m.value} -> ${m.label}`)
        );

        res.json({ success: true, months: formattedMonths });
    } catch (error) {
        console.error('Erreur récupération mois disponibles:', error);
        res.status(500).json({ error: error.message });
    }
});

// Diagnostic des mois - pour comprendre les données
router.get('/automation/diagnose-months', requireAdmin, async (req, res) => {
    try {
        // Récupérer tous les mois distincts avec leurs statistiques
        const allMonthsData = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT 
                    substr(date_key, 1, 7) as month,
                    COUNT(*) as total_rows,
                    SUM(CASE WHEN type = 'available' AND value != '1' THEN 1 ELSE 0 END) as available_not_1,
                    SUM(CASE WHEN type = 'activity' AND value != '1' THEN 1 ELSE 0 END) as activity_not_1,
                    GROUP_CONCAT(DISTINCT type || '=' || value) as unique_values
                FROM schedule_data
                GROUP BY substr(date_key, 1, 7)
                ORDER BY month
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Récupérer quelques exemples de données pour chaque mois
        const monthNames = [
            'Janvier',
            'Février',
            'Mars',
            'Avril',
            'Mai',
            'Juin',
            'Juillet',
            'Août',
            'Septembre',
            'Octobre',
            'Novembre',
            'Décembre'
        ];

        const monthsWithDetails = await Promise.all(
            allMonthsData.map(async m => {
                // Récupérer des exemples de données non-vides pour ce mois
                const samples = await new Promise((resolve, reject) => {
                    database.all(
                        `
                    SELECT date_key, type, value, resource_id
                    FROM schedule_data 
                    WHERE substr(date_key, 1, 7) = ?
                      AND ((type = 'available' AND value != '1') OR (type = 'activity' AND value != '1'))
                    LIMIT 5
                `,
                        [m.month],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });

                // Parser le mois pour l'affichage
                let label = m.month;
                if (m.month) {
                    const cleanMonth = m.month.replace(/-$/, '');
                    const parts = cleanMonth.split('-');
                    if (parts.length >= 2) {
                        const year = parts[0];
                        const month = parseInt(parts[1]);
                        if (!isNaN(month) && month >= 1 && month <= 12) {
                            label = `${monthNames[month - 1]} ${year}`;
                        }
                    }
                }

                return {
                    raw: m.month,
                    label: label,
                    totalRows: m.total_rows,
                    availableNot1: m.available_not_1,
                    activityNot1: m.activity_not_1,
                    uniqueValues: m.unique_values,
                    samples: samples.map(s => `${s.date_key}: ${s.type}=${s.value} (res:${s.resource_id})`).join(', ')
                };
            })
        );

        // Chercher des données avec des date_key mal formatées
        const orphanData = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT DISTINCT date_key, type, value
                FROM schedule_data 
                WHERE date_key NOT LIKE '____-__-__%'
                LIMIT 20
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        res.json({
            success: true,
            months: monthsWithDetails,
            orphanData: orphanData
        });
    } catch (error) {
        console.error('Erreur diagnostic mois:', error);
        res.status(500).json({ error: error.message });
    }
});

// Prévisualisation du nettoyage des dates (sans modification)
router.post('/automation/cleanup-dates-preview', requireAdmin, async (req, res) => {
    try {
        console.log('🔍 Prévisualisation du nettoyage des dates...');

        // 1. Trouver les données avec mois = 0 (à supprimer)
        const toDelete = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT date_key, type, value, resource_id 
                FROM schedule_data 
                WHERE date_key LIKE '%-0-%'
                ORDER BY date_key
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        console.log(`🗑️ Lignes à supprimer (mois=0): ${toDelete.length}`);

        // 2. Trouver les dates mal formatées (à normaliser)
        // Inclut: 2025-9-1, 2025-9-1_AM, 2026-2-18_AM, etc.
        const badDates = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT DISTINCT date_key, COUNT(*) as row_count
                FROM schedule_data 
                WHERE (
                    -- Format sans zéro pour le mois: 2025-9-XX ou 2026-2-XX
                    date_key GLOB '[0-9][0-9][0-9][0-9]-[0-9]-*'
                    -- Exclure les mois = 0
                    AND date_key NOT LIKE '%-0-%'
                )
                GROUP BY date_key
                ORDER BY date_key
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        console.log(`✏️ Dates mal formatées: ${badDates.length}`);

        // 3. Pour chaque date mal formatée, vérifier s'il y a conflit
        const toNormalize = [];
        let conflictCount = 0;

        for (const row of badDates) {
            const oldKey = row.date_key;

            // Parser la date - formats possibles:
            // 2025-9-1, 2025-9-1_AM, 2026-2-18_AM, 2026-2-18_PM
            const match = oldKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:_([AP]M))?$/);
            if (match) {
                const [, year, month, day, period] = match;
                const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                const newKey = period ? `${normalizedDate}_${period}` : `${normalizedDate}_AM`;

                // Vérifier si la nouvelle clé existe déjà
                const existingCount = await new Promise((resolve, reject) => {
                    database.get(
                        `SELECT COUNT(*) as count FROM schedule_data WHERE date_key = ?`,
                        [newKey],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row ? row.count : 0);
                        }
                    );
                });

                const hasConflict = existingCount > 0;
                if (hasConflict) conflictCount++;

                toNormalize.push({
                    oldKey,
                    newKey,
                    rowCount: row.row_count,
                    hasConflict,
                    existingCount
                });
            }
        }

        res.json({
            success: true,
            toDelete,
            toNormalize,
            conflictCount
        });
    } catch (error) {
        console.error('Erreur prévisualisation nettoyage:', error);
        res.status(500).json({ error: error.message });
    }
});

// Exécuter le nettoyage des dates (avec modification)
router.post('/automation/cleanup-dates-execute', requireAdmin, async (req, res) => {
    try {
        console.log('🧹 Exécution du nettoyage des dates...');

        let deleted = 0;
        let normalized = 0;
        let duplicatesRemoved = 0;

        // 1. Supprimer les données avec mois = 0
        const deleteResult = await new Promise((resolve, reject) => {
            database.run(`DELETE FROM schedule_data WHERE date_key LIKE '%-0-%'`, function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
        deleted = deleteResult;
        console.log(`🗑️ Supprimé ${deleted} lignes avec mois=0`);

        // 2. Normaliser les dates mal formatées
        const badDates = await new Promise((resolve, reject) => {
            database.all(
                `
                SELECT DISTINCT date_key
                FROM schedule_data 
                WHERE date_key GLOB '[0-9][0-9][0-9][0-9]-[0-9]-*'
            `,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        for (const row of badDates) {
            const oldKey = row.date_key;

            // Parser la date - formats possibles:
            // 2025-9-1, 2025-9-1_AM, 2026-2-18_AM, 2026-2-18_PM
            const match = oldKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:_([AP]M))?$/);
            if (match) {
                const [, year, month, day, period] = match;
                const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                const newKey = period ? `${normalizedDate}_${period}` : `${normalizedDate}_AM`;

                // Vérifier si la nouvelle clé existe déjà
                const existingCount = await new Promise((resolve, reject) => {
                    database.get(
                        `SELECT COUNT(*) as count FROM schedule_data WHERE date_key = ?`,
                        [newKey],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row ? row.count : 0);
                        }
                    );
                });

                if (existingCount === 0) {
                    // Pas de conflit : renommer
                    await new Promise((resolve, reject) => {
                        database.run(
                            `UPDATE schedule_data SET date_key = ? WHERE date_key = ?`,
                            [newKey, oldKey],
                            function (err) {
                                if (err) reject(err);
                                else resolve(this.changes);
                            }
                        );
                    });
                    normalized++;
                    console.log(`✏️ Renommé: ${oldKey} → ${newKey}`);
                } else {
                    // Conflit : supprimer l'ancien (doublon)
                    const deletedDup = await new Promise((resolve, reject) => {
                        database.run(`DELETE FROM schedule_data WHERE date_key = ?`, [oldKey], function (err) {
                            if (err) reject(err);
                            else resolve(this.changes);
                        });
                    });
                    duplicatesRemoved += deletedDup;
                    console.log(`🗑️ Doublon supprimé: ${oldKey} (${deletedDup} lignes)`);
                }
            }
        }

        // Logger l'action
        logUserAction(req, 'Nettoyage dates invalides exécuté', { deleted, normalized, duplicatesRemoved });

        console.log(
            `✅ Nettoyage terminé: ${deleted} supprimés, ${normalized} normalisés, ${duplicatesRemoved} doublons supprimés`
        );

        res.json({
            success: true,
            deleted,
            normalized,
            duplicatesRemoved
        });
    } catch (error) {
        console.error('Erreur exécution nettoyage:', error);
        res.status(500).json({ error: error.message });
    }
});

// Prévisualisation de l'automatisation 2
router.post('/automation/preview/2', requireAdmin, async (req, res) => {
    console.log("👁️ PREVIEW/2 APPELÉ - Affichage du récapitulatif (pas d'envoi)");
    console.log('👁️ Body reçu:', JSON.stringify(req.body, null, 2));
    const {
        groupAdmin,
        groupUser,
        groupExpert,
        recipients,
        allMonths,
        selectedMonths,
        allExperts,
        expertsList,
        excludeEmpty,
        format
    } = req.body;

    try {
        // Construire la liste des destinataires
        let recipientIds = []; // Pour éviter les doublons d'utilisateurs
        let recipientEmails = []; // Les emails uniques pour l'envoi
        let recipientNames = []; // Les noms pour l'affichage

        // Groupes
        if (groupAdmin) {
            const admins = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE is_admin = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            admins.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Admin)`);
                }
            });
        }

        if (groupUser) {
            const users = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE is_user = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            users.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Utilisateur)`);
                }
            });
        }

        if (groupExpert) {
            const expertsUsers = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE is_expert = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            expertsUsers.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Expert)`);
                }
            });
        }

        // Destinataires individuels
        if (recipients && recipients.length > 0) {
            console.log('📧 Recipients individuels reçus:', recipients);
            const individualUsers = await new Promise((resolve, reject) => {
                const query = `SELECT id, nom, prenom, email FROM users WHERE id IN (${recipients.join(',')}) AND email IS NOT NULL AND email != ''`;
                database.all(query, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            individualUsers.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Individuel)`);
                }
            });
        }

        console.log(
            '📧 Total destinataires:',
            recipientNames.length,
            'personnes,',
            recipientEmails.length,
            'emails uniques'
        );
        console.log('📧 Liste:', recipientNames);

        // Compter les experts selon la sélection
        let expertsCount = 0;
        let expertsNamesList = [];

        if (allExperts) {
            const resourcesData = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom FROM resources ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            expertsCount = resourcesData.length;
            expertsNamesList = resourcesData.map(r => `${r.prenom} ${r.nom}`);
        } else if (expertsList && expertsList.length > 0) {
            const resourcesData = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom FROM resources WHERE id IN (${expertsList.join(',')}) ORDER BY nom, prenom`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            expertsCount = resourcesData.length;
            expertsNamesList = resourcesData.map(r => `${r.prenom} ${r.nom}`);
        }

        // Déterminer les mois à inclure
        let monthsLabel = '';
        if (allMonths) {
            // Récupérer tous les mois distincts où il y a des données NON vides
            const monthsData = await new Promise((resolve, reject) => {
                database.all(
                    `
                    SELECT DISTINCT substr(date_key, 1, 7) as month 
                    FROM schedule_data 
                    WHERE (type = 'available' AND value != '1')
                       OR (type = 'activity' AND value != '1')
                `,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            // Filtrer et compter les mois valides
            const validMonths = monthsData
                .map(row => {
                    let monthStr = row.month;
                    if (!monthStr) return null;
                    monthStr = monthStr.replace(/-$/, '');
                    const parts = monthStr.split('-');
                    if (parts.length < 2) return null;
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
                    return `${year}-${String(month).padStart(2, '0')}`;
                })
                .filter(m => m !== null)
                .filter((value, index, self) => self.indexOf(value) === index);

            monthsLabel =
                validMonths.length > 0 ? `Toutes les données (${validMonths.length} mois)` : 'Toutes les données';
        } else if (selectedMonths && selectedMonths.length > 0) {
            // selectedMonths contient des valeurs comme "2025-01" ou "2025-09"
            const monthNames = [
                'Janvier',
                'Février',
                'Mars',
                'Avril',
                'Mai',
                'Juin',
                'Juillet',
                'Août',
                'Septembre',
                'Octobre',
                'Novembre',
                'Décembre'
            ];
            const monthsLabels = selectedMonths.map(monthStr => {
                // Nettoyer et parser le mois
                const cleanMonth = monthStr.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                const year = parts[0];
                const month = parseInt(parts[1]);
                if (isNaN(month) || month < 1 || month > 12) return monthStr;
                return `${monthNames[month - 1]} ${year}`;
            });
            monthsLabel = monthsLabels.join(', ');
        } else {
            monthsLabel = 'Aucun mois sélectionné';
        }

        // Générer le nom du fichier
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const filename = `Expert_Planning_Sauvegarde_de_${timestamp}.${format}`;

        console.log('👁️ Preview/2 réponse:', {
            recipientsCount: recipientNames.length,
            emailsCount: recipientEmails.length,
            expertsCount,
            monthsLabel,
            filename
        });

        res.json({
            success: true,
            recipientsCount: recipientNames.length, // Nombre de personnes
            emailsCount: recipientEmails.length, // Nombre d'emails uniques
            recipientsList: recipientNames,
            expertsCount,
            expertsNamesList,
            monthsLabel,
            excludeEmpty: excludeEmpty !== false,
            filename
        });
    } catch (error) {
        console.error('❌ Erreur preview automation 2:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// Envoyer la sauvegarde du planning (automatisation 2)
router.post('/automation/send/2', requireAdmin, async (req, res) => {
    console.log('🚨 SEND/2 APPELÉ - Vérifiez que vous avez cliqué sur Confirmer et envoyer !');
    const {
        groupAdmin,
        groupUser,
        groupExpert,
        recipients,
        allMonths,
        selectedMonths,
        allExperts,
        expertsList,
        excludeEmpty,
        format
    } = req.body;

    try {
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(500).json({ error: 'Configuration email non disponible' });
        }

        // Construire la liste des destinataires
        let recipientIds = []; // Pour éviter les doublons d'utilisateurs
        let recipientEmails = []; // Les emails uniques pour l'envoi
        let recipientNames = []; // Les noms pour l'affichage

        if (groupAdmin) {
            const admins = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE is_admin = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            admins.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }

        if (groupUser) {
            const usersData = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE is_user = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            usersData.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }

        if (groupExpert) {
            const expertsUsers = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE is_expert = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            expertsUsers.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }

        if (recipients && recipients.length > 0) {
            const individualUsers = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT id, nom, prenom, email FROM users WHERE id IN (${recipients.join(',')}) AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            individualUsers.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }

        if (recipientEmails.length === 0) {
            return res.status(400).json({ error: 'Aucun destinataire' });
        }

        console.log(`📧 Envoi à ${recipientNames.length} personnes (${recipientEmails.length} emails uniques)`);

        // Récupérer les ressources selon la sélection
        let resourcesList = [];
        if (allExperts) {
            resourcesList = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM resources ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
        } else if (expertsList && expertsList.length > 0) {
            resourcesList = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT * FROM resources WHERE id IN (${expertsList.join(',')}) ORDER BY nom, prenom`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
        }

        const now = new Date();
        const monthNames = [
            'Janvier',
            'Février',
            'Mars',
            'Avril',
            'Mai',
            'Juin',
            'Juillet',
            'Août',
            'Septembre',
            'Octobre',
            'Novembre',
            'Décembre'
        ];
        let monthsLabels = [];
        let scheduleData = [];

        console.log('📊 Config send/2:', {
            allMonths,
            selectedMonths,
            allExperts,
            expertsList: expertsList?.length,
            excludeEmpty
        });

        if (allMonths) {
            // Récupérer TOUTES les données de schedule_data
            scheduleData = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM schedule_data ORDER BY resource_id, date_key`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            monthsLabels = ['Toutes les données'];
            console.log(`📊 Toutes les données: ${scheduleData.length} lignes`);
        } else if (selectedMonths && selectedMonths.length > 0) {
            // selectedMonths contient des valeurs comme "2025-01" ou "2025-09"
            let allPatterns = [];
            selectedMonths.forEach(monthStr => {
                // Nettoyer le mois et créer les patterns
                const cleanMonth = monthStr.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                const year = parts[0];
                const month = parseInt(parts[1]);

                if (!isNaN(month) && month >= 1 && month <= 12) {
                    // Créer deux patterns pour gérer les deux formats possibles dans la DB
                    // Format avec zéro: "2025-09-%"
                    const patternWithZero = `${year}-${String(month).padStart(2, '0')}-%`;
                    // Format sans zéro: "2025-9-%"
                    const patternWithoutZero = `${year}-${month}-%`;

                    allPatterns.push(patternWithZero);
                    if (patternWithZero !== patternWithoutZero) {
                        allPatterns.push(patternWithoutZero);
                    }

                    monthsLabels.push(`${monthNames[month - 1]} ${year}`);
                }
            });

            if (allPatterns.length === 0) {
                console.log('📊 Aucun pattern valide!');
                return res.status(400).json({ error: 'Format de mois invalide' });
            }

            const likeConditions = allPatterns.map(() => `date_key LIKE ?`).join(' OR ');
            console.log('📊 Requête mois:', likeConditions, allPatterns);

            scheduleData = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT * FROM schedule_data WHERE ${likeConditions} ORDER BY resource_id, date_key`,
                    allPatterns,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            console.log(`📊 Mois sélectionnés: ${scheduleData.length} lignes`);
        } else {
            console.log('📊 Aucun mois sélectionné!');
            return res.status(400).json({ error: 'Aucun mois sélectionné' });
        }

        // Organiser les données par ressource et date
        const dataByResource = {};
        scheduleData.forEach(row => {
            if (!dataByResource[row.resource_id]) {
                dataByResource[row.resource_id] = {};
            }
            if (!dataByResource[row.resource_id][row.date_key]) {
                dataByResource[row.resource_id][row.date_key] = {};
            }
            dataByResource[row.resource_id][row.date_key][row.type] = row.value;
        });

        // Générer le fichier CSV
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const filename = `Expert_Planning_Sauvegarde_de_${timestamp}.${format}`;

        const availLabels = { 1: 'Indisponible', 2: 'Disponible', 3: 'Congés' };
        const actLabels = {
            1: 'Indisponible',
            2: 'En attente',
            3: 'SAMU Déploiement',
            4: 'SAMU Dev',
            5: 'ANS Déploiement',
            6: 'ANS Dev',
            7: 'Qualification',
            8: 'Divers'
        };

        let csvContent = '\ufeff'; // BOM UTF-8
        csvContent += 'Expert,Date,Période,Disponibilité,Affectation,Localisation\n';

        // Récupérer toutes les date_key uniques (format: 2025-01-15_AM)
        const allDateKeys = new Set();
        Object.values(dataByResource).forEach(resData => {
            Object.keys(resData).forEach(dateKey => allDateKeys.add(dateKey));
        });
        const sortedDateKeys = Array.from(allDateKeys).sort();

        resourcesList.forEach(resource => {
            const resData = dataByResource[resource.id] || {};

            sortedDateKeys.forEach(dateKey => {
                // dateKey est au format "2025-01-15_AM"
                const data = resData[dateKey] || {};

                // Extraire la date et la période
                const parts = dateKey.split('_');
                const datePart = parts[0]; // "2025-01-15"
                const period = parts[1] || 'AM'; // "AM" ou "PM"

                const avail = data.available || '1';
                const act = data.activity || '1';
                const loc = data.localisation || '-';

                // Exclure les lignes vides si l'option est cochée (1-1 = Indisponible-Indisponible)
                const isEmpty = avail === '1' && act === '1';
                const shouldExclude = excludeEmpty && isEmpty;

                if (!shouldExclude) {
                    csvContent += `"${resource.prenom} ${resource.nom}","${datePart}","${period}","${availLabels[avail] || avail}","${actLabels[act] || act}","${loc}"\n`;
                }
            });
        });

        // Envoyer l'email avec pièce jointe
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: recipientEmails.join(', '),
            subject: `📊 Sauvegarde du planning - ${monthsLabels.join(', ')}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #e65100; border-bottom: 2px solid #ff9800; padding-bottom: 10px;">
                            📊 Sauvegarde automatique du planning
                        </h2>
                        
                        <p>Bonjour,</p>
                        
                        <p>Veuillez trouver ci-joint la sauvegarde du planning${allMonths ? ' (toutes les données)' : ' pour les mois suivants :'}</p>
                        
                        ${!allMonths ? `<ul>${monthsLabels.map(m => `<li>${m}</li>`).join('')}</ul>` : ''}
                        
                        <div style="margin: 20px 0; padding: 15px; background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
                            <p style="margin: 0;"><strong>Informations :</strong></p>
                            <p style="margin: 5px 0 0 0;">
                                • ${resourcesList.length} expert(s) inclus<br>
                                • Format : ${format.toUpperCase()}<br>
                                ${excludeEmpty ? '• Lignes vides exclues<br>' : ''}
                                • Date de génération : ${new Date().toLocaleString('fr-FR')}
                            </p>
                        </div>
                        
                        <p>Cordialement,<br>Système de planification SI-SAMU</p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                            Cet email a été envoyé automatiquement depuis le système SI-SAMU de planification des ressources.
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: filename,
                    content: csvContent,
                    contentType: 'text/csv; charset=utf-8'
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Sauvegarde planning envoyée à ${recipientEmails.length} destinataire(s)`);

        // Enregistrer dans les logs avec le contenu du fichier et la liste des destinataires
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at, recipients_list, file_content, filename)
             VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
            [
                2,
                `${recipientNames.length} personnes`,
                recipientEmails.join(', '),
                monthsLabels.join(', '),
                JSON.stringify(recipientNames),
                csvContent,
                filename
            ]
        );

        res.json({
            success: true,
            sent: recipientNames.length, // Nombre de personnes
            emailsSent: recipientEmails.length, // Nombre d'emails uniques
            failed: 0
        });
    } catch (error) {
        console.error('Erreur envoi automation 2:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
