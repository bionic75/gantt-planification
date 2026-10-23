// Compare le comportement de deux versions du serveur sur l'ensemble des routes /api.
// Chaque version démarre sur une base neuve ; les routes sont appelées en admin, dans le même ordre
// (GET, puis POST/PUT, puis DELETE), avec un corps vide. Codes de réponse et messages d'erreur sont comparés.
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

async function run(entry) {
    process.env.TEST_SERVER_ENTRY = entry;
    const server = await startServer();
    const admin = server.client();
    await admin.login(ADMIN.username, ADMIN.password, 'admin');
    const results = {};
    for (const r of plan) {
        try {
            const res = await Promise.race([
                admin.request(r.method, r.url, r.method === 'GET' ? undefined : {}),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
            ]);
            const error = res.data && typeof res.data === 'object' ? res.data.error : undefined;
            results[r.label] = { status: res.status, error };
        } catch (e) {
            results[r.label] = { status: 'ERR', error: e.message };
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
    }
}
const crashes = Object.entries(after).filter(([, v]) => v.status === 'ERR' || v.status >= 500);
console.log(
    `\n${plan.length} routes comparées, ${diffs} différence(s) ; ${crashes.length} réponse(s) 5xx/erreur côté comparée`
);
for (const [label, v] of crashes) console.log(`  5xx ${label} : ${v.status} ${v.error ?? ''}`);
process.exit(0);
