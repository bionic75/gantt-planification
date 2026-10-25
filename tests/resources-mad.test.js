// Ressources : affectations SAMU, historique des taux MAD, particularités, taux effectif
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

const history = async id => (await admin.get(`/api/resources/${id}/mad-history`)).data;

describe('affectations SAMU', () => {
    it("l'admin remplace les affectations d'une ressource", async () => {
        const res = await createResource(admin);
        const r = await admin.put(`/api/resources/${res.id}/samu-assignments`, {
            principal: ['SAMU 75', ' ', 'SAMU 92'],
            secondaire: ['SAMU 93']
        });
        expect(r.status).toBe(200);
        const list = (await admin.get(`/api/resources/${res.id}/samu-assignments`)).data;
        expect(list.map(a => [a.samu, a.role])).toEqual([
            ['SAMU 75', 'principal'],
            ['SAMU 92', 'principal'],
            ['SAMU 93', 'secondaire']
        ]);

        await admin.put(`/api/resources/${res.id}/samu-assignments`, { principal: ['SAMU 13'] });
        expect((await admin.get(`/api/resources/${res.id}/samu-assignments`)).data.map(a => a.samu)).toEqual([
            'SAMU 13'
        ]);
        const all = (await admin.get('/api/resource-samu-assignments')).data;
        expect(all.filter(a => a.resource_id === res.id)).toHaveLength(1);
    });

    it("l'expert modifie les affectations de sa propre ressource", async () => {
        const { user, resource } = await createExpert(admin);
        const expert = await loginAs(server, user, 'expert');
        expect((await expert.put('/api/me/samu-assignments', { secondaire: ['SAMU 69'] })).status).toBe(200);
        const list = (await admin.get(`/api/resources/${resource.id}/samu-assignments`)).data;
        expect(list.map(a => [a.samu, a.role])).toEqual([['SAMU 69', 'secondaire']]);
    });

    it('refusé à un compte sans ressource', async () => {
        const r = await admin.put('/api/me/samu-assignments', { principal: ['SAMU 75'] });
        expect(r.status).toBe(403);
    });
});

describe('historique des taux MAD', () => {
    it('ajout : taux et date de début obligatoires', async () => {
        const res = await createResource(admin);
        expect((await admin.post(`/api/resources/${res.id}/mad-history`, { taux: 50 })).status).toBe(400);
    });

    it('refuse un chevauchement, accepte une période contiguë', async () => {
        const res = await createResource(admin, { date_debut: '2024-01-01' });
        const [initial] = await history(res.id);
        await admin.put(`/api/resources/${res.id}/mad-history/${initial.id}`, {
            taux: 50,
            date_debut: '2024-01-01',
            date_fin: '2024-06-30'
        });

        const overlap = await admin.post(`/api/resources/${res.id}/mad-history`, {
            taux: 70,
            date_debut: '2024-06-30'
        });
        expect(overlap.status).toBe(400);
        expect(overlap.data.error).toMatch(/Chevauchement/);

        const ok = await admin.post(`/api/resources/${res.id}/mad-history`, { taux: 70, date_debut: '2024-07-01' });
        expect(ok.status).toBe(200);
        expect(ok.data.id).toEqual(expect.any(Number));
        expect((await history(res.id)).map(h => [h.taux, h.date_debut, h.date_fin])).toEqual([
            [50, '2024-01-01', '2024-06-30'],
            [70, '2024-07-01', null]
        ]);
    });

    it('la période en cours met à jour le taux de la ressource', async () => {
        const res = await createResource(admin, { taux: 40, date_debut: '2020-01-01' });
        const [initial] = await history(res.id);
        await admin.put(`/api/resources/${res.id}/mad-history/${initial.id}`, {
            taux: 40,
            date_debut: '2020-01-01',
            date_fin: '2020-12-31'
        });
        await admin.post(`/api/resources/${res.id}/mad-history`, { taux: 90, date_debut: '2021-01-01' });
        const resource = (await admin.get('/api/resources')).data.find(r => r.id === res.id);
        expect(resource.taux).toBe(90);
    });

    it('impossible de supprimer la dernière période', async () => {
        const res = await createResource(admin);
        const [initial] = await history(res.id);
        const r = await admin.delete(`/api/resources/${res.id}/mad-history/${initial.id}`);
        expect(r.status).toBe(400);
    });

    it("suppression d'une période parmi plusieurs", async () => {
        const res = await createResource(admin, { date_debut: '2024-01-01' });
        const [initial] = await history(res.id);
        await admin.put(`/api/resources/${res.id}/mad-history/${initial.id}`, {
            taux: 50,
            date_debut: '2024-01-01',
            date_fin: '2024-03-31'
        });
        const added = await admin.post(`/api/resources/${res.id}/mad-history`, { taux: 60, date_debut: '2024-04-01' });
        expect((await admin.delete(`/api/resources/${res.id}/mad-history/${added.data.id}`)).status).toBe(200);
        expect(await history(res.id)).toHaveLength(1);
    });
});

