// Sauvegarde complète / restauration (SQLite) : création, analyse, restauration, historique des migrations conservé
import { afterAll, beforeAll, expect, it } from 'vitest';
import path from 'path';
import Database from 'better-sqlite3';
import { ADMIN, createWorkDir, startServer } from './helpers/server.js';
import { createResource, loginAs } from './helpers/fixtures.js';
import { isSqlite } from './helpers/test-db.js';

let server;
let admin;
const workDir = createWorkDir();

beforeAll(async () => {
    server = await startServer({ workDir });
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const raw = (method, url, { body, headers = {} } = {}) =>
    fetch(server.baseUrl + url, { method, body, headers: { Cookie: admin.cookie, ...headers } });

it.skipIf(!isSqlite)(
    'sauvegarde puis restauration : données remplacées, emails neutralisés, migrations conservées',
    async () => {
        const kept = await createResource(admin, { nom: 'DANSLADUMP' });
        await admin.post('/api/email-config', {
            host: 'smtp.example.test',
            port: 25,
            user: 'u@example.test',
            password: 'p'
        });

        const dl = await raw('GET', '/api/admin/dump');
        expect(dl.status).toBe(200);
        const filename = dl.headers.get('x-dump-filename');
        expect(filename).toMatch(/^gantt-dump_.+\.gpdump$/);
        const dump = Buffer.from(await dl.arrayBuffer());

        // Modifications après la sauvegarde : annulées par la restauration
        await admin.delete(`/api/resources/${kept.id}`);
        const added = await createResource(admin, { nom: 'APRESDUMP' });

        const bad = await raw('POST', '/api/admin/dump/inspect', {
            body: Buffer.from('pas un dump'),
            headers: { 'Content-Type': 'application/octet-stream' }
        });
        expect(bad.status).toBe(400);

        const inspected = await raw('POST', '/api/admin/dump/inspect', {
            body: dump,
            headers: { 'Content-Type': 'application/octet-stream', 'X-Dump-Filename': encodeURIComponent(filename) }
        });
        const info = await inspected.json();
        expect(inspected.status, JSON.stringify(info)).toBe(200);
        expect(info).toMatchObject({ filename, fileSize: dump.length, versionRelation: 0 });
        expect(info.manifest.tables.resources).toBeGreaterThanOrEqual(1);
        expect(info.manifest.tables).not.toHaveProperty('_prisma_migrations');
        expect(info.schemaDiff).toEqual({ onlyInDump: [], onlyLocal: [], columnsIgnored: {}, columnsDefaulted: {} });

        expect((await admin.post('/api/admin/dump/restore', { token: info.token, confirmation: 'autre' })).status).toBe(
            400
        );
        const restored = await admin.post('/api/admin/dump/restore', { token: info.token, confirmation: '127.0.0.1' });
        expect(restored.status, JSON.stringify(restored.data)).toBe(200);
        expect(restored.data).toMatchObject({ success: true, emailsNeutralized: true, relogin: true, pdfs: 0 });
        expect(restored.data.clearedLocalOnly).toEqual([]);

        // Session fermée par la restauration
        admin = await loginAs(server, ADMIN, 'admin');
        const names = (await admin.get('/api/resources')).data.map(r => r.nom);
        expect(names).toContain('DANSLADUMP');
        expect(names).not.toContain('APRESDUMP');
        expect((await admin.get('/api/email-config')).data).toMatchObject({ host: 'smtp.invalid', user: 'disabled' });
        expect(added.id).toBeGreaterThan(0);

        // Historique des migrations intact (le serveur pourra redémarrer sur cette base)
        const db = new Database(path.join(workDir, 'data', 'data.db'), { readonly: true });
        try {
            expect(db.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations').get().n).toBeGreaterThan(0);
        } finally {
            db.close();
        }
    }
);

// PostgreSQL / MariaDB : sauvegarde par les outils de la base (pg_dump, mysqldump)
it.runIf(!isSqlite)('sauvegarde intégrée indisponible hors SQLite', async () => {
    const r = await raw('GET', '/api/admin/dump');
    expect(r.status).toBe(501);
    expect((await r.json()).error).toMatch(/uniquement avec SQLite/);
});
