// Comptes rendus d'activité (CRA) : création, soumission, rappel, visas et refus
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

let mois = 0;
// Nouvel expert connecté + son CRA d'un mois inédit
async function expertWithCra() {
    const { user } = await createExpert(admin);
    const client = await loginAs(server, user, 'expert');
    const m = (mois++ % 12) + 1;
    const r = await client.get(`/api/cra/find-or-create?user_id=${user.id}&mois=${m}&annee=2025`);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { user, client, craId: r.data.id, created: r.data.created, mois: m };
}
const statut = async id => (await admin.get(`/api/cra/${id}`)).data.statut;

describe('création et consultation', () => {
    it('find-or-create crée puis retrouve le CRA', async () => {
        const { user, client, craId, created, mois: m } = await expertWithCra();
        expect(created).toBe(true);
        const again = await client.get(`/api/cra/find-or-create?user_id=${user.id}&mois=${m}&annee=2025`);
        expect(again.data).toEqual({ id: craId, statut: 'a_completer', created: false });
    });

    it("un expert ne crée ni ne consulte le CRA d'un autre", async () => {
        const a = await expertWithCra();
        const b = await expertWithCra();
        expect((await a.client.get(`/api/cra/find-or-create?user_id=${b.user.id}&mois=1&annee=2025`)).status).toBe(403);
        expect((await a.client.get(`/api/cra/${b.craId}`)).status).toBe(403);
    });

    it('consultation par son auteur', async () => {
        const { user, client, craId } = await expertWithCra();
        const r = await client.get(`/api/cra/${craId}`);
        expect(r.status).toBe(200);
        expect(r.data).toMatchObject({
            id: craId,
            user_id: user.id,
            statut: 'a_completer',
            astreintes_hno: [],
            signatures: []
        });
    });

    it('paramètres obligatoires', async () => {
        expect((await admin.get('/api/cra/find-or-create?mois=1')).status).toBe(400);
    });
});

describe('circuit de validation', () => {
    it('soumission → visa N1 → visa N2', async () => {
        const { client, craId } = await expertWithCra();
        expect((await client.post(`/api/cra/${craId}/submit`, { commentaire: 'RAS' })).status).toBe(200);
        expect(await statut(craId)).toBe('soumis');
        expect((await client.post(`/api/cra/${craId}/submit`)).status).toBe(400);

        expect((await admin.post(`/api/cra/${craId}/visa/n2`)).status).toBe(400);
        expect((await admin.post(`/api/cra/${craId}/visa/n1`)).status).toBe(200);
        expect(await statut(craId)).toBe('vise_n1');
        expect((await admin.post(`/api/cra/${craId}/visa/n2`)).status).toBe(200);

        const cra = (await admin.get(`/api/cra/${craId}`)).data;
        expect(cra).toMatchObject({ statut: 'vise_n2', commentaire_expert: 'RAS' });
        expect(cra.signatures.map(s => s.rang)).toEqual([1, 2, 3]);
    });

    it("rappel par l'expert avant visa", async () => {
        const { client, craId } = await expertWithCra();
        await client.post(`/api/cra/${craId}/submit`);
        expect((await client.post(`/api/cra/${craId}/recall`)).status).toBe(200);
        expect(await statut(craId)).toBe('a_completer');
        expect((await client.post(`/api/cra/${craId}/recall`)).status).toBe(400);
    });

    it('rappel impossible après visa N1', async () => {
        const { client, craId } = await expertWithCra();
        await client.post(`/api/cra/${craId}/submit`);
        await admin.post(`/api/cra/${craId}/visa/n1`);
        expect((await client.post(`/api/cra/${craId}/recall`)).status).toBe(400);
    });

    it('refus : commentaire obligatoire, retour à compléter et signatures effacées', async () => {
        const { client, craId } = await expertWithCra();
        await client.post(`/api/cra/${craId}/submit`);
        await admin.post(`/api/cra/${craId}/visa/n1`);

        expect((await admin.post(`/api/cra/${craId}/refuser/n2`, { commentaire: ' ' })).status).toBe(400);
        expect((await admin.post(`/api/cra/${craId}/refuser/n2`, { commentaire: 'Incomplet' })).status).toBe(200);
        const cra = (await admin.get(`/api/cra/${craId}`)).data;
        expect(cra).toMatchObject({ statut: 'a_completer', commentaire_refus: 'Incomplet', vise_n1_by: null });
        expect(cra.signatures).toEqual([]);
    });

    it("un expert ne soumet pas le CRA d'un autre", async () => {
        const a = await expertWithCra();
        const b = await expertWithCra();
        expect((await a.client.post(`/api/cra/${b.craId}/submit`)).status).toBe(404);
    });
});
