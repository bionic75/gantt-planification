// Validation de la syntaxe des adresses e-mail (utilisée côté serveur ; la même règle est dans public/js/app/email-validation.js)

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * Syntaxe d'une adresse e-mail : partie locale, @, domaine à au moins deux libellés, extension d'au moins 2 lettres
 * @param {unknown} value
 */
export function isEmail(value) {
    if (typeof value !== 'string') return false;
    const s = value.trim();
    if (!s || s.length > 254) return false;
    const at = s.lastIndexOf('@');
    if (at < 1 || s.indexOf('@') !== at) return false;
    const local = s.slice(0, at);
    const labels = s.slice(at + 1).split('.');
    if (local.length > 64 || !LOCAL.test(local)) return false;
    if (labels.length < 2 || !labels.every(l => LABEL.test(l))) return false;
    return /^[A-Za-z]{2,}$/.test(/** @type {string} */ (labels.at(-1)));
}

/**
 * Liste d'adresses, une par ligne : lignes vides ignorées, doublons retirés.
 * @param {unknown} text
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function parseEmailLines(text) {
    /** @type {string[]} */
    const valid = [];
    /** @type {string[]} */
    const invalid = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (!isEmail(line)) invalid.push(line);
        else if (!valid.some(v => v.toLowerCase() === line.toLowerCase())) valid.push(line);
    }
    return { valid, invalid };
}
