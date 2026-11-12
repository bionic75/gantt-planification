// @ts-check
// Automatisations n°1 (rappel de saisie des disponibilités) et n°2 (sauvegarde du planning),
// lancées par les tâches planifiées
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';
import { reminderEmail, scheduledBackupEmail } from './automations.emails.js';
import * as service from './automations.service.js';

const FROM = () => `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`;

/** N°1 : à J-X de la fin du mois, rappel aux experts sans disponibilité saisie pour le mois suivant */
export async function runAutomation1() {
    console.log('⏰ [CRON] Vérification automatisation n°1...');
    try {
        const config = await service.getConfig('1');
        if (!Object.keys(config).length) return console.log('⏰ [CRON] Automatisation n°1 non configurée');
        if (!config.enabled) return console.log('⏰ [CRON] Automatisation n°1 désactivée');

        const now = new Date();
        const daysUntilEndOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
        console.log(`⏰ [CRON] Jours avant fin du mois: ${daysUntilEndOfMonth}, Config: ${config.days} jours`);
        if (daysUntilEndOfMonth !== config.days) {
            return console.log(`⏰ [CRON] Pas le bon jour pour l'envoi (J-${daysUntilEndOfMonth} vs J-${config.days})`);
        }
        console.log("⏰ [CRON] Déclenchement de l'automatisation n°1...");

        const target = service.nextMonthTarget(now);
        const expertsToNotify = [];
        for (const expert of await service.expertsWithoutAvailability(target)) {
            // Un seul rappel par mois pour un même mois cible
            if (await service.reminderAlreadySent(expert.id, target.label, now)) {
                console.log(`⏰ [CRON] Rappel déjà envoyé ce mois-ci à ${expert.prenom} ${expert.nom}`);
            } else {
                expertsToNotify.push(expert);
            }
        }
        if (expertsToNotify.length === 0) return console.log('⏰ [CRON] Aucun expert à notifier');
        console.log(`⏰ [CRON] ${expertsToNotify.length} expert(s) à notifier pour ${target.label}`);

        const transporter = createEmailTransporter();
        if (!transporter) return console.error('⏰ [CRON] Configuration email non disponible');
        const copyEmail = await service.reminderCopyEmail(config);

        let sent = 0;
        let failed = 0;
        for (const expert of expertsToNotify) {
            try {
                await transporter.sendMail({
                    from: FROM(),
                    to: expert.email,
                    cc: copyEmail || undefined,
                    subject: `Rappel : Saisie des disponibilités pour ${target.label}`,
                    html: reminderEmail(expert, target.label, null)
                });
                console.log(`⏰ [CRON] ✅ Rappel envoyé à ${expert.email}`);
                sent++;
                await service.addLog({
                    automation_id: 1,
                    expert_id: expert.id,
                    expert_name: `${expert.prenom} ${expert.nom}`,
                    expert_email: expert.email,
                    target_month: target.label
                });
            } catch (/** @type {any} */ error) {
                console.error(`⏰ [CRON] ❌ Erreur envoi à ${expert.email}:`, error.message);
                failed++;
            }
        }
        console.log(`⏰ [CRON] Automatisation n°1 terminée: ${sent} envoyé(s), ${failed} échec(s)`);
    } catch (error) {
        console.error('⏰ [CRON] Erreur automatisation n°1:', error);
    }
}

/** Heure de Paris */
const parisNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));

