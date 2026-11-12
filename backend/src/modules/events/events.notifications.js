// @ts-check
// Notifications à la création d'un événement depuis la planification :
// participants (email simple), personnes sollicitées (mobilisation, avec invitation ICS)
import { buildICS, formatDateICS, generateICSUid } from '../../lib/ics.js';
import { formatDateFR } from '../../lib/utils.js';
import { enqueueEmail } from '../../services/email-queue.js';
import { mobilisationEmail, participantAddedEmail } from './events.emails.js';
import { activeUsersWithEmail, notificationContext } from './events.service.js';

/**
 * @param {{ startDate: string, endDate?: string, label: string, location_id?: unknown, participants?: unknown,
 *   needs_resources?: unknown, notify_user_ids?: unknown }} body
 * @param {number} createdBy
 */
export async function notifyEventCreated(body, createdBy) {
    const { startDate, endDate, label, location_id, participants, needs_resources, notify_user_ids } = body;
    const { locLabel, creator } = await notificationContext(location_id, createdBy);
    const creatorFullName = creator ? `${creator.prenom} ${creator.nom}` : 'Plateforme ANS';
    const creatorMail = creator?.email || '';
    const dateRangeLabel =
        startDate === (endDate || startDate)
            ? formatDateFR(startDate)
            : `du ${formatDateFR(startDate)} au ${formatDateFR(endDate || startDate)}`;

    // Participants : email simple, sans invitation
    if (Array.isArray(participants) && participants.length > 0) {
        const batchId = generateICSUid();
        for (const participant of await activeUsersWithEmail(participants)) {
            const attendeeName = `${participant.prenom} ${participant.nom}`;
            await enqueueEmail({
                batchId,
                recipientEmail: participant.email,
                recipientName: attendeeName,
                senderName: creatorFullName,
                senderEmail: creatorMail,
                subject: `Vous êtes participant(e) — ${label} — ${dateRangeLabel}`,
                htmlBody: participantAddedEmail({ label, attendeeName, dateRangeLabel, locLabel, creatorFullName }),
                actionType: 'event_notification'
            });
        }
    }

    // Mobilisation : sollicitation avec invitation ICS
    if (needs_resources && Array.isArray(notify_user_ids) && notify_user_ids.length > 0) {
        const batchId = generateICSUid();
        for (const user of await activeUsersWithEmail(notify_user_ids)) {
            const attendeeName = `${user.prenom} ${user.nom}`;
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
                htmlBody: mobilisationEmail({ label, attendeeName, dateRangeLabel, locLabel, creatorFullName }),
                icsContent,
                icsMethod: 'REQUEST',
                icsFilename: 'invitation.ics',
                actionType: 'mobilisation'
            });
        }
    }
}
