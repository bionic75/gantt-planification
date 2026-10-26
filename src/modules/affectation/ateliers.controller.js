// @ts-check
import { badRequest } from '../../lib/http-error.js';
import { logUserAction } from '../../services/action-log.js';
import * as svc from './ateliers.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const author = (/** @type {Request} */ req) => ({
    userId: /** @type {number} */ (req.session.userId),
    name: `${req.session.prenom || ''} ${req.session.nom || ''}`.trim() || req.session.username || 'Utilisateur'
});

export async function meta(/** @type {Request} */ _req, /** @type {Response} */ res) {
    res.json(await svc.meta());
}

export async function simulate(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await svc.simulate(req.body));
}

export async function list(/** @type {Request} */ _req, /** @type {Response} */ res) {
    res.json({ retroplannings: await svc.list() });
}

export async function save(/** @type {Request} */ req, /** @type {Response} */ res) {
    const r = await svc.save(req.body, author(req));
    logUserAction(req, r.created ? 'Ateliers métier : rétroplanning créé' : 'Ateliers métier : rétroplanning modifié', {
        samu: r.samu_name
    });
    res.json({ success: true, ...r });
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    const samu = await svc.remove(req.params.id);
    logUserAction(req, 'Ateliers métier : rétroplanning supprimé', { samu });
    res.json({ success: true });
}

export async function send(/** @type {Request} */ req, /** @type {Response} */ res) {
    try {
        const r = await svc.send(req.params.id, req.body || {});
        logUserAction(req, 'Ateliers métier : rétroplanning diffusé par e-mail', {
            samu: r.samu_name,
            destinataires: r.sent
        });
        res.json({ success: true, ...r });
    } catch (/** @type {any} */ e) {
        if (e.status) throw e;
        throw badRequest(`Envoi impossible : ${e.message}`);
    }
}
