// @ts-check
// Accès aux données : comptes utilisateurs, droits applicatifs, préférences
import { dbAll, dbGet, dbRun } from '../../db/database.js';
import { badRequest, notFound, unauthorized } from '../../lib/http-error.js';
import { hashPassword, passwordStrengthError, verifyPassword } from '../../lib/password.js';

const MIN_PASSWORD_LENGTH = 6;
const DEFAULT_TABS = ['resources', 'planning', 'evenements', 'cra', 'reporting', 'admin', 'astreintesGestion'];

/** Applications soumises à autorisation individuelle */
export const APP_DEFINITIONS = {
    deplacements: { label: 'Plateforme de suivi des déplacements', icon: '🚗' },
    analyse: { label: 'Analyse de fichiers', icon: '📊' },
    affectation: { label: "Aide à l'affectation opérationnelle", icon: '🎯' }
};

const flag = (/** @type {unknown} */ v) => (v ? 1 : 0);

// ---------- Lecture ----------

/** Liste complète pour l'administration */
export function listUsers() {
    return dbAll(`
        SELECT u.*, r.trigramme, r.astreinte_volontaire as resource_trigramme,
               COALESCE(u.trigramme, r.trigramme) as trigramme,
               r.astreinte_volontaire,
               (SELECT MAX(login_time) FROM connection_logs WHERE user_id = u.id) as last_login
        FROM users u
        LEFT JOIN resources r ON u.resource_id = r.id
        ORDER BY u.username
    `);
}

/** Informations de base des utilisateurs actifs (affichage dans le Gantt) */
export function listPublicUsers() {
    return dbAll(`
        SELECT u.id, u.nom, u.prenom, u.email, u.resource_id, u.profile_photo, u.is_expert,
               COALESCE(u.trigramme, r.trigramme) as trigramme
        FROM users u
        LEFT JOIN resources r ON u.resource_id = r.id
        WHERE u.actif = 1
        ORDER BY u.nom, u.prenom
    `);
}

export function listAmoaCedUsers() {
    return dbAll(`
        SELECT u.id, u.nom, u.prenom, u.email, u.resource_id, r.trigramme
        FROM users u
        LEFT JOIN resources r ON u.resource_id = r.id
        WHERE u.actif = 1 AND u.amoa_ced = 1
        ORDER BY u.nom, u.prenom
    `);
}

/** Recherche pour l'autocomplétion (2 caractères minimum) */
export async function searchUsers(/** @type {string} */ query) {
    const q = query.trim();
    if (q.length < 2) return [];
    const like = `%${q}%`;
    return dbAll(
        `SELECT id, nom, prenom, email, username FROM users
         WHERE actif = 1 AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ? OR username LIKE ?)
         ORDER BY nom, prenom LIMIT 20`,
        [like, like, like, like]
    );
}

export function getUser(/** @type {string | number} */ id) {
    return dbGet('SELECT * FROM users WHERE id = ?', [id]);
}

/** Compte expert rattaché à une ressource */
export function getExpertByResource(/** @type {string | number} */ resourceId) {
    return dbGet(
        'SELECT id, username, email, nom, prenom, is_expert, resource_id FROM users WHERE resource_id = ? AND is_expert = 1 LIMIT 1',
        [resourceId]
    );
}

// ---------- Création / modification ----------

/**
 * @param {Record<string, any>} data
 * @returns {Promise<number>}
 */
