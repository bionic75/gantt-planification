// @ts-check
// Verrou inter-processus (workers Playwright) : une seule connexion avec code OTP à la fois, pour que chaque code
// lu dans la boîte partagée corresponde à la dernière connexion demandée (ordre chronologique des envois).
import fs from 'fs';
import path from 'path';

const STALE_MS = 5 * 60 * 1000;
const sleep = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));

/**
 * Exécute fn sous verrou (création atomique d'un répertoire)
 * @template T
 * @param {string} lockDir
 * @param {() => Promise<T>} fn
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
export async function sousVerrou(lockDir, fn, timeoutMs = 10 * 60 * 1000) {
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    const end = Date.now() + timeoutMs;
    for (;;) {
        try {
            fs.mkdirSync(lockDir);
            break;
        } catch (/** @type {any} */ e) {
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
