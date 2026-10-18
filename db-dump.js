// db-dump.js — dump complet / restauration de l'application (base SQLite + PDF CRA)
//
// Format .gpdump = gzip( "GPDUMP01" | uint32BE tailleManifest | manifest JSON | octets base SQLite | octets PDF... )
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import sqlite3 from 'sqlite3';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

const MAGIC = 'GPDUMP01';
const FORMAT_VERSION = 1;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const TOKEN_TTL_MS = 30 * 60 * 1000;
const PDF_DIR = './data/pdfs';

let restoreInProgress = false;
export const isRestoreInProgress = () => restoreInProgress;

// token -> { file, manifest, userId, expires }
const pendingUploads = new Map();

const qi = name => `"${String(name).replace(/"/g, '""')}"`;
const sqlStr = s => `'${String(s).replace(/'/g, "''")}'`;

const openDb = (file, mode = sqlite3.OPEN_READWRITE) =>
    new Promise((resolve, reject) => { const d = new sqlite3.Database(file, mode, e => e ? reject(e) : resolve(d)); });
const dbRun = (d, sql, p = []) =>
    new Promise((resolve, reject) => d.run(sql, p, function (e) { e ? reject(e) : resolve(this); }));
const dbAll = (d, sql, p = []) =>
    new Promise((resolve, reject) => d.all(sql, p, (e, r) => e ? reject(e) : resolve(r)));
const dbClose = d => new Promise(resolve => d.close(() => resolve()));

