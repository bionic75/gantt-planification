// @ts-check
import { badRequest } from '../../lib/http-error.js';
import { logUserAction } from '../../services/action-log.js';
import * as svc from './sondages.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const origin = (/** @type {Request} */ req) => `${req.protocol}://${req.get('host')}`;
const withUrl = (/** @type {Request} */ req, /** @type {any} */ s) =>
    s ? { ...s, url: svc.sondageUrl(s.token, origin(req)) } : null;

export async function list(/** @type {Request} */ _req, /** @type {Response} */ res) {
    res.json({ sondages: await svc.list() });
}

export async function get(/** @type {Request} */ req, /** @type {Response} */ res) {
    const sondage = await svc.get(req.params.id, req.params.ligne);
    res.json({ sondage: withUrl(req, sondage), modele: sondage ? null : await svc.modele(req.params.id) });
}

export async function save(/** @type {Request} */ req, /** @type {Response} */ res) {
    const r = await svc.save(req.params.id, req.params.ligne, req.body || {}, req.session.userId || null);
    logUserAction(req, r.created ? 'Ateliers métier : sondage créé' : 'Ateliers métier : sondage modifié', {
        retroplanning: req.params.id,
        jalon: req.params.ligne
    });
    res.json({ success: true, sondage: withUrl(req, await svc.get(req.params.id, req.params.ligne)) });
}

export async function send(/** @type {Request} */ req, /** @type {Response} */ res) {
    try {
        const r = await svc.send(req.params.id, req.params.ligne, origin(req));
        logUserAction(req, 'Ateliers métier : sondage envoyé par e-mail', {
            retroplanning: req.params.id,
            jalon: req.params.ligne,
            destinataires: r.sent
        });
        res.json({ success: true, ...r, sondage: withUrl(req, await svc.get(req.params.id, req.params.ligne)) });
    } catch (/** @type {any} */ e) {
        if (e.status) throw e;
        throw badRequest(`Envoi impossible : ${e.message}`);
    }
}

export async function close(/** @type {Request} */ req, /** @type {Response} */ res) {
    const r = await svc.close(req.params.id, req.params.ligne, (req.body || {}).option_id);
    logUserAction(req, 'Ateliers métier : sondage clôturé', {
        sondage: r.nom,
        creneau: r.retenu || 'aucun créneau retenu'
    });
    res.json({ success: true, sondage: withUrl(req, await svc.get(req.params.id, req.params.ligne)) });
}

export async function reopen(/** @type {Request} */ req, /** @type {Response} */ res) {
    const nom = await svc.reopen(req.params.id, req.params.ligne);
    logUserAction(req, 'Ateliers métier : sondage rouvert', { sondage: nom });
    res.json({ success: true, sondage: withUrl(req, await svc.get(req.params.id, req.params.ligne)) });
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    const nom = await svc.remove(req.params.id, req.params.ligne);
    logUserAction(req, 'Ateliers métier : sondage supprimé', { sondage: nom });
    res.json({ success: true });
}

// Accès public par l'adresse unique du sondage
export async function publicGet(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await svc.publicGet(req.params.token, String(req.get('x-reponse-jeton') || '')));
}

export async function publicRespond(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ success: true, ...(await svc.publicRespond(req.params.token, req.body)) });
}
