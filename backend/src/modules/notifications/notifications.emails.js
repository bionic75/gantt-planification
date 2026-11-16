// @ts-check
// Emails des notifications : invitations d'affectation (avec ICS), demandes d'affectation, notifications Teams
import { gabaritMail, ligneInfo } from '../../lib/email-layout.ts';
import { escapeHtml as e, escapeHtmlLines } from '../../lib/html.ts';
import {
    ACTIVITY_LABELS,
    HALF_DAY_HOURS,
    buildICS,
    formatDateICS,
    generateICSUid,
    getCleanActivityLabel,
    getCleanOldActivityLabel,
    groupContiguousAssignments
} from '../../lib/ics.ts';

/**
 * Corps HTML d'une invitation (nouvelle affectation, modification ou annulation) : gabarit commun du site
 * @param {string} attendeeName
 * @param {string} requesterName
 * @param {{ activity: string, location?: string, slots: Array<{ date: string, period: string }> }} group
 * @param {'new' | 'modified' | 'cancelled'} type
 */
export function buildInvitationHTML(attendeeName, requesterName, group, type) {
    const isCancel = type === 'cancelled';
    const isModified = type === 'modified';
    const icone = isCancel ? 'annule-grand' : isModified ? 'modifie-grand' : 'mallette-grand';
    const titre = isCancel ? 'Affectation annulée' : isModified ? 'Affectation modifiée' : 'Nouvelle affectation';

    const creneaux = group.slots
        .map(s => {
            const [y, m, d] = s.date.split('-');
            const periode = s.period === 'AM' ? 'Matin (8h-12h)' : 'Après-midi (14h-18h)';
            return ligneInfo('calendrier', `<strong>${d}/${m}/${y}</strong> - ${periode}`);
        })
        .join('');
    const lieu =
        group.location && group.location !== '-'
            ? ligneInfo('lieu', `<strong>Localisation :</strong> ${e(group.location)}`)
            : '';

    return gabaritMail({
        icone,
        titre,
        corps: `<p style="margin:0;text-align:center;">Bonjour ${e(attendeeName)},<br><strong>${e(requesterName)}</strong> ${isCancel ? 'a annulé' : isModified ? 'a modifié' : 'vous a affecté'} :</p>`,
        infos: ligneInfo('mallette', `<strong>Activité :</strong> ${e(group.activity)}`) + lieu + creneaux,
        fin: `<p style="margin:0 0 14px;font-size:13px;color:#6b7a8d;">${isCancel ? 'Cette occurrence a été retirée de votre calendrier.' : 'Cette invitation a été ajoutée à votre calendrier Outlook.'}</p><p style="margin:0;">Cordialement,<br>${e(requesterName)}<br>Système de planification SI-SAMU</p>`
    });
}

/** @typedef {{ type: string, to: string, attendeeName: string, subject: string, html: string, icsContent: string, icsMethod: string, icsFilename: string }} AssignmentEmail */

/**
 * Invitations Outlook des affectations d'experts : une invitation par groupe de créneaux contigus pour les
 * nouvelles affectations, annulation puis nouvelle invitation pour une modification, annulation pour une suppression
 * @param {any[]} assignments [{ email, expertNom, expertPrenom, expertName, assignments: [...] }]
 * @param {string} requesterName
 * @param {string} senderEmailAddr
 * @returns {AssignmentEmail[]}
 */
