// Crée une migration pour les trois fournisseurs (sqlite, postgresql, mysql) à partir des modifications de
// prisma/schema.base.prisma, sans base de données : différence entre le schéma de la dernière migration
// (prisma/<fournisseur>/migrations/schema.snapshot.prisma) et le schéma courant.
//
// Usage : npm run db:migration -- <nom_en_snake_case>
//   1. modifier prisma/schema.base.prisma ;
//   2. npm run db:migration -- ajout_index_xxx ;
//   3. relire les trois migration.sql générés (et les compléter si besoin : données, valeurs par défaut).
import { execFileSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
    console.error('Usage : npm run db:migration -- <nom_en_snake_case>');
    process.exit(2);
}
const require = createRequire(import.meta.url);
const prismaCli = (args, provider) =>
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
        cwd: ROOT,
        env: { ...process.env, DB_PROVIDER: provider },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

// Schémas des trois fournisseurs à jour
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-prisma-schemas.mjs')], { cwd: ROOT, stdio: 'inherit' });

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
let created = 0;
for (const provider of ['sqlite', 'postgresql', 'mysql']) {
    const dir = path.join(ROOT, 'prisma', provider);
    const schema = path.join(dir, 'schema.prisma');
    const snapshot = path.join(dir, 'migrations', 'schema.snapshot.prisma');
    let sql = prismaCli(['migrate', 'diff', '--from-schema', snapshot, '--to-schema', schema, '--script'], provider);
    // MariaDB : collation Unicode 14 (ordre français, comme fr-FR) au lieu de celle choisie par Prisma (Unicode 4.0)
    if (provider === 'mysql') sql = sql.replaceAll('utf8mb4_unicode_ci', 'utf8mb4_uca1400_ai_ci');
    if (!/\S/.test(sql.replace(/^--.*$/gm, ''))) {
        console.log(`${provider} : aucune modification`);
        continue;
    }
    const migrationDir = path.join(dir, 'migrations', `${stamp}_${name}`);
    fs.mkdirSync(migrationDir, { recursive: true });
    fs.writeFileSync(path.join(migrationDir, 'migration.sql'), sql);
    fs.copyFileSync(schema, snapshot);
    console.log(`${provider} : ${path.relative(ROOT, migrationDir)}/migration.sql`);
    created++;
}
if (!created) console.log('Aucune migration créée : le schéma est identique à celui de la dernière migration.');
