// Aide à l'affectation (déploiements des SAMU) : déploiements, affectations, disponibilités,
// synchronisation vers la planification et les événements, suppression, import CSV Asana, configuration
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createResource, loginAs } from './helpers/fixtures.js';

let server;
let admin;
let seq = 0;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

// Numéro de SAMU propre à chaque test (lieu « SAMU 7x »)
async function newSamu() {
    const no = 70 + ++seq;
    const loc = await admin.post('/api/locations', {
        libelle_long: `SAMU TEST ${no} ${Date.now()}`,
        libelle_court: `SAMU ${no}`
    });
    expect(loc.status, JSON.stringify(loc.data)).toBe(200);
    return { no: String(no), name: `SAMU ${no}`, locationId: loc.data.id };
}

async function createProject(samu, periods = {}) {
    const r = await admin.post('/api/affectation/projects', {
        samu_name: samu.name,
        location_id: samu.locationId,
        date_debut: '2027-01-04',
        date_mise_en_service: '2027-04-01',
        periods: { visite_metier: [{ start: '2027-03-01', end: '2027-03-03', needed: 2 }], ...periods }
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data;
}

const project = async id => (await admin.get('/api/affectation/projects')).data.projects.find(p => p.id === id);
const schedule = async () => (await admin.get('/api/schedule')).data;
const typeByCode = async code => (await admin.get('/api/event-types')).data.types.find(t => t.code === code);

async function waitFor(fn, timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    let last;
    while (Date.now() < end) {
        last = await fn();
        if (last) return last;
        await new Promise(r => setTimeout(r, 100));
    }
    return last;
}

describe('configuration', () => {
    it('étapes, couleurs et motifs', async () => {
        const cfg = (await admin.get('/api/affectation/config')).data;
        expect(cfg.stages.find(s => s.key === 'gel')).toMatchObject({ kind: 'periods', defaultPattern: 'diag' });
        expect(cfg.patterns.gel).toBe('diag');
        expect((await admin.put('/api/affectation/colors', { colors: { vft: 'vert' } })).status).toBe(400);
        expect((await admin.put('/api/affectation/colors', { patterns: { vft: 'pois' } })).status).toBe(400);
        const r = await admin.put('/api/affectation/colors', { colors: { vft: '#ABCDEF' }, patterns: { vft: 'dots' } });
        expect(r.data.colors.vft).toBe('#abcdef');
        expect(r.data.patterns).toMatchObject({ vft: 'dots', gel: 'diag' });
        const users = (await admin.get('/api/affectation/users')).data.users;
        expect(users.find(u => u.id === 1)).toMatchObject({ nom: 'Admin' });
        expect(Array.isArray((await admin.get('/api/affectation/resources')).data.resources)).toBe(true);
    });

    it("correspondance activités / types d'événements, modèle de nom des exports", async () => {
        const st = (await admin.get('/api/affectation/stage-event-types')).data;
        expect(st.stages.map(s => s.key)).toContain('visite_metier');
        const visite = await typeByCode('visiteMetier');
        expect(st.mapping.visite_metier).toBe(visite.id);
        const other = await typeByCode('autre');
        const saved = await admin.put('/api/affectation/stage-event-types', {
            mapping: { vft: other.id, mes: 999999 }
        });
        expect(saved.data.mapping.vft).toBe(other.id);
        await admin.put('/api/affectation/stage-event-types', { mapping: {} });

        const name = (await admin.get('/api/affectation/export-config')).data;
        expect(name.pattern).toBe(name.defaultPattern);
        expect((await admin.put('/api/affectation/export-config', { pattern: 'Plan_{AAAA}' })).data.pattern).toBe(
            'Plan_{AAAA}'
        );
        expect((await admin.put('/api/affectation/export-config', { pattern: '' })).data.pattern).toBe(
            name.defaultPattern
        );
        expect((await admin.get('/api/affectation/template')).data).toEqual({ exists: false });
        expect((await admin.post('/api/affectation/export/pdf', { html: '' })).status).toBe(400);
    });
});

describe('déploiements', () => {
    it('validation, création, modification et historique', async () => {
        expect((await admin.post('/api/affectation/projects', { date_debut: '2027-01-04' })).status).toBe(400);
        const samu = await newSamu();
        const early = await admin.post('/api/affectation/projects', {
            samu_name: samu.name,
            date_debut: '2027-01-04',
            date_mise_en_service: '2026-12-01'
        });
        expect(early.data.error).toMatch(/ne peut pas précéder le début du projet/);
        expect(
            (
                await admin.post('/api/affectation/projects', {
                    samu_name: samu.name,
                    date_debut: '2027-01-04',
                    periods: { vft: [{ start: '2027-02-01', end: '2027-02-02' }] }
                })
            ).status
        ).toBe(400);

        const p = await createProject(samu);
        expect(p).toMatchObject({
            samu_name: samu.name,
            location_id: samu.locationId,
            date_mise_en_service: '2027-04-01',
            periods: { visite_metier: [{ start: '2027-03-01', end: '2027-03-03', needed: 2 }] },
            assignments: {},
            from_asana: false
        });
        const upd = await admin.put(`/api/affectation/projects/${p.id}`, {
            samu_name: samu.name,
            date_debut: '2027-01-04',
            chef_projet_id: 1,
            periods: { visite_metier: [{ start: '2027-03-01', end: '2027-03-03', needed: 2 }] }
        });
        expect(upd.data).toMatchObject({
            chef_projet_id: 1,
            chef_projet_nom: 'Admin Système',
            date_mise_en_service: null
        });
        const hist = (await admin.get(`/api/affectation/projects/${p.id}/history`)).data.history;
        expect(hist.map(h => h.action)).toEqual(['modification', 'creation']);
        expect(hist[0].changes).toContainEqual({ label: 'Chef de projet', from: '—', to: 'Système Admin' });
        expect(hist[0].changes).toContainEqual({ label: 'Mise en service', from: '01/04/2027', to: '—' });
        expect(
            (await admin.put('/api/affectation/projects/999999', { samu_name: 'x', date_debut: '2027-01-04' })).status
        ).toBe(404);
    });
});

describe('ressources affectées', () => {
    it('affectation, contrôles, disponibilité et ajustement au nombre de ressources', async () => {
        const samu = await newSamu();
        const p = await createProject(samu, { vft: [{ start: '2027-03-08', end: '2027-03-08', needed: 1 }] });
        const a = await createResource(admin);
        const b = await createResource(admin);
        const c = await createResource(admin);
        const put = (stage, ids) =>
            admin.put(`/api/affectation/projects/${p.id}/assignments/${stage}`, { resource_ids: ids });

        expect((await put('cadrage', [a.id])).status).toBe(400);
        expect((await put('accompagnement', [a.id])).status).toBe(400);
        expect((await put('visite_metier', [a.id, b.id, c.id])).status).toBe(400);
        expect((await put('visite_metier', [999999])).status).toBe(400);

        // Une ressource déjà affectée à un autre SAMU sur la période n'est pas affectable
        await admin.post('/api/schedule', {
            [`${c.id}_activity_2027-03-02_AM`]: '3',
            [`${c.id}_localisation_2027-03-02_AM`]: '🚨 SAMU 13'
        });
        const blocked = await put('visite_metier', [c.id]);
        expect(blocked.status).toBe(409);
        expect(blocked.data.error).toMatch(/Déjà affecté\(e\) à un autre SAMU/);

        await admin.post('/api/schedule', {
            [`${a.id}_available_2027-03-01_AM`]: '2',
            [`${a.id}_available_2027-03-01_PM`]: '3',
            [`${a.id}_activity_2027-03-02_AM`]: '5'
        });
        const av = (await admin.get(`/api/affectation/projects/${p.id}/availability/visite_metier`)).data;
        expect(av.total).toBe(6);
        expect(av.availability[a.id]).toMatchObject({ free: 1, leave: 1, ans: 1, here: 0, other: 0 });
        expect(av.availability[c.id]).toMatchObject({ other: 1, others: ['SAMU 13'] });

        expect((await put('visite_metier', [a.id, b.id])).data).toEqual({ resource_ids: [a.id, b.id] });
        expect((await put('vft', [a.id])).data).toEqual({ resource_ids: [a.id] });
        expect((await project(p.id)).assignments).toEqual({ visite_metier: [a.id, b.id], vft: [a.id] });
        const hist = (await admin.get(`/api/affectation/projects/${p.id}/history`)).data.history;
        expect(hist[0]).toMatchObject({ action: 'affectation' });

        // Nombre de ressources réduit et étape supprimée : affectations ajustées
        await admin.put(`/api/affectation/projects/${p.id}`, {
            samu_name: samu.name,
            location_id: samu.locationId,
            date_debut: '2027-01-04',
            periods: { visite_metier: [{ start: '2027-03-01', end: '2027-03-03', needed: 1 }] }
        });
        expect((await project(p.id)).assignments).toEqual({ visite_metier: [a.id] });
    });
});

describe('synchronisation vers la planification et les événements', () => {
    it('aperçu, planification renseignée, événement créé puis repris ; désaffectation et suppression', async () => {
        const samu = await newSamu();
        const p = await createProject(samu);
        const { user, resource } = await createExpert(admin);
        await admin.put(`/api/affectation/projects/${p.id}/assignments/visite_metier`, { resource_ids: [resource.id] });
        await admin.post('/api/schedule', { [`${resource.id}_available_2027-03-03_PM`]: '3' });

        const preview = (await admin.get(`/api/affectation/projects/${p.id}/sync/visite_metier`)).data;
        const visite = await typeByCode('visiteMetier');
        expect(preview).toMatchObject({
            samu: samu.name,
            samuLoc: `🚨 SAMU ${samu.no}`,
            locationId: samu.locationId,
            start: '2027-03-01',
            end: '2027-03-03',
            activity: '3',
            event: { label: visite.label_long, typeId: visite.id, existing: null }
        });
        expect(preview.resources).toEqual([
            expect.objectContaining({ id: resource.id, user_id: user.id, toWrite: 5, done: 0, conflictCount: 1 })
        ]);
        expect(preview.resources[0].conflicts).toEqual([{ key: '2027-03-03_PM', reason: 'Congés' }]);

        const applied = await admin.post(`/api/affectation/projects/${p.id}/sync/visite_metier`, {
            planning: { resource_ids: [resource.id] },
            event: { apply: true, participants: [user.id] }
        });
        expect(applied.data).toMatchObject({ planning: 5, event: { created: true, participants: 1 } });
        const eventId = applied.data.event.id;
        const sch = await schedule();
        expect(sch[`${resource.id}_activity_2027-03-01_AM`]).toBe('3');
        expect(sch[`${resource.id}_localisation_2027-03-01_AM`]).toBe(`🚨 SAMU ${samu.no}`);

        const again = (await admin.get(`/api/affectation/projects/${p.id}/sync/visite_metier`)).data;
        expect(again.resources[0]).toMatchObject({ toWrite: 0, done: 5 });
        expect(again.event.existing).toMatchObject({ id: eventId, participants: [user.id] });

        const candidates = (await admin.get(`/api/affectation/projects/${p.id}/events-candidates`)).data;
        expect(candidates.candidates.visite_metier).toMatchObject({ typeId: visite.id, linked: eventId });
        expect(candidates.candidates.visite_metier.matching).toEqual([
            expect.objectContaining({ id: eventId, participants: 1, type: visite.label_long })
        ]);
        const list = (await admin.get('/api/affectation/events')).data;
        expect(list.events.find(e => e.id === eventId)).toMatchObject({
            project_id: p.id,
            stage: 'visite_metier',
            planned: { start: '2027-03-01', end: '2027-03-03' },
            participants: [`${user.prenom} ${user.nom}`]
        });
        expect(list.samus).toContain(samu.name);

        // Désaffectation : planification remise en situation, ressource retirée de l'événement
        const rel = await admin.post(`/api/affectation/projects/${p.id}/assignments/visite_metier/release`, {
            resource_ids: [resource.id]
        });
        expect(rel.data).toEqual({ success: true, planningReset: 5, removedFromEvents: 1 });
        const after = await schedule();
        expect(after[`${resource.id}_activity_2027-03-01_AM`]).toBe('2');
        expect(after).not.toHaveProperty(`${resource.id}_localisation_2027-03-01_AM`);

        // Suppression : validation exigée si des événements sont liés
        const del = await admin.delete(`/api/affectation/projects/${p.id}`);
        expect(del.status).toBe(409);
        expect(del.data).toMatchObject({ code: 'EVENTS_LINKED', events: [expect.objectContaining({ id: eventId })] });
        const ok = await admin.delete(`/api/affectation/projects/${p.id}?events=delete`);
        expect(ok.data).toMatchObject({ success: true, eventsRemoved: 1 });
        expect(await project(p.id)).toBeUndefined();
        expect((await admin.get('/api/custom-events')).data.events.some(e => e.id === eventId)).toBe(false);
    });

    it('événement créé depuis un déploiement, lien manuel, affectations complétées depuis les participants', async () => {
        const samu = await newSamu();
        const p = await createProject(samu);
        const { user, resource } = await createExpert(admin);
        expect((await admin.post(`/api/affectation/projects/${p.id}/event-create`, { key: 'inconnue' })).status).toBe(
            400
        );
        expect((await admin.post(`/api/affectation/projects/${p.id}/event-create`, { key: 'vft' })).status).toBe(400);
        const created = await admin.post(`/api/affectation/projects/${p.id}/event-create`, {
            key: 'mise_en_service',
            start: '2027-04-01'
        });
        expect(created.data).toMatchObject({ success: true, participants: 0 });
        const mes = (await admin.get('/api/custom-events')).data.events.find(e => e.id === created.data.eventId);
        expect(mes).toMatchObject({ location_id: samu.locationId, start_date: '2027-04-01', grist: 1 });

        expect(
            (await admin.put(`/api/affectation/projects/${p.id}/event-link`, { key: 'vft', eventId: 999999 })).status
        ).toBe(404);
        await admin.put(`/api/affectation/projects/${p.id}/event-link`, { key: 'vft', eventId: created.data.eventId });
        const cand = (await admin.get(`/api/affectation/projects/${p.id}/events-candidates`)).data.candidates;
        expect(cand.vft.linked).toBe(created.data.eventId);

        // Un événement du même lieu et du même type, avec un expert en participant, complète les affectations
        const visite = await typeByCode('visiteMetier');
        await admin.post('/api/custom-events', {
            startDate: '2027-03-02',
            label: 'Visite',
            type_id: visite.id,
            location_id: samu.locationId,
            participants: [user.id]
        });
        const assigned = await waitFor(async () => (await project(p.id)).assignments.visite_metier);
        expect(assigned).toEqual([resource.id]);
        const sync = await admin.post('/api/affectation/sync-from-events', { projectId: p.id });
        expect(sync.data).toEqual({ success: true, changes: [] });
    });
});

describe('import Asana (fichier CSV)', () => {
    it('aperçu puis création du déploiement', async () => {
        await admin.post('/api/locations', { libelle_long: `SAMU SAS 4X ${Date.now()}`, libelle_court: 'SAMU-SAS 4X' });
        const asanaProject = 'Déploiement [SAMU 4X]';
        const csv = [
            'Name,Section/Column,Start Date,Due Date,Parent task,Projects',
            `"Démarrage projet auprès de l'ES",,,2027-01-11,,"${asanaProject}"`,
            `2.9 Fin du cadrage,,2027-02-01,2027-02-12,,"${asanaProject}"`,
            `Mise en service du bandeau,,,2027-04-06,,"${asanaProject}"`,
            `5.1 Visite métier,,2027-03-08,2027-03-09,,"${asanaProject}"`
        ].join('\n');
        expect((await admin.post('/api/affectation/import/asana-csv', { csv: 'Name\nx' })).status).toBe(400);
        const pv = (await admin.post('/api/affectation/import/asana-csv', { csv })).data;
        expect(pv).toMatchObject({ samuNo: '4X', samuName: 'SAMU-SAS 4X', locationFound: true, existing: null });
        const status = Object.fromEntries(pv.rows.map(r => [r.key, r.status]));
        expect(status).toMatchObject({
            date_debut: 'nouveau',
            cadrage: 'nouveau',
            deploiement: 'nouveau',
            mise_en_service: 'nouveau',
            visite_metier: 'nouveau',
            vft: 'absent'
        });
        const applied = (
            await admin.post('/api/affectation/import/asana-csv/apply', {
                csv,
                apply: ['date_debut', 'cadrage', 'deploiement', 'mise_en_service', 'visite_metier']
            })
        ).data;
        expect(applied).toMatchObject({
            success: true,
            created: true,
            samu_name: 'SAMU-SAS 4X',
            date_debut: '2027-01-11'
        });
        const p = await project(applied.id);
        expect(p).toMatchObject({
            from_asana: true,
            date_mise_en_service: '2027-04-06',
            periods: {
                cadrage: [{ start: '2027-01-11', end: '2027-02-12' }],
                deploiement: [{ start: '2027-02-13', end: '2027-04-06' }],
                visite_metier: [{ start: '2027-03-08', end: '2027-03-09', needed: 1 }]
            }
        });
        const again = (await admin.post('/api/affectation/import/asana-csv', { csv })).data;
        expect(again.existing).toEqual({ id: applied.id, samu_name: 'SAMU-SAS 4X' });
        expect(again.rows.find(r => r.key === 'cadrage').status).toBe('identique');
        expect((await admin.get('/api/affectation/asana/config')).data).toMatchObject({ tokenSet: false });
    });
});
