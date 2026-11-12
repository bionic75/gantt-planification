// Compare le comportement de deux versions du serveur sur l'ensemble des routes /api.
// Chaque version démarre sur une base neuve et reçoit le même jeu de données (SEED), puis les routes sont
// appelées en admin, dans le même ordre (GET, puis POST/PUT, puis DELETE), avec un corps vide.
// Sont comparés : codes de réponse et messages d'erreur, et contenu des réponses GET (horodatages et
// empreintes de mots de passe neutralisés).
//
// Usage : node tests/parity/route-parity.mjs <entrée de référence> [<entrée comparée = server.js>]
//   ex. : node tests/parity/route-parity.mjs server.legacy.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ADMIN, startServer } from '../helpers/server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/routes.json'), 'utf8'));
const [reference, candidate = 'server.js'] = process.argv.slice(2);
if (!reference) {
    console.error('Usage : node tests/parity/route-parity.mjs <entrée de référence> [<entrée comparée>]');
    process.exit(2);
}

const ORDER = { GET: 0, POST: 1, PUT: 1, PATCH: 1, DELETE: 2 };
// Routes à effet de bord global ou dépendant du réseau / du temps : exclues de la comparaison
const SKIP = [
    /^GET \/api\/sse$/,
    /^POST \/api\/admin\/dump/,
    /^GET \/api\/admin\/dump$/,
    /^GET \/api\/poi\/places$/,
    /^GET \/api\/poi\/:id\/route$/
];
const plan = routes
    .filter(r => r.guard !== 'apiKey' && r.guard !== 'mfaPending')
    .map(r => ({ ...r, label: `${r.method} ${r.path}`, url: r.path.replace(/:\w+/g, '1') }))
    .filter(r => !SKIP.some(re => re.test(r.label)))
    .sort((a, b) => ORDER[a.method] - ORDER[b.method]);

// Jeu de données commun (identifiants attendus : ressources 1-2 ; comptes admin 1, experts 2-3, utilisateur 4)
const SEED = [
    [
        'POST',
        '/api/resources',
        { nom: 'DUPONT', prenom: 'Jean', trigramme: 'JDU', taux: 80, samu: 'SAMU 75', date_debut: '2025-01-01' }
    ],
    [
        'POST',
        '/api/resources',
        { nom: 'MARTIN', prenom: 'Léa', trigramme: 'LMA', taux: 50, samu: 'SAMU 92', es_rattachement: 'CHU Test' }
    ],
    [
        'POST',
        '/api/users',
        {
            username: 'expert1',
            password: 'Expert-1!',
            nom: 'Dupont',
            prenom: 'Jean',
            email: 'e1@x.fr',
            is_expert: 1,
            resource_id: 1
        }
    ],
    [
        'POST',
        '/api/users',
        {
            username: 'expert2',
            password: 'Expert-2!',
            nom: 'Bis',
            prenom: 'Jean',
            email: 'e2@x.fr',
            is_expert: 1,
            resource_id: 1
        }
    ],
    [
        'POST',
        '/api/users',
        { username: 'lecteur', password: 'Lecteur-1!', nom: 'Lect', prenom: 'Eur', email: 'l@x.fr', is_user: 1 }
    ],
    [
        'PUT',
        '/api/users/4',
        { nom: 'Lect', prenom: 'Eur', email: 'l@x.fr', trigramme: 'lec', is_user: 1, resource_id: '2' }
    ],
    [
        'POST',
        '/api/schedule',
        { '1_available_2025-06-02_AM': '2', '1_activity_2025-06-02_AM': '5', '2_localisation_2025-06-02_PM': 'PSC' }
    ],
    ['PUT', '/api/resources/1/mad-history/1', { taux: 80, date_debut: '2025-01-01', date_fin: '2029-12-31' }],
    ['POST', '/api/resources/1/mad-history', { taux: 70, date_debut: '2030-01-01' }],
    [
        'PUT',
        '/api/resources/1/samu-assignments',
        { principal: ['SAMU 75', 'SAMU 92'], secondaire: ['SAMU 75', 'SAMU 13'] }
    ],
    ['POST', '/api/app-access/deplacements/users', { userId: 4 }],
    ['POST', '/api/users/4/reporting-access', { hasAccess: true }]
];

// Valeurs propres à chaque exécution
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?Z?)?$/;
function normalize(value, key) {
    if (Array.isArray(value)) return value.map(v => normalize(v));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map(k => [k, normalize(value[k], k)])
        );
    }
    if (key === 'password' || key === 'totp_secret') return '<secret>';
    if (key === 'lastActivity') return '<horodatage>';
    if (typeof value === 'string' && TIMESTAMP.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '<horodatage>';
    return value;
}

async function run(entry) {
    process.env.TEST_SERVER_ENTRY = entry;
    const server = await startServer();
    const admin = server.client();
    await admin.login(ADMIN.username, ADMIN.password, 'admin');
    for (const [method, url, body] of SEED) {
        const res = await admin.request(method, url, body);
        if (res.status >= 400)
            console.warn(`  (jeu de données) ${method} ${url} : ${res.status} ${JSON.stringify(res.data)}`);
    }
    const results = {};
    for (const r of plan) {
        try {
            const res = await Promise.race([
                admin.request(r.method, r.url, r.method === 'GET' ? undefined : {}),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
            ]);
            const error = res.data && typeof res.data === 'object' ? res.data.error : undefined;
            const body =
                r.method === 'GET' && typeof res.data === 'object' ? JSON.stringify(normalize(res.data)) : null;
            results[r.label] = { status: res.status, error, body };
        } catch (e) {
            results[r.label] = { status: 'ERR', error: e.message, body: null };
        }
    }
    await server.stop();
    return results;
}

const before = await run(reference);
const after = await run(candidate);
let diffs = 0;
for (const r of plan) {
    const a = before[r.label];
    const b = after[r.label];
    if (a.status !== b.status || a.error !== b.error) {
        diffs++;
        console.log(
            `≠ ${r.label}\n    référence : ${a.status} ${a.error ?? ''}\n    comparée  : ${b.status} ${b.error ?? ''}`
        );
    } else if (a.body !== b.body) {
        diffs++;
        console.log(
            `≠ ${r.label} (contenu)\n    référence : ${a.body?.slice(0, 600)}\n    comparée  : ${b.body?.slice(0, 600)}`
        );
    }
}
const crashes = Object.entries(after).filter(([, v]) => v.status === 'ERR' || v.status >= 500);
console.log(
    `\n${plan.length} routes comparées, ${diffs} différence(s) ; ${crashes.length} réponse(s) 5xx/erreur côté comparée`
);
for (const [label, v] of crashes) console.log(`  5xx ${label} : ${v.status} ${v.error ?? ''}`);
process.exit(0);
