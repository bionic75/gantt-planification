// CRA : listes, lancement, archivage et suppression, saisie des lignes, corrections par l'admin, MAD volantes
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

let annee = 2030;
/** Expert volontaire aux astreintes, connecté, avec un CRA à compléter sur un mois inédit */
async function setup({ mad = false } = {}) {
    const resource = mad
        ? await createResource(admin, { is_mad_volante: 1, date_fin_mad: '2040-12-31', jours_max_mad: 50, taux: '' })
        : await createResource(admin);
    const user = await createUser(admin, { is_expert: 1, resource_id: resource.id });
    await admin.post(`/api/resources/${resource.id}/astreinte`, { hasAccess: true });
    const client = await loginAs(server, user, 'expert');
    const year = annee++;
    const r = await client.get(`/api/cra/find-or-create?user_id=${user.id}&mois=3&annee=${year}`);
    return { user, resource, client, craId: r.data.id, mois: 3, annee: year };
}
const cra = async id => (await admin.get(`/api/cra/${id}`)).data;
const ligne = (date, extra = {}) => ({
    type: 'hno',
    date_debut: date,
    date_fin: date,
    heure_debut: '20:00',
    heure_fin: '22:00',
    samu: 'SAMU 75',
    objet: 'Intervention',
    ...extra
});

describe('listes', () => {
    it("my-list : l'expert voit ses CRA, l'admin tous les CRA actifs, la RH uniquement les CRA diffusés", async () => {
        const a = await setup();
        await setup();
        const mine = (await a.client.get('/api/cra/my-list')).data;
        expect(mine.map(c => c.id)).toEqual([a.craId]);

        const all = (await admin.get('/api/cra/my-list')).data;
        expect(all.map(c => c.id)).toContain(a.craId);

        const rhUser = await createUser(admin, { is_rh: 1 });
        const rh = await loginAs(server, rhUser, 'rh');
        expect((await rh.get('/api/cra/my-list')).data.every(c => c.statut === 'diffuse')).toBe(true);
    });

    it('admin/list : filtres expert, statut (multiple), mois et année', async () => {
        const a = await setup();
        await a.client.post(`/api/cra/${a.craId}/submit`);
        const list = q => admin.get(`/api/cra/admin/list?user_id=${a.user.id}&${q}`).then(r => r.data);
        expect((await list('statut=soumis')).map(c => c.id)).toEqual([a.craId]);
        expect((await list('statut=a_completer,vise_n1')).map(c => c.id)).toEqual([]);
        expect((await list(`mois=3&annee=${a.annee}`))[0]).toMatchObject({ id: a.craId, nb_lignes: 0 });
    });

    it('experts volontaires aux astreintes', async () => {
        const { user, resource } = await setup();
        expect((await admin.get('/api/cra/experts-astreinte')).data.map(e => e.resource_id)).toContain(resource.id);
        expect((await admin.get('/api/cra/all-experts')).data.map(e => e.user_id)).toContain(user.id);
        expect((await admin.get('/api/cra/all-experts-full')).data.map(e => e.user_id)).toContain(user.id);
    });
});

describe('lancement manuel', () => {
    it('paramètres, expert inconnu, doublon', async () => {
        const { user } = await setup();
        expect((await admin.post('/api/cra/launch', { user_id: user.id })).status).toBe(400);
        expect((await admin.post('/api/cra/launch', { user_id: 999999, mois: 1, annee: 2031 })).status).toBe(404);
        expect((await admin.post('/api/cra/launch', { user_id: user.id, mois: 1, annee: 2031 })).status).toBe(200);
        const again = await admin.post('/api/cra/launch', { user_id: user.id, mois: 1, annee: 2031 });
        expect(again.status).toBe(409);
    });

    it('MAD volante : lignes pré-remplies depuis la planification du mois', async () => {
        const { user, resource } = await setup({ mad: true });
        const k = (d, p, t) => `${resource.id}_${t}_2031-02-${d}_${p}`;
        await admin.post('/api/schedule', {
            [k('03', 'AM', 'available')]: '2',
            [k('03', 'AM', 'activity')]: '5',
            [k('03', 'PM', 'available')]: '2',
            [k('03', 'PM', 'activity')]: '5',
            [k('04', 'PM', 'available')]: '2',
            [k('04', 'PM', 'activity')]: '7',
            [k('05', 'AM', 'available')]: '1',
            [k('05', 'AM', 'activity')]: '5'
        });
        expect((await admin.post('/api/cra/launch', { user_id: user.id, mois: 2, annee: 2031 })).status).toBe(200);
        const lines = (await admin.get(`/api/astreintes-hno/direct?user_id=${user.id}&mois=2&annee=2031`)).data;
        expect(lines.map(l => [l.date_debut, l.heure_debut, l.heure_fin, l.objet, l.type])).toEqual([
            ['2031-02-03', '08:00', '18:00', 'ANS (Déploiement)', 'activite_courante'],
            ['2031-02-04', '13:00', '18:00', 'Qualification', 'activite_courante']
        ]);
    });
});