async function listTables(d, schema = 'main') {
    const rows = await dbAll(d, `SELECT name FROM ${schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
    return rows.map(r => r.name);
}

async function tableColumns(d, table, schema = 'main') {
    const rows = await dbAll(d, `PRAGMA ${schema}.table_info(${qi(table)})`);
    return rows.map(r => r.name);
}

async function describeDb(d) {
    const tables = {};
    const schema = {};
    for (const t of await listTables(d)) {
        const [{ n }] = await dbAll(d, `SELECT COUNT(*) AS n FROM ${qi(t)}`);
        tables[t] = n;
        schema[t] = await tableColumns(d, t);
    }
    return { tables, schema };
}

function sha256File(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
}

function parseVersion(v) {
    const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersions(a, b) {
    const pa = parseVersion(a), pb = parseVersion(b);
    if (!pa || !pb) return null;
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    return 0;
}

// Lecteur d'octets exacts au-dessus d'un flux asynchrone
class ByteReader {
    constructor(stream) { this.it = stream[Symbol.asyncIterator](); this.buf = Buffer.alloc(0); this.done = false; }
    async fill() {
        if (this.done) return false;
        const { value, done } = await this.it.next();
        if (done) { this.done = true; return false; }
        this.buf = this.buf.length ? Buffer.concat([this.buf, value]) : value;
        return true;
    }
    async read(n) {
        while (this.buf.length < n && await this.fill());
        const out = this.buf.subarray(0, n);
        this.buf = this.buf.subarray(n);
        return out;
    }
    // Écrit exactement n octets dans un fichier, renvoie { bytes, sha256 }
    async copyTo(file, n) {
        const hash = crypto.createHash('sha256');
        const fh = await fs.promises.open(file, 'w');
        let remaining = n, written = 0;
        try {
            while (remaining > 0) {
                if (!this.buf.length && !await this.fill()) break;
                const take = this.buf.subarray(0, Math.min(remaining, this.buf.length));
                this.buf = this.buf.subarray(take.length);
                await fh.write(take);
                hash.update(take);
                remaining -= take.length;
                written += take.length;
            }
        } finally { await fh.close(); }
        return { bytes: written, sha256: hash.digest('hex') };
    }
}

function openContainer(file) {
    const src = fs.createReadStream(file);
    const gunzip = zlib.createGunzip();
    src.on('error', e => gunzip.destroy(e));
    src.pipe(gunzip);
    const reader = new ByteReader(gunzip);
    const close = () => { src.destroy(); gunzip.destroy(); };
    return { reader, close };
}

async function readManifest(reader) {
    const head = await reader.read(12);
    if (head.length < 12 || head.subarray(0, 8).toString('ascii') !== MAGIC) {
        throw new Error('Fichier invalide : ce n\'est pas un dump de l\'application.');
    }
    const len = head.readUInt32BE(8);
    if (len < 2 || len > 10 * 1024 * 1024) throw new Error('Fichier invalide : en-tête corrompu.');
    const raw = await reader.read(len);
    if (raw.length < len) throw new Error('Fichier tronqué.');
    const manifest = JSON.parse(raw.toString('utf8'));
    if (manifest.format !== FORMAT_VERSION) throw new Error(`Format de dump non supporté (${manifest.format}).`);
    return manifest;
}

async function* containerChunks(manifest, dbPath, pdfFiles) {
    const m = Buffer.from(JSON.stringify(manifest), 'utf8');
    const head = Buffer.alloc(12);
    head.write(MAGIC, 0, 'ascii');
    head.writeUInt32BE(m.length, 8);
    yield head;
    yield m;
    yield* fs.createReadStream(dbPath);
    for (const f of pdfFiles) yield* fs.createReadStream(f.path);
}

const friendlyError = e => String(e.code || '').startsWith('Z_')
    ? 'Fichier invalide ou corrompu (archive illisible ou tronquée).'
    : e.message;

function rmQuiet(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ignore */ } }

function purgeExpiredUploads() {
    const now = Date.now();
    for (const [token, u] of pendingUploads) {
        if (u.expires < now) { rmQuiet(u.file); pendingUploads.delete(token); }
    }
}

export function registerDumpRoutes(app, ctx) {
    const { database, DB_FILE, DB_DIR, requireAdmin, logUserAction, reloadEmailConfig, afterRestore } = ctx;

    // Purge au démarrage des envois orphelins (redémarrage entre analyse et restauration)
    try {
        for (const f of fs.readdirSync(os.tmpdir())) {
            if (f.startsWith('gpdump-upload-')) rmQuiet(path.join(os.tmpdir(), f));
        }
    } catch (e) { /* ignore */ }

    const getAppVersion = () => new Promise(resolve => {
        database.get('SELECT value FROM settings WHERE key = ?', ['app_version'], (e, row) => resolve(row ? row.value : null));
    });

    async function snapshotTo(target) {
        await new Promise((resolve, reject) => database.run(`VACUUM INTO ${sqlStr(target)}`, e => e ? reject(e) : resolve()));
    }

    async function currentState() {
        const d = await openDb(DB_FILE, sqlite3.OPEN_READONLY);
        try {
            const info = await describeDb(d);
            return { ...info, dbSize: fs.statSync(DB_FILE).size, appVersion: await getAppVersion() };
        } finally { await dbClose(d); }
    }

    // ---------- Création du dump ----------
    app.get('/api/admin/dump', requireAdmin, async (req, res) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpdump-'));
        const cleanup = () => rmQuiet(tmpDir);
        try {
            const snapshot = path.join(tmpDir, 'snapshot.db');
            await snapshotTo(snapshot);
            const sd = await openDb(snapshot, sqlite3.OPEN_READONLY);
            let info;
            try { info = await describeDb(sd); } finally { await dbClose(sd); }

            const pdfFiles = [];
            if (fs.existsSync(PDF_DIR)) {
                for (const name of fs.readdirSync(PDF_DIR)) {
                    const p = path.join(PDF_DIR, name);
                    const st = fs.statSync(p);
                    if (st.isFile() && name.toLowerCase().endsWith('.pdf')) pdfFiles.push({ name, size: st.size, path: p });
                }
            }

            const appVersion = await getAppVersion();
            const createdAt = new Date().toISOString();
            const manifest = {
                format: FORMAT_VERSION,
                appVersion,
                createdAt,
                createdBy: { id: req.session.userId, nom: [req.session.prenom, req.session.nom].filter(Boolean).join(' ') || req.session.username || null },
                source: { hostname: os.hostname(), host: req.headers.host || null, node: process.version, platform: process.platform },
                db: { size: fs.statSync(snapshot).size, sha256: await sha256File(snapshot) },
                tables: info.tables,
                schema: info.schema,
                totalRows: Object.values(info.tables).reduce((a, b) => a + b, 0),
                files: pdfFiles.map(f => ({ name: f.name, size: f.size }))
            };

            const out = path.join(tmpDir, 'dump.gpdump');
            await pipeline(Readable.from(containerChunks(manifest, snapshot, pdfFiles)), zlib.createGzip({ level: 6 }), fs.createWriteStream(out));

            const stamp = createdAt.replace(/[:.]/g, '-').slice(0, 19);
            const filename = `gantt-dump_${appVersion || 'vX'}_${stamp}.gpdump`;
            logUserAction(req, 'Création dump complet', { appVersion, size: fs.statSync(out).size, tables: Object.keys(info.tables).length, pdfs: pdfFiles.length });
            res.setHeader('X-Dump-Filename', filename);
            res.setHeader('Access-Control-Expose-Headers', 'X-Dump-Filename, Content-Disposition');
            res.download(out, filename, cleanup);
        } catch (e) {
            cleanup();
            console.error('❌ Erreur création dump:', e);
            if (!res.headersSent) res.status(500).json({ error: `Erreur lors de la création du dump : ${e.message}` });
        }
    });

    // ---------- Analyse d'un dump envoyé (avant restauration) ----------
    app.post('/api/admin/dump/inspect', requireAdmin, async (req, res) => {
        purgeExpiredUploads();
        if (restoreInProgress) return res.status(409).json({ error: 'Une restauration est déjà en cours.' });
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'Fichier trop volumineux (max 2 Go).' });

        const token = crypto.randomBytes(16).toString('hex');
        const file = path.join(os.tmpdir(), `gpdump-upload-${token}.gpdump`);
        let size = 0;
        const limiter = new Transform({
            transform(chunk, _enc, cb) {
                size += chunk.length;
                size > MAX_UPLOAD_BYTES ? cb(new Error('Fichier trop volumineux (max 2 Go).')) : cb(null, chunk);
            }
        });
        let origName = 'dump.gpdump';
        try { origName = decodeURIComponent(req.headers['x-dump-filename'] || origName); } catch (e) { /* ignore */ }

        try {
            await pipeline(req, limiter, fs.createWriteStream(file));
            const { reader, close } = openContainer(file);
            let manifest;
            try { manifest = await readManifest(reader); } finally { close(); }

            const cur = await currentState();
            const warnings = [];
            const rel = compareVersions(manifest.appVersion, cur.appVersion);
            if (rel === 1) warnings.push({ level: 'danger', text: `Le dump vient d'une version plus récente (${manifest.appVersion}) que le code de ce serveur (${cur.appVersion}) : les tables/colonnes inconnues seront ignorées.` });
            else if (rel === -1) warnings.push({ level: 'warn', text: `Le dump vient d'une version plus ancienne (${manifest.appVersion}) que ce serveur (${cur.appVersion}) : les colonnes manquantes prendront leur valeur par défaut.` });
            else if (rel === null) warnings.push({ level: 'warn', text: 'Version du dump ou du serveur illisible : compatibilité non vérifiable.' });

            const ageDays = (Date.now() - new Date(manifest.createdAt).getTime()) / 86400000;
            if (ageDays > 7) warnings.push({ level: 'info', text: `Dump réalisé il y a ${Math.floor(ageDays)} jours.` });
            if (manifest.source?.hostname && manifest.source.hostname === os.hostname()) {
                warnings.push({ level: 'danger', text: `Ce serveur (${os.hostname()}) semble être celui qui a produit le dump. Vérifiez que vous n'êtes PAS sur la production.` });
            }
            const localRows = Object.values(cur.tables).reduce((a, b) => a + b, 0);
            warnings.push({ level: 'danger', text: `Les ${localRows} lignes de la base actuelle de ce serveur seront REMPLACÉES (une sauvegarde de sécurité est créée avant).` });

            const schemaDiff = { onlyInDump: [], onlyLocal: [], columnsIgnored: {}, columnsDefaulted: {} };
            for (const t of Object.keys(manifest.schema || {})) {
                if (!cur.schema[t]) { schemaDiff.onlyInDump.push(t); continue; }
                const ign = manifest.schema[t].filter(c => !cur.schema[t].includes(c));
                const def = cur.schema[t].filter(c => !manifest.schema[t].includes(c));
                if (ign.length) schemaDiff.columnsIgnored[t] = ign;
                if (def.length) schemaDiff.columnsDefaulted[t] = def;
            }
            for (const t of Object.keys(cur.schema)) if (!manifest.schema?.[t]) schemaDiff.onlyLocal.push(t);

            pendingUploads.set(token, { file, manifest, userId: req.session.userId, expires: Date.now() + TOKEN_TTL_MS });
            res.json({
                token,
                filename: origName,
                fileSize: size,
                manifest: { ...manifest, schema: undefined },
                current: { appVersion: cur.appVersion, tables: cur.tables, dbSize: cur.dbSize, hostname: req.hostname, serverHostname: os.hostname() },
                schemaDiff,
                warnings,
                versionRelation: rel,
                expiresInSec: TOKEN_TTL_MS / 1000
            });
        } catch (e) {
            rmQuiet(file);
            console.error('❌ Erreur analyse dump:', e.message);
            if (!res.headersSent) res.status(400).json({ error: friendlyError(e) });
        }
    });

    // ---------- Restauration ----------
    app.post('/api/admin/dump/restore', requireAdmin, async (req, res) => {
        const { token, confirmation, options = {} } = req.body || {};
        const up = pendingUploads.get(token);
        if (!up || up.userId !== req.session.userId || up.expires < Date.now()) {
            return res.status(400).json({ error: 'Dump expiré ou introuvable : rechargez le fichier.' });
        }
        if (confirmation !== req.hostname) {
            return res.status(400).json({ error: `Confirmation incorrecte : saisissez exactement « ${req.hostname} ».` });
        }
        if (restoreInProgress) return res.status(409).json({ error: 'Une restauration est déjà en cours.' });

        restoreInProgress = true;
        const t0 = Date.now();
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gprestore-'));
        let main = null;
        try {
            // 1. Extraction + vérification d'intégrité (aucune modification de la base à ce stade)
            const { reader, close } = openContainer(up.file);
            const extractedPdfs = [];
            const dumpDb = path.join(workDir, 'dump.db');
            try {
                const manifest = await readManifest(reader);
                const r = await reader.copyTo(dumpDb, manifest.db.size);
                if (r.bytes !== manifest.db.size || r.sha256 !== manifest.db.sha256) throw new Error('Dump corrompu : empreinte de la base invalide.');
                fs.mkdirSync(path.join(workDir, 'pdfs'), { recursive: true });
                for (const f of manifest.files || []) {
                    if (path.basename(f.name) !== f.name || !f.name.toLowerCase().endsWith('.pdf')) throw new Error(`Nom de fichier PDF invalide dans le dump : ${f.name}`);
                    const dest = path.join(workDir, 'pdfs', f.name);
                    const pr = await reader.copyTo(dest, f.size);
                    if (pr.bytes !== f.size) throw new Error(`Dump tronqué : PDF ${f.name} incomplet.`);
                    extractedPdfs.push({ name: f.name, path: dest });
                }
            } finally { close(); }

            const chk = await openDb(dumpDb, sqlite3.OPEN_READONLY);
            try {
                const [{ quick_check }] = await dbAll(chk, 'PRAGMA quick_check(1)');
                if (quick_check !== 'ok') throw new Error(`Base du dump invalide (quick_check : ${quick_check}).`);
            } finally { await dbClose(chk); }

            // 2. Sauvegarde de sécurité de la base actuelle
            const backupDir = path.join(DB_DIR, 'restore-backups');
            fs.mkdirSync(backupDir, { recursive: true });
            const safetyBackup = path.join(backupDir, `pre-restore_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
            await snapshotTo(safetyBackup);

            // 3. Copie transactionnelle sur une connexion dédiée
            const localVersion = await getAppVersion();
            main = await openDb(DB_FILE);
            await dbRun(main, 'PRAGMA busy_timeout = 30000');
            await dbRun(main, 'PRAGMA foreign_keys = OFF');
            await dbRun(main, `ATTACH DATABASE ${sqlStr(dumpDb)} AS src`);
            const report = { restored: {}, clearedLocalOnly: [], skippedDumpOnly: [] };
            await dbRun(main, 'BEGIN IMMEDIATE');
            try {
                const localTables = await listTables(main, 'main');
                const dumpTables = await listTables(main, 'src');
                for (const t of localTables) await dbRun(main, `DELETE FROM main.${qi(t)}`);
                for (const t of localTables) {
                    if (!dumpTables.includes(t)) { report.clearedLocalOnly.push(t); continue; }
                    const lc = await tableColumns(main, t, 'main');
                    const dc = await tableColumns(main, t, 'src');
                    const cols = lc.filter(c => dc.includes(c)).map(qi).join(', ');
                    if (!cols) continue;
                    try {
                        await dbRun(main, `INSERT INTO main.${qi(t)} (${cols}) SELECT ${cols} FROM src.${qi(t)}`);
                    } catch (e) { throw new Error(`Table « ${t} » : ${e.message}`); }
                    const [{ n }] = await dbAll(main, `SELECT COUNT(*) AS n FROM main.${qi(t)}`);
                    report.restored[t] = n;
                }
                report.skippedDumpOnly = dumpTables.filter(t => !localTables.includes(t));

                const seqTables = (await dbAll(main, `SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'`)).length;
                const seqSrc = (await dbAll(main, `SELECT name FROM src.sqlite_master WHERE name = 'sqlite_sequence'`)).length;
                if (seqTables && seqSrc) {
                    await dbRun(main, 'DELETE FROM main.sqlite_sequence');
                    await dbRun(main, 'INSERT INTO main.sqlite_sequence (name, seq) SELECT name, seq FROM src.sqlite_sequence WHERE name IN (SELECT name FROM main.sqlite_master)');
                }

                if (localVersion) await dbRun(main, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['app_version', localVersion]);

                if (options.neutralizeEmails !== false) {
                    await dbRun(main, 'DELETE FROM main.email_queue');
                    await dbRun(main, `UPDATE main.email_config SET host = 'smtp.invalid', user = 'disabled', password = ''`);
                    report.emailsNeutralized = true;
                }
                await dbRun(main, 'COMMIT');
            } catch (e) {
                await dbRun(main, 'ROLLBACK').catch(() => {});
                throw e;
            } finally {
                await dbRun(main, 'DETACH DATABASE src').catch(() => {});
            }
            await dbClose(main);
            main = null;

            // 4. PDF
            let pdfCount = 0;
            if (options.restorePdfs !== false && extractedPdfs.length) {
                fs.mkdirSync(PDF_DIR, { recursive: true });
                for (const f of extractedPdfs) { fs.copyFileSync(f.path, path.join(PDF_DIR, f.name)); pdfCount++; }
            }

            // 5. État en mémoire du serveur
            reloadEmailConfig?.();
            try { await afterRestore?.(); } catch (e) { console.error('Après restauration :', e.message); } // ex. types d'événements d'un dump ancien
            logUserAction(req, 'Restauration dump', { appVersion: up.manifest.appVersion, createdAt: up.manifest.createdAt, safetyBackup });

            pendingUploads.delete(token);
            rmQuiet(up.file);
            const payload = {
                success: true,
                durationMs: Date.now() - t0,
                safetyBackup: path.resolve(safetyBackup),
                rows: Object.values(report.restored).reduce((a, b) => a + b, 0),
                tables: Object.keys(report.restored).length,
                pdfs: pdfCount,
                clearedLocalOnly: report.clearedLocalOnly,
                skippedDumpOnly: report.skippedDumpOnly,
                emailsNeutralized: !!report.emailsNeutralized,
                relogin: true
            };
            req.session.destroy(() => res.json(payload));
        } catch (e) {
            console.error('❌ Erreur restauration dump:', e);
            if (main) await dbClose(main).catch(() => {});
            res.status(500).json({ error: `Restauration annulée (base inchangée) : ${friendlyError(e)}` });
        } finally {
            restoreInProgress = false;
            rmQuiet(workDir);
        }
    });

    app.delete('/api/admin/dump/upload/:token', requireAdmin, (req, res) => {
        const up = pendingUploads.get(req.params.token);
        if (up && up.userId === req.session.userId) { rmQuiet(up.file); pendingUploads.delete(req.params.token); }
        res.json({ success: true });
    });
}
