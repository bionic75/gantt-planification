// @ts-check
// Reporting et exports : disponibilités / affectations, astreintes / HNO, carte des événements, exports CSV
import { prisma } from '../../db/prisma.js';
import { idParam } from '../../db/values.js';
import { badRequest } from '../../lib/http-error.js';

const ACTIVITY_LABELS = /** @type {Record<string, string>} */ ({
    1: 'Indisponible',
    2: 'En attente',
    3: 'SAMU Dép.',
    4: 'SAMU Dev.',
    5: 'ANS Dép.',
    6: 'ANS Dev.',
    7: 'Qualification',
    8: 'Divers'
});

export const getActivityLabel = (/** @type {string} */ value) => ACTIVITY_LABELS[value] || '-';

/** Codes d'activité comptés comme une affectation */
const ASSIGNED = ['3', '4', '5', '6', '7', '8'];
const pad = (/** @type {unknown} */ n) => String(n).padStart(2, '0');

/** Jours ouvrés (lundi à vendredi) d'un mois (0 = janvier) */
function workingDaysOf(/** @type {number} */ year, /** @type {number} */ month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let n = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = new Date(year, month, day).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) n++;
    }
    return n;
}

/** Cellules de planification d'une ressource dont la clé commence par l'un des préfixes */
function scheduleRows(/** @type {number} */ resourceId, /** @type {string[]} */ prefixes) {
    return prisma.scheduleData.findMany({
        where: { resource_id: resourceId, OR: prefixes.map(p => ({ date_key: { startsWith: p } })) },
        select: { date_key: true, type: true, value: true },
        orderBy: { id: 'asc' }
    });
}