describe('archivage et suppression', () => {
    it('archive, désarchive, supprime, restaure puis purge', async () => {
        const { craId } = await setup();
        const ids = async url => (await admin.get(url)).data.map(c => c.id);

        await admin.post(`/api/cra/${craId}/archive`);
        expect(await ids('/api/cra/admin/archives')).toContain(craId);
        expect(await ids('/api/cra/my-list')).not.toContain(craId);
        await admin.post(`/api/cra/${craId}/unarchive`);
        expect(await ids('/api/cra/admin/archives')).not.toContain(craId);

        await admin.post(`/api/cra/${craId}/archive`);
        expect((await admin.post(`/api/cra/${craId}/soft-delete`)).status).toBe(200);
        expect(await ids('/api/cra/admin/deleted')).toContain(craId);
        expect((await admin.post(`/api/cra/${craId}/soft-delete`)).status).toBe(404);

        expect((await admin.post(`/api/cra/${craId}/restore-deleted`)).status).toBe(200);
        expect(await cra(craId)).toMatchObject({ deleted: 0, archived: 1, statut: 'a_completer' });
        expect((await admin.delete(`/api/cra/${craId}/purge`)).status).toBe(404);

        await admin.post(`/api/cra/${craId}/soft-delete`);
        expect((await admin.delete(`/api/cra/${craId}/purge`)).status).toBe(200);
        expect((await admin.get(`/api/cra/${craId}`)).status).toBe(404);
    });
});

describe('saisie des lignes', () => {
    it("l'expert enregistre ses lignes ; verrouillées après soumission", async () => {
        const { user, client, craId, annee: year } = await setup();
        const r = await client.post(`/api/cra/${craId}/astreintes`, {
            lignes: [ligne(`${year}-03-05`), ligne(`${year}-03-06`, { type: 'astreinte' })]
        });
        expect(r.data).toEqual({ success: true, inserted: 2 });
        expect((await cra(craId)).astreintes_hno).toHaveLength(2);

        await client.post(`/api/cra/${craId}/submit`);
        expect((await client.post(`/api/cra/${craId}/astreintes`, { lignes: [] })).status).toBe(400);
        const direct = await client.post('/api/astreintes-hno/direct', {
            user_id: user.id,
            mois: 3,
            annee: year,
            lignes: []
        });
        expect(direct.status).toBe(403);
        expect(
            (await client.get(`/api/astreintes-hno/lock-check?user_id=${user.id}&mois=3&annee=${year}`)).data
        ).toMatchObject({
            locked: true
        });
    });

    it("un expert ne modifie pas le CRA d'un autre", async () => {
        const a = await setup();
        const b = await setup();
        expect((await a.client.post(`/api/cra/${b.craId}/astreintes`, { lignes: [] })).status).toBe(403);
    });

    it("modification par l'admin : le CRA est marqué « modifié par l'administrateur »", async () => {
        const { craId, annee: year } = await setup();
        await admin.post(`/api/cra/${craId}/astreintes`, { lignes: [ligne(`${year}-03-10`)] });
        expect((await cra(craId)).modifie_admin_nom).toBeTruthy();
    });

    it('« rien à déclarer » : soumission par l’expert uniquement', async () => {
        const { client, craId } = await setup();
        expect((await admin.post(`/api/cra/${craId}/rien-a-declarer`)).status).toBe(403);
        expect((await client.post(`/api/cra/${craId}/rien-a-declarer`)).status).toBe(200);
        const c = await cra(craId);
        expect(c).toMatchObject({ statut: 'soumis', rien_a_declarer: 1 });
        expect(c.signatures.map(s => s.rang)).toEqual([1]);
    });
});

