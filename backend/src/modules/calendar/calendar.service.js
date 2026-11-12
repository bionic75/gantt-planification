// @ts-check
// Calendrier : vacances scolaires (par zone) et dates particulières, importées de fichiers ICS
import { prisma } from '../../db/prisma.js';
import { idParam } from '../../db/values.js';
import { badRequest } from '../../lib/http-error.js';
import { getJsonSetting, setSetting } from '../../services/settings.js';

const SCHOOL = 'school-holidays';
const SPECIAL = 'special-dates';
const ZONES = /** @type {const} */ (['zoneA', 'zoneB', 'zoneC']);

/** Vacances scolaires saisies (paramètre), par zone */
export async function getSchoolHolidays() {
    return (await getJsonSetting('school_holidays')) || { zoneA: [], zoneB: [], zoneC: [] };
}

export async function saveSchoolHolidays(/** @type {unknown} */ holidays) {
    await setSetting('school_holidays', JSON.stringify(holidays));
}

/** Fichiers importés d'un type, du plus récent au plus ancien, avec leur nombre d'événements */
async function listFiles(/** @type {string} */ type) {
    const files = await prisma.icsFile.findMany({
        where: { type },
        select: { id: true, filename: true, config: true, imported_at: true },
        orderBy: [{ imported_at: 'desc' }, { id: 'desc' }]
    });
    const counts = await prisma.icsEvent.groupBy({
        by: ['file_id'],
        where: { file_id: { in: files.map(f => f.id) } },
        _count: { _all: true }
    });
    const byFile = new Map(counts.map(c => [c.file_id, c._count._all]));
    return files.map(f => ({ ...f, count: byFile.get(f.id) || 0 }));
}

export async function listSchoolFiles() {
    return (await listFiles(SCHOOL)).map(f => ({
        id: f.id,
        filename: f.filename,
        imported_at: f.imported_at,
        periods_count: f.count
    }));
}

/**
 * Import d'un fichier de vacances scolaires : périodes par zone
 * @param {{ filename?: unknown, content?: unknown, zoneA?: unknown, zoneB?: unknown, zoneC?: unknown }} body
 */
export async function importSchoolFile(body) {
    if (!body.filename) throw badRequest('Nom du fichier requis');
    return prisma.$transaction(async tx => {
        const file = await tx.icsFile.create({
            data: {
                type: SCHOOL,
                filename: String(body.filename),
                content: body.content == null ? null : String(body.content)
            }
        });
        await tx.icsEvent.createMany({
            data: ZONES.flatMap(zone => {
                const events = Array.isArray(body[zone]) ? /** @type {any[]} */ (body[zone]) : [];
                return events.map(e => ({
                    file_id: file.id,
                    event_date: e.start,
                    event_end_date: e.end ?? null,
                    summary: e.summary ?? null,
                    zone
                }));
            })
        });
        return file.id;
    });
}

/** Suppression d'un fichier importé et de ses événements */
async function deleteFile(/** @type {unknown} */ id, /** @type {string} */ type) {
    const fileId = idParam(id);
    await prisma.$transaction([
        prisma.icsEvent.deleteMany({ where: { file_id: fileId } }),
        prisma.icsFile.deleteMany({ where: { id: fileId, type } })
    ]);
}

export const deleteSchoolFile = (/** @type {unknown} */ id) => deleteFile(id, SCHOOL);
export const deleteSpecialFile = (/** @type {unknown} */ id) => deleteFile(id, SPECIAL);

/** Toutes les périodes de vacances scolaires des fichiers importés, par zone */
export async function allSchoolPeriods() {
    const files = await prisma.icsFile.findMany({ where: { type: SCHOOL }, select: { id: true } });
    const events = await prisma.icsEvent.findMany({
        where: { file_id: { in: files.map(f => f.id) } },
        orderBy: [{ event_date: 'asc' }, { id: 'asc' }]
    });
    /** @type {Record<string, Array<{ start: string, end: string | null, name: string | null }>>} */
    const periods = { zoneA: [], zoneB: [], zoneC: [] };
    for (const e of events) {
        if (e.zone && periods[e.zone])
            periods[e.zone].push({ start: e.event_date, end: e.event_end_date, name: e.summary });
    }
    return periods;
}

/** Configuration d'affichage JSON d'un fichier (objet vide si absente ou invalide) */
function parseConfig(/** @type {string | null} */ config) {
    try {
        return config ? JSON.parse(config) : {};
    } catch {
        return {};
    }
}

export async function listSpecialFiles() {
    return (await listFiles(SPECIAL)).map(f => ({
        id: f.id,
        filename: f.filename,
        config: parseConfig(f.config),
        imported_at: f.imported_at,
        dates_count: f.count
    }));
}

