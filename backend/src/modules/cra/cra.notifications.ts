// Emails du circuit de validation des CRA (mis en file d'attente)
import { env } from '../../config/env.ts';
import { escapeHtml as e } from '../../lib/html.ts';
import { emailConfig } from '../../lib/mailer.ts';
import { enqueueEmail, newBatchId } from '../../services/email-queue.ts';
import { buildCraEmailHtml } from './cra.documents.ts';
import { getCraConfig, monthName } from './cra.service.ts';

type Sender = { name: string; email: string };
type CraRef = { id: number; annee: number; mois: number };

/** Adresse de l'application pour les tâches sans requête (automatisation) */
export const backgroundAppUrl = () => env.APP_URL || global._detectedAppUrl || 'http://localhost:3000';

const craLink = (appUrl: string, cra: CraRef) => `${appUrl}/cra/${cra.id}`;

/** CRA soumis : demande de visa N1 */
export async function notifySubmitted(cra: CraRef, expert: Sender, appUrl: string) {
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
 */
export async function notifyVisa(
    cra: CraRef,
    niveau: 'n1' | 'n2',
    expert: { expert_nom: string | null; expert_email: string | null },
    signer: Sender,
    appUrl: string
) {
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
                action: `Le CRA a été visé par ${e(signer.name)} (N1) et nécessite votre visa de niveau 2.`
            }),
            actionType: 'cra_visa_n2'
        });
    } else if (expert.expert_email) {
        // Diffusion ensuite manuelle (bouton « A diffuser »)
        await enqueueEmail({
            batchId: newBatchId(),
            recipientEmail: expert.expert_email,
            recipientName: expert.expert_nom as string,
            senderName: signer.name,
            senderEmail: signer.email,
            subject: `CRA ${moisNom} — doublement visé, en attente de diffusion`,
            htmlBody: buildCraEmailHtml({
                title: 'CRA visé N2',
                expertNom: expert.expert_nom,
                moisNom,
                craUrl,
                action: `Votre CRA a été doublement visé par ${e(signer.name)}. Il sera prochainement diffusé auprès de la RH.`
            }),
            actionType: 'cra_visa_n2'
        });
    }
}

/**
 * CRA refusé par un viseur : motif envoyé à l'expert
 */
export async function notifyRefused(
    cra: CraRef,
    niveau: 'n1' | 'n2',
    expert: { expert_nom: string | null; expert_email: string | null },
    refuser: Sender,
    commentaire: string
) {
    if (!expert.expert_email) return;
    const moisNom = monthName(cra);
    const niveauLabel = niveau === 'n1' ? 'niveau 1' : 'niveau 2';
    await enqueueEmail({
        batchId: newBatchId(),
        recipientEmail: expert.expert_email,
        recipientName: expert.expert_nom as string,
        senderName: refuser.name,
        senderEmail: refuser.email || emailConfig?.user || '',
        subject: `CRA ${moisNom} — refusé par le viseur ${niveauLabel}, modifications requises`,
        htmlBody: buildCraEmailHtml({
            title: `CRA refusé — modifications requises`,
            expertNom: expert.expert_nom,
            moisNom,
            craUrl: craLink(backgroundAppUrl(), cra),
            action: `Votre CRA a été refusé par <strong>${e(refuser.name)}</strong> (viseur ${niveauLabel}).<br><br>
                        <div style="background:#fff3cd;border-left:4px solid #f39c12;padding:12px 16px;border-radius:0 6px 6px 0;margin:10px 0;">
                            <strong>Motif du refus :</strong><br>${e(commentaire)}
                        </div><br>
                        Merci de vous connecter pour corriger votre CRA et le soumettre à nouveau.`
        }),
        actionType: 'cra_refuse'
    });
}

/**
 * CRA préparé ou modifié par un administrateur : l'expert doit le vérifier et le soumettre
 * @returns true si l'email a été mis en file
 */
export async function notifyAdminModified(
    cra: CraRef & { user_id: number },
    expert: { prenom: string; nom: string; email: string } | null,
    admin: Sender,
    appUrl: string
): Promise<boolean> {
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
            craUrl: craLink(appUrl, cra),
            action: `${e(admin.name)} a préparé ou modifié votre CRA. Merci de le vérifier, de le corriger si besoin, puis de le soumettre pour validation.`
        }),
        actionType: 'cra_modifie_admin'
    });
    return true;
}

/**
 * Information de l'expert : CRA diffusé à la RH (sans le PDF)
 * @returns lot d'envoi
 */
export async function notifyExpertDiffused(
    cra: CraRef & { expert_nom: string | null },
    recipient: { email: string; nom: string },
    sender: Sender,
    appUrl: string,
    action: string
): Promise<string> {
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
            craUrl: `${appUrl}/cra`,
            action
        }),
        actionType: 'cra_diffusion_expert'
    });
    return batchId;
}
