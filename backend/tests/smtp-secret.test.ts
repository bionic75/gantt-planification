// Audit de sécurité, lot 2 : mot de passe SMTP chiffré en base (comme le jeton Asana), donc absent en clair des
// sauvegardes ; une valeur en clair d'une version précédente est chiffrée au démarrage
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ADMIN, createWorkDir, startServer } from './helpers/server.ts';
import { loginAs } from './helpers/fixtures.ts';
import { isSqlite } from './helpers/test-db.ts';
import type { TestServer } from './helpers/server.ts';
import type { Client } from './helpers/client.ts';

let server: TestServer;
let admin: Client;
const workDir = createWorkDir();
const dbFile = path.join(workDir, 'data', 'data.db');
const ENCRYPTED = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

beforeAll(async () => {
    server = await startServer({ workDir });
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

/** Mot de passe tel qu'il est stocké dans la table email_config */
function stored(): string {
    const db: any = new Database(dbFile, { readonly: true });
    try {
        return db.prepare('SELECT password FROM email_config WHERE id = 1').get().password;
    } finally {
        db.close();
    }
}

function store(password: string) {
    const db: any = new Database(dbFile);
    try {
        db.prepare('UPDATE email_config SET password = ? WHERE id = 1').run(password);
    } finally {
        db.close();
    }
}

const smtp = { host: 'smtp.example.test', port: 2525, secure: false, user: 'robot@example.test' };

it.skipIf(!isSqlite)(
    'chiffré à l’enregistrement, chiffré au démarrage s’il est en clair, illisible avec une autre clé',
    async () => {
        expect((await admin.post('/api/email-config', { ...smtp, password: 'secret-smtp' })).status).toBe(200);
        expect(stored()).toMatch(ENCRYPTED);
        expect(stored()).not.toContain('secret-smtp');

        // Enregistrement sans ressaisie : la valeur relue (déchiffrée) est de nouveau chiffrée
        expect((await admin.post('/api/email-config', { ...smtp, port: 2526, password: '' })).status).toBe(200);
        expect(stored()).toMatch(ENCRYPTED);
        expect((await admin.get('/api/email-config')).data).toMatchObject({ port: 2526, passwordSet: true });

        // Valeur en clair (version précédente) : chiffrée au démarrage, toujours utilisable
        store('ancien-en-clair');
        server = await server.restart();
        expect(stored()).toMatch(ENCRYPTED);
        expect(server.logs).toContain('Mot de passe SMTP chiffré en base');
        admin = await loginAs(server, ADMIN, 'admin');
        expect((await admin.get('/api/email-config')).data).toMatchObject({ passwordSet: true });

        // Autre serveur (autre clé) : mot de passe illisible, à ressaisir
        fs.writeFileSync(path.join(workDir, 'data', '.asana_key'), crypto.randomBytes(32).toString('hex'));
        server = await server.restart();
        admin = await loginAs(server, ADMIN, 'admin');
        expect((await admin.get('/api/email-config')).data).toMatchObject({ passwordSet: false });
        expect((await admin.post('/api/email-config', { ...smtp, password: '' })).status).toBe(400);
    }
);
