// Adoption d'une base créée par l'ancienne version (schéma historique : tests/fixtures/legacy-schema.sql)
import Database from 'better-sqlite3';
import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, describe, expect, it } from 'vitest';
import { createWorkDir, startServer } from './helpers/server.js';
import { isSqlite } from './helpers/test-db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_SCHEMA = fs.readFileSync(path.join(ROOT, 'tests/fixtures/legacy-schema.sql'), 'utf8');
/** Migrations SQLite du dépôt, dans l'ordre d'application */
const migrationNames = () =>
    fs
        .readdirSync(path.join(ROOT, 'prisma/sqlite/migrations'), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();
const workDirs = [];
afterAll(() => {
    for (const d of workDirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

/** Base « ancienne version » avec des données, dont une ligne orpheline (clés étrangères jamais appliquées) */
function legacyDatabase(extraSql = '') {
    const workDir = createWorkDir();
    workDirs.push(workDir);
    fs.mkdirSync(path.join(workDir, 'data'));
    const db = new Database(path.join(workDir, 'data', 'data.db'));
    db.pragma('foreign_keys = OFF');
    db.exec(LEGACY_SCHEMA);
    db.exec(`
        INSERT INTO resources (nom, prenom, trigramme, taux, samu, date_debut) VALUES ('DUPONT', 'Jean', 'JDU', 80, 'SAMU 75', '2025-01-01');
        INSERT INTO users (username, password, nom, prenom, email, is_expert, resource_id, created_at)
            VALUES ('jdu', 'x', 'Dupont', 'Jean', 'j@x.fr', 1, 1, '2024-12-31 23:59:59');
        INSERT INTO schedule_data (resource_id, date_key, type, value) VALUES (1, '2025-06-02_AM', 'activity', '5');
        INSERT INTO astreintes_hno (user_id, type, date_debut, date_fin, heure_debut, heure_fin, objet)
            VALUES (1, 'hno', '2025-03-05', '2025-03-05', '20:00', '22:00', 'Intervention');
        INSERT INTO connection_logs (user_id, username, nom, prenom, profile, modifications) VALUES (999, 'orphelin', 'X', 'Y', 'user', '[]');
        INSERT INTO settings (key, value) VALUES ('favicon', 'grille');
        ${extraSql}
    `);
    db.close();
    return workDir;
}

/** Lance scripts/db-adopt.mjs (asynchrone : les tests d'adoption s'exécutent en parallèle) */
function adopt(workDir, ...args) {
    return new Promise(resolve => {
        execFile(
            process.execPath,
            [path.join(ROOT, 'scripts/db-adopt.mjs'), ...args],
            {
                cwd: ROOT,
                env: {
                    PATH: process.env.PATH,
                    SYSTEMROOT: process.env.SYSTEMROOT,
                    DB_PATH: path.join(workDir, 'data')
                },
                encoding: 'utf8'
            },
            (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: `${stdout}${stderr}` })
        );
    });
}
const open = workDir => new Database(path.join(workDir, 'data', 'data.db'), { readonly: true });

// Tests indépendants (une base temporaire chacun) : exécutés en parallèle, la CLI Prisma étant lente à démarrer
// Adoption d'une base SQLite de l'ancienne version : sans objet avec PostgreSQL / MariaDB
describe.skipIf(!isSqlite).concurrent('adoption', { timeout: 120000 }, () => {
    it('convertit le schéma en conservant les données, puis le serveur démarre sur la base', async () => {
        const workDir = legacyDatabase();
        const r = await adopt(workDir);
        expect(r.code, r.out).toBe(0);
        expect(fs.readdirSync(path.join(workDir, 'data', 'backups'))).toHaveLength(1);

        const db = open(workDir);
        // Migration initiale marquée appliquée par l'adoption, puis les suivantes appliquées
        expect(
            db
                .prepare('SELECT migration_name FROM _prisma_migrations ORDER BY migration_name')
                .all()
                .map(r => r.migration_name)
        ).toEqual(migrationNames());
        expect(db.prepare('SELECT username, created_at FROM users').get()).toEqual({
            username: 'jdu',
            created_at: '2024-12-31 23:59:59'
        });
        expect(db.prepare('SELECT heure_debut, date_debut FROM astreintes_hno').get()).toEqual({
            heure_debut: '20:00',
            date_debut: '2025-03-05'
        });
        expect(db.prepare('SELECT COUNT(*) AS n FROM connection_logs').get().n).toBe(1);
        // Plus de clé étrangère déclarée (comportement historique : jamais appliquées)
        expect(db.prepare("SELECT COUNT(*) AS n FROM pragma_foreign_key_list('users')").get().n).toBe(0);
        db.close();

        const server = await startServer({ workDir });
        try {
            const admin = server.client();
            expect((await admin.login('admin', 'Admin2025!', 'admin')).status).toBe(200);
            const resources = (await admin.get('/api/resources')).data;
            expect(resources).toEqual([expect.objectContaining({ trigramme: 'JDU', date_debut: '2025-01-01' })]);
            expect((await admin.get('/api/schedule')).data).toEqual({ '1_activity_2025-06-02_AM': '5' });
            // Paramètre existant conservé (pas écrasé par la valeur par défaut)
            expect((await admin.get('/api/settings')).data).toMatchObject({ favicon: 'grille' });
        } finally {
            await server.shutdown();
        }
    }, 60000);

    it('refuse une seconde adoption', async () => {
        const workDir = legacyDatabase();
        expect((await adopt(workDir)).code).toBe(0);
        const again = await adopt(workDir);
        expect(again.code).toBe(1);
        expect(again.out).toMatch(/déjà gérée par les migrations/);
    });

    it('--dry-run ne modifie pas la base', async () => {
        const workDir = legacyDatabase();
        const r = await adopt(workDir, '--dry-run');
        expect(r.code, r.out).toBe(0);
        const db = open(workDir);
        expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = '_prisma_migrations'").get().n).toBe(0);
        db.close();
    });

    it('refuse une colonne inconnue (elle serait perdue), base inchangée', async () => {
        const workDir = legacyDatabase(
            "ALTER TABLE users ADD COLUMN ancienne_colonne TEXT; UPDATE users SET ancienne_colonne = 'x';"
        );
        const r = await adopt(workDir);
        expect(r.code).toBe(1);
        expect(r.out).toMatch(/users\.ancienne_colonne/);
        const db = open(workDir);
        expect(db.prepare('SELECT ancienne_colonne FROM users').get().ancienne_colonne).toBe('x');
        db.close();
    });

    it('convertit les nombres stockés en texte (vide → NULL ou 0)', async () => {
        const workDir = legacyDatabase(`
            INSERT INTO resource_mad_history (resource_id, taux, date_debut) VALUES (1, '', '2025-01-01');
            INSERT INTO resource_mad_history (resource_id, taux, date_debut) VALUES (1, '60', '2025-02-01');
            UPDATE users SET resource_id = '' WHERE username = 'jdu';
        `);
        const r = await adopt(workDir);
        expect(r.code, r.out).toBe(0);
        expect(r.out).toMatch(/resource_mad_history\.taux : 1 valeur\(s\) texte converties \(vide → 0\)/);
        const db = open(workDir);
        expect(db.prepare('SELECT taux, typeof(taux) AS t FROM resource_mad_history ORDER BY id').all()).toEqual([
            { taux: 0, t: 'real' },
            { taux: 60, t: 'real' }
        ]);
        expect(db.prepare("SELECT resource_id FROM users WHERE username = 'jdu'").get().resource_id).toBeNull();
        db.close();
    });

    it('refuse un texte non numérique dans une colonne numérique, base inchangée', async () => {
        const workDir = legacyDatabase(
            "INSERT INTO resource_mad_history (resource_id, taux, date_debut) VALUES (1, 'abc', '2025-01-01');"
        );
        const r = await adopt(workDir);
        expect(r.code).toBe(1);
        expect(r.out).toMatch(/valeurs non numériques dans « resource_mad_history\.taux » \(REAL\) : "abc"/);
        const db = open(workDir);
        expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = '_prisma_migrations'").get().n).toBe(0);
        db.close();
    });

    it('table inconnue : refusée, sauf suppression explicite', async () => {
        const workDir = legacyDatabase(
            'CREATE TABLE resources_new (id INTEGER); INSERT INTO resources_new VALUES (1);'
        );
        const r = await adopt(workDir);
        expect(r.code).toBe(1);
        expect(r.out).toMatch(/table inconnue « resources_new » \(1 ligne/);

        expect((await adopt(workDir, '--drop-tables=resources_new')).code).toBe(0);
        const db = open(workDir);
        expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'resources_new'").get().n).toBe(0);
        db.close();
    });
});

describe.skipIf(!isSqlite)('démarrage', () => {
    it("refuse une base de l'ancienne version non adoptée", async () => {
        const workDir = legacyDatabase();
        let error;
        try {
            execFileSync(process.execPath, [path.join(ROOT, 'scripts/db-migrate.mjs')], {
                cwd: ROOT,
                env: {
                    PATH: process.env.PATH,
                    SYSTEMROOT: process.env.SYSTEMROOT,
                    DB_PATH: path.join(workDir, 'data')
                },
                stdio: 'pipe',
                encoding: 'utf8'
            });
        } catch (e) {
            error = e;
        }
        expect(error?.status).toBe(1);
        expect(error.stderr).toMatch(/npm run db:adopt/);
    });
});