/**
 * Import d'un fichier de dates particulières (événements sans date ignorés)
 * @param {{ filename?: unknown, content?: unknown, events?: unknown, config?: unknown }} body
 */
export async function importSpecialFile({ filename, content, events, config }) {
    const valid = (Array.isArray(events) ? events : []).filter(e => e && e.start);
    console.log(`📅 Import special-dates: ${filename}, ${Array.isArray(events) ? events.length : 0} événements`);
    if (valid.length === 0) throw badRequest('Aucun événement valide trouvé dans le fichier');
    if (!filename) throw badRequest('Nom du fichier requis');
    const fileId = await prisma.$transaction(async tx => {
        const file = await tx.icsFile.create({
            data: {
                type: SPECIAL,
                filename: String(filename),
                content: content == null ? null : String(content),
                config: config === undefined ? null : JSON.stringify(config)
            }
        });
        await tx.icsEvent.createMany({
            data: valid.map(e => ({
                file_id: file.id,
                event_date: e.start,
                event_end_date: e.end || e.start,
                summary: e.summary || 'Événement'
            }))
        });
        return file.id;
    });
    console.log(`📅 Import réussi: ${valid.length} événements insérés`);
    return { fileId, count: valid.length };
}

export async function updateSpecialConfig(/** @type {unknown} */ id, /** @type {unknown} */ config) {
    await prisma.icsFile.updateMany({
        where: { id: idParam(id), type: SPECIAL },
        data: { config: config === undefined ? null : JSON.stringify(config) }
    });
}

/**
 * Dates particulières affichées sur le planning : dates des fichiers ICS, puis événements personnalisés
 * (libellé, type, lieu et participants dans la configuration)
 */
export async function allSpecialDates() {
    const result = [];
    const files = await prisma.icsFile.findMany({ where: { type: SPECIAL }, orderBy: { id: 'asc' } });
    const icsEvents = await prisma.icsEvent.findMany({
        where: { file_id: { in: files.map(f => f.id) } },
        orderBy: { id: 'asc' }
    });
    for (const file of files) {
        const config = file.config ? JSON.parse(file.config) : {};
        for (const e of icsEvents.filter(x => x.file_id === file.id)) {
            result.push({ date: e.event_date, endDate: e.event_end_date, summary: e.summary, config });
        }
    }

    const events = await prisma.customEvent.findMany({ orderBy: { id: 'asc' } });
    const ids = (/** @type {(e: any) => number | null} */ f) => events.map(f).filter(v => v != null);
    const [types, locations, participations] = await Promise.all([
        prisma.eventType.findMany({ where: { id: { in: ids(e => e.type_id) } } }),
        prisma.location.findMany({
            where: { id: { in: ids(e => e.location_id) } },
            select: { id: true, libelle_court: true }
        }),
        prisma.customEventParticipant.findMany({ where: { event_id: { in: events.map(e => e.id) } } })
    ]);
    const users = await prisma.user.findMany({
        where: { id: { in: participations.map(p => p.user_id) } },
        select: { id: true, nom: true, prenom: true }
    });
    const typeById = new Map(types.map(t => [t.id, t]));
    const locById = new Map(locations.map(l => [l.id, l]));
    const userById = new Map(users.map(u => [u.id, u]));
    const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a === b ? 0 : a < b ? -1 : 1);

    for (const e of events) {
        const config = e.config ? JSON.parse(e.config) : {};
        config.label = e.label;
        config.eventId = e.id;
        // Type : libellé court (à défaut long) et icône ; « Autre(s) » ou sans type : le libellé de l'événement
        const type = e.type_id != null ? typeById.get(e.type_id) : undefined;
        if (type && type.label_long && !type.is_other) {
            config.typeId = e.type_id;
            config.typeLong = type.label_long;
            config.typeShort = type.label_short || '';
            config.typeIcon = type.icon;
            config.shown = type.label_short || type.label_long;
        } else config.shown = e.label;
        // location_id transmis même si le lieu a été supprimé (affiché « NON DÉFINI »)
        if (e.location_id) config.locationId = e.location_id;
        const loc = e.location_id != null ? locById.get(e.location_id) : undefined;
        if (loc?.libelle_court) config.locationLibelleCourt = loc.libelle_court;
        const names = participations
            .filter(p => p.event_id === e.id && userById.has(p.user_id))
            .map(p => /** @type {NonNullable<ReturnType<typeof userById.get>>} */ (userById.get(p.user_id)))
            .sort((a, b) => cmp(a.nom, b.nom) || cmp(a.prenom, b.prenom) || a.id - b.id)
            .map(u => `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim());
        if (names.length) config.participants = names;
        result.push({ date: e.start_date, endDate: e.end_date, summary: e.label, period: e.period || 'FULL', config });
    }
    console.log(`📅 Dates particulières chargées: ${result.length} (ICS + personnalisés)`);
    return result;
}
