// @ts-check
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';
import { manualBackupEmail, reminderEmail } from './automations.emails.js';
import * as service from './automations.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const FROM = () => `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`;

// ---------- Configuration et journaux ----------

export async function getConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, config: await service.getConfig(req.params.id) });
}

export async function saveConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { config } = req.body;
    await service.saveConfig(req.params.id, config);
    console.log(`📧 Configuration automatisation ${req.params.id} sauvegardée:`, config);
    res.json({ success: true });
}

export async function listLogs(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, logs: await service.listLogs(req.params.id) });
}

export async function downloadBackup(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { filename, content } = await service.getBackupFile(req.params.logId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
}

export async function deleteLogs(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.deleteLogs(req.params.id);
    res.json({ success: true });
}

// ---------- N°1 : rappel de saisie des disponibilités ----------

/** Experts sans disponibilité saisie pour le mois prochain */
export async function testReminder(/** @type {Request} */ req, /** @type {Response} */ res) {
    const target = service.nextMonthTarget();
    const experts = await service.expertsWithoutAvailability(target);
    res.json({
        success: true,
        targetMonth: target.label,
        year: target.year,
        month: target.month + 1,
        expertsWithoutAvailability: experts.map(e => ({
            id: e.id,
            nom: e.nom,
            prenom: e.prenom,
            email: e.email,
            resource_id: e.resource_id
        }))
    });
}

/** Rappels envoyés aux experts choisis (copie à l'utilisateur configuré) */
export async function sendReminder(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { experts, targetMonth } = req.body;
    if (!Array.isArray(experts) || experts.length === 0)
        return res.status(400).json({ error: 'Aucun expert sélectionné' });
    const transporter = createEmailTransporter();
    if (!transporter) return res.status(500).json({ error: 'Configuration email non disponible' });

    const senderName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    let copyEmail = null;
    try {
        copyEmail = await service.reminderCopyEmail(await service.getConfig('1'));
    } catch (e) {
        console.error('Erreur récupération email copie:', e);
    }
    console.log(`📧 Envoi de rappels à ${experts.length} expert(s) pour ${targetMonth}`);
    let sent = 0;
    let failed = 0;
    for (const expert of experts) {
        try {
            await transporter.sendMail({
                from: FROM(),
                to: expert.email,
                cc: copyEmail || undefined,
                subject: `Rappel : Saisie des disponibilités pour ${targetMonth}`,
                html: reminderEmail(expert, targetMonth, senderName)
            });
            console.log(`✅ Rappel envoyé à ${expert.email}`);
            sent++;
            service
                .addLog({
                    automation_id: 1,
                    expert_id: Number(expert.id) || null,
                    expert_name: `${expert.prenom} ${expert.nom}`,
                    expert_email: expert.email,
                    target_month: targetMonth
                })
                .catch(err => console.error('Erreur journal automatisation:', err));
        } catch (/** @type {any} */ error) {
            console.error(`❌ Erreur envoi à ${expert.email}:`, error.message);
            failed++;
        }
    }
    res.json({ success: true, sent, failed });
}

// ---------- N°2 : sauvegarde du planning ----------

export async function availableMonths(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, months: await service.availableMonths() });
}

/** Récapitulatif avant envoi : destinataires, experts, mois, nom du fichier */
export async function previewBackup(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { allMonths, selectedMonths, allExperts, expertsList, excludeEmpty, format } = req.body;
    const { emails, people } = await service.resolveRecipients(req.body);
    const resources = await service.resourcesFor(!!allExperts, expertsList);

    let monthsLabel;
    if (allMonths) {
        const n = await service.monthsWithDataCount();
        monthsLabel = n > 0 ? `Toutes les données (${n} mois)` : 'Toutes les données';
    } else if (Array.isArray(selectedMonths) && selectedMonths.length > 0) {
        monthsLabel = selectedMonths
            .map(m => {
                const parsed = service.parseMonth(m);
                return parsed ? `${service.MONTH_NAMES[parsed.month - 1]} ${parsed.yearText}` : m;
            })
            .join(', ');
    } else {
        monthsLabel = 'Aucun mois sélectionné';
    }
    res.json({
        success: true,
        recipientsCount: people.length,
        emailsCount: emails.length,
        recipientsList: people.map(p => `${p.name} (${p.kind})`),
        expertsCount: resources.length,
        expertsNamesList: resources.map(r => `${r.prenom} ${r.nom}`),
        monthsLabel,
        excludeEmpty: excludeEmpty !== false,
        filename: `Expert_Planning_Sauvegarde_de_${service.fileTimestamp(new Date())}.${format}`
    });
}

