// Adoption d'une base SQLite créée par l'ancienne version de l'application (tables créées au démarrage, sans
// historique de migrations). Opération unique :
//   1. sauvegarde de la base (DB_PATH/backups/pre-migrations-<date>.db) ;
//   2. contrôle : aucune colonne ni table inconnue du schéma (elles seraient perdues) ;
//   3. conversion vers le schéma de la migration initiale (tables reconstruites, données copiées) ;
//   4. migration initiale marquée comme appliquée, puis contrôle qu'il ne reste aucun écart.
//
// Usage : npm run db:adopt [-- --dry-run] [-- --drop-tables=t1,t2]
//   --dry-run          : affiche le rapport et le SQL de conversion sans rien modifier
//   --drop-tables=...  : tables inconnues à supprimer (restes d'anciennes migrations), après vérification
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BASELINE, MIGRATIONS_DIR, openSqlite, PROVIDER, prismaCli, sqliteFile, sqliteTables } from './db-common.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DROP = new Set((args.find(a => a.startsWith('--drop-tables=')) || '=').split('=')[1].split(',').filter(Boolean));
const fail = msg => {
    console.error(`❌ ${msg}`);
    process.exit(1);
};

if (PROVIDER !== 'sqlite') fail(`L'adoption concerne les bases SQLite existantes (DB_PROVIDER=${PROVIDER}).`);
const file = sqliteFile();
if (!fs.existsSync(file)) fail(`Base introuvable : ${file}`);

const db = await openSqlite(file);
const tables = sqliteTables(db);
if (tables.includes('_prisma_migrations'))
    fail('Base déjà gérée par les migrations : rien à faire (npm run db:migrate).');

// Schéma cible : base temporaire créée par la migration initiale
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-adopt-'));
const target = await openSqlite(path.join(tmpDir, 'target.db'));
target.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, BASELINE, 'migration.sql'), 'utf8'));
const columns = (d, t) =>
    d
        .prepare(`PRAGMA table_info("${t.replace(/"/g, '""')}")`)
        .all()
        .map(c => c.name);
const targetTables = new Set(sqliteTables(target));
/** Colonnes numériques du schéma cible : table → nom → { type, notnull } */
const numericColumns = {};
for (const t of targetTables) {
    for (const c of target.prepare(`PRAGMA table_info("${t}")`).all()) {
        if (c.type === 'INTEGER' || c.type === 'REAL') (numericColumns[t] ??= {})[c.name] = c;
    }
}

