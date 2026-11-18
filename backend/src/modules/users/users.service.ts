// Accès aux données : comptes utilisateurs, droits applicatifs, préférences
import { prisma } from '../../db/prisma.ts';
import { containsInsensitive, flag, idParam, isUniqueViolation, optional, toInt } from '../../db/values.ts';
import { badRequest, notFound } from '../../lib/http-error.ts';
import { hashPassword, passwordStrengthError, verifyPassword } from '../../lib/password.ts';

const MIN_PASSWORD_LENGTH = 6;
const DEFAULT_TABS = [
    'accueil',
    'resources',
    'planning',
    'evenements',
    'cra',
    'reporting',
    'admin',
    'astreintesGestion'
];

/** Applications soumises à autorisation individuelle */
export const APP_DEFINITIONS = {
    deplacements: { label: 'Plateforme de suivi des déplacements', icon: '🚗' },
    analyse: { label: 'Analyse de fichiers', icon: '📊' },
    affectation: { label: "Aide à l'affectation opérationnelle", icon: '🎯' }
};

/** Chaîne obligatoire : une valeur absente est refusée par la base (comme l'ancien SQL) */
const required = (v: unknown) => (v === null || v === undefined ? (null as any) : String(v));
/** Tri par chaînes, ordre binaire (comme ORDER BY sous SQLite) */
const byKeys =
    (...keys: string[]) =>
    (a: any, b: any) => {
        for (const k of keys) {
            if (a[k] !== b[k]) return a[k] == null ? -1 : b[k] == null ? 1 : a[k] < b[k] ? -1 : 1;
        }
        return 0;
    };

/** Ressources (id → ressource) des comptes donnés */
async function resourcesOf(users: Array<{ resource_id: number | null }>) {
    const ids = [...new Set(users.map(u => u.resource_id).filter(id => id !== null))];
    const resources = await prisma.resource.findMany({
        where: { id: { in: ids as number[] } },
        select: { id: true, trigramme: true, astreinte_volontaire: true }
    });
    return new Map(resources.map(r => [r.id, r]));
}

// ---------- Lecture ----------

/** Liste complète pour l'administration (avec la dernière connexion) */
export async function listUsers() {
    const users = await prisma.user.findMany({ orderBy: [{ username: 'asc' }] });
    const resources = await resourcesOf(users);
    const lastLogins = await prisma.connectionLog.groupBy({ by: ['user_id'], _max: { login_time: true } });
    const lastLogin = new Map(lastLogins.map(l => [l.user_id, l._max.login_time]));
    // Ni empreinte du mot de passe ni secret TOTP (il permettrait de générer les codes de double authentification)
    return users.map(({ password: _password, totp_secret, ...u }) => {
        const r = u.resource_id !== null ? resources.get(u.resource_id) : undefined;
        return {
            ...u,
            totp_configured: totp_secret !== null,
            // Libellé historique : contient en réalité le volontariat aux astreintes de la ressource
            resource_trigramme: r ? r.astreinte_volontaire : null,
            trigramme: u.trigramme ?? (r ? r.trigramme : null),
            astreinte_volontaire: r ? r.astreinte_volontaire : null,
            last_login: lastLogin.get(u.id) ?? null
        };
    });
}