export function buildAssignmentEmails(assignments, requesterName, senderEmailAddr) {
    /** @type {AssignmentEmail[]} */
    const emailsToSend = [];
    for (const item of assignments) {
        const { email, expertNom, expertPrenom, expertName, assignments: expertAssignments } = item;
        const attendeeName =
            expertPrenom && expertNom
                ? `${expertPrenom} ${expertNom}`
                : expertName || expertPrenom || expertNom || 'Expert';
        if (!email) continue;

        const newAssigns = expertAssignments.filter((/** @type {any} */ a) => a.actionType === 'new' || !a.actionType);
        const modifiedAssigns = expertAssignments.filter((/** @type {any} */ a) => a.actionType === 'modified');
        const deletedAssigns = expertAssignments.filter((/** @type {any} */ a) => a.actionType === 'deleted');

        for (const group of groupContiguousAssignments(/** @type {any[]} */ (newAssigns))) {
            try {
                const firstSlot = group.slots[0],
                    lastSlot = group.slots[group.slots.length - 1];
                const startH = HALF_DAY_HOURS[firstSlot.period],
                    endH = HALF_DAY_HOURS[lastSlot.period];
                const cleanLabel =
                    ACTIVITY_LABELS[group.activityCode] ||
                    getCleanActivityLabel({ activityCode: group.activityCode, activity: group.activity });
                const summary = `Domaines des Urgences - Affectation – ${cleanLabel} – ${requesterName}`;
                const location = group.location && group.location !== '-' ? group.location : '';
                const slotsDesc = group.slots
                    .map((/** @type {any} */ s) => {
                        const [y, m, d] = s.date.split('-');
                        return `${d}/${m}/${y} (${s.period === 'AM' ? 'Matin 8h-12h' : 'Apres-midi 14h-18h'})`;
                    })
                    .join('\\n');
                emailsToSend.push({
                    type: 'new',
                    to: email,
                    attendeeName,
                    subject: summary,
                    html: buildInvitationHTML(attendeeName, requesterName, group, 'new'),
                    icsContent: buildICS({
                        uid: generateICSUid(),
                        summary,
                        description: `Affectation: ${cleanLabel}\\nLocalisation: ${location || 'Non precisee'}\\nDemandeur: ${requesterName}\\n\\nCreneaux:\\n${slotsDesc}`,
                        location,
                        dtstart: formatDateICS(firstSlot.date, startH.start, 0),
                        dtend: formatDateICS(lastSlot.date, endH.end, 0),
                        organizer: senderEmailAddr,
                        organizerName: requesterName,
                        attendee: email,
                        attendeeName,
                        method: 'REQUEST'
                    }),
                    icsMethod: 'REQUEST',
                    icsFilename: 'invitation.ics'
                });
            } catch (/** @type {any} */ e) {
                console.error('Erreur préparation NEW:', e.message);
            }
        }

        for (const a of modifiedAssigns) {
            try {
                const hours = HALF_DAY_HOURS[a.period];
                const oldLabel = getCleanOldActivityLabel(a);
                const oldLoc = a.oldLocation && a.oldLocation !== '-' ? a.oldLocation : '';
                const cancelSummary = `Domaines des Urgences - Affectation – ${oldLabel} – ${requesterName}`;
                emailsToSend.push({
                    type: 'cancel_modify',
                    to: email,
                    attendeeName,
                    subject: `Annule: ${cancelSummary}`,
                    html: buildInvitationHTML(
                        attendeeName,
                        requesterName,
                        { activity: oldLabel, location: oldLoc, slots: [a] },
                        'cancelled'
                    ),
                    icsContent: buildICS({
                        uid: generateICSUid(),
                        summary: cancelSummary,
                        description: `Annulation: cette affectation a ete modifiee par ${requesterName}.`,
                        location: oldLoc,
                        dtstart: formatDateICS(a.date, hours.start, 0),
                        dtend: formatDateICS(a.date, hours.end, 0),
                        organizer: senderEmailAddr,
                        organizerName: requesterName,
                        attendee: email,
                        attendeeName,
                        sequence: 1,
                        method: 'CANCEL'
                    }),
                    icsMethod: 'CANCEL',
                    icsFilename: 'annulation.ics'
                });
                const newLabel = ACTIVITY_LABELS[a.activityCode] || getCleanActivityLabel(a);
                const newLoc = a.location && a.location !== '-' ? a.location : '';
                const newSummary = `Domaines des Urgences - Affectation – ${newLabel} – ${requesterName}`;
                emailsToSend.push({
                    type: 'modified',
                    to: email,
                    attendeeName,
                    subject: newSummary,
                    html: buildInvitationHTML(
                        attendeeName,
                        requesterName,
                        { activity: newLabel, location: newLoc, slots: [a] },
                        'modified'
                    ),
                    icsContent: buildICS({
                        uid: generateICSUid(),
                        summary: newSummary,
                        description: `Nouvelle affectation: ${newLabel}\\nLocalisation: ${newLoc || 'Non precisee'}\\nDemandeur: ${requesterName}`,
                        location: newLoc,
                        dtstart: formatDateICS(a.date, hours.start, 0),
                        dtend: formatDateICS(a.date, hours.end, 0),
                        organizer: senderEmailAddr,
                        organizerName: requesterName,
                        attendee: email,
                        attendeeName,
                        method: 'REQUEST'
                    }),
                    icsMethod: 'REQUEST',
                    icsFilename: 'invitation.ics'
                });
            } catch (/** @type {any} */ e) {
                console.error('Erreur préparation MODIFIED:', e.message);
            }
        }

        for (const a of deletedAssigns) {
            try {
                const hours = HALF_DAY_HOURS[a.period];
                const delLabel = getCleanOldActivityLabel(a);
                const loc =
                    a.oldLocation && a.oldLocation !== '-'
                        ? a.oldLocation
                        : a.location && a.location !== '-'
                          ? a.location
                          : '';
                const cancelSummary = `Domaines des Urgences - Affectation – ${delLabel} – ${requesterName}`;
                emailsToSend.push({
                    type: 'deleted',
                    to: email,
                    attendeeName,
                    subject: `Annule: ${cancelSummary}`,
                    html: buildInvitationHTML(
                        attendeeName,
                        requesterName,
                        { activity: delLabel, location: loc, slots: [a] },
                        'cancelled'
                    ),
                    icsContent: buildICS({
                        uid: generateICSUid(),
                        summary: cancelSummary,
                        description: `Cette affectation a ete supprimee par ${requesterName}.`,
                        location: loc,
                        dtstart: formatDateICS(a.date, hours.start, 0),
                        dtend: formatDateICS(a.date, hours.end, 0),
                        organizer: senderEmailAddr,
                        organizerName: requesterName,
                        attendee: email,
                        attendeeName,
                        sequence: 1,
                        method: 'CANCEL'
                    }),
                    icsMethod: 'CANCEL',
                    icsFilename: 'annulation.ics'
                });
            } catch (/** @type {any} */ e) {
                console.error('Erreur préparation DELETED:', e.message);
            }
        }
    }
    return emailsToSend;
}

