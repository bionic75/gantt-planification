// Base modèle créée une seule fois par les migrations, copiée pour chaque serveur de test
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default function setup({ provide }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-test-template-'));
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-migrate.mjs')], {
        cwd: ROOT,
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, DB_PATH: dir },
        stdio: 'pipe'
    });
    provide('templateDbDir', dir);
    return () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
