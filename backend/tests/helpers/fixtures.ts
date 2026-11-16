// Création de données de test via l'API (client connecté en admin)
import crypto from 'crypto';
import { expect } from 'vitest';
import { createClient, type Client } from './client.ts';
import type { TestServer } from './server.ts';

let seq = 0;
const uid = () => `${(++seq).toString(36)}${crypto.randomBytes(3).toString('hex')}`;

/** Compte de connexion (identifiant et mot de passe) */
export interface Identifiants {
    username: string;
    password: string;
}

export async function createResource(admin: Client, overrides: Record<string, unknown> = {}) {
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
    return { id: r.data.id as number, ...body };
}

/** Premier profil d'un compte (connexion), d'après ses indicateurs is_admin, is_expert, is_user, is_rh */
const firstProfile = (u: Record<string, unknown>) =>
    u.is_admin ? 'admin' : u.is_expert ? 'expert' : u.is_user ? 'user' : u.is_rh ? 'rh' : null;

/**
 * Compte créé par l'administrateur. Le mot de passe donné par l'administrateur est à changer à la première
 * connexion : le compte renvoyé l'a déjà changé (password : le nouveau), sauf { changePassword: false }.
 */
export async function createUser(
    admin: Client,
    overrides: Record<string, unknown> = {},
    { changePassword = true } = {}
) {
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
    const user = { id: r.data.id as number, ...body };
    const profile = firstProfile(user);
    if (!changePassword || !profile) return user;

    const client = createClient(admin.baseUrl);
    const login = await client.login(user.username, user.password, profile);
    // Double authentification demandée : changement laissé au test
    if (login.status !== 200 || !login.data.user) return user;
    const newPassword = `${user.password}-chg`;
    const changed = await client.post('/api/profile/change-password', { newPassword });
    expect(changed.status, JSON.stringify(changed.data)).toBe(200);
    await client.post('/api/logout');
    return { ...user, password: newPassword };
}

// Utilisateur expert rattaché à une nouvelle ressource
export async function createExpert(admin: Client) {
    const resource = await createResource(admin);
    const user = await createUser(admin, { is_expert: 1, resource_id: resource.id });
    return { user, resource };
}

// Connecte un nouveau client et vérifie le succès
export async function loginAs(server: TestServer, user: Identifiants, profile: string) {
    const client = server.client();
    const r = await client.login(user.username, user.password, profile);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.success).toBe(true);
    return client;
}
