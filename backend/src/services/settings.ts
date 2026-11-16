// Paramètres de l'application (table settings : clé → valeur texte)
import { prisma } from '../db/prisma.ts';

/** Valeur d'un paramètre, ou null */
export async function getSetting(key: string) {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? row.value : null;
}

/**
 * Paramètre JSON ; null si absent ou invalide. Contenu libre (configuration enregistrée par l'interface) : l'appelant
 * en connaît la forme.
 */
export async function getJsonSetting(key: string): Promise<any> {
    const value = await getSetting(key);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/** Crée ou remplace un paramètre */
export async function setSetting(key: string, value: unknown) {
    const text = String(value);
    await prisma.setting.upsert({ where: { key }, update: { value: text }, create: { key, value: text } });
}

export async function deleteSettings(keys: string[]) {
    await prisma.setting.deleteMany({ where: { key: { in: keys } } });
}

/** Tous les paramètres : { clé: valeur } */
export async function getAllSettings() {
    const rows = await prisma.setting.findMany({ orderBy: { id: 'asc' } });
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
