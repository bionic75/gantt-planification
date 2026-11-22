// Ressources (experts mis à disposition)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.ts';
import { createResource, createUser, loginAs } from './helpers/fixtures.ts';
import type { TestServer } from './helpers/server.ts';
import type { Client } from './helpers/client.ts';

let server: TestServer;
let admin: Client;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const findResource = async (client: Client, id: any) =>
    (await client.get('/api/resources')).data.find((r: any) => r.id === id);

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

    describe('MAD volante par période', () => {
        const periodes = async (id: number) => (await admin.get(`/api/resources/${id}/mad-history`)).data as any[];

        it('création en MAD volante : la première période est volante, avec ses dates et son quota', async () => {
            const res = await createResource(admin, {
                taux: '',
                is_mad_volante: 1,
                date_debut: '2025-01-01',
                date_fin_mad: '2099-12-31',
                jours_max_mad: 15
            });
            expect(await periodes(res.id)).toEqual([
                expect.objectContaining({
                    taux: 0,
                    volante: 1,
                    jours_max: 15,
                    date_debut: '2025-01-01',
                    date_fin: '2099-12-31'
                })
            ]);
        });

        it('alternance : la ressource suit la période en cours, volante puis classique', async () => {
            const res = await createResource(admin, { taux: 50, date_debut: '2020-01-01' });
            const [initiale] = await periodes(res.id);
            expect(
                (
                    await admin.put(`/api/resources/${res.id}/mad-history/${initiale.id}`, {
                        taux: 50,
                        date_debut: '2020-01-01',
                        date_fin: '2025-12-31'
                    })
                ).status
            ).toBe(200);
            const ajout = await admin.post(`/api/resources/${res.id}/mad-history`, {
                volante: 1,
                jours_max: 10,
                date_debut: '2026-01-01',
                date_fin: '2099-12-31'
            });
            expect(ajout.status, JSON.stringify(ajout.data)).toBe(200);
            expect(await findResource(admin, res.id)).toMatchObject({
                is_mad_volante: 1,
                taux: 0,
                jours_max_mad: 10,
                date_fin_mad: '2099-12-31'
            });
            // La période volante devient classique
            const [, volante] = await periodes(res.id);
            expect(
                (
                    await admin.put(`/api/resources/${res.id}/mad-history/${volante.id}`, {
                        volante: 0,
                        taux: 60,
                        date_debut: '2026-01-01',
                        date_fin: ''
                    })
                ).status
            ).toBe(200);
            expect(await findResource(admin, res.id)).toMatchObject({ is_mad_volante: 0, taux: 60 });
        });

        it.each([
            ['sans date de fin', { volante: 1, jours_max: 10, date_debut: '2026-01-01' }],
            ['sans jours maximum', { volante: 1, date_debut: '2026-01-01', date_fin: '2099-12-31' }]
        ])('période volante %s refusée', async (_nom, corps) => {
            const res = await createResource(admin, { taux: 50, date_debut: '2020-01-01' });
            const [initiale] = await periodes(res.id);
            await admin.put(`/api/resources/${res.id}/mad-history/${initiale.id}`, {
                taux: 50,
                date_debut: '2020-01-01',
                date_fin: '2025-12-31'
            });
            expect((await admin.post(`/api/resources/${res.id}/mad-history`, corps)).status).toBe(400);
        });

        it('la fiche écrit dans la période en cours', async () => {
            const res = await createResource(admin, { taux: 50, date_debut: '2025-01-01' });
            const r = await admin.put(`/api/resources/${res.id}`, {
                ...res,
                taux: '',
                is_mad_volante: 1,
                date_fin_mad: '2099-06-30',
                jours_max_mad: 20
            });
            expect(r.status, JSON.stringify(r.data)).toBe(200);
            expect(await periodes(res.id)).toEqual([
                expect.objectContaining({ volante: 1, jours_max: 20, date_fin: '2099-06-30', taux: 0 })
            ]);
            expect(await findResource(admin, res.id)).toMatchObject({ is_mad_volante: 1, jours_max_mad: 20 });
        });
    });

    it('adresses e-mail : syntaxe vérifiée (e-mail de la ressource et contacts RH)', async () => {
        const res = await createResource(admin);
        const put = (body: any) => admin.put(`/api/resources/${res.id}`, { ...res, ...body });

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
