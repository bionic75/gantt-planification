// @ts-check
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const BCRYPT_COST = 12;
const MIN_LENGTH = 8;
const SPECIAL_CHAR = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/]/;

/** Règle de complexité commune, affichée à l'utilisateur */
export const PASSWORD_RULE = `${MIN_LENGTH} caractères minimum, dont au moins 1 caractère spécial`;

/**
 * Vérifie la complexité d'un nouveau mot de passe
 * @param {unknown} password
 * @returns {string | null} message d'erreur, ou null si le mot de passe est conforme
 */
export function passwordStrengthError(password) {
    if (typeof password !== 'string' || password.length < MIN_LENGTH) {
        return `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères`;
    }
    if (!SPECIAL_CHAR.test(password)) return 'Le mot de passe doit contenir au moins 1 caractère spécial';
    return null;
}

/** @param {string} password */
export function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Vérifie un mot de passe : bcrypt, ou ancien hash SHA-256 (à migrer vers bcrypt si correct).
 * @param {string} plain
 * @param {string | null | undefined} stored
 * @returns {Promise<{ ok: boolean, needsRehash: boolean }>}
 */
export async function verifyPassword(plain, stored) {
    if (!stored) return { ok: false, needsRehash: false };
    if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
        return { ok: await bcrypt.compare(plain, stored), needsRehash: false };
    }
    const sha = crypto.createHash('sha256').update(plain).digest('hex');
    const ok = sha === stored;
    return { ok, needsRehash: ok };
}
