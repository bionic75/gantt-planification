// Ressources (experts mis à disposition)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createResource, createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const findResource = async (client, id) => (await client.get('/api/resources')).data.find(r => r.id === id);

describe('ressources', () => {
    it.each([
        ['nom', { nom: '' }],
        ['samu', { samu: '' }],
        ['taux (hors MAD volante)', { taux: '' }],
        ['date de fin et jours max (MAD volante)', { is_mad_volante: 1 }]
    ])('création : %s obligatoire', async (_champ, override) => {
        const r = await admin.post('/api/resources', {
            nom: 'N',
            prenom: 'P',
            trigramme: 'XXX',
            taux: 50,
            samu: 'SAMU 75',
            ...override
        });
        expect(r.status).toBe(400);
    });

    it('création puis lecture par tout utilisateur connecté', async () => {
        const res = await createResource(admin, { taux: 80, date_debut: '2025-03-01' });
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        expect(await findResource(client, res.id)).toMatchObject({
            nom: res.nom,
            prenom: res.prenom,
            trigramme: res.trigramme,
            taux: 80,
            samu: 'SAMU 75',
            date_debut: '2025-03-01'
        });
    });

    it("crée l'historique MAD initial", async () => {
        const res = await createResource(admin, { taux: 60, date_debut: '2025-02-01' });
        const r = await admin.get(`/api/resources/${res.id}/mad-history`);
        expect(r.status).toBe(200);
        expect(r.data).toEqual([expect.objectContaining({ taux: 60, date_debut: '2025-02-01', date_fin: null })]);
    });

    it('modification', async () => {
        const res = await createResource(admin);
        const r = await admin.put(`/api/resources/${res.id}`, { ...res, nom: 'MODIFIE', taux: 30 });
        expect(r.status).toBe(200);
        expect(await findResource(admin, res.id)).toMatchObject({ nom: 'MODIFIE', taux: 30 });
    });

    it('adresses e-mail : syntaxe vérifiée (e-mail de la ressource et contacts RH)', async () => {
        const res = await createResource(admin);
        const put = body => admin.put(`/api/resources/${res.id}`, { ...res, ...body });

        const bad = await put({ email: 'pas-une-adresse' });
        expect(bad.status).toBe(400);
        expect(bad.data.error).toMatch(/Adresse e-mail invalide/);
        expect((await put({ email: 'prenom.nom@esante.gouv.fr' })).status).toBe(200);
        expect((await put({ email: '' })).status).toBe(200);

        const rh = await put({ contacts_rh: 'rh@etablissement.fr\ntexte libre\ndrh@hopital' });
        expect(rh.status).toBe(400);
        expect(rh.data.error).toMatch(/texte libre, drh@hopital/);
        expect((await put({ contacts_rh: 'a@b.fr; c@d.fr' })).status).toBe(400);
        // une seule adresse par ligne, lignes vides et doublons retirés
        expect(
            (await put({ contacts_rh: ' rh@etablissement.fr \n\nRH@ETABLISSEMENT.FR\ndrh@hopital.fr\r\n' })).status
        ).toBe(200);
        expect((await findResource(admin, res.id)).contacts_rh).toBe('rh@etablissement.fr\ndrh@hopital.fr');
        expect((await put({ contacts_rh: '' })).status).toBe(200);
        expect((await findResource(admin, res.id)).contacts_rh).toBeNull();

        const created = await admin.post('/api/resources', { ...res, trigramme: 'ZZZ', email: 'oups' });
        expect(created.status).toBe(400);
    });

    it('activation / désactivation', async () => {
        const res = await createResource(admin);
        const initial = (await findResource(admin, res.id)).actif;
        expect((await admin.post(`/api/resources/${res.id}/toggle`)).status).toBe(200);
        expect((await findResource(admin, res.id)).actif).toBe(initial === 1 ? 0 : 1);
    });

    it('suppression avec son planning', async () => {
        const res = await createResource(admin);
        await admin.post('/api/schedule', { [`${res.id}_available_2025-05-05_AM`]: '2' });
        expect((await admin.delete(`/api/resources/${res.id}`)).status).toBe(200);
        expect(await findResource(admin, res.id)).toBeUndefined();
        expect((await admin.get('/api/schedule')).data).not.toHaveProperty(`${res.id}_available_2025-05-05_AM`);
    });
});
