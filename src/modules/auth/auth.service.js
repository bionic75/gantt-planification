// @ts-check
// Accès aux données : comptes pour la connexion, journal des connexions, mot de passe oublié
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/password.js';

/** @typedef {'admin' | 'expert' | 'user' | 'rh'} Profile */

/**
 * Compte avec le trigramme et le volontariat aux astreintes de sa ressource
 * (le trigramme de la ressource remplace celui du compte, comme la jointure historique)
 * @param {any} user
 */
async function withResource(user) {
    if (!user) return null;
    const resource =
        user.resource_id !== null
            ? await prisma.resource.findUnique({
                  where: { id: user.resource_id },
                  select: { trigramme: true, astreinte_volontaire: true }
              })
            : null;
    return {
        ...user,
        trigramme: resource?.trigramme ?? null,
        astreinte_volontaire: resource?.astreinte_volontaire ?? null
    };
}

/** Profils détenus par un compte, dans l'ordre de priorité */
export function profilesOf(/** @type {any} */ user) {
    /** @type {Profile[]} */
    const profiles = [];
    if (user.is_admin === 1) profiles.push('admin');
    if (user.is_expert === 1) profiles.push('expert');
    if (user.is_user === 1) profiles.push('user');
    if (user.is_rh === 1) profiles.push('rh');
    return profiles;
}

/**
 * Vérifie identifiant et mot de passe d'un compte actif (migre au passage un ancien hash SHA-256 vers bcrypt)
 * @returns {Promise<any | null>} le compte, ou null si les identifiants sont incorrects
 */
export async function authenticate(/** @type {string} */ username, /** @type {string} */ password) {
    const user = await prisma.user.findFirst({ where: { username: String(username), actif: 1 } });
    if (!user) {
        await verifyAgainstDummy(String(password));
        return null;
    }

    const { ok, needsRehash } = await verifyPassword(String(password), user.password);
    if (!ok) return null;
    if (needsRehash) {
        await prisma.user
            .update({ where: { id: user.id }, data: { password: await hashPassword(String(password)) } })
            .catch(err => console.error('Erreur migration hash mot de passe:', err));
    }
    return withResource(user);
}

export async function getUserForLogin(/** @type {number} */ userId) {
    return withResource(await prisma.user.findUnique({ where: { id: userId } }));
}

/** Applications autorisées (« Aide à l'affectation », « Déplacements »…) */
export async function getAvailableApps(/** @type {number} */ userId) {
    const rows = await prisma.appUserAccess.findMany({
        where: { user_id: userId },
        select: { app_key: true },
        orderBy: { id: 'asc' }
    });
    return rows.map(r => r.app_key);
}

/** Enregistre la connexion ; renvoie l'id de la ligne de journal (null en cas d'échec) */
export async function recordLogin(/** @type {any} */ user, /** @type {Profile} */ profile) {
    try {
        const { id } = await prisma.connectionLog.create({
            data: { user_id: user.id, username: user.username, nom: user.nom, prenom: user.prenom, profile }
        });
        return id;
    } catch (err) {
        console.error('❌ Erreur log connexion:', err);
        return null;
    }
}

export function recordLogout(/** @type {number} */ userId, /** @type {string | undefined} */ username) {
    prisma.actionLog
        .create({
            data: {
                user_id: userId,
                action_type: 'deconnexion',
                details: JSON.stringify({ username }),
                created_at: new Date().toISOString()
            }
        })
        .catch(err => console.error('❌ Erreur log déconnexion:', err));
}

/** Données complémentaires de la session courante */
export async function getSessionUserData(/** @type {number} */ userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            profile_photo: true,
            amoa_ced: true,
            is_admin: true,
            is_expert: true,
            is_user: true,
            is_rh: true,
            resource_id: true
        }
    });
    if (!user) return null;
    const { resource_id, ...data } = user;
    const resource =
        resource_id !== null
            ? await prisma.resource.findUnique({
                  where: { id: resource_id },
                  select: { trigramme: true, astreinte_volontaire: true, astreinte_date_activation: true }
              })
            : null;
    return {
        ...data,
        trigramme: resource?.trigramme ?? null,
        astreinte_volontaire: resource?.astreinte_volontaire ?? null,
        astreinte_date_activation: resource?.astreinte_date_activation ?? null
    };
}

