// @ts-check
// Automatisations n°5 (construction du planning d'astreinte HO de la semaine S+1) et n°6 (communication du planning,
// avec renvoi « MAJ » quand la semaine en cours est modifiée)
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { createEmailTransporter, emailConfig } from '../../lib/mailer.js';
import { addLog, getConfig, resolveRecipients } from '../automations/automations.service.js';
import { backgroundAppUrl } from '../cra/cra.notifications.js';
import {
    DEFAULT_TEMPLATES,
    modificationsHtml,
    renderSubject,
    renderTemplate,
    weekTableHtml,
    weekVars,
    wrapHtml
} from './ho.emails.js';
import { addDays, frDate, isoWeek, parisClock, parisToday, weekStart } from './ho.dates.js';
import { listHoExperts, slotsBetween } from './ho.service.js';

const FROM = () => `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`;

/** @typedef {{ enabled?: boolean, weekDay?: number, weekDays?: number[], hour?: number, week?: string, allExperts?: boolean, recipients?: number[], groupAdmin?: boolean, groupUser?: boolean, groupExpert?: boolean, subject?: string, body?: string }} HoConfig */

/** Configuration enregistrée, complétée des valeurs par défaut (sujet et corps) */
export async function hoConfig(/** @type {5 | 6} */ n) {
    const saved = /** @type {HoConfig} */ (await getConfig(String(n)));
    return {
        ...saved,
        subject: saved.subject && saved.subject.trim() ? saved.subject : DEFAULT_TEMPLATES[n].subject,
        body: saved.body && saved.body.trim() ? saved.body : DEFAULT_TEMPLATES[n].body
    };
}

/** Destinataires de la n°5 : experts HO (tous, ou ceux choisis) ayant un compte avec e-mail */
async function recipients5(/** @type {HoConfig} */ config) {
    const experts = (await listHoExperts()).filter(e => e.email);
    const chosen =
        config.allExperts === false
            ? experts.filter(e => Array.isArray(config.recipients) && config.recipients.includes(Number(e.user_id)))
            : experts;
    return {
        emails: [...new Set(chosen.map(e => /** @type {string} */ (e.email)))],
        names: chosen.map(e => `${e.prenom} ${e.nom}`)
    };
}

/** Destinataires de la n°6 : groupes et utilisateurs choisis */
async function recipients6(/** @type {HoConfig} */ config) {
    const { emails, people } = await resolveRecipients(config);
    return { emails, names: people.map(p => p.name) };
}

/** Planning de la semaine commençant le lundi donné */
async function weekContent(/** @type {string} */ monday) {
    const slots = await slotsBetween(monday, addDays(monday, 4));
    const resources = await prisma.resource.findMany({ select: { id: true, nom: true, prenom: true } });
    return weekTableHtml(monday, slots, new Map(resources.map(r => [r.id, r])));
}

const appLink = () => env.APP_URL || backgroundAppUrl();

/**
 * Envoie un e-mail du planning d'une semaine
 * @param {5 | 6} n
 * @param {HoConfig} config
 * @param {string} monday
 * @param {{ emails: string[], names: string[] }} to
 * @param {{ changes?: Array<{ date: string, period: string, name: string, action: string }>, author?: string, maj?: boolean }} [options]
 */
async function sendWeekMail(n, config, monday, to, options = {}) {
    const transporter = createEmailTransporter();
    if (!transporter) throw new Error('Configuration e-mail non disponible');
    const vars = weekVars(monday, appLink());
    const modif = modificationsHtml(options.changes || [], options.author);
    const planning = await weekContent(monday);
    const body = config.body || DEFAULT_TEMPLATES[n].body;
    let html = renderTemplate(body, {
        semaine: { text: vars.semaine },
        debut: { text: vars.debut },
        fin: { text: vars.fin },
        lien: { text: vars.lien },
        planning: { html: planning },
        modifications: { html: modif }
    });
    // Mise à jour : les modifications figurent toujours dans le message, même si le gabarit n'a pas le champ
    if (options.maj && modif && !body.includes('{modifications}')) html += modif;
    const subject = renderSubject(config.subject || DEFAULT_TEMPLATES[n].subject, vars);
    await transporter.sendMail({
        from: FROM(),
        to: to.emails.join(', '),
        subject: options.maj ? `MAJ - ${subject}` : subject,
        html: wrapHtml(html)
    });
    const label = `Semaine ${isoWeek(monday)} (${frDate(monday)} au ${frDate(addDays(monday, 4))})${options.maj ? ' — MAJ' : ''}`;
    await addLog({
        automation_id: n,
        expert_name: `${to.emails.length} personne${to.emails.length > 1 ? 's' : ''}`,
        expert_email: to.emails.join(', '),
        target_month: label,
        recipients_list: JSON.stringify(to.names)
    });
    return label;
}

