// Notifications : clients temps réel, notifications experts, Teams, contenu des invitations
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { database } from '../../db/database.js';
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';

// Map SSE pour les messages push (userId -> res)
export const sseClients = new Map();

// Envoyer une notification Teams depuis le serveur
export async function sendTeamsNotificationFromServer(type, data) {
    try {
        // Récupérer la configuration de l'automatisation 3
        const configRow = await new Promise((resolve, reject) => {
            database.get(`SELECT value FROM settings WHERE key = ?`, ['automation_3_config'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!configRow || !configRow.value) {
            console.log('📢 Teams: Configuration non trouvée');
            return;
        }

        const config = JSON.parse(configRow.value);

        if (!config.enabled) {
            console.log('📢 Teams: Automatisation désactivée');
            return;
        }

        if (!config.notifications || !config.notifications.includes(type)) {
            console.log(`📢 Teams: Type de notification "${type}" non activé`);
            return;
        }

        if (!config.teamsEmail) {
            console.log('📢 Teams: Email Teams non configuré');
            return;
        }

        // Construire le message selon le type
        let subject = '';
        let content = '';
        let color = '#3498db';

        switch (type) {
            case 'affectation':
                subject = '📅 Nouvelle affectation';
                color = '#3498db';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Activité :</strong> ${data.activity || 'Non spécifiée'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    <p><strong>Période :</strong> ${data.period || 'Non spécifiée'}</p>
                    ${data.location ? `<p><strong>Localisation :</strong> ${data.location}</p>` : ''}
                `;
                break;

            case 'demande':
                subject = "✉️ Demande d'affectation";
                color = '#27ae60';
                content = `
                    <p><strong>De :</strong> ${data.from || 'Non spécifié'}</p>
                    <p><strong>Objet :</strong> ${data.subject || 'Non spécifié'}</p>
                    <p><strong>Message :</strong></p>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 5px;">
                        ${(data.message || '').replace(/\n/g, '<br>').substring(0, 500)}
                    </div>
                `;
                break;

            case 'astreinte':
                subject = '🔔 Nouvelle astreinte/HNO';
                color = '#9c27b0';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Type :</strong> ${data.type === 'hno' ? 'HNO (Heures Non Ouvrées)' : data.type === 'activite_courante' ? 'Activité courante' : 'Astreinte'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.heureDebut ? `<p><strong>Horaires :</strong> ${data.heureDebut} - ${data.heureFin}</p>` : ''}
                `;
                break;

            case 'evenement':
                subject = '📆 Nouvel événement';
                color = '#ff9800';
                content = `
                    <p><strong>Événement :</strong> ${data.name || 'Non spécifié'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.createdBy ? `<p><strong>Créé par :</strong> ${data.createdBy}</p>` : ''}
                `;
                break;

            default:
                console.log(`📢 Teams: Type de notification inconnu: ${type}`);
                return;
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
            console.log('📢 Teams: Transporteur email non disponible');
            return;
        }

        const mailOptions = {
            from: `"Planning ANS" <${emailConfig.user || 'noreply@esante.gouv.fr'}>`,
            to: config.teamsEmail,
            subject: `${subject} - Planning ANS`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">${subject}</h2>
                        </div>
                        <div style="padding: 25px;">
                            ${content}
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        // Logger l'envoi
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at) VALUES (?, ?, ?, ?, datetime('now'))`,
            [3, type, config.teamsEmail, JSON.stringify(data)],
            err => {
                if (err) console.error('Erreur log Teams notify:', err);
            }
        );

        console.log(`📢 Notification Teams [${type}] envoyée avec succès`);
    } catch (error) {
        console.error('📢 Erreur envoi notification Teams:', error);
    }
}

// Construire le HTML du body d'une invitation
export function buildInvitationHTML(attendeeName, requesterName, group, type) {
    const isCancel = type === 'cancelled';
    const isModified = type === 'modified';
    const color = isCancel ? '#D60B51' : isModified ? '#ff9800' : '#1D70B7';
    const icon = isCancel ? '❌' : isModified ? '🔄' : '📅';
    const title = isCancel ? 'Affectation annulée' : isModified ? 'Affectation modifiée' : 'Nouvelle affectation';

    const slotsHTML = group.slots
        .map(s => {
            const [y, m, d] = s.date.split('-');
            const dateStr = `${d}/${m}/${y}`;
            const periodStr = s.period === 'AM' ? 'Matin (8h-12h)' : 'Après-midi (14h-18h)';
            return `<li><strong>${dateStr}</strong> - ${periodStr}</li>`;
        })
        .join('');

    const locationHTML =
        group.location && group.location !== '-' ? `<p><strong>📍 Localisation :</strong> ${group.location}</p>` : '';

    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h2 style="color: ${color}; border-bottom: 2px solid ${color}; padding-bottom: 10px;">
                    ${icon} ${title}
                </h2>
                
                <p>Bonjour ${attendeeName},</p>
                
                <p><strong>${requesterName}</strong> ${isCancel ? 'a annulé' : isModified ? 'a modifié' : 'vous a affecté'} :</p>
                
                <div style="background-color: ${isCancel ? '#fde8e8' : '#e3f2fd'}; padding: 15px; border-left: 4px solid ${color}; border-radius: 4px; margin: 15px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Activité :</strong> ${group.activity}</p>
                    ${locationHTML}
                    <ul style="margin: 8px 0 0 0; padding-left: 20px;">${slotsHTML}</ul>
                </div>
                
                ${!isCancel ? '<p style="font-size: 12px; color: #666;">💡 Cette invitation a été ajoutée à votre calendrier Outlook.</p>' : '<p style="font-size: 12px; color: #666;">Cette occurrence a été retirée de votre calendrier.</p>'}
                
                <p style="margin-top: 20px;">Cordialement,<br>${requesterName}<br>Système de planification SI-SAMU</p>
                
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                
                <p style="color: #7f8c8d; font-size: 11px; text-align: center;">
                    📅 Domaine des Urgences - Planification des Experts - ANS
                </p>
            </div>
        </div>
    `;
}

// Fonction helper pour créer une notification
export function createNotification(expertResourceId, date, period, activityName, requesterName, actionType, callback) {
    // Récupérer l'user_id de l'expert à partir de resource_id
    database.get(`SELECT id FROM users WHERE resource_id = ? AND is_expert = 1`, [expertResourceId], (err, user) => {
        if (err || !user) {
            if (callback) callback(err);
            return;
        }

        // Vérifier si une notification existe déjà pour cette demi-journée
        database.get(
            `SELECT id FROM expert_notifications 
                 WHERE expert_id = ? AND date = ? AND period = ? AND is_read = 0`,
            [user.id, date, period],
            (errCheck, existingNotif) => {
                if (errCheck) {
                    if (callback) callback(errCheck);
                    return;
                }

                if (existingNotif) {
                    // Une notification existe déjà pour cette demi-journée → UPDATE
                    database.run(
                        `UPDATE expert_notifications 
                             SET activity_name = ?, requester_name = ?, action_type = ?, created_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                        [activityName, requesterName, actionType, existingNotif.id],
                        errUpdate => {
                            if (callback) callback(errUpdate);
                        }
                    );
                } else {
                    // Pas de notification existante → INSERT
                    database.run(
                        `INSERT INTO expert_notifications (expert_id, date, period, activity_name, requester_name, action_type)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                        [user.id, date, period, activityName, requesterName, actionType],
                        errInsert => {
                            if (callback) callback(errInsert);
                        }
                    );
                }
            }
        );
    });
}
