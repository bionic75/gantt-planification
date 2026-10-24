// @ts-check
// Emails du circuit de validation des CRA (mis en file d'attente)
import { env } from '../../config/env.js';
import { emailConfig } from '../../lib/mailer.js';
import { enqueueEmail, newBatchId } from '../../services/email-queue.js';
import { buildCraEmailHtml } from './cra.documents.js';
import { getCraConfig, monthName } from './cra.service.js';

/** @typedef {{ name: string, email: string }} Sender */
/** @typedef {{ id: number, annee: number, mois: number }} CraRef */

/** Adresse de l'application pour les tâches sans requête (automatisation) */
export const backgroundAppUrl = () => env.APP_URL || global._detectedAppUrl || 'http://localhost:3000';

const craLink = (/** @type {string} */ appUrl, /** @type {CraRef} */ cra) => `${appUrl}/?tab=cra&cra_id=${cra.id}`;

/** CRA soumis : demande de visa N1 */
export async function notifySubmitted(
    /** @type {CraRef} */ cra,
    /** @type {Sender} */ expert,
    /** @type {string} */ appUrl
) {
    const config = await getCraConfig();
    if (!config?.admin_n1_email) return;
    const moisNom = monthName(cra);
    await enqueueEmail({
        batchId: newBatchId(),
        recipientEmail: config.admin_n1_email,
        recipientName: config.admin_n1_nom,
        senderName: expert.name,
        senderEmail: expert.email,
        subject: `CRA ${moisNom} — visa niveau 1 requis — ${expert.name}`,
        htmlBody: buildCraEmailHtml({
            title: 'Visa niveau 1 requis',
            expertNom: expert.name,
            moisNom,
            craUrl: craLink(appUrl, cra),
            action: "Le CRA a été soumis par l'expert et nécessite votre visa de niveau 1."
        }),
        actionType: 'cra_visa_n1'
    });
}

/**
 * Visa donné : demande de visa N2 (après N1) ou information de l'expert (après N2)
 * @param {CraRef} cra
 * @param {'n1' | 'n2'} niveau
 * @param {{ expert_nom: string | null, expert_email: string | null }} expert
 * @param {Sender} signer
 * @param {string} appUrl
 */
export async function notifyVisa(cra, niveau, expert, signer, appUrl) {
    const moisNom = monthName(cra);
    const craUrl = craLink(appUrl, cra);
    if (niveau === 'n1') {
        const config = await getCraConfig();
        if (!config?.admin_n2_email) return;
        await enqueueEmail({
            batchId: newBatchId(),
            recipientEmail: config.admin_n2_email,
            recipientName: config.admin_n2_nom,
            senderName: signer.name,
            senderEmail: signer.email,
            subject: `CRA ${moisNom} — visa niveau 2 requis — ${expert.expert_nom}`,
            htmlBody: buildCraEmailHtml({
                title: 'Visa niveau 2 requis',
                expertNom: expert.expert_nom,
                moisNom,
                craUrl,
                action: `Le CRA a été visé par ${signer.name} (N1) et nécessite votre visa de niveau 2.`
            }),
            actionType: 'cra_visa_n2'
        });
    } else if (expert.expert_email) {
        // Diffusion ensuite manuelle (bouton « A diffuser »)
        await enqueueEmail({
            batchId: newBatchId(),
            recipientEmail: expert.expert_email,
            recipientName: /** @type {string} */ (expert.expert_nom),
            senderName: signer.name,
            senderEmail: signer.email,
            subject: `CRA ${moisNom} — doublement visé, en attente de diffusion`,
            htmlBody: buildCraEmailHtml({
                title: 'CRA visé N2',
                expertNom: expert.expert_nom,
                moisNom,
                craUrl,
                action: `Votre CRA a été doublement visé par ${signer.name}. Il sera prochainement diffusé auprès de la RH.`
            }),
            actionType: 'cra_visa_n2'
        });
    }
}