/** N°5 : planning de la semaine S+1 à compléter, envoyé aux experts HO */
export async function runAutomation5(/** @type {{ force?: boolean }} */ { force = false } = {}) {
    const config = await hoConfig(5);
    if (!force) {
        const { hour, day } = parisClock();
        if (!config.enabled) return { sent: false, reason: 'désactivée' };
        if (day !== Number(config.weekDay) || hour !== Number(config.hour))
            return { sent: false, reason: 'pas le bon moment' };
    }
    const to = await recipients5(config);
    if (!to.emails.length) return { sent: false, reason: 'aucun destinataire' };
    const monday = addDays(weekStart(parisToday()), 7);
    const label = await sendWeekMail(5, config, monday, to);
    return { sent: true, recipients: to.emails.length, week: label };
}

/** N°6 : communication du planning (semaine en cours, ou suivante selon la configuration) */
export async function runAutomation6(/** @type {{ force?: boolean }} */ { force = false } = {}) {
    const config = await hoConfig(6);
    if (!force) {
        const { hour, day } = parisClock();
        if (!config.enabled) return { sent: false, reason: 'désactivée' };
        const days = Array.isArray(config.weekDays) ? config.weekDays.map(Number) : [];
        if (!days.includes(day) || hour !== Number(config.hour)) return { sent: false, reason: 'pas le bon moment' };
    }
    const to = await recipients6(config);
    if (!to.emails.length) return { sent: false, reason: 'aucun destinataire' };
    const current = weekStart(parisToday());
    const monday = config.week === 'next' ? addDays(current, 7) : current;
    const label = await sendWeekMail(6, config, monday, to);
    return { sent: true, recipients: to.emails.length, week: label };
}

/** Déclenchements planifiés (une fois par heure) : les erreurs sont journalisées, jamais propagées */
export async function runHoAutomations() {
    for (const [n, run] of /** @type {const} */ ([
        [5, runAutomation5],
        [6, runAutomation6]
    ])) {
        try {
            const r = await run();
            if (r.sent)
                console.log(`⏰ [CRON] Automatisation n°${n}: envoyée (${r.recipients} destinataire(s), ${r.week})`);
        } catch (/** @type {any} */ e) {
            console.error(`⏰ [CRON] Erreur automatisation n°${n}:`, e.message);
        }
    }
}

/**
 * Modification de la semaine en cours : e-mail de mise à jour (« MAJ ») aux destinataires de la n°6, si elle est activée
 * @param {string} author
 * @param {Array<{ date: string, period: string, name: string, action: string }>} applied
 * @param {string} currentWeek lundi de la semaine en cours
 */
export async function notifyUpdate(author, applied, currentWeek) {
    const changes = applied.filter(c => weekStart(c.date) === currentWeek);
    if (!changes.length) return { sent: false, reason: 'hors semaine en cours' };
    try {
        const config = await hoConfig(6);
        if (!config.enabled) return { sent: false, reason: 'automatisation n°6 désactivée' };
        const to = await recipients6(config);
        if (!to.emails.length) return { sent: false, reason: 'aucun destinataire' };
        await sendWeekMail(6, config, currentWeek, to, { changes, author, maj: true });
        return { sent: true, recipients: to.emails.length };
    } catch (/** @type {any} */ e) {
        console.error('Astreintes HO : e-mail de mise à jour non envoyé :', e.message);
        return { sent: false, reason: 'erreur', error: e.message };
    }
}

/** Informations pour la fenêtre de confirmation : un e-mail de mise à jour sera-t-il envoyé, et à combien de personnes */
export async function updateMailInfo() {
    const config = await hoConfig(6);
    if (!config.enabled) return { enabled: false, recipients: 0 };
    const to = await recipients6(config);
    return { enabled: true, recipients: to.emails.length };
}
