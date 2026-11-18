// Documents des CRA (PDF de consultation, document signé) et diffusion à la RH
import fs from 'fs';
import path from 'path';
import { idParam } from '../../db/values.ts';
import { HttpError, badRequest, forbidden, notFound } from '../../lib/http-error.ts';
import { puppeteer } from '../../lib/puppeteer.ts';
import { enqueueEmail, newBatchId } from '../../services/email-queue.ts';
import { buildCraDocumentHtml, generateCraPdf, renderPdf, SIGNED_DOCUMENT_MARGIN } from './cra.documents.ts';
import { notifyExpertDiffused } from './cra.notifications.ts';
import * as service from './cra.service.ts';

type Context = { appUrl: string; sender: { name: string; email: string } };
type CraWithExpert = NonNullable<Awaited<ReturnType<typeof service.getCraWithExpert>>>;
type Recipient = { email: string; nom?: string | null };

/** PDF signés (préparation, diffusion, renvoi), comme la sauvegarde complète */
export const PDF_DIR = path.resolve('data', 'pdfs');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, '0');

/** Lignes du mois et signatures d'un CRA */
async function documentData(cra: { id: number; user_id: number; annee: number; mois: number }) {
    const [astreintes, signatures] = await Promise.all([service.getMonthLines(cra), service.getSignatures(cra.id)]);
    return { astreintes, signatures, moisNom: service.monthName(cra) };
}

/** Document signé (HTML) : version email (logo en pièce jointe inline) ou version PDF */
async function signedDocument(cra: CraWithExpert, esRattachement: string | null, email: { appUrl?: string } = {}) {
    const data = await documentData(cra);
    const options = { cra, ...data, esRattachement: esRattachement || '' };
    return {
        ...data,
        html: email.appUrl ? buildCraDocumentHtml({ ...options, appUrl: email.appUrl, logoSrc: 'cid:ans-logo' }) : null,
        pdfHtml: buildCraDocumentHtml(options)
    };
}

const signedPdf = async (html: string) => renderPdf(html, SIGNED_DOCUMENT_MARGIN);

/**
 * PDF de consultation d'un CRA (expert « Nom Prénom »)
 */
export async function consultationPdf(id: unknown, { userId, profile }: { userId: number; profile?: string }) {
    const cra = await service.getCraWithExpert({ id: idParam(id) });
    if (!cra) throw notFound('CRA introuvable');
    if (profile !== 'admin' && profile !== 'rh' && cra.user_id !== userId) throw forbidden('Accès interdit');
    const expertNom = service.joinNames(cra.expert_nom_seul, cra.expert_prenom);
    const { astreintes, signatures, moisNom } = await documentData(cra);
    const buffer = await generateCraPdf({ ...cra, expert_nom: expertNom }, astreintes, signatures, moisNom);
    const filename = `CRA_${(expertNom || 'expert').replace(/\s+/g, '_')}_${moisNom.replace(/\s+/g, '_')}.pdf`;
    return { buffer, filename };
}

