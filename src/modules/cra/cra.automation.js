// @ts-check
// Comptes rendus d'activité (CRA) : automatisation n°4 (création mensuelle des CRA et rappels),
// lancée par la tâche planifiée ou testée par un administrateur
import { emailConfig } from '../../lib/mailer.js';
import { HttpError } from '../../lib/http-error.js';
import { enqueueEmail, newBatchId } from '../../services/email-queue.js';
import { buildCraEmailHtml } from './cra.documents.js';
import { backgroundAppUrl } from './cra.notifications.js';
import { countByStatut, ensureMonthlyCra, getCraConfig, listAutomationExperts } from './cra.service.js';

const SENDER_NAME = 'Plateforme de Planification ANS';

/** Mois précédent (cible des CRA) */
function previousMonth(/** @type {Date} */ now) {
    const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
        date,
        mois: date.getMonth() + 1,
        annee: date.getFullYear(),
        moisNom: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    };
}

/**
 * Rappel à l'expert de compléter son CRA
 * @param {{ email: string, prenom: string, nom: string }} expert
 * @param {number} craId
 * @param {string} moisNom
 * @param {{ subject: string, title: string, action: string }} text
 */
function enqueueReminder(expert, craId, moisNom, { subject, title, action }) {
    const expertNom = `${expert.prenom} ${expert.nom}`;
    return enqueueEmail({
        batchId: newBatchId(),
        recipientEmail: expert.email,
        recipientName: expertNom,
        senderName: SENDER_NAME,
        senderEmail: emailConfig?.user || '',
        subject,
        htmlBody: buildCraEmailHtml({
            title,
            expertNom,
            moisNom,
            craUrl: `${backgroundAppUrl()}/?tab=cra&cra_id=${craId}`,
            action
        }),
        actionType: 'cra_rappel'
    });
}

/** Rappel aux viseurs du nombre de CRA en attente de leur visa */
function enqueueVisaReminder(
    /** @type {string} */ email,
    /** @type {string} */ nom,
    /** @type {number} */ count,
    /** @type {'N1' | 'N2'} */ niveau
) {
    return enqueueEmail({
        batchId: newBatchId(),
        recipientEmail: email,
        recipientName: nom || '',
        senderName: SENDER_NAME,
        senderEmail: emailConfig?.user || '',
        subject: `${count} CRA en attente de votre visa ${niveau}`,
        htmlBody: buildCraEmailHtml({
            title: `${count} CRA en attente de visa ${niveau}`,
            expertNom: '',
            moisNom: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
            craUrl: `${backgroundAppUrl()}/?tab=cra`,
            action:
                niveau === 'N1'
                    ? `${count} compte(s)-rendu(s) d'activité ont été soumis par les experts et attendent votre visa de niveau 1.`
                    : `${count} compte(s)-rendu(s) d'activité ont été visés N1 et attendent votre visa de niveau 2.`
        }),
        actionType: 'cra_rappel_admin'
    });
}

/** Tâche planifiée : le jour configuré, CRA du mois précédent créés, rappels aux experts et aux viseurs */
export async function runAutomation4() {
    console.log('⏰ [CRON] Vérification automatisation n°4 (CRA)...');
    try {
        const config = await getCraConfig();
        if (!config?.enabled) return;
        const now = new Date();
        if (now.getDate() !== config.day) return;
        const target = previousMonth(now);
        let sent = 0;
        for (const expert of await listAutomationExperts()) {
            const cra = await ensureMonthlyCra(expert, target.mois, target.annee);
            if (cra.statut !== 'a_completer' || !expert.email) continue;
            await enqueueReminder(expert, cra.id, target.moisNom, {
                subject: `Action requise — CRA ${target.moisNom} à compléter`,
                title: `CRA ${target.moisNom} à compléter`,
                action: `Votre compte-rendu d'activité pour le mois de ${target.moisNom} est disponible et attend votre validation. Merci de vous connecter pour le compléter et le soumettre.`
            });
            sent++;
        }
        console.log(`✅ [CRON] Automation n°4 : ${sent} rappel(s) CRA envoyé(s)`);

        const pendingN1 = await countByStatut('soumis');
        const pendingN2 = await countByStatut('vise_n1');
        if (pendingN1 > 0 && config.admin_n1_email) {
            await enqueueVisaReminder(config.admin_n1_email, config.admin_n1_nom, pendingN1, 'N1');
        }
        if (pendingN2 > 0 && config.admin_n2_email) {
            await enqueueVisaReminder(config.admin_n2_email, config.admin_n2_nom, pendingN2, 'N2');
        }
    } catch (e) {
        console.error('❌ [CRON] Erreur automation n°4:', e);
    }
}

