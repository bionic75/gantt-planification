// Astreintes et HNO : saisie, verrou des CRA soumis, saisie mensuelle, disponibilités, planning d'astreinte
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createResource, createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const line = (overrides = {}) => ({
    type: 'astreinte',
    date_debut: '2025-09-10',
    date_fin: '2025-09-10',
    heure_debut: '18:00',
    heure_fin: '23:00',
    samu: 'SAMU 75',
    objet: 'Garde',
    ...overrides
});

async function expertClient() {
    const { user, resource } = await createExpert(admin);
    return { user, resource, client: await loginAs(server, user, 'expert') };
}

describe('saisie des astreintes / HNO', () => {
    it("création par l'expert, visible dans ses astreintes et sur le planning", async () => {
        const { user, resource, client } = await expertClient();
        const r = await client.post('/api/astreintes', line({ user_id: 999 }));
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.message).toBe('Astreinte/HNO créée');
        const mine = (await client.get('/api/mes-astreintes')).data;
        expect(mine).toEqual([
            expect.objectContaining({ id: r.data.id, user_id: user.id, samu: 'SAMU 75', tous_samu: 0 })
        ]);
        const planning = (await client.get('/api/all-astreintes-planning')).data;
        expect(planning.find(a => a.id === r.data.id)).toMatchObject({
            user_nom: user.nom,
            user_prenom: user.prenom,
            resource_id: resource.id
        });
    });

    it('champs obligatoires et « tous les SAMU »', async () => {
        const { client } = await expertClient();
        expect((await client.post('/api/astreintes', line({ objet: '' }))).status).toBe(400);
        expect((await client.post('/api/astreintes', line({ heure_fin: '' }))).data.error).toBe(
            'Heures de début et fin requises'
        );
        expect((await client.post('/api/astreintes', line({ samu: '' }))).status).toBe(400);
        const r = await client.post('/api/astreintes', line({ samu: 'SAMU 13', tous_samu: true }));
        const created = (await client.get('/api/mes-astreintes')).data.find(a => a.id === r.data.id);
        expect(created).toMatchObject({ samu: null, tous_samu: 1 });
    });

    it("l'administrateur saisit pour un expert ; listes réservées aux administrateurs", async () => {
        const { user, client } = await expertClient();
        const r = await admin.post('/api/astreintes', line({ user_id: user.id, type: 'hno' }));
        expect((await client.get('/api/mes-astreintes')).data.map(a => a.id)).toContain(r.data.id);
        expect((await admin.get('/api/astreintes')).data.find(a => a.id === r.data.id)).toMatchObject({
            user_nom: user.nom
        });
        expect((await client.get('/api/astreintes')).status).toBe(403);
        expect((await client.get('/api/experts-list')).status).toBe(403);
        expect((await admin.get('/api/experts-list')).data).toContainEqual({
            id: user.id,
            nom: user.nom,
            prenom: user.prenom
        });
    });

    it('modification et suppression : propriétaire ou administrateur', async () => {
        const a = await expertClient();
        const b = await expertClient();
        const { id } = (await a.client.post('/api/astreintes', line())).data;
        expect((await b.client.put(`/api/astreintes/${id}`, line())).status).toBe(403);
        expect((await b.client.delete(`/api/astreintes/${id}`)).status).toBe(403);
        expect((await a.client.put(`/api/astreintes/${id}`, line({ heure_debut: '' }))).status).toBe(400);
        const r = await a.client.put(`/api/astreintes/${id}`, line({ objet: 'Modifiée', type: 'hno' }));
        expect(r.data).toEqual({ message: 'Astreinte/HNO modifiée' });
        expect((await a.client.get('/api/mes-astreintes')).data[0]).toMatchObject({ objet: 'Modifiée', type: 'hno' });
        expect((await admin.delete(`/api/astreintes/${id}`)).data).toEqual({ message: 'Astreinte/HNO supprimée' });
        expect((await a.client.delete(`/api/astreintes/${id}`)).status).toBe(404);
        expect((await a.client.delete('/api/astreintes-hno/999999')).status).toBe(404);
    });

    it('un CRA soumis verrouille la saisie du mois', async () => {
        const { user, client } = await expertClient();
        const { id } = (
            await client.post('/api/astreintes', line({ date_debut: '2025-10-02', date_fin: '2025-10-02' }))
        ).data;
        const cra = (await client.get(`/api/cra/find-or-create?user_id=${user.id}&mois=10&annee=2025`)).data;
        expect((await client.get(`/api/astreintes-hno/lock-check?user_id=${user.id}&mois=10&annee=2025`)).data).toEqual(
            {
                locked: false,
                statut: 'a_completer'
            }
        );
        await client.post(`/api/cra/${cra.id}/submit`, {});

        expect((await client.get(`/api/astreintes-hno/lock-check?user_id=${user.id}&mois=10&annee=2025`)).data).toEqual(
            {
                locked: true,
                statut: 'soumis'
            }
        );
        const created = await client.post(
            '/api/astreintes',
            line({ date_debut: '2025-10-05', date_fin: '2025-10-05' })
        );
        expect(created.status).toBe(403);
        expect(created.data.error).toMatch(/CRA soumis/);
        expect((await client.put(`/api/astreintes/${id}`, line())).status).toBe(403);
        expect((await client.delete(`/api/astreintes-hno/${id}`)).status).toBe(403);
        expect(
            (await client.post('/api/astreintes-hno/direct', { user_id: user.id, mois: 10, annee: 2025, lignes: [] }))
                .status
        ).toBe(403);
        // Autre mois : libre
        expect(
            (await client.post('/api/astreintes', line({ date_debut: '2025-11-05', date_fin: '2025-11-05' }))).status
        ).toBe(200);
    });
});

