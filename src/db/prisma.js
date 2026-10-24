// @ts-check
// Client Prisma partagé. L'adaptateur dépend de DB_PROVIDER ; le client doit avoir été généré
// pour le même fournisseur (npm run db:generate, exécuté aussi à l'installation).
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.ts';

async function createAdapter() {
    switch (env.DB_PROVIDER) {
        case 'postgresql': {
            const { PrismaPg } = await import('@prisma/adapter-pg');
            return new PrismaPg({ connectionString: env.DATABASE_URL });
        }
        case 'mysql': {
            const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
            return new PrismaMariaDb(env.DATABASE_URL);
        }
        default: {
            const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
            return new PrismaBetterSqlite3({ url: env.DATABASE_URL });
        }
    }
}

export const prisma = new PrismaClient({ adapter: await createAdapter() });

/**
 * Réglages de connexion. SQLite : les clés étrangères déclarées par les anciennes tables ne sont pas
 * appliquées (l'application ne les a jamais appliquées) ; WAL et attente de 5 s en cas de verrou.
 */
export async function connectPrisma() {
    await prisma.$connect();
    if (env.DB_PROVIDER === 'sqlite') {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
        await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
        await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    }
}

/**
 * PostgreSQL : la base doit être en UTF-8 (textes accentués, emojis des emails et de l'historique). Une base créée
 * avec l'encodage par défaut d'un poste Windows (WIN1252) refuserait ces écritures au fil de l'eau.
 * @returns {Promise<string | null>} message d'erreur, ou null si l'encodage convient
 */
export async function checkEncoding() {
    if (env.DB_PROVIDER !== 'postgresql') return null;
    const rows = /** @type {Array<{ encoding: string }>} */ (
        await prisma.$queryRawUnsafe(
            'SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()'
        )
    );
    const encoding = rows[0]?.encoding;
    return encoding === 'UTF8'
        ? null
        : `la base PostgreSQL est encodée en ${encoding} : recréez-la en UTF-8 (CREATE DATABASE … ENCODING 'UTF8' TEMPLATE template0)`;
}

/**
 * Vérifie que toutes les migrations ont été appliquées (npm run db:migrate) avant de démarrer
 * @returns {Promise<string | null>} message d'erreur, ou null si la base est à jour
 */
export async function checkMigrations() {
    try {
        const rows = /** @type {Array<{ n: number | bigint }>} */ (
            await prisma.$queryRawUnsafe(
                'SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
            )
        );
        return Number(rows[0].n) > 0 ? null : 'aucune migration appliquée';
    } catch {
        return 'base non initialisée par les migrations';
    }
}