/**
 * CRA refusé par un viseur : motif envoyé à l'expert
 * @param {CraRef} cra
 * @param {'n1' | 'n2'} niveau
 * @param {{ expert_nom: string | null, expert_email: string | null }} expert
 * @param {Sender} refuser
 * @param {string} commentaire
 */
export async function notifyRefused(cra, niveau, expert, refuser, commentaire) {
    if (!expert.expert_email) return;
    const moisNom = monthName(cra);
    const niveauLabel = niveau === 'n1' ? 'niveau 1' : 'niveau 2';
    await enqueueEmail({
        batchId: newBatchId(),
        recipientEmail: expert.expert_email,
        recipientName: /** @type {string} */ (expert.expert_nom),
        senderName: refuser.name,
        senderEmail: refuser.email || emailConfig?.user || '',
        subject: `CRA ${moisNom} — refusé par le viseur ${niveauLabel}, modifications requises`,
        htmlBody: buildCraEmailHtml({
            title: `CRA refusé — modifications requises`,
            expertNom: expert.expert_nom,
            moisNom,
            craUrl: craLink(backgroundAppUrl(), cra),
            action: `Votre CRA a été refusé par <strong>${refuser.name}</strong> (viseur ${niveauLabel}).<br><br>
                        <div style="background:#fff3cd;border-left:4px solid #f39c12;padding:12px 16px;border-radius:0 6px 6px 0;margin:10px 0;">
                            <strong>Motif du refus :</strong><br>${commentaire}
                        </div><br>
                        Merci de vous connecter pour corriger votre CRA et le soumettre à nouveau.`
        }),
        actionType: 'cra_refuse'
    });
}

/**
 * CRA préparé ou modifié par un administrateur : l'expert doit le vérifier et le soumettre
 * @returns {Promise<boolean>} true si l'email a été mis en file
 */
export async function notifyAdminModified(
    /** @type {CraRef & { user_id: number }} */ cra,
    /** @type {{ prenom: string, nom: string, email: string } | null} */ expert,
    /** @type {Sender} */ admin,
    /** @type {string} */ appUrl
) {
    if (!expert || !expert.email) return false;
    const moisNom = monthName(cra);
    const expertNom = `${expert.prenom} ${expert.nom}`;
    await enqueueEmail({
        batchId: newBatchId(),
        recipientEmail: expert.email,
        recipientName: expertNom,
        senderName: admin.name,
        senderEmail: admin.email,
        subject: `CRA ${moisNom} — à vérifier et soumettre`,
        htmlBody: buildCraEmailHtml({
            title: 'CRA à vérifier et soumettre',
            expertNom,
            moisNom,
            craUrl: `${appUrl}/?tab=cra&craId=${cra.id}`,
            action: `${admin.name} a préparé ou modifié votre CRA. Merci de le vérifier, de le corriger si besoin, puis de le soumettre pour validation.`
        }),
        actionType: 'cra_modifie_admin'
    });
    return true;
}

/**
 * Information de l'expert : CRA diffusé à la RH (sans le PDF)
 * @returns {Promise<string>} lot d'envoi
 */
export async function notifyExpertDiffused(
    /** @type {CraRef & { expert_nom: string | null }} */ cra,
    /** @type {{ email: string, nom: string }} */ recipient,
    /** @type {Sender} */ sender,
    /** @type {string} */ appUrl,
    /** @type {string} */ action
) {
    const batchId = newBatchId();
    const moisNom = monthName(cra);
    await enqueueEmail({
        batchId,
        recipientEmail: recipient.email,
        recipientName: recipient.nom,
        senderName: sender.name,
        senderEmail: sender.email,
        subject: `CRA ${moisNom} — diffusé auprès de la RH`,
        htmlBody: buildCraEmailHtml({
            title: 'CRA diffusé',
            expertNom: cra.expert_nom,
            moisNom,
            craUrl: `${appUrl}/?tab=cra`,
            action
        }),
        actionType: 'cra_diffusion_expert'
    });
    return batchId;
}
