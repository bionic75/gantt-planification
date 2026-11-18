// Envoi d'emails SMTP. La configuration est chargée depuis la table email_config (écran Administration).
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { env } from '../config/env.ts';
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secrets.ts';

/**
 * TLS du serveur SMTP : certificat vérifié et TLS 1.2 minimum (identifiants SMTP protégés d'une interception).
 * SMTP_TLS_INSECURE=true : tout certificat et TLS 1.0 acceptés (serveur au certificat invalide, ancien comportement).
 */
const TLS_OPTIONS = env.SMTP_TLS_INSECURE
    ? { rejectUnauthorized: false, minVersion: 'TLSv1' as const }
    : { minVersion: 'TLSv1.2' as const };

export interface EmailConfig {
    host?: string;
    port?: number;
    secure?: boolean;
    requireTLS?: boolean;
    user?: string;
    password?: string;
}

/** Configuration SMTP courante. L'objet est partagé : le modifier uniquement via setEmailConfig(). */
export const emailConfig: EmailConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    user: '',
    password: ''
};

/** Remplace entièrement la configuration SMTP courante */
export function setEmailConfig(cfg: EmailConfig) {
    for (const key of Object.keys(emailConfig)) delete emailConfig[key as keyof EmailConfig];
    Object.assign(emailConfig, cfg);
}

/**
 * Mot de passe SMTP enregistré, en clair ; '' s'il est illisible (sauvegarde restaurée depuis un autre serveur : à
 * ressaisir). Une valeur en clair (version précédente, ancienne sauvegarde) est lue telle quelle.
 */
export function storedSmtpPassword(stored: string | null | undefined) {
    if (!stored) return '';
    return isEncryptedSecret(stored) ? (decryptSecret(stored) ?? '') : stored;
}

/**
 * Charge la configuration SMTP enregistrée (écran Administration), si elle existe. Un mot de passe encore en clair en
 * base (version précédente, ancienne sauvegarde restaurée) y est chiffré.
 */
export async function loadEmailConfig() {
    const { prisma } = await import('../db/prisma.ts');
    const row = await prisma.emailConfig.findUnique({ where: { id: 1 } });
    if (!row) return false;
    const password = storedSmtpPassword(row.password);
    if (row.password && !isEncryptedSecret(row.password)) {
        try {
            await prisma.emailConfig.update({ where: { id: 1 }, data: { password: encryptSecret(row.password) } });
            console.log('🔒 Mot de passe SMTP chiffré en base');
        } catch (e) {
            console.warn(`⚠️  Mot de passe SMTP laissé en clair : ${(e as Error).message}`);
        }
    } else if (row.password && !password) {
        console.warn('⚠️  Mot de passe SMTP illisible sur ce serveur (autre clé de chiffrement) : à ressaisir');
    }
    setEmailConfig({
        host: row.host,
        port: row.port,
        secure: row.secure === 1,
        user: row.user,
        password
    });
    return true;
}

let transporterCache: Transporter | null = null;
let transporterConfigKey: string | null = null;

/** Transporteur avec pool de connexions, recréé seulement si la configuration change */
export function createEmailTransporter() {
    if (!emailConfig.user || !emailConfig.password) {
        return null;
    }

    const configKey = `${emailConfig.host}:${emailConfig.port}:${emailConfig.user}`;
    if (transporterCache && transporterConfigKey === configKey) {
        return transporterCache;
    }

    transporterCache = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: { user: emailConfig.user, pass: emailConfig.password },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        tls: TLS_OPTIONS,
        debug: false,
        logger: false
    });
    transporterConfigKey = configKey;
    console.log('📧 Transporteur email créé avec pool de connexions');
    return transporterCache;
}

export interface EmailAttachment {
    filename?: string;
    content?: string | Buffer;
    contentType?: string;
}

export interface EmailExtra {
    cc?: string;
    replyTo?: string;
    fromName?: string;
    /** Invitation de calendrier (partie text/calendar : boutons Accepter / Refuser) */
    icalEvent?: { method: string; content: string; filename?: string };
}

/**
 * Envoi ponctuel (connexion ouverte puis fermée à chaque envoi : plus lent qu'un pool,
 * mais fiable sur toute infrastructure). extra : copie, adresse de réponse et invitation de calendrier.
 */
export async function sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachment[] = [],
    extra: EmailExtra = {}
) {
    const startTime = Date.now();
    console.log(`📧 sendEmail: Début envoi à ${to}, ${attachments.length} pièce(s) jointe(s)`);

    if (!emailConfig.user || !emailConfig.password) {
        throw new Error('Configuration email non définie');
    }

    // family : option de connexion transmise au socket (IPv4), absente des types de nodemailer
    const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: { user: emailConfig.user, pass: emailConfig.password },
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        tls: TLS_OPTIONS,
        debug: false,
        logger: false
    } as SMTPTransport.Options);

    try {
        const mailOptions: SendMailOptions = {
            // Le nom de l'expéditeur réel (chef de projet) figure dans le nom affiché de l'expéditeur
            from: `"${extra.fromName ? `${extra.fromName.replace(/["\\<>]/g, '').trim()} via ` : ''}Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to,
            subject,
            html
        };
        if (extra.cc) mailOptions.cc = extra.cc;
        if (extra.replyTo) mailOptions.replyTo = extra.replyTo;
        if (extra.icalEvent) mailOptions.icalEvent = extra.icalEvent;

        if (attachments.length > 0) {
            // Les invitations ICS ont besoin de cet en-tête pour être reconnues (Gmail)
            mailOptions.attachments = attachments.map(att =>
                att.contentType && att.contentType.includes('text/calendar')
                    ? {
                          filename: att.filename,
                          content: att.content,
                          contentType: att.contentType,
                          headers: { 'Content-Class': 'urn:content-classes:calendarmessage' }
                      }
                    : att
            );
            const totalSize = attachments.reduce((sum, a) => sum + (a.content?.length || 0), 0);
            console.log(`📧 sendEmail: Taille totale pièces jointes: ${totalSize} bytes`);
        }

        console.log(`📧 sendEmail: Appel transporter.sendMail() à +${Date.now() - startTime}ms`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 sendEmail: sendMail() terminé à +${Date.now() - startTime}ms, messageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        const error = err as Error & { code?: string };
        console.error(`📧 sendEmail: ERREUR à +${Date.now() - startTime}ms:`, error.message);

        let userMessage = error.message;
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            userMessage = `Le serveur SMTP ne répond pas (timeout). Vérifiez :\n- L'adresse du serveur SMTP (${emailConfig.host}:${emailConfig.port})\n- Votre connexion internet\n- Que le serveur SMTP autorise les connexions depuis cette IP`;
        } else if (error.code === 'EAUTH' || error.message.includes('authentication')) {
            userMessage = `Erreur d'authentification. Vérifiez vos identifiants SMTP (email et mot de passe).`;
        } else if (error.code === 'ECONNREFUSED') {
            userMessage = `Connexion refusée par le serveur SMTP. Vérifiez l'adresse et le port.`;
        }

        const enhancedError: Error & { code?: string } = new Error(userMessage);
        enhancedError.code = error.code;
        throw enhancedError;
    }
}
