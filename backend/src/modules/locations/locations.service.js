// @ts-check
// Localisations (SAMU-SAS et autres lieux) : libellés et adresses en majuscules
import { prisma } from '../../db/prisma.js';
import { idParam, isUniqueViolation, sqlTimestamp } from '../../db/values.js';
import { badRequest, HttpError, notFound } from '../../lib/http-error.js';

/** Coordonnée saisie : vide ou non numérique → null */
function coordinate(/** @type {unknown} */ value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

const upper = (/** @type {unknown} */ value) => (value ? String(value).toUpperCase() : null);

const duplicate = () => new HttpError(409, 'Ce libellé long existe déjà');

/** Champs saisis : libellés obligatoires */
function locationData(/** @type {any} */ b) {
    if (!b.libelle_long || !b.libelle_court) throw badRequest('Libellé long et libellé court requis');
    return {
        libelle_long: String(b.libelle_long).toUpperCase(),
        libelle_court: String(b.libelle_court).toUpperCase(),
        adresse: upper(b.adresse),
        latitude: b.latitude ? coordinate(b.latitude) : null,
        longitude: b.longitude ? coordinate(b.longitude) : null
    };
}

export function listLocations() {
    return prisma.location.findMany({ orderBy: [{ libelle_long: 'asc' }, { id: 'asc' }] });
}

export async function createLocation(/** @type {unknown} */ body) {
    try {
        return (await prisma.location.create({ data: locationData(body) })).id;
    } catch (err) {
        if (isUniqueViolation(err)) throw duplicate();
        throw err;
    }
}

export async function updateLocation(/** @type {unknown} */ id, /** @type {unknown} */ body) {
    const data = locationData(body);
    let count;
    try {
        ({ count } = await prisma.location.updateMany({
            where: { id: idParam(id) },
            data: { ...data, updated_at: sqlTimestamp() }
        }));
    } catch (err) {
        if (isUniqueViolation(err)) throw duplicate();
        throw err;
    }
    if (count === 0) throw notFound('Localisation non trouvée');
}

/** Événements qui utilisent une localisation */
export async function locationUsage(/** @type {unknown} */ id) {
    const events = await prisma.customEvent.findMany({
        where: { location_id: idParam(id) },
        select: { id: true, label: true, start_date: true, end_date: true },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
    });
    return { count: events.length, events };
}

/** Suppression ; les événements gardent leur location_id orphelin (« NON DÉFINI » à l'affichage) */
export async function deleteLocation(/** @type {unknown} */ id) {
    await prisma.location.deleteMany({ where: { id: idParam(id) } });
}

/**
 * Import CSV : les nouveaux libellés sont créés ; ceux qui existent déjà sont renvoyés comme conflits
 * (même identiques : l'utilisateur choisit)
 */
export async function importLocations(/** @type {unknown} */ rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw badRequest('Aucune ligne fournie');
    const conflicts = [];
    const clean = [];
    for (const row of rows) {
        if (!row.libelle_long || !row.libelle_court) continue;
        const incoming = {
            libelle_long: String(row.libelle_long).toUpperCase().trim(),
            libelle_court: String(row.libelle_court).toUpperCase().trim(),
            adresse: row.adresse ? String(row.adresse).toUpperCase().trim() : '',
            latitude: coordinate(row.latitude),
            longitude: coordinate(row.longitude)
        };
        const existing = await prisma.location.findUnique({ where: { libelle_long: incoming.libelle_long } });
        if (existing) {
            const identical =
                existing.libelle_court === incoming.libelle_court &&
                (existing.adresse || '') === incoming.adresse &&
                existing.latitude === incoming.latitude &&
                existing.longitude === incoming.longitude;
            conflicts.push({ incoming, existing, identical });
        } else {
            clean.push(incoming);
        }
    }
    for (const row of clean) {
        try {
            await prisma.location.create({ data: { ...row, adresse: row.adresse || null } });
        } catch (err) {
            // Libellé présent deux fois dans le fichier : la première ligne est retenue
            if (!isUniqueViolation(err)) throw err;
        }
    }
    return { inserted: clean.length, conflicts };
}

/** Résolution des conflits d'import : écrasement ou saisie manuelle */
export async function resolveImportConflicts(/** @type {unknown} */ resolutions) {
    if (!Array.isArray(resolutions)) throw badRequest('Format invalide');
    let updated = 0;
    for (const r of resolutions) {
        if (r.action !== 'overwrite' && r.action !== 'manual') continue;
        try {
            await prisma.location.updateMany({
                where: { libelle_long: String(r.libelle_long) },
                data: {
                    libelle_court: /** @type {string} */ (upper(r.libelle_court)),
                    adresse: upper(r.adresse),
                    latitude: coordinate(r.latitude),
                    longitude: coordinate(r.longitude),
                    updated_at: sqlTimestamp()
                }
            });
        } catch (err) {
            console.error('Erreur résolution conflit:', err);
        }
        updated++;
    }
    return updated;
}
