// Gestion des utilisateurs (admin)
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

const findUser = async id => (await admin.get('/api/users')).data.find(u => u.id === id);

describe('utilisateurs', () => {
    it('création : identifiant et mot de passe obligatoires', async () => {
        expect((await admin.post('/api/users', { username: 'x' })).status).toBe(400);
    });

    it('création puis connexion', async () => {
        const user = await createUser(admin, { is_user: 1, is_rh: 1 });
        expect(await findUser(user.id)).toMatchObject({
            username: user.username,
            nom: user.nom,
            email: user.email,
            is_user: 1,
            is_rh: 1,
            is_admin: 0,
            actif: 1
        });
        await loginAs(server, user, 'rh');
    });

    it('identifiant unique', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const r = await admin.post('/api/users', {
            username: user.username,
            password: 'autre-mdp',
            nom: 'N',
            prenom: 'P',
            email: 'x@example.test'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(400);
    });

    it('modification des profils et du rattachement', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const res = await createResource(admin);
        const r = await admin.put(`/api/users/${user.id}`, {
            nom: 'NOUVEAU',
            prenom: user.prenom,
            email: user.email,
            trigramme: ' abc ',
            is_expert: 1,
            resource_id: String(res.id)
        });
        expect(r.status).toBe(200);
        expect(await findUser(user.id)).toMatchObject({
            nom: 'NOUVEAU',
            trigramme: 'ABC',
            is_expert: 1,
            is_user: 0,
            resource_id: res.id
        });
        await loginAs(server, user, 'expert');
    });

    it('liste publique réservée aux utilisateurs actifs, sans données sensibles', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const list = (await client.get('/api/users/public')).data;
        const me = list.find(u => u.id === user.id);
        expect(me).toBeDefined();
        expect(me).not.toHaveProperty('password');
        expect(me).not.toHaveProperty('totp_secret');
    });

    it('suppression', async () => {
        const user = await createUser(admin, { is_user: 1 });
        expect((await admin.delete(`/api/users/${user.id}`)).status).toBe(200);
        expect(await findUser(user.id)).toBeUndefined();
        expect((await server.client().login(user.username, user.password, 'user')).status).toBe(401);
    });

    it('impossible de supprimer le dernier administrateur', async () => {
        const r = await admin.delete('/api/users/1');
        expect(r.status).toBe(400);
    });

    it("forcer la déconnexion ferme la session de l'utilisateur", async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        expect((await admin.post(`/api/users/${user.id}/force-logout`)).status).toBe(200);
        const r = await client.get('/api/resources');
        expect(r.status).toBe(401);
        expect(r.data.error).toBe('SESSION_TERMINATED');
    });
});
