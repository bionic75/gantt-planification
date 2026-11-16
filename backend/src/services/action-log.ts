// Journal des actions utilisateur : ajouté à la ligne connection_logs de la session en cours
import type { Request } from 'express';
import { prisma } from '../db/prisma.ts';

/** Ajoute une action au journal de la connexion en cours (sans effet hors session). Non bloquant. */
export function logUserAction(req: Request, action: string, details: Record<string, unknown> = {}) {
    if (!req.session || !req.session.logId) {
        return;
    }
    const logId = req.session.logId;
    const entry = { timestamp: new Date().toISOString(), action, details, profile: req.session.activeProfile };
    appendModification(logId, entry).catch(err => console.error('❌ Erreur journal des actions:', err));
}

async function appendModification(logId: number, entry: unknown) {
    const row = await prisma.connectionLog.findUnique({ where: { id: logId }, select: { modifications: true } });
    if (!row) {
        console.error('❌ Aucune ligne trouvée pour logId:', logId);
        return;
    }
    let modifications: unknown[];
    try {
        modifications = row.modifications ? JSON.parse(row.modifications) : [];
    } catch {
        modifications = [];
    }
    modifications.push(entry);
    await prisma.connectionLog.update({ where: { id: logId }, data: { modifications: JSON.stringify(modifications) } });
}
