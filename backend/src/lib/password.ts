import bcrypt from 'bcrypt';
import crypto from 'crypto';

const BCRYPT_COST = 12;
const MIN_LENGTH = 8;
const SPECIAL_CHAR = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/]/;

/** Règle de complexité commune, affichée à l'utilisateur */
export const PASSWORD_RULE = `${MIN_LENGTH} caractères minimum, dont au moins 1 caractère spécial`;

/**
 * Vérifie la complexité d'un nouveau mot de passe
 * @returns message d'erreur, ou null si le mot de passe est conforme
 */
export function passwordStrengthError(password: unknown): string | null {
    if (typeof password !== 'string' || password.length < MIN_LENGTH) {
        return `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères`;
    }
    if (!SPECIAL_CHAR.test(password)) return 'Le mot de passe doit contenir au moins 1 caractère spécial';
    return null;
}

export function hashPassword(password: string) {
    return bcrypt.hash(password, BCRYPT_COST);
}

let dummyHash: Promise<string> | null = null;

/**
 * Vérification factice, de même durée qu'une vraie, pour un compte inconnu : le temps de réponse de la
 * connexion ne révèle pas si un identifiant existe.
 */
export async function verifyAgainstDummy(plain: string) {
    dummyHash ??= bcrypt.hash(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);
    await bcrypt.compare(plain, await dummyHash);
}

/** Vérifie un mot de passe : bcrypt, ou ancien hash SHA-256 (à migrer vers bcrypt si correct). */
export async function verifyPassword(
    plain: string,
    stored: string | null | undefined
): Promise<{ ok: boolean; needsRehash: boolean }> {
    if (!stored) return { ok: false, needsRehash: false };
    if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
        return { ok: await bcrypt.compare(plain, stored), needsRehash: false };
    }
    const sha = crypto.createHash('sha256').update(plain).digest('hex');
    const ok = sha === stored;
    return { ok, needsRehash: ok };
}