describe('saisie mensuelle directe', () => {
    it('remplace les lignes commençant dans le mois', async () => {
        const { user, client } = await expertClient();
        await client.post('/api/astreintes', line({ date_debut: '2025-12-01', date_fin: '2025-12-01' }));
        await client.post('/api/astreintes', line({ date_debut: '2026-01-03', date_fin: '2026-01-03' }));
        const r = await client.post('/api/astreintes-hno/direct', {
            user_id: user.id,
            mois: 12,
            annee: 2025,
            lignes: [
                { type: 'hno', date_debut: '2025-12-20', date_fin: '2025-12-20', heure_debut: '20:00', objet: 'Nuit' },
                { type: 'astreinte', date_debut: '2025-12-05', date_fin: '2025-12-06', objet: 'WE', samu: 'SAMU 92' }
            ]
        });
        expect(r.data).toEqual({ success: true, inserted: 2 });
        const month = (await client.get(`/api/astreintes-hno/direct?user_id=${user.id}&mois=12&annee=2025`)).data;
        expect(month.map(l => [l.date_debut, l.type, l.heure_fin, l.samu])).toEqual([
            ['2025-12-05', 'astreinte', null, 'SAMU 92'],
            ['2025-12-20', 'hno', null, null]
        ]);
        expect((await client.get('/api/mes-astreintes')).data.map(l => l.date_debut)).toContain('2026-01-03');
    });

    it('accès réservé à soi ou aux administrateurs', async () => {
        const a = await expertClient();
        const b = await expertClient();
        expect((await a.client.get(`/api/astreintes-hno/direct?user_id=${b.user.id}&mois=1&annee=2025`)).status).toBe(
            403
        );
        expect((await a.client.get('/api/astreintes-hno/direct?mois=1')).status).toBe(400);
        expect((await admin.get(`/api/astreintes-hno/direct?user_id=${b.user.id}&mois=1&annee=2025`)).status).toBe(200);
    });
});

