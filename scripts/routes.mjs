// Inventaire des routes HTTP de l'application, lu dans les routeurs Express (pas de liste tenue à la main) :
// méthode, chemin, protection (middleware de contrôle d'accès) et module.
//
// Usage : npm run routes
//   - met à jour tests/fixtures/routes.json (inventaire utilisé par les tests de contrôle d'accès) ;
//   - régénère docs/api.md (référence de l'API).
// Les tests vérifient que l'inventaire correspond aux routes réelles : après l'ajout ou la modification d'une
// route, lancer cette commande et relire la protection indiquée.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Middleware de contrôle d'accès → protection */
const GUARDS = {
    requireAuth: 'auth',
    requireAdmin: 'admin',
    requireAdminOrRh: 'adminOrRh',
    requireReportingAccess: 'reporting',
    requireAffectationAccess: 'affectation',
    requireMfaPending: 'mfaPending',
    requireApiKey: 'apiKey'
};

export const GUARD_LABELS = {
    public: 'Publique',
    auth: 'Utilisateur connecté',
    admin: 'Administrateur',
    adminOrRh: 'Administrateur ou RH',
    reporting: 'Administrateur ou droit « reporting »',
    affectation: 'Administrateur ou accès à « Aide à l’affectation »',
    mfaPending: 'Connexion en attente de double authentification',
    apiKey: 'Clé d’API (en-tête X-Api-Key)'
};

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Chemin de montage d'un routeur (Express 4 : expression régulière de la couche) */
function mountPath(layer) {
    if (layer.regexp.fast_slash) return '';
    return layer.regexp.source
        .replace(/^\^/, '')
        .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
        .replace(/\\\//g, '/');
}

/** Routes de l'application, triées par chemin puis méthode */
export async function listRoutes() {
    const { createApp } = await import(pathToFileURL(path.join(ROOT, 'src/app.js')).href);
    const { registerDumpRoutes } = await import(pathToFileURL(path.join(ROOT, 'scripts/db-dump.js')).href);
    const { requireAdmin } = await import(pathToFileURL(path.join(ROOT, 'src/middlewares/auth.js')).href);
    const app = createApp();
    // Comme server.js : routes de sauvegarde / restauration
    registerDumpRoutes(app, {
        requireAdmin,
        logUserAction: () => {},
        afterRestore: () => {},
        reloadEmailConfig: () => {}
    });

    // Module de chaque routeur : src/modules/<module>/<nom>.routes.js
    const moduleOf = new Map();
    const modulesDir = path.join(ROOT, 'src/modules');
    for (const dir of fs.readdirSync(modulesDir)) {
        for (const file of fs.readdirSync(path.join(modulesDir, dir)).filter(f => f.endsWith('.routes.js'))) {
            const { default: router } = await import(pathToFileURL(path.join(modulesDir, dir, file)).href);
            moduleOf.set(router, dir);
        }
    }

    const routes = new Map();
    const walk = (stack, prefix, module) => {
        for (const layer of stack) {
            if (layer.route) {
                // Plusieurs contrôles (requireAuth puis requireAdmin) : le dernier, le plus restrictif
                const guards = layer.route.stack
                    .map(l => GUARDS[l.name])
                    .filter(Boolean)
                    .reverse();
                const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
                for (const p of paths) {
                    for (const method of Object.keys(layer.route.methods)) {
                        const route = { method: method.toUpperCase(), path: prefix + p, guard: guards[0] || 'public' };
                        const key = `${route.method} ${route.path}`;
                        // Première déclaration : celle qui répond
                        if (!routes.has(key)) routes.set(key, { ...route, module: module || 'dump' });
                    }
                }
            } else if (layer.name === 'router') {
                walk(layer.handle.stack, prefix + mountPath(layer), moduleOf.get(layer.handle) || module);
            }
        }
    };
    walk(app._router.stack, '', null);
    return [...routes.values()].sort(
        (a, b) => a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
    );
}

/** Inventaire des tests : routes /api (méthode, chemin, protection) */
export const inventory = routes =>
    routes.filter(r => r.path.startsWith('/api/')).map(({ method, path: p, guard }) => ({ method, path: p, guard }));

/** Référence de l'API (Markdown), regroupée par module ; sans les redirections des anciens scripts, styles et images */
export function apiDoc(allRoutes) {
    const routes = allRoutes.filter(r => !/\.(js|css|png|webp|svg)$/.test(r.path));
    const byModule = new Map();
    for (const r of routes) {
        if (!byModule.has(r.module)) byModule.set(r.module, []);
        byModule.get(r.module).push(r);
    }
    const lines = [
        '# Référence de l’API',
        '',
        '> Fichier généré par `npm run routes` à partir des routeurs de l’application : ne pas le modifier à la main.',
        '',
        'Conventions :',
        '',
        '- requêtes et réponses en JSON ; une erreur répond `{ "error": "message" }` avec le statut HTTP correspondant',
        '  (400 requête invalide, 401 non connecté, 403 non autorisé, 404 introuvable, 429 trop de tentatives) ;',
        '- authentification par le cookie de session `gantt.sid`, ouvert par `POST /api/login` ;',
        '- les modifications (POST, PUT, DELETE) envoyées par un navigateur doivent venir de l’application elle-même',
        '  (protection CSRF, voir [securite.md](securite.md)) ;',
        '- API publique : clé dans l’en-tête `X-Api-Key`.',
        '',
        'Protections :',
        '',
        '| Protection | Accès |',
        '| --- | --- |',
        ...Object.entries(GUARD_LABELS).map(([k, v]) => `| \`${k}\` | ${v} |`),
        '',
        `${routes.length} routes, par module (\`src/modules/<module>\`) :`,
        ''
    ];
    for (const module of [...byModule.keys()].sort()) {
        const list = byModule.get(module);
        lines.push(`## ${module}`, '', '| Méthode | Chemin | Protection |', '| --- | --- | --- |');
        for (const r of list) lines.push(`| ${r.method} | \`${r.path}\` | ${r.guard} |`);
        lines.push('');
    }
    return lines.join('\n');
}

// Exécution directe : écrit l'inventaire et la documentation
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const routes = await listRoutes();
    fs.writeFileSync(path.join(ROOT, 'tests/fixtures/routes.json'), JSON.stringify(inventory(routes), null, 4) + '\n');
    fs.writeFileSync(path.join(ROOT, 'docs/api.md'), apiDoc(routes));
    console.log(`${routes.length} routes : tests/fixtures/routes.json et docs/api.md mis à jour`);
    process.exit(0);
}
