// @ts-check
// Accès aux données : comptes pour la connexion, journal des connexions, mot de passe oublié
import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from '../../db/database.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

/** @typedef {'admin' | 'expert' | 'user' | 'rh'} Profile */

const USER_WITH_RESOURCE = `
    SELECT u.*, r.trigramme, r.astreinte_volontaire
    FROM users u
    LEFT JOIN resources r ON r.id = u.resource_id`;

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
    const user = await dbGet(`${USER_WITH_RESOURCE} WHERE u.username = ? AND u.actif = 1`, [username]);
    if (!user) return null;

    const { ok, needsRehash } = await verifyPassword(password, user.password);
    if (!ok) return null;
    if (needsRehash) {
        dbRun('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(password), user.id]).catch(err =>
            console.error('Erreur migration hash mot de passe:', err)
        );
    }
    return user;
}

export function getUserForLogin(/** @type {number} */ userId) {
    return dbGet(`${USER_WITH_RESOURCE} WHERE u.id = ?`, [userId]);
}

/** Applications autorisées (« Aide à l'affectation », « Déplacements »…) */
export async function getAvailableApps(/** @type {number} */ userId) {
    const rows = await dbAll('SELECT app_key FROM app_user_access WHERE user_id = ?', [userId]);
    return rows.map(r => r.app_key);
}

/** Enregistre la connexion ; renvoie l'id de la ligne de journal (null en cas d'échec) */
export async function recordLogin(/** @type {any} */ user, /** @type {Profile} */ profile) {
    try {
        const { lastID } = await dbRun(
            'INSERT INTO connection_logs (user_id, username, nom, prenom, profile) VALUES (?, ?, ?, ?, ?)',
            [user.id, user.username, user.nom, user.prenom, profile]
        );
        return lastID;
    } catch (err) {
        console.error('❌ Erreur log connexion:', err);
        return null;
    }
}

export function recordLogout(/** @type {number} */ userId, /** @type {string | undefined} */ username) {
    dbRun('INSERT INTO action_logs (user_id, action_type, details, created_at) VALUES (?, ?, ?, ?)', [
        userId,
        'deconnexion',
        JSON.stringify({ username }),
        new Date().toISOString()
    ]).catch(err => console.error('❌ Erreur log déconnexion:', err));
}

/** Données complémentaires de la session courante */
export function getSessionUserData(/** @type {number} */ userId) {
    return dbGet(
        `SELECT u.email, u.profile_photo, u.amoa_ced, u.is_admin, u.is_expert, u.is_user, u.is_rh,
                r.trigramme, r.astreinte_volontaire, r.astreinte_date_activation
         FROM users u
         LEFT JOIN resources r ON r.id = u.resource_id
         WHERE u.id = ?`,
        [userId]
    );
}

export async function getUserProfiles(/** @type {number} */ userId) {
    const user = await dbGet('SELECT is_admin, is_expert, is_user, is_rh FROM users WHERE id = ?', [userId]);
    return user ? profilesOf(user) : null;
}

/** Profils proposés sur l'écran de connexion pour un identifiant */
export async function getProfilesByUsername(/** @type {string} */ username) {
    const user = await dbGet('SELECT id, is_admin, is_expert, is_user, is_rh, actif FROM users WHERE username = ?', [
        username
    ]);
    if (!user) return { profiles: [], amoaCed: false, availableApps: [] };
    if (user.actif !== 1) return { profiles: [], error: 'Compte désactivé', amoaCed: false, availableApps: [] };
    const availableApps = await getAvailableApps(user.id).catch(() => []);
    return { profiles: profilesOf(user), amoaCed: availableApps.includes('deplacements'), availableApps };
}

/** Compte destinataire d'un code MFA par email */
export function getUserContact(/** @type {number} */ userId) {
    return dbGet('SELECT email, prenom, nom FROM users WHERE id = ?', [userId]);
}

// ---------- Mot de passe oublié : lien de réinitialisation à usage unique ----------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Délai minimal entre deux demandes pour un même compte (évite l'envoi massif d'emails) */
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

const sha256 = (/** @type {string} */ value) => crypto.createHash('sha256').update(value).digest('hex');

/** Journal sans session : ligne de connexion « system » */
function logSystemAction(/** @type {any} */ user, /** @type {string} */ action) {
    dbRun(
        `INSERT INTO connection_logs (user_id, username, nom, prenom, profile, modifications) VALUES (?, ?, ?, ?, 'system', ?)`,
        [
            user.id,
            user.username,
            user.nom,
            user.prenom,
            JSON.stringify([{ timestamp: new Date().toISOString(), action, details: { userId: user.id } }])
        ]
    ).catch(err => console.error('Erreur journal mot de passe:', err));
}

/**
 * Crée un jeton de réinitialisation pour un compte actif disposant d'un email.
 * Le mot de passe actuel reste valable tant que le jeton n'est pas utilisé.
 * @returns {Promise<{ user: any, token: string } | null>} null si aucun email ne doit être envoyé
 *   (compte inconnu, désactivé, sans email, ou demande trop rapprochée)
 */
export async function createPasswordResetToken(/** @type {string} */ username) {
    const user = await dbGet('SELECT id, username, nom, prenom, email FROM users WHERE username = ? AND actif = 1', [
        username
    ]);
    if (!user || !user.email) return null;

    const last = await dbGet('SELECT MAX(created_at) AS created_at FROM password_reset_tokens WHERE user_id = ?', [
        user.id
    ]);
    if (last?.created_at && Date.now() - new Date(last.created_at).getTime() < RESET_REQUEST_COOLDOWN_MS) return null;

    // Un seul lien valide à la fois : les précédents sont invalidés
    await dbRun('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    await dbRun('INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)', [
        user.id,
        sha256(token),
        new Date(now).toISOString(),
        new Date(now + RESET_TOKEN_TTL_MS).toISOString()
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
    const row = await dbGet(
        `SELECT t.id AS token_id, t.expires_at, u.id, u.username, u.nom, u.prenom
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.used_at IS NULL AND u.actif = 1`,
        [sha256(token)]
    );
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
    return { tokenId: row.token_id, user: row };
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
    const { changes } = await dbRun('UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL', [
        new Date().toISOString(),
        tokenId
    ]);
    if (changes !== 1) return false;

    await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
    await dbRun('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?', [user.id, tokenId]);
    logSystemAction(user, 'Réinitialisation mot de passe');
    return true;
}
