// Automatisations n°1 et n°2, lancées par les tâches planifiées
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { database, dbRead } from '../../db/database.js';
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';

// Fonction pour exécuter l'automatisation n°1 (rappel disponibilités)
export async function runAutomation1() {
    console.log('⏰ [CRON] Vérification automatisation n°1...');

    try {
        // Récupérer la configuration
        const configRow = await new Promise((resolve, reject) => {
            database.get(`SELECT value FROM settings WHERE key = 'automation_1_config'`, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!configRow || !configRow.value) {
            console.log('⏰ [CRON] Automatisation n°1 non configurée');
            return;
        }

        const config = JSON.parse(configRow.value);

        if (!config.enabled) {
            console.log('⏰ [CRON] Automatisation n°1 désactivée');
            return;
        }

        // Vérifier si on est à J-X de la fin du mois
        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysUntilEndOfMonth = lastDayOfMonth - currentDay;

        console.log(`⏰ [CRON] Jours avant fin du mois: ${daysUntilEndOfMonth}, Config: ${config.days} jours`);

        if (daysUntilEndOfMonth !== config.days) {
            console.log(`⏰ [CRON] Pas le bon jour pour l'envoi (J-${daysUntilEndOfMonth} vs J-${config.days})`);
            return;
        }

        console.log("⏰ [CRON] Déclenchement de l'automatisation n°1...");

        // Calculer le mois M+1
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const year = nextMonth.getFullYear();
        const month = nextMonth.getMonth();
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

        console.log(`⏰ [CRON] ${experts.length} expert(s) actif(s) avec MAD couvrant ${targetMonth}`);

        // Trouver les experts sans disponibilités pour M+1
        const expertsToNotify = [];

        for (const expert of experts) {
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
                        if (err) reject(err);
                        else resolve(row && row.count > 0);
                    }
                );
            });

            if (!hasAvailability) {
                // Vérifier si on n'a pas déjà envoyé un rappel ce mois-ci pour ce mois cible
                const alreadySent = await new Promise((resolve, reject) => {
                    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    database.get(
                        `SELECT COUNT(*) as count FROM automation_logs 
                         WHERE automation_id = 1 
                         AND expert_id = ? 
                         AND target_month = ?
                         AND sent_at >= ?`,
                        [expert.id, targetMonth, startOfMonth],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row && row.count > 0);
                        }
                    );
                });

                if (!alreadySent) {
                    expertsToNotify.push(expert);
                } else {
                    console.log(`⏰ [CRON] Rappel déjà envoyé ce mois-ci à ${expert.prenom} ${expert.nom}`);
                }
            }
        }

        if (expertsToNotify.length === 0) {
            console.log('⏰ [CRON] Aucun expert à notifier');
            return;
        }

        console.log(`⏰ [CRON] ${expertsToNotify.length} expert(s) à notifier pour ${targetMonth}`);

        // Envoyer les emails
        const transporter = createEmailTransporter();
        if (!transporter) {
            console.error('⏰ [CRON] Configuration email non disponible');
            return;
        }

        // Récupérer l'email de copie si configuré
        let copyEmail = null;
        if (config.copyUserId) {
            const copyUser = await new Promise((resolve, reject) => {
                database.get(`SELECT email FROM users WHERE id = ?`, [config.copyUserId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            if (copyUser) copyEmail = copyUser.email;
        }

        let sent = 0;
        let failed = 0;

        for (const expert of expertsToNotify) {
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
                            
                            <p>Cordialement,<br>Système de planification SI-SAMU</p>
                            
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
                console.log(`⏰ [CRON] ✅ Rappel envoyé à ${expert.email}`);
                sent++;

                // Enregistrer dans les logs
                database.run(
                    `INSERT INTO automation_logs (automation_id, expert_id, expert_name, expert_email, target_month, sent_at)
                     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
                    [1, expert.id, `${expert.prenom} ${expert.nom}`, expert.email, targetMonth]
                );
            } catch (error) {
                console.error(`⏰ [CRON] ❌ Erreur envoi à ${expert.email}:`, error.message);
                failed++;
            }
        }

        console.log(`⏰ [CRON] Automatisation n°1 terminée: ${sent} envoyé(s), ${failed} échec(s)`);
    } catch (error) {
        console.error('⏰ [CRON] Erreur automatisation n°1:', error);
    }
}

// Fonction pour exécuter l'automatisation n°2 (sauvegarde plannings)
export async function runAutomation2() {
    console.log('⏰ [CRON] Vérification automatisation n°2...');

    try {
        // Récupérer la configuration (via dbRead pour ne pas bloquer les writes)
        const configRow = await new Promise((resolve, reject) => {
            dbRead.get(`SELECT value FROM settings WHERE key = 'automation_2_config'`, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!configRow || !configRow.value) {
            console.log('⏰ [CRON] Automatisation n°2 non configurée');
            return;
        }

        const config = JSON.parse(configRow.value);

        if (!config.enabled) {
            console.log('⏰ [CRON] Automatisation n°2 désactivée');
            return;
        }

        // Utiliser l'heure de Paris pour la vérification
        const now = new Date();
        const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const currentDay = parisTime.getDate();
        const currentDayOfWeek = parisTime.getDay(); // 0=Dimanche, 1=Lundi, etc.
        const currentHour = parisTime.getHours();

        console.log(`⏰ [CRON] Heure Paris: ${currentHour}h, Config: ${config.hour}h, Fréquence: ${config.frequency}`);

        // Vérifier si c'est le bon moment pour envoyer
        let shouldSend = false;

        if (config.frequency === 'daily') {
            shouldSend = currentHour === parseInt(config.hour);
        } else if (config.frequency === 'weekly') {
            shouldSend = currentDayOfWeek === parseInt(config.weekDay) && currentHour === parseInt(config.hour);
        } else if (config.frequency === 'monthly') {
            shouldSend = currentDay === parseInt(config.monthDay) && currentHour === parseInt(config.hour);
        }

        if (!shouldSend) {
            console.log(`⏰ [CRON] Pas le bon moment pour l'automatisation n°2`);
            return;
        }

        console.log("⏰ [CRON] Déclenchement de l'automatisation n°2...");

        const transporter = createEmailTransporter();
        if (!transporter) {
            console.error('⏰ [CRON] Configuration email non disponible');
            return;
        }

        // Construire la liste des destinataires
        let recipientEmails = [];

        if (config.groupAdmin) {
            const admins = await new Promise((resolve, reject) => {
                dbRead.all(
                    `SELECT email FROM users WHERE is_admin = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            admins.forEach(u => {
                if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email);
            });
        }

        if (config.groupUser) {
            const usersData = await new Promise((resolve, reject) => {
                dbRead.all(
                    `SELECT email FROM users WHERE is_user = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            usersData.forEach(u => {
                if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email);
            });
        }

        if (config.groupExpert) {
            const expertsUsers = await new Promise((resolve, reject) => {
                dbRead.all(
                    `SELECT email FROM users WHERE is_expert = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            expertsUsers.forEach(u => {
                if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email);
            });
        }

        if (config.recipients && config.recipients.length > 0) {
            const individualUsers = await new Promise((resolve, reject) => {
                dbRead.all(
                    `SELECT email FROM users WHERE id IN (${config.recipients.join(',')}) AND email IS NOT NULL AND email != ''`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            individualUsers.forEach(u => {
                if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email);
            });
        }

        if (recipientEmails.length === 0) {
            console.log('⏰ [CRON] Automatisation n°2: aucun destinataire');
            return;
        }

        // Récupérer les ressources selon la sélection
        let resourcesList = [];
        if (config.allExperts !== false) {
            // Par défaut tous les experts
            resourcesList = await new Promise((resolve, reject) => {
                dbRead.all(`SELECT * FROM resources ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
        } else if (config.expertsList && config.expertsList.length > 0) {
            resourcesList = await new Promise((resolve, reject) => {
                dbRead.all(
                    `SELECT * FROM resources WHERE id IN (${config.expertsList.join(',')}) ORDER BY nom, prenom`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
        }

        // Récupérer les données de planning
        // Utiliser selectedMonths (format "2025-01") si pas allMonths
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
        let allPatterns = [];
        let monthsLabels = [];
        let selectedMonthsList = [];

        if (config.allMonths) {
            // Récupérer tous les mois disponibles depuis la base (via dbRead)
            const availableMonths = await new Promise((resolve, reject) => {
                dbRead.all(
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
            selectedMonthsList = availableMonths.map(r => r.month).filter(m => m && m.length >= 7);
        } else if (config.selectedMonths && config.selectedMonths.length > 0) {
            selectedMonthsList = config.selectedMonths;
        } else {
            // Fallback: mois courant et suivant
            const d1 = new Date();
            const d2 = new Date(d1.getFullYear(), d1.getMonth() + 1, 1);
            selectedMonthsList = [
                `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}`,
                `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`
            ];
        }

        console.log(`⏰ [CRON] Mois sélectionnés: ${selectedMonthsList.join(', ')}`);

        selectedMonthsList.forEach(monthStr => {
            // Format: "2025-01" ou "2025-1-"
            const cleanMonth = monthStr.replace(/-$/, '');
            const parts = cleanMonth.split('-');
            if (parts.length >= 2) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                    // Pattern avec zéro
                    const patternWithZero = `${year}-${String(month).padStart(2, '0')}-%`;
                    allPatterns.push(patternWithZero);
                    // Pattern sans zéro (pour les anciennes données)
                    const patternWithoutZero = `${year}-${month}-%`;
                    if (patternWithZero !== patternWithoutZero) {
                        allPatterns.push(patternWithoutZero);
                    }
                    monthsLabels.push(`${monthNames[month - 1]} ${year}`);
                }
            }
        });

        if (allPatterns.length === 0) {
            console.log('⏰ [CRON] Automatisation n°2: aucun mois sélectionné');
            return;
        }

        const likeConditions = allPatterns.map(() => `date_key LIKE ?`).join(' OR ');

        const scheduleData = await new Promise((resolve, reject) => {
            dbRead.all(
                `SELECT * FROM schedule_data WHERE ${likeConditions} ORDER BY resource_id, date_key`,
                allPatterns,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Organiser les données
        const dataByResource = {};
        scheduleData.forEach(row => {
            if (!dataByResource[row.resource_id]) dataByResource[row.resource_id] = {};
            if (!dataByResource[row.resource_id][row.date_key]) dataByResource[row.resource_id][row.date_key] = {};
            dataByResource[row.resource_id][row.date_key][row.type] = row.value;
        });

        // Générer le fichier avec l'heure de Paris
        const format = config.format || 'csv';
        const parisTimeForFile = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const timestamp = `${parisTimeForFile.getFullYear()}-${String(parisTimeForFile.getMonth() + 1).padStart(2, '0')}-${String(parisTimeForFile.getDate()).padStart(2, '0')}_${String(parisTimeForFile.getHours()).padStart(2, '0')}-${String(parisTimeForFile.getMinutes()).padStart(2, '0')}`;
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

        // Option excludeEmpty
        const excludeEmpty = config.excludeEmpty !== false; // Par défaut true
        console.log(`⏰ [CRON] Exclure lignes vides: ${excludeEmpty}`);

        let csvContent = '\ufeff';
        csvContent += 'Expert,Date,Période,Disponibilité,Affectation,Localisation\n';
        let totalRows = 0;
        let excludedRows = 0;

        resourcesList.forEach(resource => {
            const resData = dataByResource[resource.id] || {};

            // Parcourir tous les mois sélectionnés
            selectedMonthsList.forEach(monthStr => {
                const cleanMonth = monthStr.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                if (parts.length >= 2) {
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                        const daysInMonth = new Date(year, month, 0).getDate();

                        for (let day = 1; day <= daysInMonth; day++) {
                            const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            ['AM', 'PM'].forEach(period => {
                                const key = `${dateKey}_${period}`;
                                // Aussi chercher avec l'ancien format sans zéro
                                const keyAlt = `${year}-${month}-${day}_${period}`;
                                const data = resData[key] || resData[keyAlt] || {};

                                const avail = data.available || '1';
                                const act = data.activity || '1';
                                const loc = data.localisation || '-';

                                // Vérifier si on doit exclure cette ligne
                                const isEmpty = avail === '1' && act === '1';

                                if (excludeEmpty && isEmpty) {
                                    excludedRows++;
                                    return; // Sauter cette ligne
                                }

                                totalRows++;
                                csvContent += `"${resource.prenom} ${resource.nom}","${dateKey}","${period}","${availLabels[avail] || avail}","${actLabels[act] || act}","${loc}"\n`;
                            });
                        }
                    }
                }
            });
        });

        console.log(`⏰ [CRON] CSV généré: ${totalRows} lignes (${excludedRows} exclues car vides)`);

        // Construire la liste des noms des destinataires pour les logs
        let recipientNames = [];
        if (config.groupAdmin) recipientNames.push('Groupe Administrateurs');
        if (config.groupUser) recipientNames.push('Groupe Utilisateurs');
        if (config.groupExpert) recipientNames.push('Groupe Experts');
        // Récupérer les noms des destinataires individuels
        if (config.recipients && config.recipients.length > 0) {
            const individualUsers = await new Promise((resolve, reject) => {
                dbRead.all(
                    `SELECT nom, prenom FROM users WHERE id IN (${config.recipients.join(',')})`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            individualUsers.forEach(u => recipientNames.push(`${u.prenom} ${u.nom}`));
        }

        // Envoyer l'email
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: recipientEmails.join(', '),
            subject: `📊 Sauvegarde automatique du planning - ${monthsLabels.join(', ')}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #e65100;">📊 Sauvegarde automatique du planning</h2>
                    <p>Veuillez trouver ci-joint la sauvegarde du planning pour : ${monthsLabels.join(', ')}</p>
                    <p>• ${resourcesList.length} expert(s) inclus<br>• Format : ${format.toUpperCase()}</p>
                    <hr><p style="color: #999; font-size: 12px;">Email automatique - Système SI-SAMU</p>
                </div>
            `,
            attachments: [{ filename, content: csvContent, contentType: 'text/csv; charset=utf-8' }]
        };

        await transporter.sendMail(mailOptions);
        console.log(`⏰ [CRON] ✅ Automatisation n°2: sauvegarde envoyée à ${recipientEmails.length} destinataire(s)`);

        // Enregistrer dans les logs avec toutes les informations
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
    } catch (error) {
        console.error('⏰ [CRON] Erreur automatisation n°2:', error);
    }
}
