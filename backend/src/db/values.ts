// Conversion des valeurs reçues (paramètres d'URL, corps JSON) vers les types attendus par Prisma.
// L'ancien code les passait telles quelles à SQLite, qui convertit selon le type de la colonne :
// ces fonctions reproduisent ce comportement de façon explicite et portable.
import { env } from '../config/env.ts';

const INT32_MAX = 2147483647;

/**
 * Identifiant lu dans l'URL : un identifiant invalide ne correspond à aucune ligne (comme en SQL).
 * Hors des entiers 32 bits (colonnes INTEGER de PostgreSQL et MariaDB) : aucune ligne non plus, plutôt qu'une erreur.
 */
export function idParam(value: unknown) {
    const n = Number(value);
    return Number.isSafeInteger(n) && Math.abs(n) <= INT32_MAX ? n : -1;
}

/** Entier optionnel : vide → null */
export function toInt(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Nombre décimal : vide → 0 (lecture historique d'une valeur vide) */
export function toFloat(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/** Booléen historique stocké en entier 0 / 1 */
export const flag = (value: unknown) => (value ? 1 : 0);

/** Chaîne optionnelle : vide → null */
export function optional(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
}

/**
 * Filtre « contient » insensible à la casse, comme LIKE sous SQLite (ASCII) :
 * PostgreSQL est sensible à la casse par défaut ; MySQL / MariaDB ne le sont pas.
 */
export function containsInsensitive(value: string) {
    return env.DB_PROVIDER === 'postgresql' ? { contains: value, mode: 'insensitive' as const } : { contains: value };
}

/** Horodatage au format historique « AAAA-MM-JJ HH:MM:SS » (UTC), comme CURRENT_TIMESTAMP */
export const sqlTimestamp = (date = new Date()) => date.toISOString().replace('T', ' ').slice(0, 19);

/** Erreur Prisma de contrainte d'unicité */
export const isUniqueViolation = (err: unknown) => (err as { code?: string } | null | undefined)?.code === 'P2002';
