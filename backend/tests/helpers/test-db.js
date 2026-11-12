// Bases de test PostgreSQL / MariaDB : une base par serveur de test, créée puis supprimée.
//   TEST_DB_PROVIDER  : sqlite (défaut), postgresql ou mysql
//   TEST_DATABASE_URL : connexion d'administration au serveur (droit de créer des bases), par exemple
//                       postgresql://planning:planning@localhost:5432/postgres ou mysql://root:secret@localhost:3306/mysql
// Le client Prisma doit avoir été généré pour ce fournisseur : DB_PROVIDER=<fournisseur> npm run db:generate
import crypto from 'crypto';

export const TEST_PROVIDER = process.env.TEST_DB_PROVIDER || 'sqlite';
export const isSqlite = TEST_PROVIDER === 'sqlite';

function adminUrl() {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error(`TEST_DATABASE_URL obligatoire avec TEST_DB_PROVIDER=${TEST_PROVIDER}`);
    return url;
}

/** URL de connexion à une base du serveur de test */
export function databaseUrl(name) {
    const url = new URL(adminUrl());
    url.pathname = `/${name}`;
    return url.toString();
}

/** Nom de base unique */
export const newDatabaseName = prefix => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

/** Exécute des requêtes d'administration (création / suppression de bases) */
async function admin(statements) {
    if (TEST_PROVIDER === 'postgresql') {
        const { default: pg } = await import('pg');
        const client = new pg.Client({ connectionString: adminUrl() });
        await client.connect();
        try {
            for (const sql of statements) await client.query(sql);
        } finally {
            await client.end();
        }
    } else {
        const { default: mariadb } = await import('mariadb');
        const conn = await mariadb.createConnection(adminUrl().replace(/^mysql:/, 'mariadb:'));
        try {
            for (const sql of statements) await conn.query(sql);
        } finally {
            await conn.end();
        }
    }
}

/** Crée une base vide, ou copie d'une base modèle (PostgreSQL) */
export function createDatabase(name, template) {
    return admin([
        TEST_PROVIDER === 'postgresql' && template
            ? `CREATE DATABASE "${name}" TEMPLATE "${template}"`
            : `CREATE DATABASE ${TEST_PROVIDER === 'postgresql' ? `"${name}"` : `\`${name}\``}`
    ]);
}

export function dropDatabase(name) {
    return admin([
        TEST_PROVIDER === 'postgresql'
            ? `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`
            : `DROP DATABASE IF EXISTS \`${name}\``
    ]);
}

/** Variables d'environnement de connexion d'un serveur (ou de la CLI) à une base de test */
export const databaseEnv = name => (isSqlite ? {} : { DB_PROVIDER: TEST_PROVIDER, DATABASE_URL: databaseUrl(name) });