/** Envoi de la sauvegarde (CSV des demi-journées renseignées) aux destinataires choisis */
export async function sendBackup(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { allMonths, selectedMonths, allExperts, expertsList, excludeEmpty, format } = req.body;
    const transporter = createEmailTransporter();
    if (!transporter) return res.status(500).json({ error: 'Configuration email non disponible' });
    const { emails, people } = await service.resolveRecipients(req.body);
    if (emails.length === 0) return res.status(400).json({ error: 'Aucun destinataire' });
    console.log(`📧 Envoi à ${people.length} personnes (${emails.length} emails uniques)`);
    const resources = await service.resourcesFor(!!allExperts, expertsList);

    let rows;
    let monthsLabels;
    if (allMonths) {
        rows = await service.scheduleForMonths(null);
        monthsLabels = ['Toutes les données'];
    } else if (Array.isArray(selectedMonths) && selectedMonths.length > 0) {
        const months = selectedMonths.map(service.parseMonth).filter(m => m !== null);
        if (months.length === 0) return res.status(400).json({ error: 'Format de mois invalide' });
        rows = await service.scheduleForMonths(months);
        monthsLabels = months.map(m => `${service.MONTH_NAMES[m.month - 1]} ${m.yearText}`);
    } else {
        return res.status(400).json({ error: 'Aucun mois sélectionné' });
    }

    // Toutes les clés renseignées (toutes ressources confondues), dans l'ordre
    const data = service.byResource(rows);
    const keys = [...new Set(Object.values(data).flatMap(r => Object.keys(r)))].sort();
    let csv = service.CSV_HEADER;
    for (const resource of resources) {
        const resData = data[resource.id] || {};
        for (const dateKey of keys) {
            const [date, period = 'AM'] = dateKey.split('_');
            csv += service.csvLine(resource, date, period, resData[dateKey] || {}, !!excludeEmpty) || '';
        }
    }
    const filename = `Expert_Planning_Sauvegarde_de_${service.fileTimestamp(new Date())}.${format}`;
    await transporter.sendMail({
        from: FROM(),
        to: emails.join(', '),
        subject: `📊 Sauvegarde du planning - ${monthsLabels.join(', ')}`,
        html: manualBackupEmail({
            allMonths: !!allMonths,
            monthsLabels,
            expertsCount: resources.length,
            format: String(format),
            excludeEmpty: !!excludeEmpty
        }),
        attachments: [{ filename, content: csv, contentType: 'text/csv; charset=utf-8' }]
    });
    console.log(`✅ Sauvegarde planning envoyée à ${emails.length} destinataire(s)`);
    await service.addLog({
        automation_id: 2,
        expert_name: `${people.length} personnes`,
        expert_email: emails.join(', '),
        target_month: monthsLabels.join(', '),
        recipients_list: JSON.stringify(people.map(p => p.name)),
        file_content: csv,
        filename
    });
    res.json({ success: true, sent: people.length, emailsSent: emails.length, failed: 0 });
}

// ---------- Diagnostic et nettoyage ----------

export async function diagnoseMonths(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, ...(await service.diagnoseMonths()) });
}

export async function cleanupPreview(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, ...(await service.cleanupPreview()) });
}

export async function cleanupExecute(/** @type {Request} */ req, /** @type {Response} */ res) {
    const result = await service.cleanupExecute();
    logUserAction(req, 'Nettoyage dates invalides exécuté', result);
    console.log(
        `✅ Nettoyage terminé: ${result.deleted} supprimés, ${result.normalized} normalisés, ${result.duplicatesRemoved} doublons supprimés`
    );
    res.json({ success: true, ...result });
}