/**
 * Email d'une affectation en attente (notification groupée)
 * @param {{ prenom: string, nom: string, creator_prenom: string, creator_nom: string }} notif
 * @param {{ dates?: unknown, activity?: unknown, location?: unknown }} assignmentData
 */
export const pendingAssignmentEmail = (notif, assignmentData) =>
    gabaritMail({
        icone: 'mallette-grand',
        titre: 'Nouvelle affectation',
        corps: `<p style="margin:0;text-align:center;">Bonjour ${e(notif.prenom)} ${e(notif.nom)},<br><strong>${e(notif.creator_prenom)} ${e(notif.creator_nom)}</strong> vous a affecté une nouvelle activité :</p>`,
        infos:
            ligneInfo('calendrier', `<strong>Période :</strong> ${e(assignmentData.dates)}`) +
            ligneInfo('mallette', `<strong>Activité :</strong> ${e(assignmentData.activity)}`) +
            ligneInfo('lieu', `<strong>Localisation :</strong> ${e(assignmentData.location)}`),
        fin: '<p style="margin:0;">Cordialement,<br>Le système de planification</p>'
    });

/**
 * Demande d'affectation adressée à un expert
 * @param {{ fromName: unknown, fromEmail: string, subject: string, startDateFormatted: string, endDateFormatted: string, personalizedMessage: string }} p
 */
export const assignmentRequestEmail = ({
    fromName,
    fromEmail,
    subject,
    startDateFormatted,
    endDateFormatted,
    personalizedMessage
}) => `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                <h2 style="color: #1D70B7; border-bottom: 2px solid #1D70B7; padding-bottom: 10px;">Demande d'affectation</h2>
                                <div style="margin: 20px 0; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                                    <p style="margin: 5px 0;"><strong>De:</strong> ${e(fromName)} (${e(fromEmail)})</p>
                                    <p style="margin: 5px 0;"><strong>Début:</strong> ${e(startDateFormatted)}</p>
                                    <p style="margin: 5px 0;"><strong>Fin:</strong> ${e(endDateFormatted)}</p>
                                </div>
                                <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 4px; line-height: 1.8;">
                                    ${personalizedMessage
                                        .split('\n')
                                        .map(line =>
                                            line.trim() === ''
                                                ? '<br>'
                                                : `<p style="margin: 0 0 10px 0;">${e(line)}</p>`
                                        )
                                        .join('')}
                                </div>
                                <div style="text-align: center; margin: 25px 0;">
                                    <a href="mailto:${e(fromEmail)}?subject=${encodeURIComponent('Re: ' + subject)}"
                                       style="display: inline-block; padding: 12px 30px; background-color: #27ae60; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                        📧 Répondre à ${e(fromName)}
                                    </a>
                                </div>
                                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                                <p style="color: #7f8c8d; font-size: 12px; text-align: center; margin: 0;">Système SI-SAMU de planification des ressources</p>
                            </div>
                        </div>`;

