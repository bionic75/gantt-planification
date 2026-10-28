// @ts-check
// Construction de l'application Express (sans démarrage du serveur HTTP)
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'path';
import { isRestoreInProgress } from '../scripts/db-dump.js';
import { env } from './config/env.js';
import { PrismaSessionStore } from './db/session-store.js';
import { envoyerIndex, modeFrontend, PORT_HMR } from './lib/frontend.js';
import { PUBLIC_DIR } from './lib/paths.js';
import { rejectCrossOrigin } from './middlewares/csrf.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requirePasswordChanged } from './middlewares/password-change.js';
import pagesRoutes from './modules/admin/pages.routes.js';
import apiRoutes from './routes.js';

/** Valeurs des paramètres sensibles (jetons, clés, mots de passe) masquées dans une URL journalisée */
export function maskSecrets(/** @type {string} */ url) {
    return url.replace(/([?&][^=&]*(?:token|key|password|secret|code)[^=&]*=)[^&]*/gi, '$1***');
}

/**
 * En-têtes de sécurité. La politique de contenu (CSP) admet les scripts et styles en ligne du frontend actuel
 * (gestionnaires onclick…) ; elle limite les ressources externes aux CDN et à OpenStreetMap utilisés, et interdit
 * l'affichage de l'application dans un cadre d'un autre site.
 */
function securityHeaders() {
    const https = !!env.APP_URL?.startsWith('https:');
    return helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
                imgSrc: [
                    "'self'",
                    'data:',
                    'blob:',
                    'https://*.tile.openstreetmap.org',
                    'https://cdnjs.cloudflare.com'
                ],
                fontSrc: ["'self'", 'data:'],
                connectSrc: [
                    "'self'",
                    'https://nominatim.openstreetmap.org',
                    // Développement : rechargement à chaud de l'interface Vue (serveur Vite)
                    ...(modeFrontend() === 'vite' ? [`ws://localhost:${PORT_HMR}`] : [])
                ],
                frameSrc: ["'self'", 'blob:', 'data:'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'self'"],
                ...(https ? { upgradeInsecureRequests: [] } : {})
            }
        },
        // HTTPS uniquement : sinon le navigateur refuserait ensuite l'accès en HTTP (poste de développement)
        strictTransportSecurity: https ? { maxAge: 180 * 24 * 3600 } : false,
        // Origine seule envoyée aux autres sites : les tuiles OpenStreetMap exigent un en-tête Referer
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        // Ressources des CDN chargées sans en-têtes CORP / COEP
        crossOriginEmbedderPolicy: false,
        // Liens externes (itinéraire Google Maps…) ouverts dans un nouvel onglet
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
    });
}

/** Middlewares communs et routes /api des modules */
export function createApp() {
    const app = express();

    // Derrière le proxy (OVH, nginx) : IP client réelle et protocole via X-Forwarded-*, des seuls proxys de confiance
    app.set('trust proxy', env.TRUST_PROXY);
    app.disable('x-powered-by');

    app.use(securityHeaders());
    // Modifications refusées si elles viennent d'un autre site (CSRF)
    app.use(rejectCrossOrigin);
    // Appels d'autres sites : seulement l'API publique (clé d'API, sans cookie de session)
    app.use('/api/public', cors());

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
        const { method } = req;
        const url = maskSecrets(req.originalUrl);
        console.log(`→ ${method} ${url}`);
        res.on('finish', () => console.log(`← ${method} ${url} ${res.statusCode} (${Date.now() - t0}ms)`));
        next();
    });

    app.use(
        session({
            secret: env.SESSION_SECRET,
            store: new PrismaSessionStore(),
            resave: false,
            saveUninitialized: false,
            cookie: {
                // Cookie réservé à HTTPS quand la requête est en HTTPS (directement ou via un proxy de confiance)
                secure: 'auto',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            },
            name: 'gantt.sid'
        })
    );

    // Corps des requêtes : volumineux (planning complet, modèles, photos) pour un utilisateur connecté seulement
    const parsers = {
        small: [express.json({ limit: '100kb' }), express.urlencoded({ limit: '100kb', extended: true })],
        large: [express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true })]
    };
    app.use((req, res, next) => {
        const [json, urlencoded] = req.session?.userId ? parsers.large : parsers.small;
        json(req, res, err => (err ? next(err) : urlencoded(req, res, next)));
    });

    // Mot de passe donné par un administrateur : à changer avant toute autre action
    app.use(requirePasswordChanged);
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
    // Page principale avec le point d'entrée de l'interface Vue (îlots)
    app.get(['/', '/index.html'], envoyerIndex);
    app.use(express.static(PUBLIC_DIR, { index: false }));

    app.get('/mobile', (req, res) => {
        const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
            req.headers['user-agent'] || ''
        );
        // Desktop : application principale
        if (isMobile) res.sendFile(path.join(PUBLIC_DIR, 'mobile.html'));
        else res.redirect('/');
    });

    app.get('*', envoyerIndex);

    app.use(errorHandler);
}