// Contrôle des pertes de données
const problems = [];
// Valeurs mal typées laissées par l'ancien code (SQLite ne type pas strictement les colonnes)
const NUMERIC_TEXT = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;
const conversions = [];
for (const t of tables) {
    if (!targetTables.has(t)) {
        if (!DROP.has(t)) {
            const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get();
            problems.push(
                `table inconnue « ${t} » (${n} ligne(s)) : ajoutez-la au schéma, ou --drop-tables=${t} si c'est un reste à supprimer`
            );
        }
        continue;
    }
    const expected = new Set(columns(target, t));
    for (const c of columns(db, t)) {
        if (!expected.has(c)) {
            problems.push(`colonne inconnue « ${t}.${c} » : à ajouter au schéma avant l'adoption`);
            continue;
        }
        const numeric = numericColumns[t]?.[c];
        if (!numeric) continue;
        const q = `"${c.replace(/"/g, '""')}"`;
        const texts = db
            .prepare(`SELECT DISTINCT ${q} AS v FROM "${t}" WHERE typeof(${q}) = 'text'`)
            .all()
            .map(r => r.v);
        const invalid = texts.filter(v => v.trim() !== '' && !NUMERIC_TEXT.test(v));
        if (numeric.type === 'INTEGER') {
            const decimals = db
                .prepare(
                    `SELECT DISTINCT ${q} AS v FROM "${t}" WHERE typeof(${q}) = 'real' AND ${q} <> CAST(${q} AS INTEGER)`
                )
                .all();
            invalid.push(...decimals.map(r => r.v));
        }
        if (invalid.length) {
            problems.push(
                `valeurs non numériques dans « ${t}.${c} » (${numeric.type}) : ${invalid
                    .slice(0, 5)
                    .map(v => JSON.stringify(v))
                    .join(', ')}${invalid.length > 5 ? '…' : ''} — à corriger avant l'adoption`
            );
        } else if (texts.length) {
            const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE typeof(${q}) = 'text'`).get();
            conversions.push(`${t}.${c} : ${n} valeur(s) texte converties (vide → ${numeric.notnull ? '0' : 'NULL'})`);
        }
    }
}
const missing = [...targetTables].filter(t => !tables.includes(t));
console.log(`Base : ${file}`);
console.log(
    `${tables.length} table(s) existante(s), ${missing.length} à créer${missing.length ? ` (${missing.join(', ')})` : ''}`
);
target.close();
if (problems.length) fail(`Adoption impossible sans perte de données :\n   - ${problems.join('\n   - ')}`);
if (conversions.length) console.log(`Valeurs numériques stockées en texte :\n   - ${conversions.join('\n   - ')}`);

/** Expression de copie d'une colonne : les valeurs numériques stockées en texte sont converties */
function copyExpression(table, column) {
    const q = quote(column);
    const numeric = numericColumns[table]?.[column];
    if (!numeric) return q;
    const empty = numeric.notnull ? '0' : 'NULL';
    return `CASE WHEN typeof(${q}) = 'text' THEN (CASE WHEN trim(${q}) = '' THEN ${empty} ELSE CAST(${q} AS ${numeric.type}) END) ELSE ${q} END`;
}

// Script de conversion : chaque table est reconstruite selon la migration initiale (données copiées),
// puis les index sont recréés. Même méthode que Prisma, appliquée uniformément à toutes les tables.
const baselineSql = fs.readFileSync(path.join(MIGRATIONS_DIR, BASELINE, 'migration.sql'), 'utf8');
const createTables = [...baselineSql.matchAll(/CREATE TABLE "(\w+)" \([\s\S]*?\n\);/g)];
const createIndexes = [...baselineSql.matchAll(/CREATE (?:UNIQUE )?INDEX [^;]+;/g)].map(m => m[0]);
const quote = name => `"${name.replace(/"/g, '""')}"`;
const statements = [...DROP].filter(t => tables.includes(t)).map(t => `DROP TABLE ${quote(t)};`);
for (const [sql, table] of createTables) {
    if (!tables.includes(table)) {
        statements.push(sql);
        continue;
    }
    const tmp = `new_${table}`;
    const shared = columns(db, table);
    statements.push(
        sql.replace(`CREATE TABLE "${table}"`, `CREATE TABLE ${quote(tmp)}`),
        `INSERT INTO ${quote(tmp)} (${shared.map(quote).join(', ')}) SELECT ${shared.map(c => copyExpression(table, c)).join(', ')} FROM ${quote(table)};`,
        `DROP TABLE ${quote(table)};`,
        `ALTER TABLE ${quote(tmp)} RENAME TO ${quote(table)};`
    );
}
statements.push(...createIndexes);
const scriptFile = path.join(tmpDir, 'adopt.sql');
fs.writeFileSync(scriptFile, statements.join('\n\n') + '\n');

if (DRY_RUN) {
    console.log(`\nAucune perte de données détectée. Script de conversion (non appliqué) : ${scriptFile}`);
    db.close();
    process.exit(0);
}

// Sauvegarde cohérente (y compris le journal WAL)
const backupDir = path.join(path.dirname(file), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `pre-migrations-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(backup);
const counts = Object.fromEntries(
    tables.filter(t => targetTables.has(t)).map(t => [t, db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n])
);
console.log(`💾 Sauvegarde : ${backup}`);

// Conversion en une seule transaction (clés étrangères historiques non appliquées, comme l'application)
db.pragma('foreign_keys = OFF');
try {
    db.transaction(() => db.exec(statements.join('\n')))();
} catch (e) {
    db.close();
    fail(`Conversion annulée (base inchangée) : ${e.message}`);
}
db.close();
prismaCli(['migrate', 'resolve', '--applied', BASELINE]);

// Copie de la migration initiale seule, pour comparer la base à son schéma
const baselineDir = path.join(tmpDir, 'migrations');
fs.mkdirSync(path.join(baselineDir, BASELINE), { recursive: true });
fs.copyFileSync(path.join(MIGRATIONS_DIR, 'migration_lock.toml'), path.join(baselineDir, 'migration_lock.toml'));
fs.copyFileSync(
    path.join(MIGRATIONS_DIR, BASELINE, 'migration.sql'),
    path.join(baselineDir, BASELINE, 'migration.sql')
);

// Contrôles : plus aucun écart avec la migration initiale, aucune ligne perdue
const remaining = prismaCli(
    ['migrate', 'diff', '--from-config-datasource', '--to-migrations', baselineDir, '--script'],
    {
        capture: true
    }
);
const check = await openSqlite(file, { readonly: true });
const lost = Object.entries(counts).filter(([t, n]) => check.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n !== n);
check.close();
if (lost.length)
    fail(`Nombre de lignes modifié pour : ${lost.map(([t]) => t).join(', ')}. Restaurez la sauvegarde ${backup}.`);
if (/\b(CREATE|ALTER|DROP)\b/.test(remaining)) {
    fail(`Écart restant après conversion (sauvegarde : ${backup}) :\n${remaining}`);
}
console.log('✅ Base adoptée : schéma conforme à la migration initiale, données conservées.');

// Migrations postérieures à la migration initiale
prismaCli(['migrate', 'deploy']);
