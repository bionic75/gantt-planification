// @ts-check
// Emails envoyés à la création d'un événement depuis la planification

/** @typedef {{ label: string, attendeeName: string, dateRangeLabel: string, locLabel: string, creatorFullName: string }} EventEmail */

/** Information d'un participant ajouté à l'événement */
export const participantAddedEmail = (
    /** @type {EventEmail} */ { label, attendeeName, dateRangeLabel, locLabel, creatorFullName }
) => `
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

/** Demande de mobilisation (inscription libre) */
export const mobilisationEmail = (
    /** @type {EventEmail} */ { label, attendeeName, dateRangeLabel, locLabel, creatorFullName }
) => `
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
