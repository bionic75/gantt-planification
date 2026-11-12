// Transfert des données d'une base SQLite de l'application vers la base PostgreSQL / MariaDB configurée
// (DB_PROVIDER, DATABASE_URL ou DB_HOST / DB_NAME / DB_USER / DB_PASSWORD).
//
// Usage : npm run db:transfer -- --from=<fichier data.db> [--replace]
//   La base cible doit avoir été créée par les migrations (npm run db:migrate) et être vide,
//   ou --replace : son contenu est d'abord supprimé.
//   La base source doit être au même niveau de migrations (adoption puis npm run db:migrate sur la copie SQLite).
// Les PDF des CRA (DB_PATH/../data/pdfs) sont des fichiers : à copier à part.
import fs from 'fs';
import path from 'path';
import { openSqlite, PROVIDER, ROOT } from './db-common.mjs';

const args = process.argv.slice(2);
const option = name => (args.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || null;
const REPLACE = args.includes('--replace');
const CHUNK = 500;

const fail = msg => {
    console.error(`❌ ${msg}`);
    process.exit(1);
};

if (PROVIDER === 'sqlite')
    fail('Base cible SQLite : définir DB_PROVIDER=postgresql ou mysql (et la connexion) pour le transfert.');
const from = option('from');
if (!from) fail('Base source manquante : --from=<chemin du fichier data.db>');
if (!fs.existsSync(from)) fail(`Base source introuvable : ${from}`);

// Modèles du schéma : nom Prisma, table, type de chaque colonne (schéma commun aux trois bases)
function readModels() {
    const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.base.prisma'), 'utf8').replace(/\r\n/g, '\n');
    return [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)].map(([, name, body]) => {
        const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] || name;
        const fields = {};
        for (const [, field, type] of body.matchAll(/^\s+(\w+)\s+(Int|Float|String|Boolean|BigInt)\??/gm)) {
            fields[field] = type;
        }
        return { name, table, fields, delegate: name[0].toLowerCase() + name.slice(1) };
    });
}

/** Valeur SQLite convertie au type Prisma de la colonne */
function convert(value, type) {
    if (value === null || value === undefined) return null;
    if (type === 'Int') return Math.trunc(Number(value));
    if (type === 'Float') return Number(value);
    if (type === 'Boolean') return Boolean(value);
    if (type === 'BigInt') return BigInt(value);
    return String(value);
}

const source = await openSqlite(path.resolve(from), { readonly: true });
const sourceTables = new Set(
    source
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(r => r.name)
);
if (!sourceTables.has('_prisma_migrations')) {
    fail("La base source n'est pas gérée par les migrations : adoptez-la d'abord (npm run db:adopt, sur une copie).");
}

const { prisma } = await import('../src/db/prisma.js');
const applied = async rows => new Set(rows.map(r => r.migration_name));
const sourceMigrations = await applied(
    source
        .prepare(
            'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
        )
        .all()
);
let targetMigrations;
try {
    targetMigrations = await applied(
        await prisma.$queryRawUnsafe(
            'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
        )
    );
} catch {
    fail("Base cible non initialisée : appliquez d'abord les migrations (npm run db:migrate).");
}
const missingInTarget = [...sourceMigrations].filter(m => !targetMigrations.has(m));
const missingInSource = [...targetMigrations].filter(m => !sourceMigrations.has(m));
if (missingInTarget.length || missingInSource.length) {
    fail(
        `Les deux bases ne sont pas au même niveau de migrations.\n` +
            (missingInTarget.length
                ? `   Absentes de la cible : ${missingInTarget.join(', ')} (npm run db:migrate sur la cible)\n`
                : '') +
            (missingInSource.length
                ? `   Absentes de la source : ${missingInSource.join(', ')} (npm run db:migrate sur la copie SQLite)`
                : '')
    );
}

// Sessions ouvertes : propres au serveur d'origine, non transférées
const models = readModels().filter(m => m.table !== 'sessions');
const counts = {};
for (const m of models) counts[m.name] = await prisma[m.delegate].count();
const nonEmpty = models.filter(m => counts[m.name] > 0);
if (nonEmpty.length && !REPLACE) {
    fail(
        `La base cible contient déjà des données (${nonEmpty.map(m => m.table).join(', ')}).\n` +
            '   Relancez avec --replace pour les remplacer.'
    );
}
if (REPLACE) {
    for (const m of models) await prisma[m.delegate].deleteMany();
    console.log('🗑️  Contenu de la base cible supprimé');
}

console.log(`Transfert ${path.resolve(from)} → ${PROVIDER}`);
const report = [];
for (const m of models) {
    if (!sourceTables.has(m.table)) {
        report.push({ table: m.table, rows: 0, note: 'absente de la source' });
        continue;
    }
    const columns = Object.keys(m.fields);
    const select = source.prepare(`SELECT ${columns.map(c => `"${c}"`).join(', ')} FROM "${m.table}" ORDER BY rowid`);
    let batch = [];
    let total = 0;
    const flush = async () => {
        if (!batch.length) return;
        try {
            await prisma[m.delegate].createMany({ data: batch });
        } catch (e) {
            fail(`Table « ${m.table} » : ${e.message}\n   Corrigez la donnée en cause puis relancez avec --replace.`);
        }
        total += batch.length;
        batch = [];
    };
    for (const row of select.iterate()) {
        batch.push(Object.fromEntries(columns.map(c => [c, convert(row[c], m.fields[c])])));
        if (batch.length >= CHUNK) await flush();
    }
    await flush();
    const copied = await prisma[m.delegate].count();
    if (copied !== total) fail(`Table « ${m.table} » : ${total} ligne(s) lues, ${copied} présente(s) dans la cible.`);
    report.push({ table: m.table, rows: total });

    // PostgreSQL : compteur d'identifiants recalé sur le plus grand identifiant copié
    // (MariaDB le fait d'elle-même à l'insertion d'identifiants explicites)
    if (PROVIDER === 'postgresql' && m.fields.id === 'Int' && total) {
        await prisma.$executeRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('"${m.table}"', 'id'), (SELECT MAX(id) FROM "${m.table}"))`
        );
    }
}
source.close();
await prisma.$disconnect();

const rows = report.reduce((n, r) => n + r.rows, 0);
for (const r of report)
    if (r.rows || r.note)
        console.log(`   ${r.table.padEnd(36)} ${String(r.rows).padStart(7)}${r.note ? `  (${r.note})` : ''}`);
console.log(`✅ ${rows} ligne(s) transférée(s) dans ${report.filter(r => r.rows).length} table(s).`);
console.log('   Les PDF des CRA (répertoire data/pdfs) sont à copier à part.');
