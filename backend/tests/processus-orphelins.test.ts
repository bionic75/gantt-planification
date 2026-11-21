// Un serveur de test ne doit jamais survivre à son lanceur ni boucler quand ses tubes de sortie sont fermés
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { startServer } from './helpers/server.ts';

const LANCEUR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lanceur-orphelin.ts');
const vivant = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};
async function attendreFin(pid: number, delaiMs: number) {
    const limite = Date.now() + delaiMs;
    while (vivant(pid) && Date.now() < limite) await new Promise(r => setTimeout(r, 200));
    return !vivant(pid);
}

describe('serveurs de test orphelins', () => {
    it('le serveur se termine seul quand son lanceur est tué', async () => {
        const lanceur = spawn(process.execPath, [LANCEUR], { stdio: ['ignore', 'pipe', 'inherit'] });
        const [pid, workDir] = await new Promise<[number, string]>((resolve, reject) => {
            let sortie = '';
            lanceur.stdout.on('data', d => {
                sortie += d;
                const m = /^(\d+) (.+)$/m.exec(sortie);
                if (m) resolve([Number(m[1]), m[2]]);
            });
            lanceur.once('exit', () => reject(new Error(`Lanceur arrêté :\n${sortie}`)));
        });
        try {
            expect(vivant(pid)).toBe(true);
            lanceur.kill('SIGKILL');
            expect(await attendreFin(pid, 10000)).toBe(true);
        } finally {
            if (vivant(pid)) process.kill(pid, 'SIGKILL');
            fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
    }, 90000);

    it('tube de sortie fermé (EPIPE) : le serveur quitte au lieu de boucler', async () => {
        const server = await startServer();
        const pid = server.pid as number;
        try {
            server.closeOutputs();
            // Toute requête journalisée écrit sur le tube fermé
            for (let i = 0; i < 20 && vivant(pid); i++) {
                await server
                    .client()
                    .login('inconnu', 'x', 'admin')
                    .catch(() => {});
                await new Promise(r => setTimeout(r, 250));
            }
            expect(await attendreFin(pid, 5000)).toBe(true);
        } finally {
            if (vivant(pid)) process.kill(pid, 'SIGKILL');
            await server.stop();
        }
    }, 90000);
});
