// Base modèle créée une seule fois par les migrations, copiée pour chaque serveur de test.
// SQLite : fichier copié. PostgreSQL : base modèle (CREATE DATABASE … TEMPLATE). MariaDB : migrations par serveur.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    createDatabase,
    databaseEnv,
    dropDatabase,
    isSqlite,
    newDatabaseName,
    TEST_PROVIDER
} from './helpers/test-db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const migrate = env =>
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-migrate.mjs')], {
        cwd: ROOT,
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...env },
        stdio: 'pipe'
    });

export default async function setup({ provide }) {
    if (TEST_PROVIDER === 'postgresql') {
        const name = newDatabaseName('gantt_tpl');
        await createDatabase(name);
        migrate(databaseEnv(name));
        provide('templateDatabase', name);
        return () => dropDatabase(name);
    }
    if (!isSqlite) return undefined;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-test-template-'));
    migrate({ DB_PATH: dir });
    provide('templateDbDir', dir);
    return () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