describe("planning d'astreinte", () => {
    it('volontaires, disponibilités et indisponibilités', async () => {
        const res = await createResource(admin);
        await admin.post(`/api/astreinte/volontaire/${res.id}`, { volontaire: true });
        const v = (await admin.get('/api/astreinte/volontaires')).data.find(x => x.id === res.id);
        expect(v).toMatchObject({ astreinte_volontaire: 1, trigramme: res.trigramme });
        expect(v.astreinte_date_activation).toBeTruthy();

        const saved = await admin.post(`/api/astreinte/dispos/${res.id}/2031-05`, {
            disponibilites: ['2031-05-02', '2031-05-03']
        });
        expect(saved.data).toEqual({ success: true, count: 2 });
        const dispos = (await admin.get(`/api/astreinte/dispos/${res.id}/2031-05`)).data;
        expect(dispos.map(d => [d.date, d.type_creneau])).toEqual([
            ['2031-05-02', 'soir'],
            ['2031-05-03', 'journee']
        ]);

        const first = await admin.post('/api/astreinte/indispo', {
            resource_id: res.id,
            date: '2031-05-10',
            type_creneau: 'journee',
            motif: 'Congés'
        });
        await admin.post('/api/astreinte/indispo', {
            resource_id: res.id,
            date: '2031-05-10',
            type_creneau: 'journee'
        });
        const indispos = (await admin.get('/api/astreinte/indispos')).data.filter(i => i.resource_id === res.id);
        expect(indispos).toHaveLength(1);
        expect(indispos[0].motif).toBeNull();
        await admin.delete(`/api/astreinte/indispo/${indispos[0].id}`);
        expect((await admin.get('/api/astreinte/indispos')).data.some(i => i.resource_id === res.id)).toBe(false);
        expect(first.data.success).toBe(true);
    });

    it('génération : créneaux attribués selon les disponibilités, avec équité', async () => {
        const a = await createResource(admin, { nom: 'ALPHA', prenom: 'Anne' });
        const b = await createResource(admin, { nom: 'BRAVO', prenom: 'Bob' });
        for (const r of [a, b]) await admin.post(`/api/astreinte/volontaire/${r.id}`, { volontaire: true });
        await admin.post(`/api/astreinte/dispos/${a.id}/2030-06`, { disponibilites: ['2030-06-03', '2030-06-04'] });
        await admin.post(`/api/astreinte/dispos/${b.id}/2030-06`, { disponibilites: ['2030-06-04'] });

        const r = await admin.post('/api/astreinte/generate', { year: 2030, month: 6 });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.planning).toHaveLength(30);
        const slot = date => r.data.planning.find(s => s.date === date);
        expect(slot('2030-06-01')).toMatchObject({ type_creneau: 'journee', resource_id: null, year: 2030, month: 6 });
        expect(slot('2030-06-03')).toMatchObject({ type_creneau: 'soir', resource_id: a.id });
        expect(slot('2030-06-04')).toMatchObject({ type_creneau: 'soir', resource_id: b.id });
        expect(r.data.stats).toEqual({ 'ALPHA Anne': 1, 'BRAVO Bob': 1 });
        expect(r.data.warnings).toHaveLength(28);
        expect(r.data.disponibilites).toHaveLength(3);

        const stored = (await admin.get('/api/astreinte/planning/2030-06')).data;
        expect(stored.map(s => s.id)).toEqual(r.data.planning.map(s => s.id));
        await admin.put(`/api/astreinte/slot/${slot('2030-06-01').id}`, { resource_id: b.id });
        expect((await admin.get('/api/astreinte/planning/2030-06')).data[0].resource_id).toBe(b.id);

        // Nouvelle génération : le planning du mois est remplacé
        await admin.post('/api/astreinte/generate', { year: 2030, month: 6 });
        expect((await admin.get('/api/astreinte/planning/2030-06')).data).toHaveLength(30);
    });

    it('réservé aux administrateurs', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        expect((await client.post('/api/astreinte/generate', { year: 2030, month: 7 })).status).toBe(403);
        expect((await client.get('/api/astreinte/volontaires')).status).toBe(403);
    });
});
