// Démarre l'application dans un processus séparé, sur une base SQLite neuve dans un répertoire temporaire.
// Les tests passent uniquement par HTTP : ils restent valables quelle que soit l'organisation interne du code.
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './client.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADMIN = { username: 'admin', password: 'Admin2025!' };

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// initDB lance ses CREATE TABLE / ALTER TABLE sans les enchaîner : sur une base neuve, une partie des
// colonnes n'est créée qu'au démarrage suivant. On démarre donc deux fois sur la même base, comme une
// installation existante. (Corrigé par les migrations Prisma en phase 2.)
export async function startServer() {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-test-'));
    try {
        const first = await bootServer(workDir);
        await first.shutdown();
        return await bootServer(workDir);
    } catch (err) {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        throw err;
    }
}

async function bootServer(workDir) {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let logs = '';

    // cwd = répertoire temporaire : les fichiers écrits en relatif (./data/pdfs…) restent hors du projet
    const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: workDir,
        env: {
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            NODE_ENV: 'test',
            PORT: String(port),
            DB_PATH: path.join(workDir, 'data'),
            SESSION_SECRET: 'test-secret-'.padEnd(48, 'x')
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', d => (logs += d));
    proc.stderr.on('data', d => (logs += d));

    const server = {
        baseUrl,
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
                // Laisse initDB terminer ses migrations asynchrones
                await sleep(500);
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
