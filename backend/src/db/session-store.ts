// Stockage des sessions HTTP en base (table sessions) : elles survivent aux redémarrages du serveur, et leur
// fermeture forcée (révocation) aussi. Remplace le stockage en mémoire par défaut d'express-session, qui n'est
// pas prévu pour la production (fuite mémoire, sessions perdues au redémarrage).
import session, { type SessionData } from 'express-session';
import { prisma } from './prisma.ts';
import { sqlTimestamp } from './values.ts';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

type Callback = (err?: any, value?: any) => void;

/** Expiration d'une session : celle de son cookie, sinon 24 h */
const expiresAt = (sess: SessionData) =>
    sqlTimestamp(sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + DEFAULT_TTL_MS));

export class PrismaSessionStore extends session.Store {
    constructor() {
        super();
        // Suppression périodique des sessions expirées
        setInterval(
            () => this.purgeExpired().catch(err => console.error('Purge des sessions :', err)),
            CLEANUP_INTERVAL_MS
        ).unref();
    }

    purgeExpired() {
        return prisma.session.deleteMany({ where: { expires_at: { lte: sqlTimestamp() } } });
    }

    get(sid: string, cb: Callback) {
        prisma.session
            .findUnique({ where: { sid } })
            .then(row => cb(null, row && row.expires_at > sqlTimestamp() ? JSON.parse(row.data) : null))
            .catch(cb);
    }

    set(sid: string, sess: SessionData, cb: Callback = () => {}) {
        const fields = { user_id: sess.userId ?? null, data: JSON.stringify(sess), expires_at: expiresAt(sess) };
        prisma.session
            .upsert({ where: { sid }, update: fields, create: { sid, ...fields } })
            .then(() => cb())
            .catch(cb);
    }

    touch(sid: string, sess: SessionData, cb: Callback = () => {}) {
        prisma.session
            .updateMany({ where: { sid }, data: { expires_at: expiresAt(sess) } })
            .then(() => cb())
            .catch(cb);
    }

    destroy(sid: string, cb: Callback = () => {}) {
        prisma.session
            .deleteMany({ where: { sid } })
            .then(() => cb())
            .catch(cb);
    }
}

/**
 * Ferme toutes les sessions ouvertes d'un utilisateur : elles sont marquées « terminated » et rejetées à leur
 * prochaine requête (réponse SESSION_TERMINATED, voir middlewares/auth.ts).
 */
export async function terminateUserSessions(userId: number) {
    const rows = await prisma.session.findMany({ where: { user_id: userId }, select: { sid: true, data: true } });
    for (const row of rows) {
        const data = { ...JSON.parse(row.data), terminated: true };
        await prisma.session.updateMany({ where: { sid: row.sid }, data: { data: JSON.stringify(data) } });
    }
}
