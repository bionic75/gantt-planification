// Données initiales, créées au démarrage si absentes (idempotent) : compte administrateur, paramètres par défaut,
// types d'événements, accès initial à l'application d'affectation.
import { env } from '../config/env.ts';
import { hashPassword } from '../lib/password.ts';
import { evtSeedTypes } from '../modules/events/events.service.ts';
import { prisma } from './prisma.ts';

/** Paramètres créés avec leur valeur par défaut s'ils n'existent pas */
const DEFAULT_SETTINGS = {
    inactivity_enabled: 'false',
    inactivity_timeout: '15',
    favicon: 'calendrier',
    help_publication_enabled: 'false',
    help_publication_version: '',
    automation_4_config: '{"enabled":false,"day":1}'
};

async function seedSettings() {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
    }
}

/**
 * Compte administrateur initial, créé s'il n'existe pas : identifiant et mot de passe INITIAL_ADMIN_USERNAME /
 * INITIAL_ADMIN_PASSWORD (défaut admin / admin hors production). Un compte existant n'est jamais modifié.
 * En production, sans INITIAL_ADMIN_PASSWORD, le serveur refuse de créer le compte et ne démarre pas : un mot de passe
 * connu de tous (« admin ») laisserait le compte à qui se connecte le premier.
 */
async function seedAdmin() {
    const username = env.INITIAL_ADMIN_USERNAME;
    if (await prisma.user.findUnique({ where: { username } })) return;
    if (!env.INITIAL_ADMIN_PASSWORD && env.isProduction) {
        console.error(
            `❌ Compte administrateur initial « ${username} » à créer : INITIAL_ADMIN_PASSWORD obligatoire en production.`
        );
        process.exit(1);
    }
    await prisma.user.create({
        data: {
            username,
            password: await hashPassword(env.INITIAL_ADMIN_PASSWORD || 'admin'),
            must_change_password: 1,
            nom: 'Admin',
            prenom: 'Système',
            email: 'admin@example.com',
            is_admin: 1
        }
    });
    console.log(`👤 Compte administrateur initial créé : ${username} (mot de passe à changer à la première connexion)`);
}

/** Application « Aide à l'affectation opérationnelle » : accès accordé une fois aux administrateurs existants */
async function seedAffectationAccess() {
    if (await prisma.setting.findUnique({ where: { key: 'app_affectation_seeded' } })) return;
    const admins = await prisma.user.findMany({ where: { is_admin: 1 }, select: { id: true } });
    for (const { id } of admins) {
        await prisma.appUserAccess.upsert({
            where: { app_key_user_id: { app_key: 'affectation', user_id: id } },
            update: {},
            create: { app_key: 'affectation', user_id: id }
        });
    }
    await prisma.setting.create({ data: { key: 'app_affectation_seeded', value: '1' } });
    console.log("✅ Accès initial « Aide à l'affectation opérationnelle » accordé aux administrateurs");
}

export async function seedDatabase() {
    await seedAdmin();
    await seedSettings();
    await evtSeedTypes();
    await seedAffectationAccess();
}
