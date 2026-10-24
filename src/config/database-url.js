// @ts-check
// URL de connexion à la base, partagée par l'application, la CLI Prisma (prisma.config.js) et les scripts
import path from 'path';

/** Fournisseurs pris en charge (nom Prisma) */
export const DB_PROVIDERS = /** @type {const} */ (['sqlite', 'postgresql', 'mysql']);

const DEFAULT_PORTS = { postgresql: 5432, mysql: 3306 };

/**
 * DATABASE_URL si fourni ; sinon :
 * - SQLite : fichier data.db du répertoire DB_PATH ;
 * - PostgreSQL / MariaDB : URL construite depuis DB_HOST, DB_PORT, DB_NAME, DB_USER et DB_PASSWORD
 *   (identifiants encodés : le mot de passe peut contenir des caractères spéciaux).
 * @param {{ DB_PROVIDER?: string, DATABASE_URL?: string, DB_PATH?: string, DB_HOST?: string, DB_PORT?: string | number,
 *   DB_NAME?: string, DB_USER?: string, DB_PASSWORD?: string }} vars
 * @returns {string | undefined}
 */
export function resolveDatabaseUrl({
    DB_PROVIDER = 'sqlite',
    DATABASE_URL,
    DB_PATH = './data',
    DB_HOST,
    DB_PORT,
    DB_NAME,
    DB_USER,
    DB_PASSWORD
}) {
    if (DATABASE_URL) return DATABASE_URL;
    if (DB_PROVIDER === 'sqlite') return `file:${path.resolve(DB_PATH, 'data.db')}`;
    if (!DB_HOST || !DB_NAME || !DB_USER) return undefined;
    const port = DB_PORT || DEFAULT_PORTS[/** @type {'postgresql' | 'mysql'} */ (DB_PROVIDER)];
    const auth = encodeURIComponent(DB_USER) + (DB_PASSWORD ? `:${encodeURIComponent(DB_PASSWORD)}` : '');
    return `${DB_PROVIDER}://${auth}@${DB_HOST}:${port}/${encodeURIComponent(DB_NAME)}`;
}
