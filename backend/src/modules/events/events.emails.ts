// Emails envoyés à la création d'un événement depuis la planification (gabarit commun : lib/email-layout.ts, icônes
// jointes par la file d'envoi)
import { escapeHtml as e } from '../../lib/html.ts';
import { gabaritMail, ligneInfo } from '../../lib/email-layout.ts';

type EventEmail = {
    label: string;
    attendeeName: string;
    dateRangeLabel: string;
    locLabel: string;
    creatorFullName: string;
};

/** Lignes d'information d'un événement : intitulé, dates, lieu (si connu), organisateur */
const infosEvenement = ({ label, dateRangeLabel, locLabel, creatorFullName }: EventEmail, lieuParDefaut: string = '') =>
    ligneInfo('evenement', `<strong>Événement :</strong> ${e(label)}`) +
    ligneInfo('calendrier', `<strong>Date(s) :</strong> ${e(dateRangeLabel)}`) +
    (locLabel || lieuParDefaut ? ligneInfo('lieu', `<strong>Lieu :</strong> ${e(locLabel || lieuParDefaut)}`) : '') +
    ligneInfo('utilisateur', `<strong>Organisateur :</strong> ${e(creatorFullName)}`);

const signature = (creatorFullName: string) =>
    `Cordialement,<br><strong>${e(creatorFullName)}</strong><br><em>Via la Plateforme de Planification ANS</em>`;

/** Information d'un participant ajouté à l'événement */
export const participantAddedEmail = (ev: EventEmail) =>
    gabaritMail({
        icone: 'calendrier-grand',
        titre: 'Vous êtes participant(e)',
        corps: `<p style="margin:0;text-align:center;">Bonjour <strong>${e(ev.attendeeName)}</strong>,<br>vous avez été ajouté(e) comme participant(e) à l'événement suivant sur la Plateforme de Planification ANS :</p>`,
        infos: infosEvenement(ev),
        fin: `<p style="margin:0 0 14px;">Pour confirmer votre participation ou obtenir plus d'informations, connectez-vous à la plateforme.</p><p style="margin:0;">${signature(ev.creatorFullName)}</p>`
    });

/** Demande de mobilisation (inscription libre) */
export const mobilisationEmail = (ev: EventEmail) =>
    gabaritMail({
        icone: 'calendrier-grand',
        titre: 'Demande de mobilisation',
        corps: `<p style="margin:0;text-align:center;">Bonjour <strong>${e(ev.attendeeName)}</strong>,<br>un événement a été créé sur la Plateforme de Planification ANS et nous souhaiterions savoir si vous êtes disponible pour y participer.</p>`,
        infos: infosEvenement(ev, 'Non précisée'),
        fin: `<p style="margin:0 0 14px;">Si vous êtes disponible et souhaitez participer, merci de vous connecter à la plateforme et <strong>d'inscrire votre nom dans la liste des participants</strong> de cet événement.</p><p style="margin:0 0 14px;color:#6b7a8d;font-size:13px;">Cette demande est faite à titre informatif. Votre inscription est libre et sans obligation.</p><p style="margin:0;">${signature(ev.creatorFullName)}</p>`
    });