/** Date d'une clé normalisée sur deux chiffres (« 2025-9-5 » → « 2025-09-05 ») */
function normalizeDate(/** @type {string} */ datePart) {
    const parts = datePart.split('-');
    return parts.length >= 3 ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}` : null;
}

/**
 * Disponibilités et affectations par expert et par mois (demi-journées comptées 0,5 jour)
 * @param {{ startMonth: any, startYear: any, endMonth: any, endYear: any, expertIds: unknown, includeLeave?: unknown }} body
 */
export async function availabilityReport({ startMonth, startYear, endMonth, endYear, expertIds }) {
    if (!expertIds || !Array.isArray(expertIds) || expertIds.length === 0) throw badRequest('Aucun expert sélectionné');

    // Mois de la période (5 ans au plus)
    const months = [];
    const currentDate = new Date(startYear, startMonth, 1);
    const endDate = new Date(endYear, endMonth + 1, 0);
    while (currentDate <= endDate && months.length < 60) {
        months.push({ year: currentDate.getFullYear(), month: currentDate.getMonth() });
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    if (months.length === 0) throw badRequest('Période invalide');

    const experts = await prisma.resource.findMany({
        where: { id: { in: expertIds.map(idParam) } },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
    const totalWorkingDays = months.reduce((n, m) => n + workingDaysOf(m.year, m.month), 0);
    const avgWorkingDaysPerMonth = totalWorkingDays / months.length;
    const round = (/** @type {number} */ n) => Math.round(n * 10) / 10;

    const result = [];
    for (const expert of experts) {
        /** @type {Record<string, object>} */
        const monthlyStats = {};
        for (const month of months) {
            const monthKey = `${month.year}-${pad(month.month + 1)}`;
            // Clés au format « AAAA-MM-JJ » et anciennes clés sans zéro (« AAAA-M-J »)
            const rows = await scheduleRows(expert.id, [`${monthKey}-`, `${month.year}-${month.month + 1}-`]);

            // Cellules par demi-journée ; une ancienne clé sans _AM / _PM vaut pour la journée complète
            /** @type {Record<string, Record<string, string>>} */
            const byHalfDay = {};
            for (const row of rows) {
                const halfDay = row.date_key.includes('_AM') || row.date_key.includes('_PM');
                const [datePart, period] = halfDay ? row.date_key.split('_') : [row.date_key, null];
                const date = normalizeDate(datePart);
                if (!date) continue;
                for (const p of period ? [period] : ['AM', 'PM'])
                    (byHalfDay[`${date}_${p}`] ??= {})[row.type] = row.value;
            }

            // Disponible : disponibilité 2 ; congés : disponibilité 3 ; affecté : activité 3 à 8
            let available = 0;
            let assigned = 0;
            let leave = 0;
            const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                for (const p of ['AM', 'PM']) {
                    const cell = byHalfDay[`${monthKey}-${pad(day)}_${p}`] || {};
                    if (cell.available === '2') available += 0.5;
                    if (cell.available === '3') leave += 0.5;
                    if (cell.activity && ASSIGNED.includes(cell.activity)) assigned += 0.5;
                }
            }
            // Taux : affecté / disponible (les congés ne sont jamais comptés comme disponibles)
            const rate = available > 0 ? (assigned / available) * 100 : 0;
            monthlyStats[monthKey] = {
                workingDays: workingDaysOf(month.year, month.month),
                available: round(available),
                assigned: round(assigned),
                leave: round(leave),
                rate: round(rate)
            };
        }
        result.push({
            id: expert.id,
            name: `${expert.prenom} ${expert.nom}`,
            tauxMad: expert.taux || 100,
            avgWorkingDaysPerMonth: round(avgWorkingDaysPerMonth),
            monthlyStats
        });
    }
    return { months, experts: result };
}

/** Données brutes de planification d'un expert sur un mois (diagnostic) */
export async function diagnose(
    /** @type {string} */ expertId,
    /** @type {string} */ year,
    /** @type {string} */ month
) {
    const monthKey = `${year}-${pad(parseInt(month))}`;
    const patterns = [`${monthKey}-%`, `${year}-${parseInt(month)}-%`];
    const rawData = await prisma.scheduleData.findMany({
        where: {
            resource_id: idParam(expertId),
            OR: patterns.map(p => ({ date_key: { startsWith: p.slice(0, -1) } }))
        },
        select: { date_key: true, type: true, value: true },
        orderBy: [{ date_key: 'asc' }, { type: 'asc' }]
    });
    const count = (/** @type {(r: { type: string, value: string }) => boolean} */ f) => rawData.filter(f).length;
    const availableSlots = count(r => r.type === 'available' && r.value === '2');
    const leaveSlots = count(r => r.type === 'available' && r.value === '3');
    const assignedSlots = count(r => r.type === 'activity' && ASSIGNED.includes(r.value));
    return {
        expertId,
        monthKey,
        patterns,
        totalRows: rawData.length,
        summary: {
            availableSlots,
            assignedSlots,
            leaveSlots,
            availableDays: availableSlots / 2,
            assignedDays: assignedSlots / 2,
            leaveDays: leaveSlots / 2
        },
        rawData: rawData.slice(0, 100)
    };
}

/** Export CSV des ressources */
export async function resourcesCsv() {
    const resources = await prisma.resource.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }] });
    let csv = '﻿'; // BOM UTF-8
    csv += 'ID,Nom,Prénom,Trigramme,Email,Téléphone,Taux MAD (%),SAMU,Début MAD,Fin MAD,Actif,Date création\n';
    for (const r of resources) {
        csv += `${r.id},"${r.nom}","${r.prenom}","${r.trigramme}","${r.email || ''}","${r.telephone || ''}",${r.taux},"${r.samu}","${r.date_debut || ''}","${r.date_fin || ''}",${r.actif ? 'Oui' : 'Non'},"${r.created_at}"\n`;
    }
    return { csv, count: resources.length };
}

const MONTH_NAMES = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];

/**
 * Export CSV du planning d'un mois (0 = janvier) : disponibilité / activité / lieu par demi-journée
 * @param {unknown} year
 * @param {unknown} month
 */
export async function ganttCsv(year, month) {
    if (!year || month === undefined) throw badRequest('Année et mois requis');
    const monthInt = parseInt(String(month));
    const monthStr = pad(monthInt + 1);
    const resources = await prisma.resource.findMany({
        where: { actif: 1 },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
    const cells = await prisma.scheduleData.findMany({
        where: { date_key: { startsWith: `${year}-${monthStr}-` } },
        orderBy: { id: 'asc' }
    });
    /** @type {Map<string, string>} */
    const value = new Map();
    for (const c of cells) {
        const k = `${c.resource_id}|${c.date_key}|${c.type}`;
        if (!value.has(k)) value.set(k, c.value);
    }

    let csv = '﻿'; // BOM UTF-8
    csv += `Planning - ${MONTH_NAMES[monthInt]} ${year}\n\n`;
    csv += 'Ressource,Trigramme,SAMU';
    const lastDay = new Date(parseInt(String(year)), monthInt + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
        const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][
            new Date(parseInt(String(year)), monthInt, day).getDay()
        ];
        csv += `,${dayName} ${day} AM,${dayName} ${day} PM`;
    }
    csv += '\n';

    for (const resource of resources) {
        csv += `"${resource.nom} ${resource.prenom}","${resource.trigramme}","${resource.samu}"`;
        for (let day = 1; day <= lastDay; day++) {
            const halves = ['AM', 'PM'].map(p => {
                const key = `${year}-${monthStr}-${pad(day)}_${p}`;
                const get = (/** @type {string} */ type) => value.get(`${resource.id}|${key}|${type}`);
                const avail = get('available');
                const act = get('activity');
                const loc = get('localisation');
                const availLabel = avail !== undefined ? (avail === '1' ? 'Indispo' : 'Dispo') : '-';
                const actLabel = act !== undefined ? getActivityLabel(act) : '-';
                return `"${availLabel} / ${actLabel} / ${loc !== undefined ? loc : '-'}"`;
            });
            csv += `,${halves.join(',')}`;
        }
        csv += '\n';
    }
    return { csv, monthName: MONTH_NAMES[monthInt], count: resources.length };
}

/**
 * Jours d'astreinte et de HNO par expert et par mois (clé « AAAA-M », mois à partir de 0)
 * @param {{ startMonth: any, startYear: any, endMonth: any, endYear: any, expertIds: unknown }} body
 */
export async function hnoAstreintesReport({ startMonth, startYear, endMonth, endYear, expertIds }) {
    if (!Array.isArray(expertIds)) throw badRequest('Aucun expert sélectionné');
    const resources = await prisma.resource.findMany({
        where: { id: { in: expertIds.map(idParam) } },
        select: { id: true, nom: true, prenom: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
    const users = await prisma.user.findMany({
        where: { resource_id: { in: resources.map(r => r.id) } },
        select: { id: true, resource_id: true },
        orderBy: { id: 'asc' }
    });
    // Une ligne par compte rattaché (ou une ligne sans compte)
    const experts = resources.flatMap(r => {
        const linked = users.filter(u => u.resource_id === r.id);
        return (linked.length ? linked : [null]).map(u => ({
            resource_id: r.id,
            nom: r.nom,
            prenom: r.prenom,
            user_id: u ? u.id : null
        }));
    });
    const userIds = experts.map(e => e.user_id).filter(id => id != null);
    if (userIds.length === 0) {
        return {
            experts: experts.map(e => ({ resource_id: e.resource_id, nom: e.nom, prenom: e.prenom, monthlyData: {} }))
        };
    }

    const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;
    const endDate = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-31`;
    const lines = await prisma.astreinteHno.findMany({
        where: {
            user_id: { in: /** @type {number[]} */ (userIds) },
            date_debut: { lte: endDate },
            date_fin: { gte: startDate }
        }
    });
    const resourceOfUser = new Map(users.map(u => [u.id, u.resource_id]));
    const astreintes = lines.map(a => ({ ...a, resource_id: resourceOfUser.get(a.user_id) }));

    return {
        experts: experts.map(expert => {
            /** @type {Record<string, { hno: number, astreintes: number }>} */
            const monthlyData = {};
            const currentDate = new Date(startYear, startMonth, 1);
            const endPeriod = new Date(endYear, endMonth + 1, 0);
            while (currentDate <= endPeriod) {
                const month = currentDate.getMonth();
                const year = currentDate.getFullYear();
                const key = `${year}-${month}`;
                monthlyData[key] = { hno: 0, astreintes: 0 };
                const monthStart = new Date(year, month, 1);
                const monthEnd = new Date(year, month + 1, 0);
                for (const a of astreintes) {
                    if (a.resource_id !== expert.resource_id) continue;
                    const aStart = new Date(a.date_debut);
                    const aEnd = new Date(a.date_fin);
                    // Jours de la ligne compris dans le mois
                    if (aStart <= monthEnd && aEnd >= monthStart) {
                        const overlapStart = aStart > monthStart ? aStart : monthStart;
                        const overlapEnd = aEnd < monthEnd ? aEnd : monthEnd;
                        const days =
                            Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                        if (a.type === 'hno') monthlyData[key].hno += days;
                        else if (a.type === 'astreinte') monthlyData[key].astreintes += days;
                    }
                }
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
            return { resource_id: expert.resource_id, nom: expert.nom, prenom: expert.prenom, monthlyData };
        })
    };
}

