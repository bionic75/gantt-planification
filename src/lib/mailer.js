// @ts-check
// Envoi d'emails SMTP. La configuration est chargée depuis la table email_config (écran Administration).
import nodemailer from 'nodemailer';

/**
 * Configuration SMTP courante. L'objet est partagé : le modifier uniquement via setEmailConfig().
 * @type {{ host?: string, port?: number, secure?: boolean, requireTLS?: boolean, user?: string, password?: string }}
 */
export const emailConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    user: '',
    password: ''
};

/** Remplace entièrement la configuration SMTP courante */
export function setEmailConfig(/** @type {typeof emailConfig} */ cfg) {
    for (const key of Object.keys(emailConfig)) delete emailConfig[/** @type {keyof typeof emailConfig} */ (key)];
    Object.assign(emailConfig, cfg);
}

/** @type {import('nodemailer').Transporter | null} */
let transporterCache = null;
let transporterConfigKey = null;

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
        tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
        debug: false,
        logger: false
    });
    transporterConfigKey = configKey;
    console.log('📧 Transporteur email créé avec pool de connexions');
    return transporterCache;
}

/**
 * Envoi ponctuel (connexion ouverte puis fermée à chaque envoi : plus lent qu'un pool,
 * mais fiable sur toute infrastructure).
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @param {Array<{ filename?: string, content?: any, contentType?: string }>} [attachments]
 */
export async function sendEmail(to, subject, html, attachments = []) {
    const startTime = Date.now();
    console.log(`📧 sendEmail: Début envoi à ${to}, ${attachments.length} pièce(s) jointe(s)`);

    if (!emailConfig.user || !emailConfig.password) {
        throw new Error('Configuration email non définie');
    }

    const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: { user: emailConfig.user, pass: emailConfig.password },
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
        debug: false,
        logger: false
    });

    try {
        /** @type {import('nodemailer').SendMailOptions} */
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to,
            subject,
            html
        };

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
    } catch (/** @type {any} */ error) {
        console.error(`📧 sendEmail: ERREUR à +${Date.now() - startTime}ms:`, error.message);

        let userMessage = error.message;
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            userMessage = `Le serveur SMTP ne répond pas (timeout). Vérifiez :\n- L'adresse du serveur SMTP (${emailConfig.host}:${emailConfig.port})\n- Votre connexion internet\n- Que le serveur SMTP autorise les connexions depuis cette IP`;
        } else if (error.code === 'EAUTH' || error.message.includes('authentication')) {
            userMessage = `Erreur d'authentification. Vérifiez vos identifiants SMTP (email et mot de passe).`;
        } else if (error.code === 'ECONNREFUSED') {
            userMessage = `Connexion refusée par le serveur SMTP. Vérifiez l'adresse et le port.`;
        }

        const enhancedError = /** @type {Error & { code?: string }} */ (new Error(userMessage));
        enhancedError.code = error.code;
        throw enhancedError;
    }
}
