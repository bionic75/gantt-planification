// Point d'entrée : connexion à la base (schéma géré par les migrations : npm run db:migrate), données initiales,
// application Express (src/app.js, routes dans src/modules), tâches de fond et démarrage du serveur HTTP.
import { env } from './src/config/env.js';
import fs from 'fs';
import { registerDumpRoutes } from './scripts/db-dump.js';
import { createApp, finalizeApp } from './src/app.js';
import { checkEncoding, checkMigrations, connectPrisma, prisma } from './src/db/prisma.js';
import { seedDatabase } from './src/db/seed.js';
import { startScheduler } from './src/jobs/scheduler.js';
import { installerFrontend } from './src/lib/frontend.js';
import { emailConfig, loadEmailConfig } from './src/lib/mailer.js';
import { requireAdmin } from './src/middlewares/auth.js';
import { evtSeedTypes } from './src/modules/events/events.service.js';
import { logUserAction } from './src/services/action-log.js';
import { getReusableTransporter, resetReusableTransporter, startEmailQueueWorker } from './src/services/email-queue.js';

const PORT = env.PORT;

// Version de l'application (commentaire <!-- vX.Y.Z --> de index.html), affichée dans l'administration
async function syncAppVersion() {
    try {
        const html = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
        const match = html.match(/<!--\s*(v[\d]+\.[\d]+\.[\d]+)\s*-->/);
        if (!match) return;
        await prisma.setting.upsert({
            where: { key: 'app_version' },
            update: { value: match[1] },
            create: { key: 'app_version', value: match[1] }
        });
        console.log(`📦 Version application synchronisée : ${match[1]}`);
    } catch (e) {
        console.warn('⚠️  Impossible de lire la version depuis index.html :', e.message);
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
        console.log('⚠️ Warmup SMTP échoué :', error.message);
        resetReusableTransporter();
    }
}

// Écoute HTTP — réessaie si le port n'est pas encore libéré par le processus précédent
function listen(app, attempt = 1) {
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
    server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${PORT} encore occupé — nouvelle tentative dans 2s...`);
            setTimeout(() => listen(app, attempt + 1), 2000);
        } else {
            console.error('❌ Erreur serveur :', err);
            process.exit(1);
        }
    });
}

async function main() {
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
    console.error('⚠️ Stack:', reason?.stack || 'no stack');
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