/** Informations de base des utilisateurs actifs (affichage dans le Gantt) */
export async function listPublicUsers() {
    const users = await prisma.user.findMany({
        where: { actif: 1 },
        select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            resource_id: true,
            profile_photo: true,
            is_expert: true,
            trigramme: true
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
    const resources = await resourcesOf(users);
    return users.map(u => ({
        ...u,
        trigramme: u.trigramme ?? (u.resource_id !== null ? (resources.get(u.resource_id)?.trigramme ?? null) : null)
    }));
}

export async function listAmoaCedUsers() {
    const users = await prisma.user.findMany({
        where: { actif: 1, amoa_ced: 1 },
        select: { id: true, nom: true, prenom: true, email: true, resource_id: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
    const resources = await resourcesOf(users);
    return users.map(u => ({
        ...u,
        trigramme: u.resource_id !== null ? (resources.get(u.resource_id)?.trigramme ?? null) : null
    }));
}

/** Recherche pour l'autocomplétion (2 caractères minimum) */
export async function searchUsers(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    const like = containsInsensitive(q);
    return prisma.user.findMany({
        where: { actif: 1, OR: [{ nom: like }, { prenom: like }, { email: like }, { username: like }] },
        select: { id: true, nom: true, prenom: true, email: true, username: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }],
        take: 20
    });
}

export function getUser(id: string | number) {
    return prisma.user.findUnique({ where: { id: idParam(id) } });
}

/** Compte expert rattaché à une ressource */
export function getExpertByResource(resourceId: string | number) {
    return prisma.user.findFirst({
        where: { resource_id: idParam(resourceId), is_expert: 1 },
        select: { id: true, username: true, email: true, nom: true, prenom: true, is_expert: true, resource_id: true },
        orderBy: { id: 'asc' }
    });
}

/** L'adresse est-elle celle d'un utilisateur rattaché à la ressource ? (destinataires des emails d'affectation) */
export async function isEmailOfResource(resourceId: unknown, email: unknown) {
    if (!resourceId || typeof email !== 'string' || !email) return false;
    const user = await prisma.user.findFirst({
        where: { resource_id: idParam(resourceId), email },
        select: { id: true }
    });
    return !!user;
}

// ---------- Création / modification ----------

export async function createUser(data: Record<string, any>): Promise<number> {
    const { username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, is_rh, resource_id } =
        data;
    const { has_reporting_access, amoa_ced } = data;
    if (!username || !password) throw badRequest('Username et password requis');

    try {
        const { id } = await prisma.user.create({
            data: {
                username: String(username),
                password: await hashPassword(String(password)),
                // Mot de passe choisi par l'administrateur : à remplacer à la première connexion
                must_change_password: 1,
                nom: required(nom),
                prenom: required(prenom),
                email: required(email),
                telephone: optional(telephone),
                is_admin: flag(is_admin),
                is_expert: flag(is_expert),
                is_user: flag(is_user),
                is_rh: flag(is_rh),
                resource_id: toInt(resource_id),
                has_reporting_access: flag(has_reporting_access),
                amoa_ced: flag(amoa_ced)
            }
        });
        return id;
    } catch (err) {
        if (isUniqueViolation(err)) throw badRequest("Ce nom d'utilisateur existe déjà");
        throw err;
    }
}

/**
 * Droits d'un compte conservés dans ses sessions ouvertes (profils, ressource rattachée) : s'ils changent, les sessions
 * doivent être fermées. Chaîne comparable, null si le compte n'existe pas.
 */
export async function sessionRights(id: string | number) {
    const user = await prisma.user.findUnique({
        where: { id: idParam(id) },
        select: { is_admin: true, is_expert: true, is_user: true, is_rh: true, resource_id: true }
    });
    return user ? JSON.stringify(user) : null;
}

/**
 * @returns identifiant de ressource retenu
 */
export async function updateUser(id: string | number, data: Record<string, any>): Promise<number | null> {
    const { nom, prenom, email, trigramme, is_admin, is_expert, is_user, is_rh, resource_id, has_reporting_access } =
        data;
    const { amoa_ced } = data;

    const parsed = resource_id ? parseInt(resource_id) : NaN;
    const resourceId = isNaN(parsed) ? null : parsed;

    await prisma.user.updateMany({
        where: { id: idParam(id) },
        data: {
            nom: required(nom),
            prenom: required(prenom),
            email: required(email),
            trigramme: trigramme ? String(trigramme).toUpperCase().trim() : null,
            is_admin: flag(is_admin),
            is_expert: flag(is_expert),
            is_user: flag(is_user),
            is_rh: flag(is_rh),
            resource_id: resourceId,
            has_reporting_access: flag(has_reporting_access),
            amoa_ced: flag(amoa_ced)
        }
    });
    return resourceId;
}

/** Supprime un compte ; le dernier administrateur ne peut pas être supprimé */
export async function deleteUser(id: string | number) {
    const userId = idParam(id);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { is_admin: true } });
    if (user && user.is_admin === 1 && (await prisma.user.count({ where: { is_admin: 1 } })) <= 1) {
        throw badRequest('Impossible de supprimer le dernier administrateur');
    }
    await prisma.user.deleteMany({ where: { id: userId } });
}

/** Bascule actif / inactif ; renvoie le nouvel état */
export async function toggleUser(id: string | number) {
    const user = await prisma.user.findUnique({ where: { id: idParam(id) }, select: { id: true, actif: true } });
    if (!user) throw notFound('Utilisateur non trouvé');
    const actif = user.actif === 1 ? 0 : 1;
    await prisma.user.update({ where: { id: user.id }, data: { actif } });
    return actif;
}

// ---------- Droits ----------

/** @param column */
export async function setUserFlag(
    id: string | number,
    column: 'has_reporting_access' | 'is_rh' | 'amoa_ced' | 'astreinte_ho_ans',
    enabled: boolean
) {
    await prisma.user.updateMany({ where: { id: idParam(id) }, data: { [column]: flag(enabled) } });
}

/** Volontariat aux astreintes, porté par la ressource rattachée au compte */
export async function setAstreinteAccess(id: string | number, enabled: boolean) {
    const user = await prisma.user.findUnique({ where: { id: idParam(id) }, select: { resource_id: true } });
    if (!user?.resource_id) throw badRequest('Pas de ressource associée');
    await prisma.resource.updateMany({
        where: { id: user.resource_id },
        data: { astreinte_volontaire: flag(enabled) }
    });
}

/** Applications et leurs utilisateurs autorisés */
export async function listAppAccess() {
    const access = await prisma.appUserAccess.findMany({ select: { app_key: true, user_id: true } });
    const users = await prisma.user.findMany({
        where: { id: { in: [...new Set(access.map(a => a.user_id))] } },
        select: { id: true, nom: true, prenom: true, email: true, username: true }
    });
    const userById = new Map(users.map(u => [u.id, u]));
    const rows = access
        .filter(a => userById.has(a.user_id))
        .map(a => ({ app_key: a.app_key, ...userById.get(a.user_id) }))
        .sort(byKeys('app_key', 'nom', 'prenom'));

    const result: Record<string, any> = {};
    for (const [key, def] of Object.entries(APP_DEFINITIONS)) result[key] = { ...def, users: [] };
    for (const r of rows) {
        result[r.app_key]?.users.push({ id: r.id, nom: r.nom, prenom: r.prenom, email: r.email, username: r.username });
    }
    return result;
}

export async function grantAppAccess(app: string, userId: unknown) {
    if (!Object.hasOwn(APP_DEFINITIONS, app)) throw badRequest('Application inconnue');
    const user_id = toInt(userId) as number;
    await prisma.appUserAccess.upsert({
        where: { app_key_user_id: { app_key: app, user_id } },
        update: {},
        create: { app_key: app, user_id }
    });
    // Colonne historique amoa_ced conservée pour compatibilité
    if (app === 'deplacements') {
        await prisma.user.updateMany({ where: { id: user_id }, data: { amoa_ced: 1 } }).catch(() => {});
    }
}

export async function revokeAppAccess(app: string, userId: string | number) {
    const user_id = idParam(userId);
    await prisma.appUserAccess.deleteMany({ where: { app_key: app, user_id } });
    if (app === 'deplacements') {
        await prisma.user.updateMany({ where: { id: user_id }, data: { amoa_ced: 0 } }).catch(() => {});
    }
}

// ---------- Mots de passe ----------

/** Réinitialisation par un administrateur ; renvoie l'utilisateur concerné */
export async function resetPassword(id: string | number, newPassword: unknown) {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        throw badRequest('Le mot de passe doit contenir au moins 6 caractères');
    }
    const hashed = await hashPassword(newPassword);
    const user = await getUser(id);
    if (!user) throw notFound('Utilisateur non trouvé');
    // Mot de passe connu de l'administrateur : à remplacer à la prochaine connexion
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, must_change_password: 1 } });
    return user;
}

