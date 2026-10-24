// @ts-check
// Données initiales, créées au démarrage si absentes (idempotent) : compte administrateur, paramètres par défaut,
// types d'événements, accès initial à l'application d'affectation.
import { hashPassword } from '../lib/password.js';
import { evtSeedTypes } from '../modules/events/events.service.js';
import { prisma } from './prisma.js';

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

/** Compte administrateur initial (identifiant « admin ») s'il n'existe pas */
async function seedAdmin() {
    if (await prisma.user.findUnique({ where: { username: 'admin' } })) return;
    await prisma.user.create({
        data: {
            username: 'admin',
            password: await hashPassword('Admin2025!'),
            nom: 'Admin',
            prenom: 'Système',
            email: 'admin@example.com',
            is_admin: 1
        }
    });
    console.log('Compte admin créé');
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
