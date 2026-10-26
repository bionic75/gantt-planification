// @ts-check
import { badRequest } from '../../lib/http-error.js';
import { logUserAction } from '../../services/action-log.js';
import { DEFAULT_TEMPLATES, TEMPLATE_FIELDS } from './ho.emails.js';
import { notifyUpdate, runAutomation5, runAutomation6, updateMailInfo } from './ho.automation.js';
import * as service from './ho.service.js';

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
    res.json({ ...planning, experts, me, updateMail });
}

/** Enregistrement d'ajouts / retraits ; e-mail de mise à jour si la semaine en cours est touchée */
export async function save(/** @type {Request} */ req, /** @type {Response} */ res) {
    const session = sessionOf(req);
    const result = await service.applyChanges(session, req.body?.changes);
    let mail = { sent: false, reason: 'aucune modification' };
    if (result.applied.length) {
        logUserAction(req, 'Astreintes HO : modification du planning', {
            ajouts: result.applied.filter(c => c.action === 'add').length,
            retraits: result.applied.filter(c => c.action === 'remove').length
        });
        if (result.touchesCurrentWeek) mail = await notifyUpdate(session.name, result.applied, result.currentWeek);
    }
    res.json({ success: true, ...result, mail });
}

/** Envoi immédiat d'une automatisation (n°5 ou n°6), sans attendre le jour et l'heure configurés */
export async function sendNow(/** @type {Request} */ req, /** @type {Response} */ res) {
    const run = { 5: runAutomation5, 6: runAutomation6 }[/** @type {5 | 6} */ (Number(req.params.n))];
    if (!run) throw badRequest('Automatisation inconnue (5 ou 6)');
    try {
        res.json({ success: true, ...(await run({ force: true })) });
    } catch (/** @type {any} */ e) {
        throw badRequest(`Envoi impossible : ${e.message}`);
    }
}

/** Gabarits par défaut, champs disponibles et experts HO pour l'écran d'administration */
export async function info(/** @type {Request} */ _req, /** @type {Response} */ res) {
    res.json({ templates: DEFAULT_TEMPLATES, fields: TEMPLATE_FIELDS, experts: await service.listHoExperts() });
}
