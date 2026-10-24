// Création de données de test via l'API (client connecté en admin)
import crypto from 'crypto';
import { expect } from 'vitest';

let seq = 0;
const uid = () => `${(++seq).toString(36)}${crypto.randomBytes(3).toString('hex')}`;

export async function createResource(admin, overrides = {}) {
    const id = uid();
    const body = {
        nom: `NOM${id}`,
        prenom: `Prenom${id}`,
        trigramme: `T${id}`.toUpperCase(),
        taux: 50,
        samu: 'SAMU 75',
        date_debut: '2025-01-01',
        ...overrides
    };
    const r = await admin.post('/api/resources', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { id: r.data.id, ...body };
}

export async function createUser(admin, overrides = {}) {
    const id = uid();
    const body = {
        username: `user_${id}`,
        password: `Pwd-${id}-Aa1!`,
        nom: `Nom${id}`,
        prenom: `Prenom${id}`,
        email: `${id}@example.test`,
        ...overrides
    };
    const r = await admin.post('/api/users', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { id: r.data.id, ...body };
}

// Utilisateur expert rattaché à une nouvelle ressource
export async function createExpert(admin) {
    const resource = await createResource(admin);
    const user = await createUser(admin, { is_expert: 1, resource_id: resource.id });
    return { user, resource };
}

// Connecte un nouveau client et vérifie le succès
export async function loginAs(server, user, profile) {
    const client = server.client();
    const r = await client.login(user.username, user.password, profile);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.success).toBe(true);
    return client;
}
