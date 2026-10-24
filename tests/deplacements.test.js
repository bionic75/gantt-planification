// Déplacements et bons de commande : UO, droits, régularisations, suivi
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';

let server;
let admin;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

let seq = 0;
async function createBon(overrides = {}) {
    const body = {
        intitule: `BDC-${Date.now().toString(36)}-${++seq}`,
        titulaire: 'acme',
        date_debut: '2027-01-01',
        date_fin: '2027-12-31',
        nb_uo: 10,
        ...overrides
    };
    const r = await admin.post('/api/bons-commande', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { id: r.data.id, ...body };
}

const trip = (overrides = {}) => ({
    amoa_ced_id: 1,
    date_debut: '2027-03-01',
    date_fin: '2027-03-03',
    samu: 'SAMU 75',
    ville: 'paris',
    commentaire: '  RAS  ',
    ...overrides
});

async function userClient() {
    const user = await createUser(admin, { is_user: 1 });
    return { user, client: await loginAs(server, user, 'user') };
}

describe('bons de commande', () => {
    it('création, unicité du numéro, modification, suivi des UO et suppression', async () => {
        const bon = await createBon();
        expect((await admin.post('/api/bons-commande', { ...bon, intitule: bon.intitule.toLowerCase() })).status).toBe(
            400
        );
        expect((await admin.post('/api/bons-commande', { intitule: 'x' })).status).toBe(400);
        const listed = (await admin.get('/api/bons-commande')).data.find(b => b.id === bon.id);
        expect(listed).toMatchObject({ titulaire: 'ACME', nb_uo: 10, actif: 1, solde: 0, creator_prenom: 'Système' });

        await admin.post('/api/deplacements', trip({ bon_commande_id: bon.id }));
        await admin.post('/api/deplacements', trip({ bon_commande_id: bon.id, date_fin: '2027-03-01' }));
        const report = (await admin.get('/api/reporting-deplacements')).data.find(b => b.id === bon.id);
        expect(report).toMatchObject({ uo_commandees: 10, uo_consommees: 4, regularisation_cible_intitule: null });

        await admin.put(`/api/bons-commande/${bon.id}`, { ...bon, titulaire: 'autre', nb_uo: 12, solde: true });
        expect((await admin.get('/api/bons-commande')).data.find(b => b.id === bon.id)).toMatchObject({
            titulaire: 'AUTRE',
            nb_uo: 12,
            solde: 1
        });

        const del = await admin.delete(`/api/bons-commande/${bon.id}`);
        expect(del.data).toEqual({ message: 'Bon de commande supprimé', deplacements_desaffectes: 2 });
        const empty = await createBon();
        expect((await admin.delete(`/api/bons-commande/${empty.id}`)).data).toEqual({
            message: 'Bon de commande supprimé'
        });
    });
});

describe('déplacements', () => {
    it('création : UO calculées, ville en majuscules, listes', async () => {
        const { user, client } = await userClient();
        const bon = await createBon();
        const r = await client.post('/api/deplacements', trip({ bon_commande_id: bon.id }));
        expect(r.data).toEqual({
            id: r.data.id,
            nb_uo: 3,
            bon_commande_id: bon.id,
            a_regulariser: false,
            message: 'Déplacement créé'
        });
        const noBon = await client.post('/api/deplacements', trip());
        expect(noBon.data).toEqual({ id: noBon.data.id, nb_uo: 3, bon_commande_id: null, message: 'Déplacement créé' });

        const mine = (await client.get('/api/mes-deplacements')).data;
        expect(mine.map(d => d.id).sort()).toEqual([r.data.id, noBon.data.id].sort());
        expect(mine.find(d => d.id === r.data.id)).toMatchObject({
            ville: 'PARIS',
            commentaire: 'RAS',
            bon_commande_intitule: bon.intitule,
            bc_uo_commandees: 10,
            amoa_ced_prenom: 'Système',
            creator_nom: user.nom
        });
        const all = (await client.get(`/api/deplacements?bon_commande_id=${bon.id}`)).data;
        expect(all).toEqual([
            expect.objectContaining({ id: r.data.id, user_nom: user.nom, bon_commande_titulaire: 'ACME' })
        ]);
        expect((await client.get(`/api/deplacements/${r.data.id}`)).data).toMatchObject({
            bon_commande_intitule: bon.intitule
        });
        expect((await client.get('/api/deplacements/999999')).status).toBe(404);
        expect((await client.post('/api/deplacements', trip({ samu: '' }))).status).toBe(400);
    });

    it('modification et suppression : auteur ou administrateur', async () => {
        const a = await userClient();
        const b = await userClient();
        const { id } = (await a.client.post('/api/deplacements', trip())).data;
        expect((await b.client.put(`/api/deplacements/${id}`, trip())).status).toBe(403);
        expect(
            (await a.client.put(`/api/deplacements/${id}`, trip({ date_fin: '2027-03-10', ville: 'lyon' }))).data
        ).toEqual({
            message: 'Déplacement modifié'
        });
        expect((await a.client.get(`/api/deplacements/${id}`)).data).toMatchObject({ nb_uo: 10, ville: 'LYON' });
        expect((await b.client.delete(`/api/deplacements/${id}`)).status).toBe(403);
        expect((await admin.delete(`/api/deplacements/${id}`)).data).toEqual({ message: 'Déplacement supprimé' });
        expect((await a.client.delete(`/api/deplacements/${id}`)).status).toBe(404);
    });

    it('régularisation et réaffectation', async () => {
        const source = await createBon();
        const cible = await createBon();
        const soldé = await createBon({ solde: 1 });
        await admin.put(`/api/bons-commande/${soldé.id}`, { ...soldé, solde: true });
        const hors = await createBon({ date_debut: '2028-01-01', date_fin: '2028-12-31' });
        const { id } = (await admin.post('/api/deplacements', trip({ bon_commande_id: source.id }))).data;

        const regul = body => admin.post(`/api/deplacements/${id}/regularisation`, body);
        expect((await regul({ ancien_bon_commande_id: source.id })).status).toBe(400);
        expect((await regul({ ancien_bon_commande_id: source.id, nouveau_bon_commande_id: source.id })).status).toBe(
            400
        );
        expect((await regul({ ancien_bon_commande_id: source.id, nouveau_bon_commande_id: soldé.id })).status).toBe(
            404
        );
        expect((await regul({ ancien_bon_commande_id: source.id, nouveau_bon_commande_id: hors.id })).status).toBe(400);
        const ok = await regul({ ancien_bon_commande_id: source.id, nouveau_bon_commande_id: cible.id });
        expect(ok.data).toMatchObject({
            message: 'Régularisation effectuée avec succès',
            details: { nb_uo_transferees: 3 }
        });
        expect((await admin.get(`/api/deplacements/${id}`)).data).toMatchObject({
            bon_commande_id: cible.id,
            a_regulariser: 0
        });

        const { user, client } = await userClient();
        expect(
            (await client.post(`/api/deplacements/${id}/reaffecter`, { nouveau_bon_commande_id: source.id })).status
        ).toBe(403);
        const re = await admin.post(`/api/deplacements/${id}/reaffecter`, { nouveau_bon_commande_id: source.id });
        expect(re.data.details).toMatchObject({
            ancien_bon_commande: cible.intitule,
            nouveau_bon_commande: source.intitule
        });
        const after = (await admin.get(`/api/deplacements/${id}`)).data;
        expect(after.commentaire).toBe(
            `Réaffectation du BDC n° ${cible.intitule} vers le BDC n° ${source.intitule} | RAS`
        );
        await admin.post(`/api/deplacements/${id}/reaffecter`, { nouveau_bon_commande_id: cible.id });
        expect((await admin.get(`/api/deplacements/${id}`)).data.commentaire).toBe(
            `Réaffectation du BDC n° ${source.intitule} vers le BDC n° ${cible.intitule}`
        );
        expect(user.id).toBeGreaterThan(0);
    });

    it('régularisation technique', async () => {
        const source = await createBon();
        const cible = await createBon();
        const r = await admin.post('/api/deplacements/regularisation-technique', {
            source_bdc_id: source.id,
            cible_bdc_id: cible.id,
            nb_uo: 3,
            date_debut: '2027-05-30'
        });
        expect(r.data).toMatchObject({
            success: true,
            source_intitule: source.intitule,
            cible_intitule: cible.intitule,
            nb_uo: 3,
            date_debut: '2027-05-30'
        });
        const line = (await admin.get(`/api/deplacements/${r.data.deplacement_id}`)).data;
        expect(line).toMatchObject({
            bon_commande_id: cible.id,
            nb_uo: 3,
            samu: '',
            regularisation_source_bdc_id: source.id,
            commentaire: `Régularisation du bon de commande ${source.intitule} qui était en surconsommation`
        });
        const report = (await admin.get('/api/reporting-deplacements')).data.find(b => b.id === source.id);
        expect(report.regularisation_cible_intitule).toBe(cible.intitule);
        expect(
            (await admin.post('/api/deplacements/regularisation-technique', { source_bdc_id: source.id })).status
        ).toBe(400);
    });

    it('liste des SAMU des ressources', async () => {
        const samus = (await admin.get('/api/liste-samu')).data;
        expect(Array.isArray(samus)).toBe(true);
        expect([...samus].sort()).toEqual(samus);
    });
});
