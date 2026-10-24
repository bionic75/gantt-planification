// @ts-check
// Stockage des sessions HTTP en base (table sessions) : elles survivent aux redémarrages du serveur, et leur
// fermeture forcée (révocation) aussi. Remplace le stockage en mémoire par défaut d'express-session, qui n'est
// pas prévu pour la production (fuite mémoire, sessions perdues au redémarrage).
import session from 'express-session';
import { prisma } from './prisma.js';
import { sqlTimestamp } from './values.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** @typedef {import('express-session').SessionData} SessionData */
/** @typedef {(err?: any, value?: any) => void} Callback */

/** Expiration d'une session : celle de son cookie, sinon 24 h */
const expiresAt = (/** @type {SessionData} */ sess) =>
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

    /** @param {string} sid @param {Callback} cb */
    get(sid, cb) {
        prisma.session
            .findUnique({ where: { sid } })
            .then(row => cb(null, row && row.expires_at > sqlTimestamp() ? JSON.parse(row.data) : null))
            .catch(cb);
    }

    /** @param {string} sid @param {SessionData} sess @param {Callback} [cb] */
    set(sid, sess, cb = () => {}) {
        const fields = { user_id: sess.userId ?? null, data: JSON.stringify(sess), expires_at: expiresAt(sess) };
        prisma.session
            .upsert({ where: { sid }, update: fields, create: { sid, ...fields } })
            .then(() => cb())
            .catch(cb);
    }

    /** @param {string} sid @param {SessionData} sess @param {Callback} [cb] */
    touch(sid, sess, cb = () => {}) {
        prisma.session
            .updateMany({ where: { sid }, data: { expires_at: expiresAt(sess) } })
            .then(() => cb())
            .catch(cb);
    }

    /** @param {string} sid @param {Callback} [cb] */
    destroy(sid, cb = () => {}) {
        prisma.session
            .deleteMany({ where: { sid } })
            .then(() => cb())
            .catch(cb);
    }
}

/**
 * Ferme toutes les sessions ouvertes d'un utilisateur : elles sont marquées « terminated » et rejetées à leur
 * prochaine requête (réponse SESSION_TERMINATED, voir middlewares/auth.js).
 * @param {number} userId
 */
export async function terminateUserSessions(userId) {
    const rows = await prisma.session.findMany({ where: { user_id: userId }, select: { sid: true, data: true } });
    for (const row of rows) {
        const data = { ...JSON.parse(row.data), terminated: true };
        await prisma.session.updateMany({ where: { sid: row.sid }, data: { data: JSON.stringify(data) } });
    }
}