/**
 * Changement depuis l'écran « Mon profil » (mot de passe actuel vérifié : check) ou à la connexion quand il est
 * obligatoire (check absent). Règles de complexité ; le nouveau mot de passe doit différer de l'actuel (mot de passe
 * donné par un administrateur).
 */
export async function changeProfilePassword(
    userId: number,
    newPassword: unknown,
    check?: { currentPassword: unknown }
) {
    if (check && (!check.currentPassword || typeof check.currentPassword !== 'string')) {
        throw badRequest('Mot de passe actuel requis');
    }
    if (!newPassword) throw badRequest('Nouveau mot de passe requis');
    const weakness = passwordStrengthError(newPassword);
    if (weakness) throw badRequest(weakness);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) throw notFound('Utilisateur introuvable');
    // Erreur de saisie (400), comme les règles de complexité
    if (check && !(await verifyPassword(String(check.currentPassword), user.password)).ok) {
        throw badRequest('Mot de passe actuel incorrect');
    }
    if ((await verifyPassword(String(newPassword), user.password)).ok) {
        throw badRequest('Le nouveau mot de passe doit être différent du mot de passe actuel');
    }
    await prisma.user.update({
        where: { id: userId },
        data: { password: await hashPassword(String(newPassword)), must_change_password: 0 }
    });
}

// ---------- Préférences du compte ----------

export async function getProfilePhoto(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { profile_photo: true } });
    return user?.profile_photo || null;
}

export async function setProfilePhoto(userId: number, photo: unknown) {
    if (!photo) throw badRequest('Photo manquante');
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) throw badRequest('Format invalide');
    await prisma.user.updateMany({ where: { id: userId }, data: { profile_photo: photo } });
}

export async function setDefaultTab(userId: number, tab: unknown) {
    if (typeof tab !== 'string' || !DEFAULT_TABS.includes(tab)) throw badRequest('Onglet invalide');
    await prisma.user.updateMany({ where: { id: userId }, data: { default_tab: tab } });
}
