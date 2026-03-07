// email-worker.js - Process séparé pour envoyer les emails sans bloquer le serveur principal
import nodemailer from 'nodemailer';

function createTransporter(config) {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTLS,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
        debug: true,
        logger: true
    });
}

// Recevoir le job du process parent
process.on('message', async (job) => {
    const { emailConfig, emails } = job;
    
    console.log(`📧 [Worker] Démarrage envoi de ${emails.length} email(s)...`);
    
    const transporter = createTransporter(emailConfig);
    let totalSent = 0;
    let totalFailed = 0;
    
    for (const mail of emails) {
        try {
            await transporter.sendMail(mail.options);
            totalSent++;
            console.log(`✅ [Worker] Email envoyé à ${mail.options.to} (${mail.type})`);
        } catch (error) {
            totalFailed++;
            console.error(`❌ [Worker] Erreur envoi à ${mail.options.to}: ${error.message}`);
        }
    }
    
    console.log(`📊 [Worker] Terminé: ${totalSent} envoyé(s), ${totalFailed} échec(s)`);
    
    // Renvoyer le résultat au parent
    process.send({ done: true, totalSent, totalFailed });
    
    // Se terminer proprement
    setTimeout(() => process.exit(0), 500);
});
