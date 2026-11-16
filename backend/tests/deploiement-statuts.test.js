// Statuts de déploiement (couleur de la palette, ordre, « En service ») et statut de chaque SAMU : /api/affectation
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.ts';
import { createExpert, loginAs } from './helpers/fixtures.ts';

let server;
let admin;
let seq = 0;
let palette;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
    palette = (await admin.get('/api/affectation/deployment-statuses')).data.palette;
});
afterAll(() => server?.stop());

const statuts = async () => (await admin.get('/api/affectation/deployment-statuses')).data.statuses;
const carte = async () => (await admin.get('/api/affectation/deployment-map')).data;
const ligne = async id => (await carte()).deployments.find(d => d.location_id === id);
const service = async () => (await statuts()).find(s => s.is_service);
const nouveauStatut = async (color = palette[3]) => {
    const r = await admin.post('/api/affectation/deployment-statuses', {
        label: `Statut ${Date.now()}-${++seq}`,
        color
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data;
};
async function nouveauSamu(coords = { latitude: 48.8566, longitude: 2.3522 }) {
    const no = 80 + ++seq;
    const loc = await admin.post('/api/locations', {
        libelle_long: `SAMU STATUT ${no} ${Date.now()}`,
        libelle_court: `SAMU ${no}`,
        ...coords
    });
    expect(loc.status, JSON.stringify(loc.data)).toBe(200);
    return { id: loc.data.id, nom: `SAMU ${no}` };
}
const statutDe = (id, corps) => admin.put(`/api/affectation/deployment-samus/${id}`, corps);
async function evenementMes(lieu, startDate) {
    const type = (await admin.get('/api/event-types')).data.types.find(t => t.code === 'mes');
    const r = await admin.post('/api/custom-events', {
        startDate,
        label: `MES ${lieu.nom}`,
        type_id: type.id,
        location_id: lieu.id
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
}

describe('palette et statuts', () => {
    it('la palette compte 15 couleurs distinctes, « En service » prend la dernière', async () => {
        expect(palette).toHaveLength(15);
        expect(new Set(palette).size).toBe(15);
        expect((await service()).color).toBe(palette.at(-1));
    });

    it('« En service » existe par défaut en première position', async () => {
        expect((await statuts())[0]).toMatchObject({ label: 'En service', is_service: 1, position: 0 });
    });

    it('un statut créé passe à la suite des autres', async () => {
        const avant = await statuts();
        const s = await nouveauStatut();
        const apres = await statuts();
        expect(apres.length).toBe(avant.length + 1);
        expect(apres.at(-1).id).toBe(s.id);
    });

    it('une couleur hors de la palette est refusée, même au format #rrggbb', async () => {
        for (const color of ['rouge', '#123456'])
            expect((await admin.post('/api/affectation/deployment-statuses', { label: 'X', color })).status).toBe(400);
    });

    it('un libellé vide ou déjà pris est refusé', async () => {
        expect(
            (await admin.post('/api/affectation/deployment-statuses', { label: ' ', color: palette[0] })).status
        ).toBe(400);
        const s = await nouveauStatut();
        expect(
            (await admin.post('/api/affectation/deployment-statuses', { label: s.label, color: palette[0] })).status
        ).toBe(400);
    });

    it('« En service » : couleur modifiable dans la palette, libellé conservé, suppression refusée', async () => {
        const svc = await service();
        const r = await admin.put(`/api/affectation/deployment-statuses/${svc.id}`, {
            label: 'Autre',
            color: palette.at(-2)
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data).toMatchObject({ label: 'En service', color: palette.at(-2) });
        await admin.put(`/api/affectation/deployment-statuses/${svc.id}`, {
            label: 'En service',
            color: palette.at(-1)
        });
        expect((await admin.delete(`/api/affectation/deployment-statuses/${svc.id}`)).status).toBe(409);
    });

    it('un statut utilisé ne se supprime pas, et le message nomme les SAMU', async () => {
        const s = await nouveauStatut();
        const samu = await nouveauSamu();
        expect((await statutDe(samu.id, { status_id: s.id })).status).toBe(200);
        const r = await admin.delete(`/api/affectation/deployment-statuses/${s.id}`);
        expect(r.status).toBe(409);
        expect(JSON.stringify(r.data)).toContain(samu.nom);
        await statutDe(samu.id, { status_id: null });
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

describe('motifs et usage', () => {
    it('la liste annonce les motifs possibles, « plein » par défaut', async () => {
        const r = (await admin.get('/api/affectation/deployment-statuses')).data;
        expect(r.patterns).toEqual(['plein', 'diag', 'diag-inv', 'points', 'quadrille', 'lignes']);
        expect((await statuts())[0].pattern).toBe('plein');
    });

    it('un statut garde le motif choisi à la création et à la modification', async () => {
        const r = await admin.post('/api/affectation/deployment-statuses', {
            label: `Motif ${Date.now()}`,
            color: palette[2],
            pattern: 'points'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.pattern).toBe('points');
        const m = await admin.put(`/api/affectation/deployment-statuses/${r.data.id}`, {
            label: r.data.label,
            color: palette[2],
            pattern: 'diag'
        });
        expect(m.data.pattern).toBe('diag');
        const sans = await admin.put(`/api/affectation/deployment-statuses/${r.data.id}`, {
            label: r.data.label,
            color: palette[3]
        });
        expect(sans.data.pattern).toBe('diag');
    });

    it('un motif inconnu est refusé', async () => {
        const r = await admin.post('/api/affectation/deployment-statuses', {
            label: 'Zébré',
            color: palette[0],
            pattern: 'zebre'
        });
        expect(r.status).toBe(400);
    });

    it('le nombre de SAMU par statut est annoncé', async () => {
        const s = await nouveauStatut();
        expect((await statuts()).find(x => x.id === s.id).nb_samu).toBe(0);
        const a = await nouveauSamu();
        const b = await nouveauSamu();
        await statutDe(a.id, { status_id: s.id });
        await statutDe(b.id, { status_id: s.id });
        expect((await statuts()).find(x => x.id === s.id).nb_samu).toBe(2);
        expect((await carte()).statuses.find(x => x.id === s.id).nb_samu).toBe(2);
    });
});

describe('statut d’un SAMU', () => {
    it('un SAMU ajouté apparaît dans la liste avec ses coordonnées, puis disparaît quand on le retire', async () => {
        const samu = await nouveauSamu();
        expect(await ligne(samu.id)).toBeUndefined();
        expect((await statutDe(samu.id, { status_id: null })).status).toBe(200);
        expect(await ligne(samu.id)).toMatchObject({
            samu_name: samu.nom,
            latitude: 48.8566,
            longitude: 2.3522,
            status_id: null,
            derive: false
        });
        expect((await admin.delete(`/api/affectation/deployment-samus/${samu.id}`)).status).toBe(200);
        expect(await ligne(samu.id)).toBeUndefined();
    });

    it('« En service » enregistre la date de mise en service', async () => {
        const samu = await nouveauSamu();
        const svc = await service();
        expect((await statutDe(samu.id, { status_id: svc.id, date_mise_en_service: '2027-06-15' })).status).toBe(200);
        expect(await ligne(samu.id)).toMatchObject({ status_id: svc.id, date_mise_en_service: '2027-06-15' });
    });

    it('un autre statut ne touche pas la date de mise en service', async () => {
        const samu = await nouveauSamu();
        const svc = await service();
        await statutDe(samu.id, { status_id: svc.id, date_mise_en_service: '2027-06-15' });
        const s = await nouveauStatut();
        await statutDe(samu.id, { status_id: s.id, date_mise_en_service: '2030-01-01' });
        expect(await ligne(samu.id)).toMatchObject({ status_id: s.id, date_mise_en_service: '2027-06-15' });
    });

    it('une date invalide, un statut inconnu ou une localisation inconnue sont refusés', async () => {
        const samu = await nouveauSamu();
        const svc = await service();
        expect((await statutDe(samu.id, { status_id: svc.id, date_mise_en_service: '15/06/2027' })).status).toBe(400);
        expect((await statutDe(samu.id, { status_id: 999999 })).status).toBe(400);
        expect((await statutDe(999999, { status_id: svc.id })).status).toBe(404);
    });

    it('un SAMU sans coordonnées reste dans la liste, sans latitude ni longitude', async () => {
        const samu = await nouveauSamu({});
        await statutDe(samu.id, { status_id: null });
        expect(await ligne(samu.id)).toMatchObject({ latitude: null, longitude: null });
    });
});

describe('mises en service des événements', () => {
    it('un événement « Mise en service » ajoute le SAMU à la liste avec une date suggérée', async () => {
        const samu = await nouveauSamu();
        await evenementMes(samu, '2026-03-10');
        expect(await ligne(samu.id)).toMatchObject({
            status_id: null,
            date_mise_en_service: null,
            date_suggeree: '2026-03-10',
            derive: true
        });
    });

    it('« En service » sans date reprend la date suggérée', async () => {
        const samu = await nouveauSamu();
        await evenementMes(samu, '2026-04-02');
        await statutDe(samu.id, { status_id: (await service()).id });
        expect(await ligne(samu.id)).toMatchObject({ date_mise_en_service: '2026-04-02' });
    });

    it('l’import passe « En service » les SAMU sans statut dont la mise en service est passée, pas les futurs', async () => {
        const passe = await nouveauSamu();
        const futur = await nouveauSamu();
        const deja = await nouveauSamu();
        await evenementMes(passe, '2026-01-12');
        await evenementMes(futur, '2999-01-12');
        await evenementMes(deja, '2026-01-13');
        const autre = await nouveauStatut();
        await statutDe(deja.id, { status_id: autre.id });
        const r = await admin.post('/api/affectation/deployment-import-mes', {});
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.imported).toBeGreaterThanOrEqual(1);
        const svc = await service();
        expect(await ligne(passe.id)).toMatchObject({ status_id: svc.id, date_mise_en_service: '2026-01-12' });
        expect(await ligne(futur.id)).toMatchObject({ status_id: null });
        expect(await ligne(deja.id)).toMatchObject({ status_id: autre.id });
        expect((await admin.post('/api/affectation/deployment-import-mes', {})).data.imported).toBe(0);
    });
});

describe('droits', () => {
    it('un utilisateur lit les statuts et la carte, mais ne modifie rien', async () => {
        const { user: u } = await createExpert(admin);
        const client = await loginAs(server, u, 'expert');
        expect((await client.get('/api/affectation/deployment-statuses')).status).toBe(200);
        expect((await client.get('/api/affectation/deployment-map')).status).toBe(200);
        const s = (await statuts())[0];
        const interdits = [
            client.post('/api/affectation/deployment-statuses', { label: 'X', color: palette[0] }),
            client.put(`/api/affectation/deployment-statuses/${s.id}`, { label: 'X', color: palette[0] }),
            client.delete(`/api/affectation/deployment-statuses/${s.id}`),
            client.put('/api/affectation/deployment-statuses-order', { ids: [] }),
            client.put('/api/affectation/deployment-samus/1', { status_id: null }),
            client.delete('/api/affectation/deployment-samus/1'),
            client.post('/api/affectation/deployment-import-mes', {})
        ];
        for (const r of await Promise.all(interdits)) expect(r.status).toBe(403);
    });
});
