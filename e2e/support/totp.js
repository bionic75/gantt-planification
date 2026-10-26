// @ts-check
// Code TOTP (RFC 6238, HMAC-SHA1, 6 chiffres, pas de 30 s) : même calcul que src/modules/auth/mfa.service.js
import crypto from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function codeTotp(/** @type {string} */ secret, now = Date.now()) {
    let bits = '';
    for (const c of secret.toUpperCase().replace(/\s+/g, '')) bits += BASE32.indexOf(c).toString(2).padStart(5, '0');
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));

    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(Math.floor(now / 1000 / 30)));
    const hash = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
    const offset = hash[hash.length - 1] & 0xf;
    const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, '0');
}
