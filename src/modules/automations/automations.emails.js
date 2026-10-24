// @ts-check
// Emails des automatisations : rappel de saisie des disponibilités (n°1), sauvegarde du planning (n°2)

/** Rappel aux experts sans disponibilité saisie pour le mois à venir */
export const reminderEmail = (
    /** @type {{ prenom: string, nom: string }} */ expert,
    /** @type {string} */ targetMonth,
    /** @type {string | null} */ senderName
) => `
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

                        <p>Cordialement,<br>${senderName ? `${senderName}<br>` : ''}Système de planification SI-SAMU</p>

                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">

                        <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                            Cet email a été envoyé automatiquement depuis le système SI-SAMU de planification des ressources.
                        </p>
                    </div>
                </div>
            `;

/** Sauvegarde envoyée par la tâche planifiée */
export const scheduledBackupEmail = (
    /** @type {string[]} */ monthsLabels,
    /** @type {number} */ expertsCount,
    /** @type {string} */ format
) => `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #e65100;">📊 Sauvegarde automatique du planning</h2>
                    <p>Veuillez trouver ci-joint la sauvegarde du planning pour : ${monthsLabels.join(', ')}</p>
                    <p>• ${expertsCount} expert(s) inclus<br>• Format : ${format.toUpperCase()}</p>
                    <hr><p style="color: #999; font-size: 12px;">Email automatique - Système SI-SAMU</p>
                </div>
            `;

/** Sauvegarde envoyée à la demande d'un administrateur */
export const manualBackupEmail = (
    /** @type {{ allMonths: boolean, monthsLabels: string[], expertsCount: number, format: string, excludeEmpty: boolean }} */ p
) => `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #e65100; border-bottom: 2px solid #ff9800; padding-bottom: 10px;">
                            📊 Sauvegarde automatique du planning
                        </h2>

                        <p>Bonjour,</p>

                        <p>Veuillez trouver ci-joint la sauvegarde du planning${p.allMonths ? ' (toutes les données)' : ' pour les mois suivants :'}</p>

                        ${!p.allMonths ? `<ul>${p.monthsLabels.map(m => `<li>${m}</li>`).join('')}</ul>` : ''}

                        <div style="margin: 20px 0; padding: 15px; background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
                            <p style="margin: 0;"><strong>Informations :</strong></p>
                            <p style="margin: 5px 0 0 0;">
                                • ${p.expertsCount} expert(s) inclus<br>
                                • Format : ${p.format.toUpperCase()}<br>
                                ${p.excludeEmpty ? '• Lignes vides exclues<br>' : ''}
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
            `;
