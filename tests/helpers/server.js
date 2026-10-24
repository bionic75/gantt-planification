// Démarre l'application dans un processus séparé, sur une base SQLite neuve dans un répertoire temporaire.
// Les tests passent uniquement par HTTP : ils restent valables quelle que soit l'organisation interne du code.
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './client.js';
import { createDatabase, databaseEnv, dropDatabase, isSqlite, newDatabaseName, TEST_PROVIDER } from './test-db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADMIN = { username: 'admin', password: 'Admin2025!' };
// URL publique déclarée à l'application (liens des emails), volontairement différente de l'adresse d'écoute
const APP_URL = 'http://planning.test';

// Navigateur Chromium pour la génération des PDF (tests ignorés s'il n'y en a pas)
const BROWSER_CANDIDATES = [
    process.env.TEST_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];
export const BROWSER_PATH = BROWSER_CANDIDATES.find(p => p && fs.existsSync(p)) || null;

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

// Version antérieure aux migrations (comparaisons de comportement) : TEST_SERVER_ENTRY autre que server.js
const isLegacyEntry = () => !!process.env.TEST_SERVER_ENTRY && process.env.TEST_SERVER_ENTRY !== 'server.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const definedOnly = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Base PostgreSQL / MariaDB d'un serveur de test (nom conservé dans son répertoire de travail) */
const databaseFile = workDir => path.join(workDir, 'test-database.txt');
const databaseOf = workDir =>
    fs.existsSync(databaseFile(workDir)) ? fs.readFileSync(databaseFile(workDir), 'utf8') : null;

/** Applique les migrations sur la base de test (comme « npm start » avant le serveur) */
function migrate(workDir) {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-migrate.mjs')], {
        cwd: ROOT,
        env: definedOnly({
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            DB_PATH: path.join(workDir, 'data'),
            ...databaseEnv(databaseOf(workDir))
        }),
        stdio: 'pipe'
    });
}

/** Valeur fournie par tests/global-setup.js, absente hors de Vitest (script de comparaison) */
async function injected(key) {
    try {
        const { inject } = await import('vitest');
        return inject(key) || null;
    } catch {
        return null;
    }
}

/**
 * Base du serveur : copie de la base modèle si disponible (plus rapide), sinon migrations.
 * Une base déjà présente (préparée par le test) reçoit seulement les migrations en attente.
 */
async function prepareDatabase(workDir) {
    const dataDir = path.join(workDir, 'data');
    if (!isSqlite) {
        // PostgreSQL : copie de la base modèle ; MariaDB : base vide puis migrations
        fs.mkdirSync(dataDir, { recursive: true });
        if (!databaseOf(workDir)) {
            const name = newDatabaseName('gantt_test');
            const template = TEST_PROVIDER === 'postgresql' ? await injected('templateDatabase') : null;
            await createDatabase(name, template);
            fs.writeFileSync(databaseFile(workDir), name);
            if (template) return;
        }
        migrate(workDir);
        return;
    }
    const template = await injected('templateDbDir');
    if (!fs.existsSync(path.join(dataDir, 'data.db')) && template) {
        fs.mkdirSync(dataDir, { recursive: true });
        for (const suffix of ['', '-wal', '-shm']) {
            const file = path.join(template, `data.db${suffix}`);
            if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dataDir, `data.db${suffix}`));
        }
        return;
    }
    fs.mkdirSync(dataDir, { recursive: true });
    migrate(workDir);
}

/** Répertoire de travail temporaire d'un serveur de test (base dans <workDir>/data) */
export const createWorkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-test-'));

/**
 * @param {{ workDir?: string }} [options] workDir : répertoire préparé à l'avance (base existante dans workDir/data)
 */
export async function startServer({ workDir = createWorkDir() } = {}) {
    try {
        if (isLegacyEntry()) {
            // Ancienne version (comparaisons) : tables créées au démarrage par initDB, dont une partie seulement
            // au démarrage suivant sur une base neuve : deux démarrages successifs
            const first = await bootServer(workDir);
            await first.shutdown();
        } else {
            await prepareDatabase(workDir);
        }
        return await bootServer(workDir);
    } catch (err) {
        const database = databaseOf(workDir);
        if (database) await dropDatabase(database).catch(() => {});
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        throw err;
    }
}

async function bootServer(workDir) {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let logs = '';

    // cwd = répertoire temporaire : les fichiers écrits en relatif (./data/pdfs…) restent hors du projet
    // TEST_SERVER_ENTRY : autre point d'entrée (ex. version précédente pour comparer les comportements)
    const entry = path.join(ROOT, process.env.TEST_SERVER_ENTRY || 'server.js');
    const proc = spawn(process.execPath, [entry], {
        cwd: workDir,
        env: definedOnly({
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            // Nécessaires au lancement du navigateur (profil temporaire)
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            HOME: process.env.HOME,
            USERPROFILE: process.env.USERPROFILE,
            LOCALAPPDATA: process.env.LOCALAPPDATA,
            ...(BROWSER_PATH ? { PUPPETEER_EXECUTABLE_PATH: BROWSER_PATH } : {}),
            NODE_ENV: 'test',
            PORT: String(port),
            DB_PATH: path.join(workDir, 'data'),
            ...databaseEnv(databaseOf(workDir)),
            APP_URL: APP_URL,
            SESSION_SECRET: 'test-secret-'.padEnd(48, 'x')
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', d => (logs += d));
    proc.stderr.on('data', d => (logs += d));

    const server = {
        baseUrl,
        appUrl: APP_URL,
        get logs() {
            return logs;
        },
        client: () => createClient(baseUrl),
        async shutdown() {
            if (proc.exitCode === null) {
                proc.kill();
                await new Promise(r => proc.once('exit', r));
            }
        },
        async stop() {
            await server.shutdown();
            // TEST_LOGS_DIR : conserve les logs du serveur (diagnostic)
            if (process.env.TEST_LOGS_DIR) {
                fs.writeFileSync(path.join(process.env.TEST_LOGS_DIR, `${path.basename(workDir)}.log`), logs);
            }
            const database = databaseOf(workDir);
            if (database) await dropDatabase(database);
            fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
    };

    // Prêt quand le compte admin initial (créé de façon asynchrone par initDB) permet de se connecter
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`Le serveur s'est arrêté (code ${proc.exitCode}) :\n${logs}`);
        try {
            const r = await server.client().login(ADMIN.username, ADMIN.password, 'admin');
            if (r.status === 200) {
                // Ancienne version : laisse initDB terminer ses créations de tables asynchrones
                if (isLegacyEntry()) await sleep(500);
                return server;
            }
        } catch {
            /* serveur pas encore à l'écoute */
        }
        await sleep(250);
    }
    await server.shutdown();
    throw new Error(`Le serveur n'a pas démarré à temps :\n${logs}`);
}
