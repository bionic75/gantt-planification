// Asana : changement de dates d'une activité avec experts affectés (désaffectation totale ou partielle), règles
// « Cadrage (fin) » de la correspondance. L'API Asana est simulée.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createResource, loginAs } from './helpers/fixtures.js';

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
        // Sous-tâches (projet type) : deux niveaux sous « 5.9 VFT ANS »
        if (url.pathname === '/tasks/900/subtasks')
            return json({
                data: [
                    { gid: '901', name: '7.1.1. Tests des positions de travail', num_subtasks: 0 },
                    { gid: '902', name: '7.1.2. VFT en distanciel', num_subtasks: 1 }
                ]
            });
        if (url.pathname === '/tasks/902/subtasks')
            return json({ data: [{ gid: '903', name: '7.1.2.1. Détail distanciel', num_subtasks: 0 }] });
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
    setTask('5.9 VFT sur site', '2027-03-08', '2027-03-12');
    tasks.set('7.1 Parent type', {
        gid: '900',
        name: '7.1 Parent type',
        start_on: '2027-03-01',
        due_on: '2027-03-05',
        num_subtasks: 2
    });
    setTask('2.10 Autre fin de cadrage', '', '2027-02-12');
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

const byName = async () =>
    (await admin.get('/api/affectation/projects')).data.projects.find(p => p.samu_name === 'SAMU 91');

describe('dates modifiées dans Asana pour une activité avec experts affectés', () => {
    let expert;
    it('import puis affectation d’un expert sur la VFT', async () => {
        const r = await admin.post('/api/affectation/asana/apply', { gid: '555', apply: 'auto' });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expert = await createResource(admin);
        const p = await byName();
        expect(p.periods.vft[0]).toMatchObject({ start: '2027-03-08', end: '2027-03-12' });
        await admin.put(`/api/affectation/projects/${p.id}`, {
            samu_name: p.samu_name,
            date_debut: p.date_debut,
            date_mise_en_service: p.date_mise_en_service,
            date_mise_en_production: p.date_mise_en_production,
            periods: { ...p.periods, vft: [{ ...p.periods.vft[0], needed: 1 }] }
        });
        await admin.put(`/api/affectation/projects/${p.id}/assignments/vft`, { resource_ids: [expert.id] });
        expect((await byName()).assignments.vft).toEqual([expert.id]);
    });

    it('bornes en recouvrement : l’expert reste affecté, les journées hors recouvrement sont retirées', async () => {
        const p = await byName();
        await admin.put(`/api/affectation/projects/${p.id}/assignment-days/vft`, {
            resource_ids: [expert.id],
            dates: ['2027-03-08', '2027-03-09', '2027-03-11']
        });
        setTask('5.9 VFT sur site', '2027-03-10', '2027-03-16');
        const r = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.desaffectations).toEqual([expect.objectContaining({ key: 'vft', total: false, experts: 1 })]);
        const after = await byName();
        expect(after.periods.vft[0]).toMatchObject({ start: '2027-03-10', end: '2027-03-16' });
        expect(after.assignments.vft).toEqual([expert.id]);
        expect(Object.keys(after.assignment_days.vft || {}).filter(d => d < '2027-03-10')).toEqual([]);
    });

    it('bornes totalement différentes : l’expert est désaffecté', async () => {
        const p = await byName();
        setTask('5.9 VFT sur site', '2027-05-10', '2027-05-14');
        const r = await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect(r.data.desaffectations).toEqual([expect.objectContaining({ key: 'vft', total: true, experts: 1 })]);
        const after = await byName();
        expect(after.periods.vft[0]).toMatchObject({ start: '2027-05-10', end: '2027-05-14' });
        expect(after.assignments.vft || []).toEqual([]);
    });
});

describe('correspondance : règles de début / fin du cadrage et du déploiement', () => {
    it('la liste comprend les nouvelles lignes, sans type pour les bornes', async () => {
        const st = (await admin.get('/api/affectation/stage-event-types')).data;
        expect(st.stages.map(s => s.key).slice(0, 5)).toEqual([
            'cadrage_debut',
            'cadrage_fin',
            'deploiement_debut',
            'deploiement_fin',
            'mise_en_service'
        ]);
        expect(st.stages.find(s => s.key === 'cadrage_fin')).toMatchObject({ typed: false, label: 'Cadrage (fin)' });
    });

    it('« Cadrage (fin) » choisi : la fin du cadrage suit la tâche désignée', async () => {
        const put = await admin.put('/api/affectation/stage-event-types', {
            mapping: {},
            asanaRules: { cadrage_fin: '2.10' }
        });
        expect(put.data.asanaRules.cadrage_fin).toBe('2.10');
        const p = await byName();
        await admin.post(`/api/affectation/projects/${p.id}/asana-refresh`);
        expect((await byName()).periods.cadrage[0].end).toBe('2027-02-12');
        await admin.put('/api/affectation/stage-event-types', { mapping: {}, asanaRules: {} });
    });
});

describe('projet type', () => {
    it('toutes les tâches, sous-tâches comprises, sont proposées', async () => {
        const r = await admin.put('/api/affectation/asana/template', { gid: '555' });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const valeurs = r.data.template.tasks.map(t => t.value);
        expect(valeurs).toEqual(expect.arrayContaining(['7.1', '7.1.1', '7.1.2', '7.1.2.1']));
    });
});
