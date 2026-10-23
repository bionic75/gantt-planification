// Comptes rendus d'activité (CRA) : automatisation n°4 (création mensuelle des CRA et rappels), lancée par la tâche planifiée
import { env as appEnv } from '../../config/env.js';
import { database } from '../../db/database.js';
import { emailConfig } from '../../lib/mailer.js';
import { enqueueEmail, newBatchId as generateICSUid } from '../../services/email-queue.js';
import { buildCraEmailHtml } from './cra.documents.js';
import { getCraConfig } from './cra.service.js';

export async function runAutomation4() {
    console.log('⏰ [CRON] Vérification automatisation n°4 (CRA)...');
    try {
        const config = await getCraConfig();
        if (!config?.enabled) return;
        const now = new Date();
        if (now.getDate() !== config.day) return;
        const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const targetMois = targetDate.getMonth() + 1;
        const targetAnnee = targetDate.getFullYear();
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT r.id as resource_id, r.nom, r.prenom, r.samu, u.id as user_id, u.email
                 FROM resources r JOIN users u ON u.resource_id = r.id AND u.is_expert = 1
                 WHERE r.astreinte_volontaire = 1 AND r.actif = 1`,
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
        const appUrl = appEnv.APP_URL || global._detectedAppUrl || 'http://localhost:3000';
        let sent = 0;
        for (const expert of experts) {
            // INSERT si inexistant, puis toujours SELECT l'id (lastID non fiable sur IGNORE)
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT OR IGNORE INTO cra (user_id, resource_id, mois, annee, statut) VALUES (?, ?, ?, ?, 'a_completer')`,
                    [expert.user_id, expert.resource_id, targetMois, targetAnnee],
                    err => (err ? reject(err) : resolve())
                );
            });
            const cra = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT id, statut FROM cra WHERE user_id = ? AND mois = ? AND annee = ?`,
                    [expert.user_id, targetMois, targetAnnee],
                    (e, row) => (e ? reject(e) : resolve(row))
                );
            });
            const craId = cra?.id;
            if (!cra || cra.statut !== 'a_completer' || !expert.email) continue;
            const moisNom = targetDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            const expertNom = `${expert.prenom} ${expert.nom}`;
            await enqueueEmail({
                batchId: generateICSUid(),
                recipientEmail: expert.email,
                recipientName: expertNom,
                senderName: 'Plateforme de Planification ANS',
                senderEmail: emailConfig?.user || '',
                subject: `Action requise — CRA ${moisNom} à compléter`,
                htmlBody: buildCraEmailHtml({
                    title: `CRA ${moisNom} à compléter`,
                    expertNom,
                    moisNom,
                    craUrl: `${appUrl}/?tab=cra&cra_id=${craId}`,
                    action: `Votre compte-rendu d'activité pour le mois de ${moisNom} est disponible et attend votre validation. Merci de vous connecter pour le compléter et le soumettre.`
                }),
                actionType: 'cra_rappel'
            });
            sent++;
        }
        console.log(`✅ [CRON] Automation n°4 : ${sent} rappel(s) CRA envoyé(s)`);

        // Notifier les admins viseurs des CRA en attente de leur validation
        const pendingN1 = await new Promise((resolve, reject) => {
            database.all(`SELECT COUNT(*) as nb FROM cra WHERE statut = 'soumis'`, [], (err, rows) =>
                err ? reject(err) : resolve(rows[0]?.nb || 0)
            );
        });
        const pendingN2 = await new Promise((resolve, reject) => {
            database.all(`SELECT COUNT(*) as nb FROM cra WHERE statut = 'vise_n1'`, [], (err, rows) =>
                err ? reject(err) : resolve(rows[0]?.nb || 0)
            );
        });

        if (pendingN1 > 0 && config.admin_n1_email) {
            await enqueueEmail({
                batchId: generateICSUid(),
                recipientEmail: config.admin_n1_email,
                recipientName: config.admin_n1_nom || '',
                senderName: 'Plateforme de Planification ANS',
                senderEmail: emailConfig?.user || '',
                subject: `${pendingN1} CRA en attente de votre visa N1`,
                htmlBody: buildCraEmailHtml({
                    title: `${pendingN1} CRA en attente de visa N1`,
                    expertNom: '',
                    moisNom: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
                    craUrl: `${appUrl}/?tab=cra`,
                    action: `${pendingN1} compte(s)-rendu(s) d'activité ont été soumis par les experts et attendent votre visa de niveau 1.`
                }),
                actionType: 'cra_rappel_admin'
            });
        }
        if (pendingN2 > 0 && config.admin_n2_email) {
            await enqueueEmail({
                batchId: generateICSUid(),
                recipientEmail: config.admin_n2_email,
                recipientName: config.admin_n2_nom || '',
                senderName: 'Plateforme de Planification ANS',
                senderEmail: emailConfig?.user || '',
                subject: `${pendingN2} CRA en attente de votre visa N2`,
                htmlBody: buildCraEmailHtml({
                    title: `${pendingN2} CRA en attente de visa N2`,
                    expertNom: '',
                    moisNom: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
                    craUrl: `${appUrl}/?tab=cra`,
                    action: `${pendingN2} compte(s)-rendu(s) d'activité ont été visés N1 et attendent votre visa de niveau 2.`
                }),
                actionType: 'cra_rappel_admin'
            });
        }
    } catch (e) {
        console.error('❌ [CRON] Erreur automation n°4:', e);
    }
}
