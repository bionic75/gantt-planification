// Statuts de déploiement (couleur, ordre, « En service ») et statut de chaque déploiement : /api/affectation
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, loginAs } from './helpers/fixtures.js';

let server;
let admin;
let seq = 0;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const statuts = async () => (await admin.get('/api/affectation/deployment-statuses')).data.statuses;
const nouveauStatut = async (label = `Statut ${Date.now()}-${++seq}`, color = '#1565c0') => {
    const r = await admin.post('/api/affectation/deployment-statuses', { label, color });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data;
};
async function nouveauProjet(coords = { latitude: 48.8566, longitude: 2.3522 }) {
    const no = 80 + ++seq;
    const loc = await admin.post('/api/locations', {
        libelle_long: `SAMU STATUT ${no} ${Date.now()}`,
        libelle_court: `SAMU ${no}`,
        ...coords
    });
    expect(loc.status, JSON.stringify(loc.data)).toBe(200);
    const r = await admin.post('/api/affectation/projects', {
        samu_name: `SAMU ${no}`,
        location_id: loc.data.id,
        date_debut: '2027-01-04',
        date_mise_en_service: '2027-04-01',
        periods: {}
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data;
}

describe('statuts', () => {
    it('« En service » existe par défaut en première position', async () => {
        const l = await statuts();
        expect(l[0]).toMatchObject({ label: 'En service', is_service: 1, position: 0 });
    });

    it('un statut créé passe à la suite des autres', async () => {
        const avant = await statuts();
        const s = await nouveauStatut();
        const apres = await statuts();
        expect(apres.length).toBe(avant.length + 1);
        expect(apres.at(-1).id).toBe(s.id);
    });

    it('une couleur qui n’est pas #rrggbb est refusée', async () => {
        const r = await admin.post('/api/affectation/deployment-statuses', { label: 'Rouge', color: 'rouge' });
        expect(r.status).toBe(400);
    });

    it('un libellé vide ou déjà pris est refusé', async () => {
        expect(
            (await admin.post('/api/affectation/deployment-statuses', { label: ' ', color: '#112233' })).status
        ).toBe(400);
        const s = await nouveauStatut();
        expect(
            (await admin.post('/api/affectation/deployment-statuses', { label: s.label, color: '#112233' })).status
        ).toBe(400);
    });

    it('« En service » : couleur modifiable, libellé conservé, suppression refusée', async () => {
        const svc = (await statuts()).find(s => s.is_service);
        const r = await admin.put(`/api/affectation/deployment-statuses/${svc.id}`, {
            label: 'Autre',
            color: '#00aa00'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data).toMatchObject({ label: 'En service', color: '#00aa00' });
        expect((await admin.delete(`/api/affectation/deployment-statuses/${svc.id}`)).status).toBe(409);
    });

    it('un statut utilisé ne se supprime pas, et le message nomme les SAMU', async () => {
        const s = await nouveauStatut();
        const p = await nouveauProjet();
        expect((await admin.put(`/api/affectation/projects/${p.id}/status`, { status_id: s.id })).status).toBe(200);
        const r = await admin.delete(`/api/affectation/deployment-statuses/${s.id}`);
        expect(r.status).toBe(409);
        expect(JSON.stringify(r.data)).toContain(p.samu_name);
        await admin.put(`/api/affectation/projects/${p.id}/status`, { status_id: null });
        expect((await admin.delete(`/api/affectation/deployment-statuses/${s.id}`)).status).toBe(200);
    });

    it('réordonner exige tous les statuts, puis applique l’ordre', async () => {
        await nouveauStatut();
        const ids = (await statuts()).map(s => s.id);
        expect((await admin.put('/api/affectation/deployment-statuses-order', { ids: ids.slice(1) })).status).toBe(400);
        const inverse = [...ids].reverse();
        const r = await admin.put('/api/affectation/deployment-statuses-order', { ids: inverse });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect((await statuts()).map(s => s.id)).toEqual(inverse);
        await admin.put('/api/affectation/deployment-statuses-order', { ids });
    });
});

describe('statut d’un déploiement', () => {
    it('« En service » enregistre la date de mise en service', async () => {
        const svc = (await statuts()).find(s => s.is_service);
        const p = await nouveauProjet();
        const r = await admin.put(`/api/affectation/projects/${p.id}/status`, {
            status_id: svc.id,
            date_mise_en_service: '2027-06-15'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const m = (await admin.get('/api/affectation/deployment-map')).data.deployments.find(d => d.id === p.id);
        expect(m).toMatchObject({ status_id: svc.id, date_mise_en_service: '2027-06-15' });
    });

    it('un autre statut laisse la date de mise en service inchangée', async () => {
        const s = await nouveauStatut();
        const p = await nouveauProjet();
        const r = await admin.put(`/api/affectation/projects/${p.id}/status`, {
            status_id: s.id,
            date_mise_en_service: '2030-01-01'
        });
        expect(r.status).toBe(200);
        const m = (await admin.get('/api/affectation/deployment-map')).data.deployments.find(d => d.id === p.id);
        expect(m.date_mise_en_service).toBe('2027-04-01');
    });

    it('un statut inconnu est refusé', async () => {
        const p = await nouveauProjet();
        expect((await admin.put(`/api/affectation/projects/${p.id}/status`, { status_id: 999999 })).status).toBe(400);
    });

    it('la carte donne latitude et longitude, null sans coordonnées', async () => {
        const avec = await nouveauProjet();
        const sans = await nouveauProjet({});
        const d = (await admin.get('/api/affectation/deployment-map')).data.deployments;
        expect(d.find(x => x.id === avec.id)).toMatchObject({ latitude: 48.8566, longitude: 2.3522 });
        expect(d.find(x => x.id === sans.id)).toMatchObject({ latitude: null, longitude: null });
    });
});

describe('droits', () => {
    it('un utilisateur lit les statuts et la carte, mais ne modifie rien', async () => {
        const { user: u } = await createExpert(admin);
        const client = await loginAs(server, u, 'expert');
        expect((await client.get('/api/affectation/deployment-statuses')).status).toBe(200);
        expect((await client.get('/api/affectation/deployment-map')).status).toBe(200);
        const s = (await statuts())[0];
        expect(
            (await client.post('/api/affectation/deployment-statuses', { label: 'X', color: '#112233' })).status
        ).toBe(403);
        expect(
            (await client.put(`/api/affectation/deployment-statuses/${s.id}`, { label: 'X', color: '#112233' })).status
        ).toBe(403);
        expect((await client.delete(`/api/affectation/deployment-statuses/${s.id}`)).status).toBe(403);
        expect((await client.put('/api/affectation/deployment-statuses-order', { ids: [] })).status).toBe(403);
        expect((await client.put('/api/affectation/projects/1/status', { status_id: null })).status).toBe(403);
    });
});
