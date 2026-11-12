// @ts-check
// Double authentification : configuration, codes par email, TOTP (RFC 6238)
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Durée de validité d'une vérification MFA selon la fréquence configurée */
const MFA_VALIDITY_MS = { always: 0, daily: DAY_MS, weekly: 7 * DAY_MS, monthly: 30 * DAY_MS };

// ---------- Configuration ----------

/** @returns {Promise<any>} configuration MFA (ou null si jamais enregistrée) */
export async function getMfaConfig() {
    const row = await prisma.setting.findUnique({ where: { key: 'mfa_config' } });
    return row ? JSON.parse(row.value) : null;
}

export async function saveMfaConfig(/** @type {unknown} */ config) {
    const value = JSON.stringify(config) ?? 'null';
    await prisma.setting.upsert({
        where: { key: 'mfa_config' },
        update: { value },
        create: { key: 'mfa_config', value }
    });
}

/**
 * Le profil est-il soumis au MFA ? (le profil RH ne l'est jamais)
 * @param {any} config
 * @param {string} profile
 */
export function profileRequiresMfa(config, profile) {
    if (!config || !config.enabled) return false;
    return (
        (profile === 'admin' && !!config.profileAdmin) ||
        (profile === 'expert' && !!config.profileExpert) ||
        (profile === 'user' && !!config.profileUser)
    );
}

/** Méthode proposée au client : 'email', 'totp' ou 'choice' */
export const clientMfaMethod = (/** @type {any} */ config) => (config.method === 'both' ? 'choice' : config.method);

// ---------- Validations ----------

/** Une vérification MFA récente dispense-t-elle d'en demander une nouvelle ? */
export async function isMfaStillValid(/** @type {number} */ userId, /** @type {string} */ frequency) {
    const row = await prisma.mfaValidation.findFirst({
        where: { user_id: userId },
        orderBy: { validated_at: 'desc' },
        select: { validated_at: true }
    });
    if (!row || !row.validated_at) return false;
    const maxAge = MFA_VALIDITY_MS[/** @type {keyof typeof MFA_VALIDITY_MS} */ (frequency)] ?? DAY_MS;
    return Date.now() - new Date(row.validated_at).getTime() < maxAge;
}

export async function recordMfaValidation(/** @type {number} */ userId) {
    await prisma.mfaValidation.create({ data: { user_id: userId, validated_at: sqlTimestamp() } });
}

/** Supprime TOTP, validations et codes en attente d'un utilisateur (changement de téléphone) */
export async function resetUserMfa(/** @type {string | number} */ userId) {
    const id = idParam(userId);
    await prisma.$transaction([
        prisma.user.updateMany({ where: { id }, data: { totp_secret: null } }),
        prisma.mfaValidation.deleteMany({ where: { user_id: id } }),
        prisma.mfaCode.deleteMany({ where: { user_id: id } })
    ]);
}

export async function resetAllMfa() {
    await prisma.$transaction([
        prisma.user.updateMany({ data: { totp_secret: null } }),
        prisma.mfaValidation.deleteMany(),
        prisma.mfaCode.deleteMany()
    ]);
}

// ---------- Codes par email ----------

/** Génère et enregistre un code à 6 chiffres valable 10 minutes */
export async function createEmailCode(/** @type {number} */ userId) {
    const code = crypto.randomInt(100000, 1000000).toString();
    const expires_at = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();
    // Un seul code par compte : le précédent est remplacé
    await prisma.$transaction([
        prisma.mfaCode.deleteMany({ where: { user_id: userId } }),
        prisma.mfaCode.create({ data: { user_id: userId, code, expires_at } })
    ]);
    return code;
}

/** Vérifie un code email non expiré et le consomme */
export async function consumeEmailCode(/** @type {number} */ userId, /** @type {string} */ code) {
    const row = await prisma.mfaCode.findFirst({ where: { user_id: userId, code } });
    // expires_at est stocké en ISO 8601 : comparaison faite en JS
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return false;
    await prisma.mfaCode.deleteMany({ where: { user_id: userId } });
    return true;
}

// ---------- TOTP ----------

export async function isTotpConfigured(/** @type {number} */ userId) {
    return (await getTotpSecret(userId)) !== null;
}

export async function getTotpSecret(/** @type {number} */ userId) {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { totp_secret: true } });
    return row?.totp_secret ?? null;
}

export async function saveTotpSecret(/** @type {number} */ userId, /** @type {string} */ secret) {
    await prisma.user.update({ where: { id: userId }, data: { totp_secret: secret } });
}

/** Secret base32 de 32 caractères (160 bits) */
export function generateTotpSecret() {
    let secret = '';
    for (let i = 0; i < 32; i++) secret += BASE32.charAt(crypto.randomInt(BASE32.length));
    return secret;
}

/**
 * Code TOTP (HMAC-SHA1, 6 chiffres) pour un compteur donné
 * @param {string} secret
 * @param {number} counter
 */
export function generateTotpCode(secret, counter) {
    let bits = '';
    for (const c of secret.toUpperCase()) bits += BASE32.indexOf(c).toString(2).padStart(5, '0');
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));
    const hash = crypto.createHmac('sha1', Buffer.from(bytes)).update(counterBuffer).digest();

    const offset = hash[hash.length - 1] & 0xf;
    const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, '0');
}

/** Accepte le code de la fenêtre de 30 s courante et des deux fenêtres adjacentes */
export function verifyTotp(/** @type {string} */ secret, /** @type {string} */ code) {
    const step = Math.floor(Date.now() / 1000 / 30);
    for (let i = -1; i <= 1; i++) {
        if (generateTotpCode(secret, step + i) === code) return true;
    }
    return false;
}

/** URL otpauth:// à encoder en QR code dans l'application d'authentification */
export const otpauthUrl = (/** @type {string} */ username, /** @type {string} */ secret) =>
    `otpauth://totp/Planning%20ANS:${encodeURIComponent(username)}?secret=${secret}&issuer=Planning%20ANS`;