describe("corrections par l'administrateur", () => {
    it('admin-correction : retour à compléter, refusé après visa N2', async () => {
        const { client, craId } = await setup();
        await client.post(`/api/cra/${craId}/submit`);
        await admin.post(`/api/cra/${craId}/visa/n1`);
        expect((await admin.post(`/api/cra/${craId}/admin-correction`)).data).toEqual({
            success: true,
            statut: 'a_completer'
        });
        expect((await cra(craId)).signatures).toEqual([]);

        await client.post(`/api/cra/${craId}/submit`);
        await admin.post(`/api/cra/${craId}/visa/n1`);
        await admin.post(`/api/cra/${craId}/visa/n2`);
        expect((await admin.post(`/api/cra/${craId}/admin-correction`)).status).toBe(400);
    });

    it("renvoi à l'expert : uniquement un CRA à compléter", async () => {
        const { client, craId } = await setup();
        expect((await admin.post(`/api/cra/${craId}/return-to-expert`)).data).toMatchObject({ success: true });
        await client.post(`/api/cra/${craId}/submit`);
        expect((await admin.post(`/api/cra/${craId}/return-to-expert`)).status).toBe(400);
    });

    it('destinataires de diffusion : expert et contacts RH de la ressource', async () => {
        const { user, resource, craId } = await setup();
        await admin.post('/api/cra/rh-recipients', { recipients: { [resource.id]: ['rh@es.test', 'invalide'] } });
        const r = (await admin.get(`/api/cra/${craId}/diffusion-recipients`)).data;
        expect(r.expert).toEqual([{ email: user.email, nom: expect.any(String) }]);
        expect(r.rh_es.map(x => x.email)).toEqual(['rh@es.test']);
        expect((await admin.get(`/api/cra/${craId}/diffusion-log`)).data).toEqual([]);
    });
});

describe('MAD volante : collecte depuis la planification', () => {
    it('non MAD : collecte non proposée, report refusé', async () => {
        const { client, craId } = await setup();
        expect((await client.get(`/api/cra/${craId}/collect`)).data).toEqual({ allowed: false, lines: [] });
        expect((await client.post(`/api/cra/${craId}/propagate`, { corrections: [] })).status).toBe(400);
    });

    it('MAD : activités du mois regroupées par journée', async () => {
        const { client, resource, craId, annee: year } = await setup({ mad: true });
        const k = (d, p, t) => `${resource.id}_${t}_${year}-03-${d}_${p}`;
        await admin.post('/api/schedule', {
            [k('02', 'AM', 'available')]: '2',
            [k('02', 'AM', 'activity')]: '6',
            [k('02', 'PM', 'available')]: '2',
            [k('02', 'PM', 'activity')]: '6',
            [k('03', 'AM', 'available')]: '2',
            [k('03', 'AM', 'activity')]: '8'
        });
        const r = (await client.get(`/api/cra/${craId}/collect`)).data;
        expect(r.allowed).toBe(true);
        expect(r.lines.map(l => [l.date_debut, l.heure_debut, l.heure_fin, l.objet])).toEqual([
            [`${year}-03-02`, '09:00', '18:00', 'ANS (Dev. usages)'],
            [`${year}-03-03`, '09:00', '12:00', 'Divers']
        ]);

        const p = await client.post(`/api/cra/${craId}/propagate`, {
            corrections: [{ origin: r.lines[1].origin, line: null }]
        });
        expect(p.data).toMatchObject({ activity: 1, astreinte: 0 });
        expect((await admin.get('/api/schedule')).data[k('03', 'AM', 'activity')]).toBe('2');
    });
});

describe('automatisation n°4', () => {
    it('déclenchement manuel sans configuration : aucun envoi', async () => {
        const r = await admin.post('/api/automation/cra/trigger', {});
        expect(r.status).toBe(200);
        expect(r.data).toMatchObject({ success: true, sent: 0 });
    });
});
