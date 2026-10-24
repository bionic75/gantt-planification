// @ts-check
// Paramètres de l'application (table settings : clé → valeur texte)
import { prisma } from '../db/prisma.js';

/** Valeur d'un paramètre, ou null */
export async function getSetting(/** @type {string} */ key) {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? row.value : null;
}

/** Paramètre JSON ; null si absent ou invalide */
export async function getJsonSetting(/** @type {string} */ key) {
    const value = await getSetting(key);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/** Crée ou remplace un paramètre */
export async function setSetting(/** @type {string} */ key, /** @type {unknown} */ value) {
    const text = String(value);
    await prisma.setting.upsert({ where: { key }, update: { value: text }, create: { key, value: text } });
}

export async function deleteSettings(/** @type {string[]} */ keys) {
    await prisma.setting.deleteMany({ where: { key: { in: keys } } });
}

/** Tous les paramètres : { clé: valeur } */
export async function getAllSettings() {
    const rows = await prisma.setting.findMany({ orderBy: { id: 'asc' } });
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
