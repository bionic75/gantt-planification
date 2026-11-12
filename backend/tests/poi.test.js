// Bonnes adresses autour des SAMU-SAS : lieux, notes, commentaires, droits
// (coordonnées toujours fournies : aucun appel au service de géocodage externe)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;
let samu;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
    const r = await admin.post('/api/locations', {
        libelle_long: 'SAMU POI TEST',
        libelle_court: 'samu 99',
        latitude: 48.85,
        longitude: 2.35
    });
    samu = r.data.id;
});
afterAll(() => server?.stop());

const place = (overrides = {}) => ({
    category: 'restaurant',
    name: 'Chez Test',
    location_id: samu,
    address: '1 rue du Test',
    latitude: 48.86,
    longitude: 2.36,
    comment: 'Bon accueil',
    ...overrides
});

async function userClient() {
    const user = await createUser(admin, { is_user: 1 });
    return { user, client: await loginAs(server, user, 'user') };
}

describe('lieux', () => {
    it('création avec note, liste, détail, filtres et méta', async () => {
        const { user, client } = await userClient();
        const r = await client.post('/api/poi', place({ rating: 4.4, name: '  Le Zinc  ' }));
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const list = await client.get('/api/poi');
        expect(list.data).toMatchObject({ isAdmin: false, userId: user.id });
        const poi = list.data.pois.find(p => p.id === r.data.id);
        expect(poi).toMatchObject({
            name: 'Le Zinc',
            loc_court: 'SAMU 99',
            category: 'restaurant',
            creator: `${user.prenom} ${user.nom.toUpperCase()}`,
            avg_rating: 4,
            n_ratings: 1,
            my_rating: 4,
            n_comments: 0,
            can_edit: true,
            distance_km: 1.3
        });

        const detail = await admin.get(`/api/poi/${r.data.id}`);
        expect(detail.data.poi).toMatchObject({ my_rating: null, can_edit: true });
        expect(detail.data.ratings).toEqual([expect.objectContaining({ user_id: user.id, rating: 4, can_edit: true })]);

        const ids = async q => (await client.get(`/api/poi?${q}`)).data.pois.map(p => p.id);
        expect(await ids('q=zinc')).toEqual([r.data.id]);
        expect(await ids('q=samu%2099')).toContain(r.data.id);
        expect(await ids(`q=${user.nom.toLowerCase()}`)).toEqual([r.data.id]);
        expect(await ids('category=bar')).not.toContain(r.data.id);
        expect(await ids(`creator=${user.id}&location_id=${samu}`)).toEqual([r.data.id]);

        const meta = (await client.get('/api/poi/meta')).data;
        expect(meta.categories).toEqual(['hebergement', 'restaurant', 'bar']);
        expect(meta.locations.find(l => l.id === samu).n_poi).toBeGreaterThanOrEqual(1);
        expect(meta.counts[samu].restaurant).toBeGreaterThanOrEqual(1);
        expect(meta.creators).toContainEqual({ id: user.id, name: `${user.prenom} ${user.nom.toUpperCase()}` });
        expect((await client.get('/api/poi/999999')).status).toBe(404);
    });

    it('validation des champs', async () => {
        expect((await admin.post('/api/poi', place({ category: 'musee' }))).status).toBe(400);
        expect((await admin.post('/api/poi', place({ name: 'x' }))).status).toBe(400);
        expect((await admin.post('/api/poi', place({ location_id: 999999 }))).data.error).toBe(
            'Choisissez le SAMU-SAS auquel rattacher ce lieu'
        );
        expect((await admin.get('/api/poi/places?q=ab')).data).toEqual({ places: [] });
    });

    it('modification et suppression : créateur ou administrateur', async () => {
        const a = await userClient();
        const b = await userClient();
        const { id } = (await a.client.post('/api/poi', place())).data;
        expect((await b.client.put(`/api/poi/${id}`, place({ name: 'Pirate' }))).status).toBe(403);
        expect((await b.client.delete(`/api/poi/${id}`)).status).toBe(403);
        expect((await a.client.put(`/api/poi/${id}`, place({ name: 'Renommé', category: 'bar' }))).data).toEqual({
            success: true
        });
        expect((await a.client.get(`/api/poi/${id}`)).data.poi).toMatchObject({ name: 'Renommé', category: 'bar' });
        await b.client.post(`/api/poi/${id}/comments`, { text: 'Avis' });
        await b.client.put(`/api/poi/${id}/rating`, { rating: 5 });
        expect((await admin.delete(`/api/poi/${id}`)).data).toEqual({ success: true });
        expect((await a.client.get(`/api/poi/${id}`)).status).toBe(404);
    });
});

describe('notes et commentaires', () => {
    it("notes : une par utilisateur, moyenne, retrait par l'administrateur", async () => {
        const a = await userClient();
        const b = await userClient();
        const { id } = (await a.client.post('/api/poi', place())).data;
        await a.client.put(`/api/poi/${id}/rating`, { rating: 2 });
        await a.client.put(`/api/poi/${id}/rating`, { rating: 3 });
        await b.client.put(`/api/poi/${id}/rating`, { rating: 4 });
        expect((await a.client.put(`/api/poi/${id}/rating`, { rating: 9 })).status).toBe(400);
        expect((await a.client.put('/api/poi/999999/rating', { rating: 3 })).status).toBe(404);
        let poi = (await a.client.get(`/api/poi/${id}`)).data.poi;
        expect(poi).toMatchObject({ avg_rating: 3.5, n_ratings: 2, my_rating: 3 });

        // Sans droit d'administration, user_id est ignoré : seule sa propre note est retirée
        await b.client.delete(`/api/poi/${id}/rating?user_id=${a.user.id}`);
        poi = (await a.client.get(`/api/poi/${id}`)).data.poi;
        expect(poi).toMatchObject({ n_ratings: 1, my_rating: 3 });
        await admin.delete(`/api/poi/${id}/rating?user_id=${a.user.id}`);
        expect((await a.client.get(`/api/poi/${id}`)).data.poi).toMatchObject({ n_ratings: 0, avg_rating: null });
    });

    it('commentaires : auteur ou administrateur', async () => {
        const a = await userClient();
        const b = await userClient();
        const { id } = (await a.client.post('/api/poi', place())).data;
        expect((await b.client.post(`/api/poi/${id}/comments`, { text: '   ' })).status).toBe(400);
        const c = await b.client.post(`/api/poi/${id}/comments`, { text: ' Très bien ' });
        expect(c.data.success).toBe(true);
        let detail = (await a.client.get(`/api/poi/${id}`)).data;
        expect(detail.poi.n_comments).toBe(1);
        expect(detail.comments).toEqual([
            expect.objectContaining({ id: c.data.id, text: 'Très bien', user_id: b.user.id, can_edit: false })
        ]);
        expect((await a.client.put(`/api/poi/comments/${c.data.id}`, { text: 'x' })).status).toBe(403);
        await b.client.put(`/api/poi/comments/${c.data.id}`, { text: 'Modifié' });
        detail = (await b.client.get(`/api/poi/${id}`)).data;
        expect(detail.comments[0]).toMatchObject({ text: 'Modifié', can_edit: true });
        expect((await a.client.delete(`/api/poi/comments/${c.data.id}`)).status).toBe(403);
        await admin.delete(`/api/poi/comments/${c.data.id}`);
        expect((await b.client.get(`/api/poi/${id}`)).data.comments).toEqual([]);
        expect((await b.client.delete('/api/poi/comments/999999')).status).toBe(404);
    });
});
