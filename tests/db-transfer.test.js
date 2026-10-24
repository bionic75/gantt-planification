// Transfert d'une base SQLite vers PostgreSQL / MariaDB (npm run db:transfer) : sans objet sous SQLite
import Database from 'better-sqlite3';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, createWorkDir, startServer } from './helpers/server.js';
import { loginAs } from './helpers/fixtures.js';
import { createDatabase, databaseEnv, dropDatabase, isSqlite, newDatabaseName } from './helpers/test-db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);

/** Base SQLite source : schéma de la migration initiale, historique des migrations, quelques données */
function buildSource(file) {
    const db = new Database(file);
    const migrations = path.join(ROOT, 'prisma', 'sqlite', 'migrations');
    const names = fs
        .readdirSync(migrations)
        .filter(n => fs.statSync(path.join(migrations, n)).isDirectory())
        .sort();
    for (const n of names) db.exec(fs.readFileSync(path.join(migrations, n, 'migration.sql'), 'utf8'));
    db.exec(`CREATE TABLE "_prisma_migrations" (
        "id" TEXT PRIMARY KEY NOT NULL, "checksum" TEXT NOT NULL, "finished_at" DATETIME, "migration_name" TEXT NOT NULL,
        "logs" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0)`);
    const mig = db.prepare(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, 'x', CURRENT_TIMESTAMP, ?, 1)`
    );
    names.forEach((n, i) => mig.run(`m${i}`, n));
    db.prepare(
        `INSERT INTO resources (id, nom, prenom, trigramme, taux, samu, actif) VALUES (42, 'TRANSFÉRÉ', 'Élise', 'TRF', 80.5, 'SAMU 75', 1)`
    ).run();
    db.prepare(`INSERT INTO settings (key, value) VALUES ('test_transfert', '{"emoji":"🚨"}')`).run();
    db.prepare(
        `INSERT INTO schedule_data (resource_id, date_key, type, value) VALUES (42, '2027-01-04_AM', 'available', '2')`
    ).run();
    db.close();
}

describe.skipIf(isSqlite)('transfert SQLite → PostgreSQL / MariaDB', () => {
    const workDir = createWorkDir();
    const source = path.join(workDir, 'source.db');
    const database = newDatabaseName('gantt_transfer');
    const env = () => ({ PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...databaseEnv(database) });
    const transfer = (...args) =>
        run(process.execPath, [path.join(ROOT, 'scripts', 'db-transfer.mjs'), `--from=${source}`, ...args], {
            cwd: ROOT,
            env: env()
        });
    let server;

    beforeAll(async () => {
        buildSource(source);
        await createDatabase(database);
        fs.writeFileSync(path.join(workDir, 'test-database.txt'), database);
        await run(process.execPath, [path.join(ROOT, 'scripts', 'db-migrate.mjs')], { cwd: ROOT, env: env() });
    }, 120000);
    // stop() supprime aussi la base de test et le répertoire de travail
    afterAll(() => (server ? server.stop() : dropDatabase(database).catch(() => {})));

    it('données copiées, compteurs d’identifiants recalés, base non vide protégée', { timeout: 120000 }, async () => {
        const { stdout } = await transfer();
        expect(stdout).toMatch(/ligne\(s\) transférée\(s\)/);

        server = await startServer({ workDir });
        const admin = await loginAs(server, ADMIN, 'admin');
        const resources = (await admin.get('/api/resources')).data;
        expect(resources).toContainEqual(
            expect.objectContaining({ id: 42, nom: 'TRANSFÉRÉ', prenom: 'Élise', taux: 80.5 })
        );
        expect((await admin.get('/api/settings')).data.test_transfert).toBe('{"emoji":"🚨"}');
        expect((await admin.get('/api/schedule')).data['42_available_2027-01-04_AM']).toBe('2');
        // Nouvel identifiant après le plus grand identifiant transféré
        const created = await admin.post('/api/resources', {
            nom: 'NOUVEAU',
            prenom: 'x',
            trigramme: 'NOU',
            taux: 50,
            samu: 'SAMU 75'
        });
        expect(created.data.id).toBeGreaterThan(42);

        const again = await transfer().catch(e => e);
        expect(again.code).toBe(1);
        expect(again.stderr).toMatch(/contient déjà des données/);
        const replaced = await transfer('--replace');
        expect(replaced.stdout).toMatch(/Contenu de la base cible supprimé/);
    });
});
