// @ts-check
import { logUserAction } from '../../services/action-log.js';
import * as service from './logs.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

/** Utilisateurs connectés (accessible à tous les utilisateurs authentifiés) */
export async function activeSessions(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ activeUsers: await service.listActiveUsers() });
}

export async function connectionsReport(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ rows: await service.connectionsReport(req.query) });
}

export async function userActions(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ logs: await service.listUserActions(req.query.userId) });
}

export async function addModification(/** @type {Request} */ req, /** @type {Response} */ res) {
    if (!req.session.logId) return res.json({ success: false, error: 'Aucun log actif' });
    await service.addModification(req.session.logId, req.body.modification);
    res.json({ success: true });
}

export async function planningDebug(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.planningDebug());
}

export async function resetUserLogs(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { type, userId } = req.body;
    console.log(`🗑️ RAZ logs demandée: type=${type}, userId=${userId}`);
    const { deleted, username, description } = await service.resetUserLogs(type, userId);
    logUserAction(req, description, { targetUserId: userId, targetUsername: username, deletedCount: deleted });
    res.json({ success: true, deleted, message: `${deleted} enregistrement(s) supprimé(s)` });
}

/** Purge complète (tous les utilisateurs) */
export async function purgeAll(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { table, type } = req.body;
    const deleted = await service.purgeAll(table, type);
    logUserAction(req, 'Purge complète logs', { table, type: type || 'all', deletedCount: deleted });
    res.json({ success: true, deleted, table, message: `${deleted} enregistrement(s) supprimé(s) de ${table}` });
}
