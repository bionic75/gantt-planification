// Configuration de la CLI Prisma (génération du client, migrations).
// La base cible est choisie par DB_PROVIDER (sqlite | postgresql | mysql) et DATABASE_URL (voir .env.example).
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/config/database-url.js';

dotenv.config({ quiet: true });
const provider = process.env.DB_PROVIDER || 'sqlite';
// Schémas et migrations du dossier backend, quel que soit le répertoire courant (racine du projet : .env, ./data)
const ici = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    // Schémas générés depuis prisma/schema.base.prisma (npm run db:schemas)
    schema: path.join(ici, 'prisma', provider, 'schema.prisma'),
    migrations: { path: path.join(ici, 'prisma', provider, 'migrations') },
    datasource: { url: resolveDatabaseUrl({ ...process.env, DB_PROVIDER: provider }) }
});
