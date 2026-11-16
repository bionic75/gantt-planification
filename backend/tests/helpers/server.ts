// Démarre l'application dans un processus séparé, sur une base SQLite neuve dans un répertoire temporaire.
// Les tests passent uniquement par HTTP : ils restent valables quelle que soit l'organisation interne du code.
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import net, { type AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './client.ts';
import type { Identifiants } from './fixtures.ts';
import { createDatabase, databaseEnv, dropDatabase, isSqlite, newDatabaseName, TEST_PROVIDER } from './test-db.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADMIN = { username: 'admin', password: 'Admin2025!' };
// URL publique déclarée à l'application (liens des emails), volontairement différente de l'adresse d'écoute
const APP_URL = 'http://planning.test';
/** Point d'entrée du serveur */
const ENTREE = 'server.ts';

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
    return new Promise<number>((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, () => {
            const { port } = srv.address() as AddressInfo;
            srv.close(() => resolve(port));
        });
    });
}

// Version antérieure aux migrations (comparaisons de comportement) : TEST_SERVER_ENTRY autre que server.ts
const isLegacyEntry = () => !!process.env.TEST_SERVER_ENTRY && process.env.TEST_SERVER_ENTRY !== ENTREE;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const definedOnly = (obj: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Record<string, string>;

/** Base PostgreSQL / MariaDB d'un serveur de test (nom conservé dans son répertoire de travail) */
const databaseFile = (workDir: string) => path.join(workDir, 'test-database.txt');
const databaseOf = (workDir: string) =>
    fs.existsSync(databaseFile(workDir)) ? fs.readFileSync(databaseFile(workDir), 'utf8') : null;

/** Applique les migrations sur la base de test (comme « npm start » avant le serveur) */
function migrate(workDir: string) {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-migrate.ts')], {
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

/** Valeur fournie par tests/global-setup.ts, absente hors de Vitest (script de comparaison) */
async function injected(key: 'templateDatabase' | 'templateDbDir'): Promise<string | null> {
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
async function prepareDatabase(workDir: string) {
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

/** Compte administrateur initial sans variables d'environnement */
export const DEFAULT_ADMIN = { username: 'admin', password: 'admin' };

/** Mot de passe initial du compte ADMIN, remplacé par ADMIN.password au démarrage (changement obligatoire) */
const ADMIN_INITIAL = { username: ADMIN.username, password: `${ADMIN.password}-initial` };

/** Serveur de test démarré */
export interface TestServer {
    baseUrl: string;
    appUrl: string;
    /** Journal (sorties standard et d'erreur) du processus serveur */
    readonly logs: string;
    client: () => ReturnType<typeof createClient>;
    shutdown(): Promise<void>;
    /** Redémarre le serveur sur le même port et la même base ; renvoie le nouveau serveur (mêmes clients) */
    restart(): Promise<TestServer>;
    stop(): Promise<void>;
}

/**
 * Le compte administrateur initial doit changer son mot de passe à la première connexion : il prend ici le mot de
 * passe ADMIN.password utilisé par les tests (sans effet si c'est déjà fait : redémarrage, base existante).
 */
async function completeInitialAdmin(server: TestServer) {
    const client = server.client();
    const r = await client.login(ADMIN_INITIAL.username, ADMIN_INITIAL.password, 'admin');
    if (r.status !== 200 || !r.data.user?.mustChangePassword) return;
    const changed = await client.post('/api/profile/change-password', { newPassword: ADMIN.password });
    if (changed.status !== 200) throw new Error(`Changement du mot de passe admin : ${JSON.stringify(changed.data)}`);
    await client.post('/api/logout');
}

/**
 * workDir : répertoire préparé à l'avance (base existante dans workDir/data) ;
 * initialAdmin : compte administrateur initial transmis par INITIAL_ADMIN_USERNAME / _PASSWORD, null pour démarrer
 * sans ces variables (compte par défaut), laissé tel quel (mot de passe à changer). Sans cette option : compte
 * ADMIN prêt à l'emploi.
 */
export async function startServer({
    workDir = createWorkDir(),
    initialAdmin
}: { workDir?: string; initialAdmin?: Identifiants | null } = {}): Promise<TestServer> {
    const standard = initialAdmin === undefined;
    const admin = standard ? ADMIN_INITIAL : initialAdmin;
    try {
        if (isLegacyEntry()) {
            // Ancienne version (comparaisons) : tables créées au démarrage par initDB, dont une partie seulement
            // au démarrage suivant sur une base neuve : deux démarrages successifs
            const first = await bootServer(workDir, undefined, admin);
            await first.shutdown();
        } else {
            await prepareDatabase(workDir);
        }
        const server = await bootServer(workDir, undefined, admin);
        if (standard && !isLegacyEntry()) await completeInitialAdmin(server);
        return server;
    } catch (err) {
        const database = databaseOf(workDir);
        if (database) await dropDatabase(database).catch(() => {});
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        throw err;
    }
}

async function bootServer(
    workDir: string,
    previousPort: number | undefined,
    initialAdmin: Identifiants | null
): Promise<TestServer> {
    const port = previousPort ?? (await freePort());
    const baseUrl = `http://127.0.0.1:${port}`;
    let logs = '';

    // cwd = répertoire temporaire : les fichiers écrits en relatif (./data/pdfs…) restent hors du projet
    // TEST_SERVER_ENTRY : autre point d'entrée (ex. version précédente pour comparer les comportements)
    const entry = path.join(ROOT, process.env.TEST_SERVER_ENTRY || ENTREE);
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
            SESSION_SECRET: 'test-secret-'.padEnd(48, 'x'),
            // API Asana simulée (tests d'import et de rafraîchissement)
            ASANA_API_BASE: process.env.TEST_ASANA_API_BASE,
            INITIAL_ADMIN_USERNAME: initialAdmin?.username,
            INITIAL_ADMIN_PASSWORD: initialAdmin?.password
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', d => (logs += d));
    proc.stderr.on('data', d => (logs += d));

    const server: TestServer = {
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
        async restart() {
            await server.shutdown();
            return bootServer(workDir, port, initialAdmin);
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

    // Prêt quand le compte admin initial (créé de façon asynchrone par initDB) permet de se connecter : avec son
    // mot de passe initial, ou avec ADMIN une fois celui-ci changé (ancienne version : son propre compte, ADMIN)
    const candidates = isLegacyEntry() ? [ADMIN] : [initialAdmin || DEFAULT_ADMIN, ADMIN];
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`Le serveur s'est arrêté (code ${proc.exitCode}) :\n${logs}`);
        try {
            let ready = false;
            for (const admin of candidates) {
                const r = await server.client().login(admin.username, admin.password, 'admin');
                if (r.status === 200) ready = true;
                if (ready || r.status !== 401) break;
            }
            if (ready) {
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
