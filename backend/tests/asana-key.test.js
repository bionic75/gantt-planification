// Clé de chiffrement du jeton Asana : fichier DB_PATH/.asana_key, ou clé dérivée de SESSION_SECRET s'il est inaccessible
// (dossier de données appartenant à un autre utilisateur que celui du conteneur)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir;
const saved = { DB_PATH: process.env.DB_PATH, SESSION_SECRET: process.env.SESSION_SECRET };

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asana-key-'));
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    fs.rmSync(dir, { recursive: true, force: true });
});

/** Charge le service avec la configuration voulue (l'environnement est lu une seule fois à l'import) */
async function load({ secret = 'a'.repeat(40) } = {}) {
    process.env.DB_PATH = path.join(dir, 'data');
    if (secret) process.env.SESSION_SECRET = secret;
    else delete process.env.SESSION_SECRET;
    return import('../src/modules/affectation/asana.service.js');
}

describe('clé du jeton Asana', () => {
    it('première utilisation : fichier de clé créé (dossier compris), jeton chiffré puis relu', async () => {
        const svc = await load();
        const blob = svc.asanaEncrypt('jeton-1');
        expect(blob).not.toContain('jeton-1');
        expect(fs.readFileSync(path.join(dir, 'data', '.asana_key'), 'utf8')).toHaveLength(64);
        expect(svc.asanaDecrypt(blob)).toBe('jeton-1');
    });

    it('une clé existante est réutilisée et jamais écrasée', async () => {
        const svc = await load();
        const blob = svc.asanaEncrypt('jeton-1');
        const before = fs.readFileSync(path.join(dir, 'data', '.asana_key'), 'utf8');
        vi.resetModules();
        const again = await load();
        expect(again.asanaDecrypt(blob)).toBe('jeton-1');
        again.asanaEncrypt('autre');
        expect(fs.readFileSync(path.join(dir, 'data', '.asana_key'), 'utf8')).toBe(before);
    });

    it('fichier de clé inaccessible : clé dérivée de SESSION_SECRET, sans erreur, et relue après retour à la normale', async () => {
        const svc = await load();
        const key = path.join(dir, 'data', '.asana_key');
        const old = svc.asanaEncrypt('ancien'); // chiffré avec la clé du fichier
        fs.rmSync(key);
        fs.mkdirSync(key); // illisible comme fichier (EISDIR), quel que soit l'utilisateur
        const blob = svc.asanaEncrypt('nouveau');
        expect(svc.asanaDecrypt(blob)).toBe('nouveau');
        expect(svc.asanaDecrypt(old)).toBeNull(); // clé d'origine inaccessible : à ressaisir
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('inaccessible'));

        // La clé dérivée reste utilisable une fois le fichier de nouveau créé
        fs.rmSync(key, { recursive: true });
        expect(svc.asanaDecrypt(blob)).toBe('nouveau');
        const after = svc.asanaEncrypt('apres');
        expect(svc.asanaDecrypt(after)).toBe('apres');
        expect(svc.asanaDecrypt(blob)).toBe('nouveau');
    });

    it("un fichier de clé invalide n'est pas écrasé", async () => {
        const svc = await load();
        const key = path.join(dir, 'data', '.asana_key');
        fs.mkdirSync(path.dirname(key), { recursive: true });
        fs.writeFileSync(key, 'pas une clé');
        expect(svc.asanaDecrypt(svc.asanaEncrypt('x'))).toBe('x');
        expect(fs.readFileSync(key, 'utf8')).toBe('pas une clé');
    });

    it('sans SESSION_SECRET fixe et sans fichier utilisable : erreur claire (aucune clé éphémère)', async () => {
        const svc = await load({ secret: '' });
        const key = path.join(dir, 'data', '.asana_key');
        fs.mkdirSync(key, { recursive: true });
        expect(() => svc.asanaEncrypt('x')).toThrow(/Clé de chiffrement Asana inaccessible/);
        expect(svc.asanaDecrypt('aa:bb:cc')).toBeNull();
    });
});