describe('particularités et taux effectif', () => {
    async function resourceWithPeriod() {
        const res = await createResource(admin, { taux: 50, date_debut: '2024-01-01' });
        const [period] = await history(res.id);
        await admin.put(`/api/resources/${res.id}/mad-history/${period.id}`, {
            taux: 50,
            date_debut: '2024-01-01',
            date_fin: '2024-12-31'
        });
        return { res, period, url: `/api/resources/${res.id}/mad-history/${period.id}/particularites` };
    }

    it('ajout : champs obligatoires et dates dans la période parente', async () => {
        const { url } = await resourceWithPeriod();
        expect((await admin.post(url, { taux: 20, date_debut: '2024-02-01' })).status).toBe(400);
        const outside = await admin.post(url, { taux: 20, date_debut: '2024-12-01', date_fin: '2025-01-15' });
        expect(outside.status).toBe(400);
    });

    it('période parente inconnue → 404', async () => {
        const { res } = await resourceWithPeriod();
        const r = await admin.post(`/api/resources/${res.id}/mad-history/999999/particularites`, {
            taux: 20,
            date_debut: '2024-02-01',
            date_fin: '2024-02-10'
        });
        expect(r.status).toBe(404);
    });

    it('cycle complet et calcul du taux effectif', async () => {
        const { res, url } = await resourceWithPeriod();
        const added = await admin.post(url, {
            taux: 20,
            date_debut: '2024-03-01',
            date_fin: '2024-03-31',
            motif: 'Congés'
        });
        expect(added.status).toBe(200);

        const overlap = await admin.post(url, { taux: 30, date_debut: '2024-03-15', date_fin: '2024-04-15' });
        expect(overlap.status).toBe(400);

        const rate = date => admin.get(`/api/resources/${res.id}/effective-mad-rate?date=${date}`);
        expect((await rate('2024-03-10')).data).toMatchObject({ taux: 20, source: 'particularite' });
        expect((await rate('2024-05-10')).data).toMatchObject({ taux: 50, source: 'history' });
        expect((await rate('2026-05-10')).data).toMatchObject({ source: 'resource' });

        const pid = added.data.id;
        const upd = await admin.put(`${url}/${pid}`, { taux: 25, date_debut: '2024-03-01', date_fin: '2024-03-20' });
        expect(upd.status).toBe(200);
        expect((await admin.get(url)).data).toEqual([
            expect.objectContaining({ id: pid, taux: 25, date_fin: '2024-03-20', motif: null })
        ]);

        expect((await admin.delete(`${url}/${pid}`)).status).toBe(200);
        expect((await admin.get(url)).data).toEqual([]);
    });
});

describe('carte des experts et volontariat aux astreintes', () => {
    it('liste les ressources rattachées à un établissement', async () => {
        const res = await createResource(admin, { es_rattachement: 'CHU Test' });
        await createResource(admin);
        const map = (await admin.get('/api/resources/experts-map')).data;
        expect(map.find(r => r.id === res.id)).toMatchObject({ es_rattachement: 'CHU Test' });
        expect(map.every(r => r.es_rattachement)).toBe(true);
    });

    it('le volontariat donne le profil expert aux comptes rattachés', async () => {
        const res = await createResource(admin);
        const user = await createUser(admin, { is_user: 1, resource_id: res.id });
        expect((await admin.post(`/api/resources/${res.id}/astreinte`, { hasAccess: true })).status).toBe(200);
        const resource = (await admin.get('/api/resources')).data.find(r => r.id === res.id);
        expect(resource.astreinte_volontaire).toBe(1);
        await loginAs(server, user, 'expert');
    });
});
