import { logUserAction } from '../../services/action-log.ts';
import * as service from './logs.service.ts';

import type { Request, Response } from 'express';

/**
 * Utilisateurs connectés (accessible à tous les utilisateurs authentifiés). Identifiant de connexion (username) réservé
 * à l'administrateur : les autres profils voient nom, prénom, photo et profil.
 */
export async function activeSessions(req: Request, res: Response) {
    const users = await service.listActiveUsers();
    const isAdmin = req.session.activeProfile === 'admin';
    res.json({ activeUsers: isAdmin ? users : users.map(({ username: _username, ...u }) => u) });
}

export async function connectionsReport(req: Request, res: Response) {
    res.json({ rows: await service.connectionsReport(req.query) });
}

export async function userActions(req: Request, res: Response) {
    res.json({ logs: await service.listUserActions(req.query.userId) });
}

/** Journal complet d'un utilisateur (connexions et toutes ses actions, catégorisées) pour l'export CSV */
export async function userExport(req: Request, res: Response) {
    res.json(await service.exportUserLogs(req.query.userId));
}

export async function addModification(req: Request, res: Response) {
    if (!req.session.logId) return res.json({ success: false, error: 'Aucun log actif' });
    await service.addModification(req.session.logId, req.body.modification);
    res.json({ success: true });
}

export async function planningDebug(req: Request, res: Response) {
    res.json(await service.planningDebug());
}

export async function resetUserLogs(req: Request, res: Response) {
    const { type, userId } = req.body;
    console.log(`🗑️ RAZ logs demandée: type=${type}, userId=${userId}`);
    const { deleted, username, description } = await service.resetUserLogs(type, userId);
    logUserAction(req, description, { targetUserId: userId, targetUsername: username, deletedCount: deleted });
    res.json({ success: true, deleted, message: `${deleted} enregistrement(s) supprimé(s)` });
}

/** Purge complète (tous les utilisateurs) */
export async function purgeAll(req: Request, res: Response) {
    const { table, type } = req.body;
    const deleted = await service.purgeAll(table, type);
    logUserAction(req, 'Purge complète logs', { table, type: type || 'all', deletedCount: deleted });
    res.json({ success: true, deleted, table, message: `${deleted} enregistrement(s) supprimé(s) de ${table}` });
}