/** N°2 : sauvegarde du planning envoyée selon la fréquence configurée (heure de Paris) */
export async function runAutomation2() {
    console.log('⏰ [CRON] Vérification automatisation n°2...');
    try {
        const config = await service.getConfig('2');
        if (!Object.keys(config).length) return console.log('⏰ [CRON] Automatisation n°2 non configurée');
        if (!config.enabled) return console.log('⏰ [CRON] Automatisation n°2 désactivée');

        const paris = parisNow();
        const hour = paris.getHours();
        console.log(`⏰ [CRON] Heure Paris: ${hour}h, Config: ${config.hour}h, Fréquence: ${config.frequency}`);
        const atHour = hour === parseInt(config.hour);
        const shouldSend =
            (config.frequency === 'daily' && atHour) ||
            (config.frequency === 'weekly' && paris.getDay() === parseInt(config.weekDay) && atHour) ||
            (config.frequency === 'monthly' && paris.getDate() === parseInt(config.monthDay) && atHour);
        if (!shouldSend) return console.log(`⏰ [CRON] Pas le bon moment pour l'automatisation n°2`);
        console.log("⏰ [CRON] Déclenchement de l'automatisation n°2...");

        const transporter = createEmailTransporter();
        if (!transporter) return console.error('⏰ [CRON] Configuration email non disponible');
        const { emails } = await service.resolveRecipients(config);
        if (emails.length === 0) return console.log('⏰ [CRON] Automatisation n°2: aucun destinataire');

        // Par défaut, tous les experts
        const resources = await service.resourcesFor(config.allExperts !== false, config.expertsList);

        // Mois : tous ceux qui contiennent des données, ceux choisis, ou à défaut le mois courant et le suivant
        /** @type {string[]} */
        let monthsList;
        if (config.allMonths) {
            monthsList = await service.rawMonthsList();
        } else if (Array.isArray(config.selectedMonths) && config.selectedMonths.length > 0) {
            monthsList = config.selectedMonths;
        } else {
            const d1 = new Date();
            const d2 = new Date(d1.getFullYear(), d1.getMonth() + 1, 1);
            const ym = (/** @type {Date} */ d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthsList = [ym(d1), ym(d2)];
        }
        console.log(`⏰ [CRON] Mois sélectionnés: ${monthsList.join(', ')}`);
        const months = monthsList.map(service.parseMonth).filter(m => m !== null);
        if (months.length === 0) return console.log('⏰ [CRON] Automatisation n°2: aucun mois sélectionné');
        const monthsLabels = months.map(m => `${service.MONTH_NAMES[m.month - 1]} ${m.year}`);

        // Toutes les demi-journées des mois choisis, pour chaque ressource (clés avec ou sans zéros)
        const data = service.byResource(await service.scheduleForMonths(months));
        const format = config.format || 'csv';
        const excludeEmpty = config.excludeEmpty !== false;
        console.log(`⏰ [CRON] Exclure lignes vides: ${excludeEmpty}`);
        let csv = service.CSV_HEADER;
        let totalRows = 0;
        let excludedRows = 0;
        for (const resource of resources) {
            const resData = data[resource.id] || {};
            for (const { year, month } of months) {
                const daysInMonth = new Date(year, month, 0).getDate();
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    for (const period of ['AM', 'PM']) {
                        const cell = resData[`${date}_${period}`] || resData[`${year}-${month}-${day}_${period}`] || {};
                        const line = service.csvLine(resource, date, period, cell, excludeEmpty);
                        if (line === null) excludedRows++;
                        else {
                            totalRows++;
                            csv += line;
                        }
                    }
                }
            }
        }
        console.log(`⏰ [CRON] CSV généré: ${totalRows} lignes (${excludedRows} exclues car vides)`);

        const filename = `Expert_Planning_Sauvegarde_de_${service.fileTimestamp(parisNow())}.${format}`;
        await transporter.sendMail({
            from: FROM(),
            to: emails.join(', '),
            subject: `📊 Sauvegarde automatique du planning - ${monthsLabels.join(', ')}`,
            html: scheduledBackupEmail(monthsLabels, resources.length, format),
            attachments: [{ filename, content: csv, contentType: 'text/csv; charset=utf-8' }]
        });
        console.log(`⏰ [CRON] ✅ Automatisation n°2: sauvegarde envoyée à ${emails.length} destinataire(s)`);

        const recipientNames = await service.recipientLogNames(config);
        await service.addLog({
            automation_id: 2,
            expert_name: `${recipientNames.length} personnes`,
            expert_email: emails.join(', '),
            target_month: monthsLabels.join(', '),
            recipients_list: JSON.stringify(recipientNames),
            file_content: csv,
            filename
        });
    } catch (error) {
        console.error('⏰ [CRON] Erreur automatisation n°2:', error);
    }
}
