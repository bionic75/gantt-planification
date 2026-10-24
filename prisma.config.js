// Configuration de la CLI Prisma (génération du client, migrations).
// La base cible est choisie par DB_PROVIDER (sqlite | postgresql | mysql) et DATABASE_URL (voir .env.example).
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/config/database-url.js';

dotenv.config({ quiet: true });
const provider = process.env.DB_PROVIDER || 'sqlite';

export default defineConfig({
    // Schémas générés depuis prisma/schema.base.prisma (npm run db:schemas)
    schema: `prisma/${provider}/schema.prisma`,
    migrations: { path: `prisma/${provider}/migrations` },
    datasource: { url: resolveDatabaseUrl({ ...process.env, DB_PROVIDER: provider }) }
});