/**
 * Test de l'automatisation par un administrateur (sans contrôle du jour), avec journal détaillé
 * @param {unknown} userId limite à un expert
 * @returns {Promise<{ sent: number, logs: string[] }>}
 */
export async function testAutomation4(userId) {
    /** @type {string[]} */
    const logs = [];
    const log = (/** @type {string} */ msg) => {
        logs.push(msg);
        console.log('[CRA TEST]', msg);
    };
    try {
        const config = await getCraConfig();
        log(`Config : enabled=${config?.enabled}, day=${config?.day}`);
        if (!config?.enabled) {
            log('⛔ Automation désactivée — cocher la case et sauvegarder');
            return { sent: 0, logs };
        }

        const now = new Date();
        log(`Jour actuel : ${now.getDate()} (configuré : ${config.day}) — vérification ignorée en mode test`);
        const target = previousMonth(now);
        log(`Mois cible : ${target.mois}/${target.annee}`);

        const filterUserId = userId ? parseInt(String(userId)) : null;
        const experts = await listAutomationExperts(filterUserId);
        log(
            `Experts astreinte trouvés : ${experts.length}${filterUserId ? ` (filtré sur user_id=${filterUserId})` : ''}`
        );
        experts.forEach(e => log(`  • ${e.prenom} ${e.nom} — email: ${e.email || '⚠️ MANQUANT'}`));
        log(`URL app : ${backgroundAppUrl()}`);
        log(`SMTP expéditeur : ${emailConfig?.user || '⚠️ non configuré'}`);

        let sent = 0;
        for (const expert of experts) {
            const cra = await ensureMonthlyCra(expert, target.mois, target.annee);
            log(`  ${expert.prenom} ${expert.nom} → CRA id=${cra.id} statut=${cra.statut}`);
            if (cra.statut !== 'a_completer') {
                log(`    ↳ Skip (statut=${cra.statut}, déjà soumis)`);
                continue;
            }
            if (!expert.email) {
                log(`    ↳ Skip (email manquant)`);
                continue;
            }
            try {
                await enqueueReminder(expert, cra.id, target.moisNom, {
                    subject: `[TEST] CRA ${target.moisNom} — action requise`,
                    title: `[TEST] CRA ${target.moisNom} à compléter`,
                    action: `[EMAIL DE TEST] Votre compte-rendu d'activité pour ${target.moisNom} est disponible.`
                });
                log(`    ✅ Email mis en queue → ${expert.email}`);
                sent++;
            } catch (/** @type {any} */ emailErr) {
                log(`    ❌ Erreur enqueueEmail : ${emailErr.message}`);
            }
        }

        log(`─── Bilan ───`);
        log(`Admin N1 : ${config.admin_n1_email || '⚠️ non configuré'}`);
        log(`Admin N2 : ${config.admin_n2_email || '⚠️ non configuré'}`);
        log(`Destinataires RH : ${JSON.stringify(config.rh_recipients || {})}`);
        log(`Total emails : ${sent} rappel(s) mis en queue`);
        return { sent, logs };
    } catch (/** @type {any} */ e) {
        log(`❌ Erreur fatale : ${e.message}`);
        throw new HttpError(500, e.message, { logs });
    }
}
