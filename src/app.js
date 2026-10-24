// @ts-check
// Construction de l'application Express (sans démarrage du serveur HTTP)
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { isRestoreInProgress } from '../scripts/db-dump.js';
import { env } from './config/env.js';
import { PUBLIC_DIR } from './lib/paths.js';
import { errorHandler } from './middlewares/error-handler.js';
import pagesRoutes from './modules/admin/pages.routes.js';
import apiRoutes from './routes.js';

/** Middlewares communs et routes /api des modules */
export function createApp() {
    const app = express();

    // Derrière le proxy (OVH, nginx) : IP client réelle via X-Forwarded-For
    app.set('trust proxy', true);

    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Restauration de la base en cours : seules les routes de dump restent disponibles
    app.use((req, res, next) => {
        if (isRestoreInProgress() && !req.path.startsWith('/api/admin/dump')) {
            return res
                .status(503)
                .json({ error: 'Restauration de la base en cours, réessayez dans quelques instants.' });
        }
        next();
    });

    app.use((req, res, next) => {
        const t0 = Date.now();
        const { method, url } = req;
        console.log(`→ ${method} ${url}`);
        res.on('finish', () => console.log(`← ${method} ${url} ${res.statusCode} (${Date.now() - t0}ms)`));
        next();
    });

    app.use(
        session({
            secret: env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false, // à passer à true derrière HTTPS (phase 4)
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            },
            name: 'gantt.sid'
        })
    );

    app.use('/api', apiRoutes);
    // Pages hors /api, prioritaires sur les fichiers statiques
    app.use(pagesRoutes);
    return app;
}

/**
 * Fichiers statiques, page mobile, renvoi de toute autre URL vers l'application, gestion des erreurs.
 * À appeler après la déclaration de toutes les routes.
 * @param {import('express').Express} app
 */
export function finalizeApp(app) {
    app.use(express.static(PUBLIC_DIR));

    app.get('/mobile', (req, res) => {
        const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
            req.headers['user-agent'] || ''
        );
        // Desktop : application principale
        if (isMobile) res.sendFile(path.join(PUBLIC_DIR, 'mobile.html'));
        else res.redirect('/');
    });

    app.get('*', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    app.use(errorHandler);
}
