// Applique les migrations en attente (prisma migrate deploy). À lancer avant chaque démarrage (npm start, Docker).
// Une base SQLite créée par l'ancienne version (sans historique de migrations) doit d'abord être adoptée :
// npm run db:adopt
import { exists, openSqlite, PROVIDER, prismaCli, sqliteFile, sqliteTables } from './db-common.mjs';

if (PROVIDER === 'sqlite' && exists(sqliteFile())) {
    const db = await openSqlite(sqliteFile(), { readonly: true });
    const tables = sqliteTables(db);
    db.close();
    if (tables.length > 0 && !tables.includes('_prisma_migrations')) {
        console.error(
            `❌ La base ${sqliteFile()} a été créée par une version précédente de l'application et n'est pas encore gérée par les migrations.\n` +
                '   Adoptez-la une fois (sauvegarde automatique, conversion du schéma, données conservées) :\n' +
                '     npm run db:adopt\n' +
                '   (Docker : docker compose run --rm <service> npm run db:adopt)'
        );
        process.exit(1);
    }
}

prismaCli(['migrate', 'deploy']);
