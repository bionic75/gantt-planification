// Verrou inter-processus (workers Playwright) : une seule connexion avec code OTP à la fois, pour que chaque code
// lu dans la boîte partagée corresponde à la dernière connexion demandée (ordre chronologique des envois).
import fs from 'fs';
import path from 'path';

const STALE_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Exécute fn sous verrou (création atomique d'un répertoire)
 * @template T
 */
export async function sousVerrou<T>(
    lockDir: string,
    fn: () => Promise<T>,
    timeoutMs: number = 10 * 60 * 1000
): Promise<T> {
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    const end = Date.now() + timeoutMs;
    for (;;) {
        try {
            fs.mkdirSync(lockDir);
            break;
        } catch (e: any) {
            if (e.code !== 'EEXIST') throw e;
            // Verrou abandonné par un processus interrompu
            try {
                if (Date.now() - fs.statSync(lockDir).mtimeMs > STALE_MS)
                    fs.rmSync(lockDir, { recursive: true, force: true });
            } catch {
                /* libéré entre-temps */
            }
            if (Date.now() > end)
                throw new Error(`Verrou OTP non obtenu après ${timeoutMs / 1000} s (${lockDir})`, { cause: e });
            await sleep(500);
        }
    }
    try {
        return await fn();
    } finally {
        fs.rmSync(lockDir, { recursive: true, force: true });
    }
}
