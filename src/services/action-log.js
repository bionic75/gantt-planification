// @ts-check
// Journal des actions utilisateur : ajouté à la ligne connection_logs de la session en cours
import { prisma } from '../db/prisma.js';

/**
 * Ajoute une action au journal de la connexion en cours (sans effet hors session). Non bloquant.
 * @param {import('express').Request} req
 * @param {string} action
 * @param {Record<string, unknown>} [details]
 */
export function logUserAction(req, action, details = {}) {
    if (!req.session || !req.session.logId) {
        return;
    }
    const logId = req.session.logId;
    const entry = { timestamp: new Date().toISOString(), action, details, profile: req.session.activeProfile };
    appendModification(logId, entry).catch(err => console.error('❌ Erreur journal des actions:', err));
}

async function appendModification(/** @type {number} */ logId, /** @type {unknown} */ entry) {
    const row = await prisma.connectionLog.findUnique({ where: { id: logId }, select: { modifications: true } });
    if (!row) {
        console.error('❌ Aucune ligne trouvée pour logId:', logId);
        return;
    }
    /** @type {unknown[]} */
    let modifications;
    try {
        modifications = row.modifications ? JSON.parse(row.modifications) : [];
    } catch {
        modifications = [];
    }
    modifications.push(entry);
    await prisma.connectionLog.update({ where: { id: logId }, data: { modifications: JSON.stringify(modifications) } });
}
