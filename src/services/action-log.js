// @ts-check
// Journal des actions utilisateur : ajouté à la ligne connection_logs de la session en cours
import { database } from '../db/database.js';

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {Record<string, unknown>} [details]
 */
export function logUserAction(req, action, details = {}) {
    if (!req.session || !req.session.logId) {
        return;
    }

    const logId = req.session.logId;
    const actionLog = {
        timestamp: new Date().toISOString(),
        action,
        details,
        profile: req.session.activeProfile
    };

    database.get('SELECT modifications FROM connection_logs WHERE id = ?', [logId], (err, /** @type {any} */ row) => {
        if (err) {
            console.error('❌ Erreur lecture log:', err);
            return;
        }
        if (!row) {
            console.error('❌ Aucune ligne trouvée pour logId:', logId);
            return;
        }

        let modifications = [];
        if (row.modifications) {
            try {
                modifications = JSON.parse(row.modifications);
            } catch {
                modifications = [];
            }
        }
        modifications.push(actionLog);

        database.run(
            'UPDATE connection_logs SET modifications = ? WHERE id = ?',
            [JSON.stringify(modifications), logId],
            err => {
                if (err) console.error('❌ Erreur update log:', err);
            }
        );
    });
}
