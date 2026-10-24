// Outils partagés par les scripts de base de données (db-migrate, db-adopt)
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveDatabaseUrl } from '../src/config/database-url.js';

dotenv.config({ quiet: true });

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROVIDER = process.env.DB_PROVIDER || 'sqlite';
export const DATABASE_URL = resolveDatabaseUrl({ ...process.env, DB_PROVIDER: PROVIDER });
export const MIGRATIONS_DIR = path.join(ROOT, 'prisma', PROVIDER, 'migrations');
export const BASELINE = '00000000000000_init';

const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve('prisma/build/index.js');

/** Exécute la CLI Prisma ; renvoie la sortie standard */
export function prismaCli(args, { capture = false, env = {} } = {}) {
    return execFileSync(process.execPath, [PRISMA_CLI, ...args], {
        cwd: ROOT,
        env: { ...process.env, DB_PROVIDER: PROVIDER, ...env },
        encoding: 'utf8',
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        maxBuffer: 64 * 1024 * 1024
    });
}

/** Chemin du fichier SQLite */
export const sqliteFile = () => DATABASE_URL.replace(/^file:/, '');

/** Ouvre la base SQLite (better-sqlite3) */
export async function openSqlite(file = sqliteFile(), options = {}) {
    const { default: Database } = await import('better-sqlite3');
    return new Database(file, options);
}

/** Tables applicatives d'une base SQLite */
export function sqliteTables(db) {
    return db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map(r => r.name);
}

export const exists = file => fs.existsSync(file);