/** Génération du document signé en PDF, sauvegardé sur disque pour la diffusion */
export async function prepareSignedPdf(id: unknown) {
    if (!puppeteer) throw new HttpError(503, 'Puppeteer non disponible');
    const cra = await service.getCraWithExpert({ id: idParam(id) });
    if (!cra) throw notFound('CRA introuvable');
    if (!['vise_n2', 'diffuse'].includes(cra.statut)) throw badRequest('CRA non encore doublement visé');
    const { pdfHtml, moisNom } = await signedDocument(cra, cra.es_rattachement);

    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    // Caractères interdits dans un nom de fichier (dont / et \ : écriture hors du répertoire des PDF) remplacés
    const safe = (s: string) => s.replace(/[\s/\\:*?"<>|]+/g, '_');
    const nomSafe = safe(cra.expert_nom_seul || '').toUpperCase();
    const prenomSafe = safe(cra.expert_prenom || '');
    const pdfFilename = `SI-SAMU_CRA_${nomSafe}_${prenomSafe}_${capitalize(moisNom).replace(/\s+/g, '_')}_${ts}.pdf`;

    fs.mkdirSync(PDF_DIR, { recursive: true });
    const pdf = await signedPdf(pdfHtml);
    fs.writeFileSync(path.join(PDF_DIR, pdfFilename), pdf);
    await service.setPdfFilename(cra.id, pdfFilename);
    console.log(`📄 PDF CRA sauvegardé: ${pdfFilename} (${Math.round(pdf.length / 1024)}Ko)`);
    return pdfFilename;
}

/**
 * PDF signé sauvegardé ; régénéré (et sauvegardé) s'il manque sur le disque
 * @param assertAccess contrôle d'accès, appelé avec le CRA dont c'est le PDF (null : fichier sans CRA connu)
 */
export async function savedPdf(name: string, assertAccess: (cra: { user_id: number } | null) => void) {
    const filename = path.basename(name);
    const filepath = path.join(PDF_DIR, filename);
    const cra = await service.getCraWithExpert({ pdf_filename: filename });
    assertAccess(cra);
    if (fs.existsSync(filepath)) return { filename, buffer: fs.readFileSync(filepath) };

    if (!cra) throw notFound('CRA introuvable pour ce fichier');
    if (!puppeteer) throw new HttpError(503, 'Puppeteer non disponible pour la régénération');
    try {
        const { pdfHtml } = await signedDocument(cra, cra.es_rattachement);
        fs.mkdirSync(PDF_DIR, { recursive: true });
        const buffer = await signedPdf(pdfHtml);
        fs.writeFileSync(filepath, buffer);
        console.log(`📄 PDF CRA régénéré depuis reprise : ${filename}`);
        return { filename, buffer };
    } catch (e: any) {
        console.error('[pdf-saved] Erreur régénération:', e.message);
        throw new HttpError(500, 'Erreur lors de la régénération du PDF');
    }
}

/** Destinataires proposés pour la diffusion : expert, RH de l'établissement, DRH ANS */
export async function diffusionRecipients(id: unknown) {
    const cra = await service.getCraWithExpert({ id: idParam(id) });
    if (!cra) throw notFound('CRA introuvable');
    const config = await service.getCraConfig();
    let rhEs: Array<{ email: string; nom: string | null }> = [];
    if (cra.contacts_rh) {
        rhEs = cra.contacts_rh
            .split('\n')
            .map(e => e.trim())
            .filter(e => e.includes('@'))
            .map(e => ({ email: e, nom: '' }));
    } else if (cra.user_resource_id) {
        rhEs = await service.listRhRecipients(cra.user_resource_id);
    }
    const drhAns = (config?.drh_ans_infos || [])
        .filter((d: any) => d.email)
        .map((d: any) => ({ email: d.email, nom: d.nom || '' }));
    const expert = cra.expert_email ? [{ email: cra.expert_email, nom: cra.expert_nom || '' }] : [];
    return { expert, rh_es: rhEs, drh_ans: drhAns };
}

/** Email RH : premier destinataire en « À », les autres en copie */
function enqueueRhEmail(
    recipients: Recipient[],
    email: { batchId: string; subject: string; html: string; pdfBase64: string | null; pdfFilename: string | null },
    sender: Context['sender'],
    nameOf: (r: Recipient) => string
) {
    const [first, ...others] = recipients;
    return enqueueEmail({
        batchId: email.batchId,
        recipientEmail: first.email,
        recipientName: nameOf(first),
        ccEmails: others.length > 0 ? others.map(r => r.email).join(', ') : undefined,
        senderName: sender.name,
        senderEmail: sender.email,
        subject: email.subject,
        htmlBody: email.html,
        pdfAttachment: email.pdfBase64 || undefined,
        pdfFilename: email.pdfFilename || undefined,
        actionType: 'cra_diffusion'
    });
}

/**
 * Diffusion d'un CRA doublement visé : PDF préparé envoyé à la RH (RH ES + DRH ANS), information de l'expert
 */
export async function diffuse(
    id: unknown,
    {
        recipients,
        pdfFilename
    }: { recipients?: { expert?: Recipient[]; rh_es?: Recipient[]; drh_ans?: Recipient[] }; pdfFilename?: string },
    ctx: Context
) {
    const now = new Date().toISOString();
    const cra = await service.getCraWithExpert({ id: idParam(id) });
    if (!cra) throw notFound('CRA introuvable');
    if (cra.statut !== 'vise_n2') throw badRequest('CRA non encore doublement visé');
    if (!pdfFilename) throw badRequest("PDF non généré — veuillez d'abord générer le PDF");
    let pdfBase64;
    try {
        pdfBase64 = fs.readFileSync(path.join(PDF_DIR, path.basename(String(pdfFilename)))).toString('base64');
    } catch {
        throw badRequest(`Fichier PDF introuvable: ${pdfFilename}`);
    }

    const { html, moisNom } = await signedDocument(cra, cra.es_rattachement, { appUrl: ctx.appUrl });
    const batchId = newBatchId();
    const rhEs = recipients?.rh_es || [];
    const drhAns = recipients?.drh_ans || [];
    const allRh = [...rhEs, ...drhAns];
    const experts = recipients?.expert || [];

    if (allRh.length > 0) {
        await enqueueRhEmail(
            allRh,
            {
                batchId,
                subject: `AGENCE DU NUMERIQUE EN SANTE - ${cra.expert_nom} - ${moisNom} - Compte-Rendu d'Activité`,
                html: html as string,
                pdfBase64,
                pdfFilename: String(pdfFilename)
            },
            ctx.sender,
            r => r.nom || r.email
        );
    }
    const entries = [
        ...rhEs.map(r => ({ email: r.email, nom: r.nom || r.email, type: 'rh_es', batchId })),
        ...drhAns.map(r => ({ email: r.email, nom: r.nom || r.email, type: 'drh_ans', batchId }))
    ];
    // L'expert (notification sans PDF, lot d'envoi distinct) apparaît lui aussi dans le statut de diffusion
    for (const exp of experts) {
        const expertBatch = await notifyExpertDiffused(
            cra,
            { email: exp.email, nom: exp.nom || exp.email },
            ctx.sender,
            ctx.appUrl,
            `Votre CRA a été doublement visé et diffusé auprès de la RH (${allRh.length} destinataire(s)).`
        );
        entries.push({ email: exp.email, nom: exp.nom || exp.email, type: 'expert', batchId: expertBatch });
    }
    const savedFilename = path.basename(String(pdfFilename));
    await service.markDiffused(cra.id, { diffusedAt: now, pdfFilename: savedFilename, entries });
    return { sent: allRh.length + experts.length, pdfFilename: savedFilename };
}

/**
 * Renvoi à tous les destinataires RH précédents : vérifications, puis envoi à lancer en arrière-plan
 */
export async function prepareResendAll(id: unknown, ctx: Context) {
    const cra = await service.getCraWithExpert({ id: idParam(id) });
    if (!cra) throw notFound('CRA introuvable');
    const recipients = await service.listPreviousRhRecipients(cra.id);
    if (recipients.length === 0) throw badRequest('Aucun destinataire RH trouvé dans le log de diffusion');

    const send = async () => {
        const esRattachement = await service.getEsRattachement(cra.resource_id);
        const { html, moisNom } = await signedDocument(cra, esRattachement, { appUrl: ctx.appUrl });
        // PDF préparé lors de la diffusion, s'il est encore sur le disque
        let pdfBase64 = null;
        let pdfFilename = cra.pdf_filename || null;
        if (pdfFilename) {
            try {
                pdfBase64 = fs.readFileSync(path.join(PDF_DIR, path.basename(pdfFilename))).toString('base64');
                console.log(`📄 PDF CRA chargé depuis disque pour renvoi: ${pdfFilename}`);
            } catch (e: any) {
                console.warn('⚠️ PDF sur disque introuvable, renvoi sans PDF:', e.message);
                pdfFilename = null;
            }
        }
        await enqueueRhEmail(
            recipients.map(r => ({ email: r.recipient_email, nom: r.recipient_name })),
            {
                batchId: newBatchId(),
                subject: `AGENCE DU NUMERIQUE EN SANTE - ${cra.expert_nom} - ${moisNom} - Compte-Rendu d'Activité (Renvoi)`,
                html: html as string,
                pdfBase64,
                pdfFilename
            },
            ctx.sender,
            r => r.nom as string
        );
        console.log(
            `✅ Renvoi CRA ${cra.id}: ${recipients.length} email(s) mis en file (PDF: ${pdfBase64 ? 'oui' : 'non'})`
        );
    };
    return { count: recipients.length, send };
}

/**
 * Renvoi d'un email de diffusion : notification à l'expert, ou document (PDF régénéré) au destinataire RH.
 * Le journal est mis à jour immédiatement ; l'envoi RH (génération du PDF) est à lancer en arrière-plan.
 */
export async function prepareResend(
    id: unknown,
    logId: unknown,
    ctx: Context
): Promise<{ toExpert: boolean; send?: () => Promise<void> }> {
    const [cra, entry] = await Promise.all([
        service.getCraWithExpert({ id: idParam(id) }),
        service.getDiffusionLogEntry(logId)
    ]);
    if (!cra || !entry) throw notFound('CRA ou log introuvable');

    if (entry.recipient_type === 'expert') {
        // L'expert reçoit la notification (sans PDF), pas le document RH
        const batchId = await notifyExpertDiffused(
            cra,
            { email: entry.recipient_email, nom: entry.recipient_name as string },
            ctx.sender,
            ctx.appUrl,
            'Votre CRA a été doublement visé et diffusé auprès de la RH.'
        );
        await service.markLogResent(entry.id, batchId);
        return { toExpert: true };
    }

    const esRattachement = await service.getEsRattachement(cra.resource_id);
    const { html, pdfHtml, moisNom } = await signedDocument(cra, esRattachement, { appUrl: ctx.appUrl });
    const pdfFilename = `CRA_${(cra.expert_nom || '').replace(/\s+/g, '_')}_${capitalize(moisNom)}.pdf`;
    const batchId = newBatchId();
    await service.markLogResent(entry.id, batchId);

    const send = async () => {
        let pdfBase64 = null;
        if (puppeteer) {
            try {
                const pdf = await signedPdf(pdfHtml);
                pdfBase64 = pdf.toString('base64');
                console.log(`📄 PDF CRA généré pour renvoi: ${pdfFilename} (${Math.round(pdf.length / 1024)}Ko)`);
            } catch (e: any) {
                console.warn('⚠️ PDF non généré pour renvoi:', e.message);
            }
        } else {
            console.warn('⚠️ Puppeteer non chargé — renvoi CRA sans PDF');
        }
        await enqueueRhEmail(
            [{ email: entry.recipient_email, nom: entry.recipient_name }],
            {
                batchId,
                subject: `AGENCE DU NUMERIQUE EN SANTE - ${cra.expert_nom} - ${moisNom} - Compte-Rendu d'Activité (Renvoi)`,
                html: html as string,
                pdfBase64,
                pdfFilename: pdfBase64 ? pdfFilename : null
            },
            ctx.sender,
            r => r.nom as string
        );
        console.log(`✅ Renvoi CRA ${cra.id} (log ${entry.id}) mis en file (PDF: ${pdfBase64 ? 'oui' : 'non'})`);
    };
    return { toExpert: false, send };
}
