// Point d'entrée : connexion à la base (schéma géré par les migrations : npm run db:migrate), données initiales,
// application Express (src/app.ts, routes dans src/modules), tâches de fond et démarrage du serveur HTTP.
import { env } from './src/config/env.ts';
import { execFileSync } from 'child_process';
import type { Express } from 'express';
import fs from 'fs';
import { registerDumpRoutes } from './scripts/db-dump.js';
import { createApp, finalizeApp } from './src/app.ts';
import { checkEncoding, checkMigrations, connectPrisma, prisma } from './src/db/prisma.ts';
import { seedDatabase } from './src/db/seed.ts';
import { startScheduler } from './src/jobs/scheduler.ts';
import { installerFrontend } from './src/lib/frontend.ts';
import { emailConfig, loadEmailConfig } from './src/lib/mailer.ts';
import { requireAdmin } from './src/middlewares/auth.ts';
import { evtSeedTypes } from './src/modules/events/events.service.js';
import { logUserAction } from './src/services/action-log.ts';
import { getReusableTransporter, resetReusableTransporter, startEmailQueueWorker } from './src/services/email-queue.ts';

const PORT = env.PORT;

// Version de l'application (commentaire <!-- vX.Y.Z --> de index.html), affichée dans l'administration
async function syncAppVersion() {
    try {
        const html = fs.readFileSync(new URL('../frontend/pages/index.html', import.meta.url), 'utf8');
        const match = html.match(/<!--\s*(v[\d]+\.[\d]+\.[\d]+)\s*-->/);
        if (!match) return;
        await prisma.setting.upsert({
            where: { key: 'app_version' },
            update: { value: match[1] },
            create: { key: 'app_version', value: match[1] }
        });
        console.log(`📦 Version application synchronisée : ${match[1]}`);
    } catch (e) {
        console.warn('⚠️  Impossible de lire la version depuis index.html :', (e as Error).message);
    }
}

// Préchauffage de la connexion SMTP du pool d'envoi (file d'attente des emails)
async function warmupSMTPConnection() {
    if (!emailConfig.user || !emailConfig.password) {
        console.log('📧 Configuration SMTP non disponible, warmup ignoré');
        return;
    }
    try {
        const transporter = getReusableTransporter();
        if (transporter) {
            await transporter.verify();
            console.log('✅ Connexion SMTP préchauffée et prête');
        }
    } catch (error) {
        // En local sans accès au serveur SMTP : normal. Ne pas laisser le pool en état d'erreur.
        console.log('⚠️ Warmup SMTP échoué :', (error as Error).message);
        resetReusableTransporter();
    }
}

// Écoute HTTP — réessaie si le port n'est pas encore libéré par le processus précédent
function listen(app: Express, attempt = 1) {
    if (attempt > 3) {
        console.error(
            `❌ Impossible de démarrer après 3 tentatives. Libérez le port ${PORT} manuellement puis relancez.`
        );
        process.exit(1);
    }
    const server = app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
        console.log(`⏰ Automatisations programmées actives`);
        setTimeout(() => warmupSMTPConnection(), 5000);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${PORT} encore occupé — nouvelle tentative dans 2s...`);
            setTimeout(() => listen(app, attempt + 1), 2000);
        } else {
            console.error('❌ Erreur serveur :', err);
            process.exit(1);
        }
    });
}

// Développement : migrations en attente appliquées à chaque démarrage, y compris les redémarrages automatiques de
// « node --watch » (sinon une migration récupérée par un pull donne « table ou colonne inexistante » jusqu'au prochain
// « npm run dev »). En production, les migrations sont appliquées avant le démarrage (Docker, npm start).
function appliquerMigrationsEnDeveloppement() {
    if (env.NODE_ENV !== 'development') return;
    try {
        execFileSync(process.execPath, [new URL('./scripts/db-migrate.mjs', import.meta.url).pathname], {
            stdio: 'inherit',
            env: process.env
        });
    } catch {
        console.error('❌ Migrations de la base : échec (voir ci-dessus).');
        process.exit(1);
    }
}

async function main() {
    appliquerMigrationsEnDeveloppement();
    await connectPrisma();
    const encodingProblem = await checkEncoding();
    if (encodingProblem) {
        console.error(`❌ Base de données : ${encodingProblem}.`);
        process.exit(1);
    }
    const migrationProblem = await checkMigrations();
    if (migrationProblem) {
        console.error(`❌ Base de données : ${migrationProblem}. Lancez « npm run db:migrate » avant de démarrer.`);
        process.exit(1);
    }
    await seedDatabase();
    if (await loadEmailConfig()) console.log('✅ Configuration email chargée depuis DB');

    const app = createApp();
    // Sauvegarde / restauration complète de la base (administration)
    registerDumpRoutes(app, {
        requireAdmin,
        logUserAction,
        afterRestore: () => evtSeedTypes(),
        reloadEmailConfig: () => loadEmailConfig()
    });
    // Interface Vue (îlots) : build ou serveur Vite selon l'environnement
    await installerFrontend(app);
    // Fichiers statiques, page mobile, renvoi vers index.html et gestion des erreurs : après toutes les routes
    finalizeApp(app);

    startEmailQueueWorker();
    startScheduler();
    await syncAppVersion();
    listen(app);
}

// Protection contre les crash silencieux
process.on('unhandledRejection', reason => {
    console.error('⚠️ Unhandled Promise Rejection:', reason);
    console.error('⚠️ Stack:', (reason as { stack?: string } | undefined)?.stack || 'no stack');
});
process.on('uncaughtException', err => {
    console.error('🔥 Uncaught Exception:', err);
    console.error('🔥 Stack:', err?.stack || 'no stack');
    // Pas de process.exit() : le serveur continue
});

main().catch(err => {
    console.error('❌ Démarrage impossible :', err);
    process.exit(1);
});
