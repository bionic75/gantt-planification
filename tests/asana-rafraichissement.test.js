// Asana : rafraîchissement d'un déploiement avec arbitrage des conflits (donnée modifiée dans l'application et dans
// Asana), nouvelles étapes « Réunion de lancement stratégique » et « Visite OB ». L'API Asana est simulée.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { loginAs } from './helpers/fixtures.js';

let asana;
let asanaPort;
let server;
let admin;
/** Tâches du projet Asana simulé : modifiables par les tests */
const tasks = new Map();
const setTask = (name, start, due) =>
    tasks.set(name, { gid: String(100 + tasks.size), name, start_on: start, due_on: due });

beforeAll(async () => {
    asana = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        const json = body => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(body));
        };
        if (/\/teams\/[^/]+\/projects/.test(url.pathname))
            return json({
                data: [{ gid: '555', name: '[SAMU 91] SF4 - Déploiement', permalink_url: 'https://asana.test/p/555' }]
            });
        if (url.pathname === '/projects/555') return json({ data: { name: '[SAMU 91] SF4 - Déploiement' } });
        if (url.pathname === '/projects/555/tasks') return json({ data: [...tasks.values()] });
        res.statusCode = 404;
        json({ errors: [{ message: 'inconnu' }] });
    });
    await new Promise(r => asana.listen(0, '127.0.0.1', r));
    asanaPort = asana.address().port;
    process.env.TEST_ASANA_API_BASE = `http://127.0.0.1:${asanaPort}`;
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
    setTask("Démarrage projet auprès de l'ES", '', '2027-01-04');
    setTask('2.9 Fin du cadrage', '', '2027-02-05');
    setTask('Mise en service du bandeau', '', '2027-04-01');
    setTask('Mise en production du bandeau', '', '2027-05-03');
    setTask('Réunion de lancement stratégique', '2027-01-20', '2027-01-20');
    setTask('Visite OB', '2027-03-10', '2027-03-11');
    expect(
        (await admin.put('/api/affectation/asana/config', { token: 'jeton-de-test', teamGid: '9', teamName: 'Équipe' }))
            .status
    ).toBe(200);
});
afterAll(async () => {
    delete process.env.TEST_ASANA_API_BASE;
    await server?.stop();
    await new Promise(r => asana?.close(r));
});

const projects = async () => (await admin.get('/api/affectation/projects')).data.projects;
const byName = async () => (await projects()).find(p => p.samu_name === 'SAMU 91');

describe('import, modification locale puis rafraîchissement', () => {
    it('import : les nouvelles étapes sont reprises avec le nom des tâches Asana', async () => {
        const r = await admin.post('/api/affectation/asana/apply', { gid: '555', apply: 'auto' });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data).toMatchObject({ created: true, conflicts: [] });
        const p = await byName();
        expect(p.periods.reunion_lancement[0]).toMatchObject({ start: '2027-01-20', end: '2027-01-20' });
        expect(p.periods.visite_ob[0]).toMatchObject({ start: '2027-03-11', end: '2027-03-11' });
        expect(p.date_mise_en_service).toBe('2027-04-01');
    });

    it('rafraîchissement sans changement : à jour', async () => {
        const p = await byName();
        const r = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(r.data).toMatchObject({ unchanged: true, conflicts: [] });
    });

    it('donnée modifiée seulement dans Asana : reprise ; modifiée seulement dans l’application : conservée sans conflit', async () => {
        const p = await byName();
        // Application : mise en service décalée
        const upd = await admin.put(`/api/affectation/projects/${p.id}`, {
            samu_name: p.samu_name,
            date_debut: p.date_debut,
            date_mise_en_service: '2027-04-08',
            date_mise_en_production: p.date_mise_en_production,
            periods: p.periods
        });
        expect(upd.status, JSON.stringify(upd.data)).toBe(200);
        // Asana : réunion de lancement déplacée
        setTask('Réunion de lancement stratégique', '2027-01-25', '2027-01-25');
        const r = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.conflicts).toEqual([]);
        const after = await byName();
        expect(after.periods.reunion_lancement[0].start).toBe('2027-01-25');
        expect(after.date_mise_en_service).toBe('2027-04-08');
    });

    it('donnée modifiée dans l’application ET dans Asana : conflit, rien n’est écrasé, puis arbitrage', async () => {
        const p = await byName();
        const periods = { ...p.periods, visite_ob: [{ start: '2027-03-15', end: '2027-03-16', needed: 1 }] };
        await admin.put(`/api/affectation/projects/${p.id}`, {
            samu_name: p.samu_name,
            date_debut: p.date_debut,
            date_mise_en_service: p.date_mise_en_service,
            date_mise_en_production: p.date_mise_en_production,
            periods
        });
        setTask('Visite OB', '2027-03-22', '2027-03-23'); // Asana aussi
        setTask('Mise en service du bandeau', '', '2027-04-15'); // Asana seul : mise en service déjà modifiée localement → conflit
        const r = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const keys = r.data.conflicts.map(c => c.key).sort();
        expect(keys).toEqual(['mise_en_service', 'visite_ob']);
        const ob = r.data.conflicts.find(c => c.key === 'visite_ob');
        expect(ob).toMatchObject({ label: 'Visite OB', app: '15/03/2027', asana: '23/03/2027' });
        // Rien n'a été écrasé
        const unchanged = await byName();
        expect(unchanged.periods.visite_ob[0].start).toBe('2027-03-15');
        expect(unchanged.date_mise_en_service).toBe('2027-04-08');

        // Arbitrage : Visite OB reprise d'Asana, mise en service conservée
        const res = await admin.post(`/api/affectation/projects/${p.id}/asana-conflicts`, {
            choices: { visite_ob: 'asana', mise_en_service: 'app' }
        });
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        expect(res.data).toMatchObject({ applied: 1, kept: 1 });
        const after = await byName();
        expect(after.periods.visite_ob[0].start).toBe('2027-03-23');
        expect(after.date_mise_en_service).toBe('2027-04-08');

        // Plus de conflit tant qu'Asana ne change pas
        const again = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(again.data).toMatchObject({ unchanged: true, conflicts: [] });
        // Asana change à nouveau la mise en service : redevient un conflit (l'application l'avait modifiée)
        setTask('Mise en service du bandeau', '', '2027-04-22');
        const third = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(third.data.conflicts.map(c => c.key)).toEqual(['mise_en_service']);
    });

    it('tout rafraîchir : conflits regroupés par déploiement ; choix invalides refusés ; réservé aux administrateurs', async () => {
        const all = await admin.post('/api/affectation/asana/refresh-all');
        expect(all.status, JSON.stringify(all.data)).toBe(200);
        expect(all.data.conflicts).toHaveLength(1);
        expect(all.data.conflicts[0]).toMatchObject({ samu: 'SAMU 91' });
        const p = await byName();
        expect((await admin.post(`/api/affectation/projects/${p.id}/asana-conflicts`, { choices: {} })).status).toBe(
            400
        );
        expect(
            (await admin.post(`/api/affectation/projects/${p.id}/asana-conflicts`, { choices: { vft: 'x' } })).status
        ).toBe(400);
        expect(
            (await admin.post('/api/affectation/projects/999999/asana-conflicts', { choices: { vft: 'app' } })).status
        ).toBe(404);
    });
});