/**
 * Message d'une notification Teams selon son type ; null pour un type inconnu
 * @param {string} type affectation | demande | astreinte | evenement
 * @param {any} data
 * @param {{ detailedRequest: boolean }} options demande : experts contactés et période (notification depuis l'interface)
 * @returns {{ subject: string, color: string, content: string } | null}
 */
export function teamsMessage(type, data, { detailedRequest }) {
    switch (type) {
        case 'affectation':
            return {
                subject: '📅 Nouvelle affectation',
                color: '#3498db',
                content: `
                    <p><strong>Expert :</strong> ${e(data.expert || 'Non spécifié')}</p>
                    <p><strong>Activité :</strong> ${e(data.activity || 'Non spécifiée')}</p>
                    <p><strong>Date :</strong> ${e(data.date || 'Non spécifiée')}</p>
                    <p><strong>Période :</strong> ${e(data.period || 'Non spécifiée')}</p>
                    ${data.location ? `<p><strong>Localisation :</strong> ${e(data.location)}</p>` : ''}
                `
            };
        case 'demande':
            return {
                subject: "✉️ Demande d'affectation",
                color: '#27ae60',
                content: detailedRequest
                    ? `
                    <p><strong>De :</strong> ${e(data.from || 'Non spécifié')}</p>
                    <p><strong>Objet :</strong> ${e(data.subject || 'Non spécifié')}</p>
                    ${data.experts ? `<p><strong>Expert(s) contacté(s) :</strong> ${e(data.experts)}</p>` : ''}
                    ${data.startDate ? `<p><strong>Période demandée :</strong></p><p style="margin-left: 15px;">📅 Du ${e(data.startDate)}<br>📅 Au ${e(data.endDate)}</p>` : ''}
                    <p><strong>Message :</strong></p>
                    <div style="background: #ffffff; border: 1px solid #e0e0e0; padding: 12px; border-radius: 5px; margin-top: 5px; color: #333333; line-height: 1.6;">
                        ${escapeHtmlLines(data.message)}
                    </div>
                `
                    : `
                    <p><strong>De :</strong> ${e(data.from || 'Non spécifié')}</p>
                    <p><strong>Objet :</strong> ${e(data.subject || 'Non spécifié')}</p>
                    <p><strong>Message :</strong></p>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 5px;">
                        ${escapeHtmlLines(String(data.message || '').substring(0, 500))}
                    </div>
                `
            };
        case 'astreinte':
            return {
                subject: '🔔 Nouvelle astreinte/HNO',
                color: '#9c27b0',
                content: `
                    <p><strong>Expert :</strong> ${e(data.expert || 'Non spécifié')}</p>
                    <p><strong>Type :</strong> ${data.type === 'hno' ? 'HNO (Heures Non Ouvrées)' : data.type === 'activite_courante' ? 'Activité courante' : 'Astreinte'}</p>
                    <p><strong>Date :</strong> ${e(data.date || 'Non spécifiée')}</p>
                    ${data.heureDebut ? `<p><strong>Horaires :</strong> ${e(data.heureDebut)} - ${e(data.heureFin)}</p>` : ''}
                `
            };
        case 'evenement':
            return {
                subject: '📆 Nouvel événement',
                color: '#ff9800',
                content: `
                    <p><strong>Événement :</strong> ${e(data.name || 'Non spécifié')}</p>
                    <p><strong>Date :</strong> ${e(data.date || 'Non spécifiée')}</p>
                    ${data.createdBy ? `<p><strong>Créé par :</strong> ${e(data.createdBy)}</p>` : ''}
                `
            };
        default:
            return null;
    }
}

/** Mise en page d'un message Teams (bandeau coloré) */
export const teamsCardHtml = (
    /** @type {string} */ title,
    /** @type {string} */ color,
    /** @type {string} */ content
) => `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">${e(title)}</h2>
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
            `;

/** Message de test du canal Teams */
export const TEAMS_TEST_HTML = `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">🧪 Test de notification</h2>
                        </div>
                        <div style="padding: 25px;">
                            <p style="font-size: 16px; color: #333;">
                                ✅ <strong>Félicitations !</strong>
                            </p>
                            <p style="color: #666;">
                                Si vous voyez ce message, la connexion entre l'application <strong>Planning ANS</strong> et votre canal Teams fonctionne correctement.
                            </p>
                            <p style="color: #666;">
                                Les notifications automatiques seront désormais envoyées ici selon la configuration choisie.
                            </p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `;
