// @ts-check
// Conversion des valeurs reçues (paramètres d'URL, corps JSON) vers les types attendus par Prisma.
// L'ancien code les passait telles quelles à SQLite, qui convertit selon le type de la colonne :
// ces fonctions reproduisent ce comportement de façon explicite et portable.
import { env } from '../config/env.js';

const INT32_MAX = 2147483647;

/**
 * Identifiant lu dans l'URL : un identifiant invalide ne correspond à aucune ligne (comme en SQL).
 * Hors des entiers 32 bits (colonnes INTEGER de PostgreSQL et MariaDB) : aucune ligne non plus, plutôt qu'une erreur.
 * @param {unknown} value
 */
export function idParam(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) && Math.abs(n) <= INT32_MAX ? n : -1;
}

/**
 * Entier optionnel : vide → null
 * @param {unknown} value
 */
export function toInt(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Nombre décimal : vide → 0 (lecture historique d'une valeur vide)
 * @param {unknown} value
 */
export function toFloat(value) {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Booléen historique stocké en entier 0 / 1
 * @param {unknown} value
 */
export const flag = value => (value ? 1 : 0);

/**
 * Chaîne optionnelle : vide → null
 * @param {unknown} value
 */
export function optional(value) {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
}

/**
 * Filtre « contient » insensible à la casse, comme LIKE sous SQLite (ASCII) :
 * PostgreSQL est sensible à la casse par défaut ; MySQL / MariaDB ne le sont pas.
 * @param {string} value
 */
export function containsInsensitive(value) {
    return env.DB_PROVIDER === 'postgresql' ? { contains: value, mode: 'insensitive' } : { contains: value };
}

/**
 * Horodatage au format historique « AAAA-MM-JJ HH:MM:SS » (UTC), comme CURRENT_TIMESTAMP
 * @param {Date} [date]
 */
export const sqlTimestamp = (date = new Date()) => date.toISOString().replace('T', ' ').slice(0, 19);

/**
 * Erreur Prisma de contrainte d'unicité
 * @param {any} err
 */
export const isUniqueViolation = err => err?.code === 'P2002';
