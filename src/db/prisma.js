// @ts-check
// Client Prisma partagé. L'adaptateur dépend de DB_PROVIDER ; le client doit avoir été généré
// pour le même fournisseur (npm run db:generate, exécuté aussi à l'installation).
import fs from 'node:fs';
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
    /** @type {string[]} */
    let applied;
    try {
        const rows = /** @type {Array<{ migration_name: string }>} */ (
            await prisma.$queryRawUnsafe(
                'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
            )
        );
        applied = rows.map(r => r.migration_name);
    } catch {
        return 'base non initialisée par les migrations';
    }
    if (!applied.length) return 'aucune migration appliquée';
    // Migrations du code absentes de la base : sans elles, des tables ou colonnes manqueraient (erreurs au fil des requêtes)
    try {
        const dir = new URL(`../../prisma/${env.DB_PROVIDER}/migrations/`, import.meta.url);
        const pending = fs
            .readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory() && !applied.includes(d.name))
            .map(d => d.name);
        if (pending.length) return `${pending.length} migration(s) en attente (${pending.join(', ')})`;
    } catch {
        /* dossier des migrations absent de l'installation : contrôle sans objet */
    }
    return null;
}
