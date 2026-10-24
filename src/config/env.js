// @ts-check
// Configuration centralisée : lecture de l'environnement (.env + variables système), validée au démarrage.
// Toute nouvelle variable d'environnement doit être déclarée ici et documentée dans .env.example.
import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import legacyConfig from '../../config/config.json' with { type: 'json' };
import { DB_PROVIDERS, resolveDatabaseUrl } from './database-url.js';

dotenv.config({ quiet: true });

const optionalString = z
    .string()
    .trim()
    .transform(v => v || undefined)
    .optional();

const schema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        PORT: z.coerce.number().int().min(0).max(65535).default(3000),
        SESSION_SECRET: optionalString,
        // Base de données : sqlite (défaut), postgresql ou mysql (MariaDB / MySQL)
        DB_PROVIDER: z.enum(DB_PROVIDERS).default('sqlite'),
        // Connexion hors SQLite : DATABASE_URL complète, ou ses éléments (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
        DATABASE_URL: optionalString,
        DB_HOST: optionalString,
        DB_PORT: z.coerce
            .number()
            .int()
            .min(1)
            .max(65535)
            .optional()
            .or(z.literal('').transform(() => undefined)),
        DB_NAME: optionalString,
        DB_USER: optionalString,
        DB_PASSWORD: optionalString,
        // Répertoire de la base SQLite (data.db) et des fichiers de l'application (PDF des CRA…).
        // Priorité : variable d'environnement, puis config/config.json.
        DB_PATH: z
            .string()
            .trim()
            .min(1)
            .default(legacyConfig.DB_PATH || './data'),
        APP_URL: z
            .string()
            .trim()
            .url()
            .optional()
            .or(z.literal('').transform(() => undefined)),
        SMTP_USER: optionalString,
        ASANA_API_BASE: z.string().trim().url().default('https://app.asana.com/api/1.0'),
        SOFFICE_PATH: optionalString,
        PUPPETEER_EXECUTABLE_PATH: optionalString
    })
    .superRefine((cfg, ctx) => {
        if (cfg.NODE_ENV === 'production' && (!cfg.SESSION_SECRET || cfg.SESSION_SECRET.length < 32)) {
            ctx.addIssue({
                code: 'custom',
                path: ['SESSION_SECRET'],
                message: 'obligatoire en production (32 caractères minimum)'
            });
        }
        // Les liens envoyés par email (réinitialisation de mot de passe) ne doivent pas dépendre
        // de l'en-tête Host, contrôlable par le client
        if (cfg.NODE_ENV === 'production' && !cfg.APP_URL) {
            ctx.addIssue({
                code: 'custom',
                path: ['APP_URL'],
                message: "obligatoire en production (URL publique de l'application, ex. https://planning.example.fr)"
            });
        }
        if (cfg.DB_PROVIDER !== 'sqlite') {
            if (!resolveDatabaseUrl(cfg)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['DATABASE_URL'],
                    message: `avec DB_PROVIDER=${cfg.DB_PROVIDER}, renseigner DATABASE_URL, ou DB_HOST, DB_NAME, DB_USER (et DB_PASSWORD)`
                });
            }
            // Une partie du code accède encore directement à SQLite : PostgreSQL / MariaDB seront utilisables
            // une fois tous les modules passés à Prisma (phase 2)
            ctx.addIssue({
                code: 'custom',
                path: ['DB_PROVIDER'],
                message: `${cfg.DB_PROVIDER} n'est pas encore utilisable : migration vers Prisma en cours, seul sqlite est pris en charge`
            });
        }
    });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Configuration invalide :');
    for (const issue of parsed.error.issues) {
        console.error(`   - ${issue.path.join('.')} : ${issue.message}`);
    }
    process.exit(1);
}

const cfg = parsed.data;

if (!cfg.SESSION_SECRET) {
    // Hors production uniquement : secret aléatoire, les sessions ne survivent pas à un redémarrage
    cfg.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  SESSION_SECRET non défini : secret aléatoire généré (sessions perdues au redémarrage).');
}

export const env = Object.freeze({
    ...cfg,
    SESSION_SECRET: /** @type {string} */ (cfg.SESSION_SECRET),
    DATABASE_URL: /** @type {string} */ (resolveDatabaseUrl(cfg)),
    isProduction: cfg.NODE_ENV === 'production',
    isTest: cfg.NODE_ENV === 'test'
});
