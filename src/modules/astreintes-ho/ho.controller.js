// @ts-check
import { badRequest } from '../../lib/http-error.js';
import { logUserAction } from '../../services/action-log.js';
import { DEFAULT_TEMPLATES, TEMPLATE_FIELDS } from './ho.emails.js';
import {
    ansUpdateMailInfo,
    notifyAnsUpdate,
    notifyUpdate,
    runAutomation5,
    runAutomation6,
    runAutomation7,
    runAutomation8,
    updateMailInfo
} from './ho.automation.js';
import * as service from './ho.service.js';
import * as ans from './ans.service.js';
import { addDays } from './ho.dates.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const sessionOf = (/** @type {Request} */ req) => ({
    userId: /** @type {number} */ (req.session.userId),
    activeProfile: req.session.activeProfile,
    name: `${req.session.prenom || ''} ${req.session.nom || ''}`.trim() || req.session.username || 'Utilisateur'
});

/** Planning d'un mois, experts déclarés, droits de l'utilisateur ; visible par tous les profils connectés */
export async function getMonth(/** @type {Request} */ req, /** @type {Response} */ res) {
    const month = String(req.query.month || '');
    const [planning, experts, me, updateMail] = await Promise.all([
        service.getMonth(month),
        service.listHoExperts(),
        service.editorOf(sessionOf(req)),
        updateMailInfo()
    ]);
    // Astreinte HO ANS : un utilisateur par jour ouvré, sur les mêmes semaines que le planning HO
    const weeks = planning.weeks;
    const ansSlots = await ans.ansSlotsBetween(weeks[0].monday, addDays(weeks[weeks.length - 1].monday, 4));
    const ansUsers = await ans.listAnsUsers();
    const ansMe = await ans.ansEditorOf(sessionOf(req));
    const ansNames = await ans.ansNames(ansSlots.map(s => s.user_id));
    res.json({
        ...planning,
        experts,
        me,
        updateMail,
        ans: { slots: ansSlots, users: ansUsers, names: ansNames, me: ansMe, updateMail: await ansUpdateMailInfo() }
    });
}

/** Enregistrement d'ajouts / retraits ; e-mail de mise à jour si la semaine en cours est touchée */
export async function save(/** @type {Request} */ req, /** @type {Response} */ res) {
    const session = sessionOf(req);
    const hoChanges = Array.isArray(req.body?.changes) ? req.body.changes : [];
    const ansChanges = Array.isArray(req.body?.ansChanges) ? req.body.ansChanges : [];
    if (!hoChanges.length && !ansChanges.length) throw badRequest('Aucune modification à enregistrer');
    const empty = { applied: [], skipped: 0, touchesCurrentWeek: false, currentWeek: '' };
    const result = hoChanges.length ? await service.applyChanges(session, hoChanges) : empty;
    const ansResult = ansChanges.length ? await ans.applyAnsChanges(session, ansChanges) : null;
    let ansMail = { sent: false, reason: 'aucune modification' };
    if (ansResult && ansResult.applied.length) {
        logUserAction(req, 'Astreintes HO ANS : modification du planning', {
            designations: ansResult.applied.filter(c => c.action === 'set').length,
            retraits: ansResult.applied.filter(c => c.action === 'clear').length
        });
        if (ansResult.touchesCurrentWeek)
            ansMail = await notifyAnsUpdate(session.name, ansResult.applied, ansResult.currentWeek);
    }
    let mail = { sent: false, reason: 'aucune modification' };
    if (result.applied.length) {
        logUserAction(req, 'Astreintes HO : modification du planning', {
            ajouts: result.applied.filter(c => c.action === 'add').length,
            retraits: result.applied.filter(c => c.action === 'remove').length
        });
        if (result.touchesCurrentWeek) mail = await notifyUpdate(session.name, result.applied, result.currentWeek);
    }
    res.json({ success: true, ...result, mail, ans: ansResult ? { ...ansResult, mail: ansMail } : null });
}

/** Envoi immédiat d'une automatisation (n°5 ou n°6), sans attendre le jour et l'heure configurés */
export async function sendNow(/** @type {Request} */ req, /** @type {Response} */ res) {
    const run = { 5: runAutomation5, 6: runAutomation6, 7: runAutomation7, 8: runAutomation8 }[
        /** @type {5 | 6 | 7 | 8} */ (Number(req.params.n))
    ];
    if (!run) throw badRequest('Automatisation inconnue (5 à 8)');
    try {
        res.json({ success: true, ...(await run({ force: true })) });
    } catch (/** @type {any} */ e) {
        throw badRequest(`Envoi impossible : ${e.message}`);
    }
}

/** Gabarits par défaut, champs disponibles et experts HO pour l'écran d'administration */
export async function info(/** @type {Request} */ _req, /** @type {Response} */ res) {
    res.json({
        templates: DEFAULT_TEMPLATES,
        fields: TEMPLATE_FIELDS,
        experts: await service.listHoExperts(),
        ansUsers: await ans.listAnsUsers()
    });
}