/**
 * Événements localisés (lieu avec coordonnées) sur une période, pour la carte
 * @param {{ startDate?: unknown, endDate?: unknown }} query
 */
export async function eventsMap({ startDate, endDate }) {
    const locations = await prisma.location.findMany({ where: { latitude: { not: null }, longitude: { not: null } } });
    const events = await prisma.customEvent.findMany({
        where: {
            location_id: { in: locations.map(l => l.id) },
            AND: [
                startDate ? { end_date: { gte: String(startDate) } } : {},
                endDate ? { start_date: { lte: String(endDate) } } : {}
            ]
        },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
    });
    const [types, participations] = await Promise.all([
        prisma.eventType.findMany({ where: { id: { in: events.map(e => e.type_id).filter(id => id != null) } } }),
        prisma.customEventParticipant.findMany({
            where: { event_id: { in: events.map(e => e.id) } },
            orderBy: { id: 'asc' }
        })
    ]);
    const users = await prisma.user.findMany({
        where: {
            id: {
                in: [...events.map(e => e.created_by), ...participations.map(p => p.user_id)].filter(id => id != null)
            }
        },
        select: { id: true, nom: true, prenom: true }
    });
    const userById = new Map(users.map(u => [u.id, u]));
    const locById = new Map(locations.map(l => [l.id, l]));
    const typeById = new Map(types.map(t => [t.id, t]));
    return events.map(e => {
        const l = /** @type {NonNullable<ReturnType<typeof locById.get>>} */ (
            locById.get(/** @type {number} */ (e.location_id))
        );
        const creator = e.created_by != null ? userById.get(e.created_by) : undefined;
        const type = e.type_id != null ? typeById.get(e.type_id) : undefined;
        return {
            id: e.id,
            label: e.label,
            start_date: e.start_date,
            end_date: e.end_date,
            period: e.period,
            created_by: e.created_by,
            config: e.config,
            location_id: l.id,
            libelle_long: l.libelle_long,
            libelle_court: l.libelle_court,
            adresse: l.adresse,
            latitude: l.latitude,
            longitude: l.longitude,
            creator_nom: creator?.nom ?? null,
            creator_prenom: creator?.prenom ?? null,
            type_long: type ? type.label_long : null,
            type_short: type ? type.label_short : null,
            type_icon: type ? type.icon : null,
            type_other: type ? type.is_other : null,
            participants: participations
                .filter(p => p.event_id === e.id && userById.has(p.user_id))
                .map(p => {
                    const u = /** @type {NonNullable<ReturnType<typeof userById.get>>} */ (userById.get(p.user_id));
                    return `${u.prenom} ${(u.nom || '').toUpperCase()}`.trim();
                })
        };
    });
}