const PROFILE_FLAGS = { is_admin: true, is_expert: true, is_user: true, is_rh: true };

export async function getUserProfiles(/** @type {number} */ userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_FLAGS });
    return user ? profilesOf(user) : null;
}

/** Compte destinataire d'un code MFA par email */
export function getUserContact(/** @type {number} */ userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { email: true, prenom: true, nom: true } });
}

// ---------- Mot de passe oublié : lien de réinitialisation à usage unique ----------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Délai minimal entre deux demandes pour un même compte (évite l'envoi massif d'emails) */
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

const sha256 = (/** @type {string} */ value) => crypto.createHash('sha256').update(value).digest('hex');

/** Journal sans session : ligne de connexion « system » */
function logSystemAction(/** @type {any} */ user, /** @type {string} */ action) {
    prisma.connectionLog
        .create({
            data: {
                user_id: user.id,
                username: user.username,
                nom: user.nom,
                prenom: user.prenom,
                profile: 'system',
                modifications: JSON.stringify([
                    { timestamp: new Date().toISOString(), action, details: { userId: user.id } }
                ])
            }
        })
        .catch(err => console.error('Erreur journal mot de passe:', err));
}

/**
 * Crée un jeton de réinitialisation pour un compte actif disposant d'un email.
 * Le mot de passe actuel reste valable tant que le jeton n'est pas utilisé.
 * @returns {Promise<{ user: any, token: string } | null>} null si aucun email ne doit être envoyé
 *   (compte inconnu, désactivé, sans email, ou demande trop rapprochée)
 */
export async function createPasswordResetToken(/** @type {string} */ username) {
    const user = await prisma.user.findFirst({
        where: { username, actif: 1 },
        select: { id: true, username: true, nom: true, prenom: true, email: true }
    });
    if (!user || !user.email) return null;

    const last = await prisma.passwordResetToken.findFirst({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
        select: { created_at: true }
    });
    if (last && Date.now() - new Date(last.created_at).getTime() < RESET_REQUEST_COOLDOWN_MS) return null;

    // Un seul lien valide à la fois : les précédents sont invalidés
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { user_id: user.id } }),
        prisma.passwordResetToken.create({
            data: {
                user_id: user.id,
                token_hash: sha256(token),
                created_at: new Date(now).toISOString(),
                expires_at: new Date(now + RESET_TOKEN_TTL_MS).toISOString()
            }
        })
    ]);
    logSystemAction(user, 'Demande de réinitialisation du mot de passe');
    return { user, token };
}

/**
 * Jeton valide (existant, non utilisé, non expiré, compte actif)
 * @returns {Promise<{ tokenId: number, user: any } | null>}
 */
export async function findValidResetToken(/** @type {unknown} */ token) {
    if (typeof token !== 'string' || !token) return null;
    const reset = await prisma.passwordResetToken.findUnique({ where: { token_hash: sha256(token) } });
    if (!reset || reset.used_at !== null || new Date(reset.expires_at).getTime() <= Date.now()) return null;
    const user = await prisma.user.findFirst({
        where: { id: reset.user_id, actif: 1 },
        select: { id: true, username: true, nom: true, prenom: true }
    });
    return user ? { tokenId: reset.id, user } : null;
}

/**
 * Applique le nouveau mot de passe et consomme le jeton
 * @param {{ tokenId: number, user: any }} reset
 * @param {string} newPassword mot de passe déjà validé
 * @returns {Promise<boolean>} false si le jeton a été utilisé entre-temps
 */
export async function applyPasswordReset({ tokenId, user }, newPassword) {
    const hashed = await hashPassword(newPassword);
    // Consommation atomique : une seule requête concurrente peut utiliser le jeton
    const { count } = await prisma.passwordResetToken.updateMany({
        where: { id: tokenId, used_at: null },
        data: { used_at: new Date().toISOString() }
    });
    if (count !== 1) return false;

    // Mot de passe choisi par l'utilisateur : plus de changement obligatoire
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, must_change_password: 0 } });
    await prisma.passwordResetToken.deleteMany({ where: { user_id: user.id, id: { not: tokenId } } });
    logSystemAction(user, 'Réinitialisation mot de passe');
    return true;
}
