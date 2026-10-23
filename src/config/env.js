// @ts-check
// Configuration centralisée : lecture de l'environnement (.env + variables système), validée au démarrage.
// Toute nouvelle variable d'environnement doit être déclarée ici et documentée dans .env.example.
import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import legacyConfig from '../../config/config.json' with { type: 'json' };

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
        // Répertoire de la base SQLite (data.db). Priorité : variable d'environnement, puis config/config.json.
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
    isProduction: cfg.NODE_ENV === 'production',
    isTest: cfg.NODE_ENV === 'test'
});