export async function createUser(data) {
    const { username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, is_rh, resource_id } =
        data;
    const { has_reporting_access, amoa_ced } = data;
    if (!username || !password) throw badRequest('Username et password requis');

    const hashed = await hashPassword(password);
    try {
        const { lastID } = await dbRun(
            `INSERT INTO users (username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, is_rh, resource_id, has_reporting_access, amoa_ced)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                username,
                hashed,
                nom,
                prenom,
                email,
                telephone || null,
                flag(is_admin),
                flag(is_expert),
                flag(is_user),
                flag(is_rh),
                resource_id || null,
                flag(has_reporting_access),
                flag(amoa_ced)
            ]
        );
        return lastID;
    } catch (/** @type {any} */ err) {
        if (String(err.message).includes('UNIQUE')) throw badRequest("Ce nom d'utilisateur existe déjà");
        throw err;
    }
}

/**
 * @param {string | number} id
 * @param {Record<string, any>} data
 * @returns {Promise<number | null>} identifiant de ressource retenu
 */
export async function updateUser(id, data) {
    const { nom, prenom, email, trigramme, is_admin, is_expert, is_user, is_rh, resource_id, has_reporting_access } =
        data;
    const { amoa_ced } = data;

    const parsed = resource_id ? parseInt(resource_id) : NaN;
    const resourceId = isNaN(parsed) ? null : parsed;
    const finalTrigramme = trigramme ? String(trigramme).toUpperCase().trim() : null;

    await dbRun(
        `UPDATE users
         SET nom = ?, prenom = ?, email = ?, trigramme = ?, is_admin = ?, is_expert = ?, is_user = ?, is_rh = ?, resource_id = ?, has_reporting_access = ?, amoa_ced = ?
         WHERE id = ?`,
        [
            nom,
            prenom,
            email,
            finalTrigramme,
            flag(is_admin),
            flag(is_expert),
            flag(is_user),
            flag(is_rh),
            resourceId,
            flag(has_reporting_access),
            flag(amoa_ced),
            id
        ]
    );
    return resourceId;
}

/** Supprime un compte ; le dernier administrateur ne peut pas être supprimé */
export async function deleteUser(/** @type {string | number} */ id) {
    const user = await dbGet('SELECT is_admin FROM users WHERE id = ?', [id]);
    if (user && user.is_admin === 1) {
        const { count } = await dbGet('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
        if (count <= 1) throw badRequest('Impossible de supprimer le dernier administrateur');
    }
    await dbRun('DELETE FROM users WHERE id = ?', [id]);
}

/** Bascule actif / inactif ; renvoie le nouvel état */
export async function toggleUser(/** @type {string | number} */ id) {
    const row = await dbGet('SELECT actif FROM users WHERE id = ?', [id]);
    if (!row) throw notFound('Utilisateur non trouvé');
    const actif = row.actif === 1 ? 0 : 1;
    await dbRun('UPDATE users SET actif = ? WHERE id = ?', [actif, id]);
    return actif;
}

// ---------- Droits ----------

/** @param {'has_reporting_access' | 'is_rh' | 'amoa_ced'} column */
export async function setUserFlag(/** @type {string | number} */ id, column, /** @type {boolean} */ enabled) {
    await dbRun(`UPDATE users SET ${column} = ? WHERE id = ?`, [flag(enabled), id]);
}

/** Volontariat aux astreintes, porté par la ressource rattachée au compte */
export async function setAstreinteAccess(/** @type {string | number} */ id, /** @type {boolean} */ enabled) {
    const user = await dbGet('SELECT resource_id FROM users WHERE id = ?', [id]).catch(() => null);
    if (!user?.resource_id) throw badRequest('Pas de ressource associée');
    await dbRun('UPDATE resources SET astreinte_volontaire = ? WHERE id = ?', [flag(enabled), user.resource_id]);
}

/** Applications et leurs utilisateurs autorisés */
export async function listAppAccess() {
    const rows = await dbAll(`
        SELECT a.app_key, a.user_id, u.nom, u.prenom, u.email, u.username
        FROM app_user_access a
        JOIN users u ON u.id = a.user_id
        ORDER BY a.app_key, u.nom, u.prenom
    `);
    /** @type {Record<string, any>} */
    const result = {};
    for (const [key, def] of Object.entries(APP_DEFINITIONS)) result[key] = { ...def, users: [] };
    for (const r of rows) {
        result[r.app_key]?.users.push({
            id: r.user_id,
            nom: r.nom,
            prenom: r.prenom,
            email: r.email,
            username: r.username
        });
    }
    return result;
}

export async function grantAppAccess(/** @type {string} */ app, /** @type {unknown} */ userId) {
    if (!Object.hasOwn(APP_DEFINITIONS, app)) throw badRequest('Application inconnue');
    await dbRun('INSERT OR IGNORE INTO app_user_access (app_key, user_id) VALUES (?, ?)', [app, userId]);
    // Colonne historique amoa_ced conservée pour compatibilité
    if (app === 'deplacements') dbRun('UPDATE users SET amoa_ced = 1 WHERE id = ?', [userId]).catch(() => {});
}

export async function revokeAppAccess(/** @type {string} */ app, /** @type {string | number} */ userId) {
    await dbRun('DELETE FROM app_user_access WHERE app_key = ? AND user_id = ?', [app, userId]);
    if (app === 'deplacements') dbRun('UPDATE users SET amoa_ced = 0 WHERE id = ?', [userId]).catch(() => {});
}

// ---------- Mots de passe ----------

/** Réinitialisation par un administrateur ; renvoie l'utilisateur concerné */
export async function resetPassword(/** @type {string | number} */ id, /** @type {unknown} */ newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        throw badRequest('Le mot de passe doit contenir au moins 6 caractères');
    }
    const hashed = await hashPassword(newPassword);
    const user = await getUser(id);
    if (!user) throw notFound('Utilisateur non trouvé');
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
    return user;
}

/** Changement par l'utilisateur, avec vérification de l'ancien mot de passe */
export async function changePassword(
    /** @type {number} */ userId,
    /** @type {unknown} */ oldPassword,
    /** @type {unknown} */ newPassword
) {
    if (!oldPassword || !newPassword) throw badRequest('Ancien et nouveau mot de passe requis');
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        throw badRequest('Le mot de passe doit contenir au moins 6 caractères');
    }
    const user = await getUser(userId);
    if (!user) throw notFound('Utilisateur introuvable');
    const { ok } = await verifyPassword(String(oldPassword), user.password);
    if (!ok) throw unauthorized('Ancien mot de passe incorrect');
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(newPassword), userId]);
}

/** Changement depuis l'écran « Mon profil » (règles de complexité, sans ancien mot de passe) */
export async function changeProfilePassword(/** @type {number} */ userId, /** @type {unknown} */ newPassword) {
    if (!newPassword) throw badRequest('Nouveau mot de passe requis');
    const weakness = passwordStrengthError(newPassword);
    if (weakness) throw badRequest(weakness);
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(String(newPassword)), userId]);
}

// ---------- Préférences du compte ----------

export async function getProfilePhoto(/** @type {number} */ userId) {
    const row = await dbGet('SELECT profile_photo FROM users WHERE id = ?', [userId]);
    return row?.profile_photo || null;
}

export async function setProfilePhoto(/** @type {number} */ userId, /** @type {unknown} */ photo) {
    if (!photo) throw badRequest('Photo manquante');
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) throw badRequest('Format invalide');
    await dbRun('UPDATE users SET profile_photo = ? WHERE id = ?', [photo, userId]);
}

export async function setDefaultTab(/** @type {number} */ userId, /** @type {unknown} */ tab) {
    if (typeof tab !== 'string' || !DEFAULT_TABS.includes(tab)) throw badRequest('Onglet invalide');
    await dbRun('UPDATE users SET default_tab = ? WHERE id = ?', [tab, userId]);
}
