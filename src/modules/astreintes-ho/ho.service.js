// @ts-check
// Astreintes HO (heures ouvrées) : planning demi-journée par demi-journée, jours ouvrés, avec droits de modification
import { prisma } from '../../db/prisma.js';
import { sqlTimestamp } from '../../db/values.js';
import { badRequest, forbidden } from '../../lib/http-error.js';
import {
    addDays,
    isValidDate,
    isValidMonth,
    isWeekday,
    monthWeeks,
    parisToday,
    weekDays,
    weekStart
} from './ho.dates.js';

export const PERIODS = ['AM', 'PM'];

/** @typedef {{ resource_id: number, nom: string, prenom: string, trigramme: string, user_id: number | null, email: string | null }} HoExpert */

/** Experts déclarés pour les astreintes HO (ressources actives), avec leur compte expert si elles en ont un */
export async function listHoExperts() {
    const resources = await prisma.resource.findMany({
        where: { actif: 1, astreinte_ho: 1 },
        select: { id: true, nom: true, prenom: true, trigramme: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }]
    });
    const users = await prisma.user.findMany({
        where: { resource_id: { in: resources.map(r => r.id) }, actif: 1 },
        select: { id: true, resource_id: true, email: true },
        orderBy: { id: 'asc' }
    });
    return /** @type {HoExpert[]} */ (
        resources.map(r => {
            const u = users.find(x => x.resource_id === r.id);
            return {
                resource_id: r.id,
                nom: r.nom,
                prenom: r.prenom,
                trigramme: r.trigramme,
                user_id: u ? u.id : null,
                email: u && u.email ? u.email : null
            };
        })
    );
}

/**
 * Droits de l'utilisateur de la session sur le planning HO
 * @param {{ userId: number, activeProfile?: string | null }} session
 */
export async function editorOf(session) {
    const today = parisToday();
    const base = { today, currentWeek: weekStart(today) };
    if (session.activeProfile === 'admin') return { ...base, isAdmin: true, resourceId: null, canEdit: true };
    if (session.activeProfile === 'expert') {
        const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { resource_id: true } });
        const resource = user?.resource_id
            ? await prisma.resource.findUnique({
                  where: { id: user.resource_id },
                  select: { id: true, actif: true, astreinte_ho: true }
              })
            : null;
        if (resource && resource.actif === 1 && resource.astreinte_ho === 1) {
            return { ...base, isAdmin: false, resourceId: resource.id, canEdit: true };
        }
    }
    return { ...base, isAdmin: false, resourceId: null, canEdit: false };
}

/** Inscriptions de la plage de dates [from, to] */
export function slotsBetween(/** @type {string} */ from, /** @type {string} */ to) {
    return prisma.astreinteHoSlot.findMany({
        where: { date: { gte: from, lte: to } },
        select: { date: true, period: true, resource_id: true },
        orderBy: [{ date: 'asc' }, { period: 'asc' }, { id: 'asc' }]
    });
}

/** Planning d'un mois « AAAA-MM » : semaines complètes (lundi à vendredi) qui contiennent des jours du mois */
export async function getMonth(/** @type {unknown} */ month) {
    if (!isValidMonth(month)) throw badRequest('Mois invalide (AAAA-MM)');
    const weeks = monthWeeks(/** @type {string} */ (month));
    const slots = await slotsBetween(weeks[0], addDays(weeks[weeks.length - 1], 4));
    // Noms des experts inscrits, même s'ils ne sont plus déclarés pour les astreintes HO
    const ids = [...new Set(slots.map(x => x.resource_id))];
    const names = ids.length
        ? await prisma.resource.findMany({
              where: { id: { in: ids } },
              select: { id: true, nom: true, prenom: true, trigramme: true }
          })
        : [];
    return {
        month,
        weeks: weeks.map(monday => ({ monday, days: weekDays(monday) })),
        slots,
        names
    };
}

/**
 * Applique des ajouts / retraits d'experts sur des demi-journées. Contrôle les droits, ignore les opérations sans effet
 * (déjà inscrit, déjà absent), journalise chaque modification.
 * @param {{ userId: number, activeProfile?: string | null, name: string }} session
 * @param {unknown} changes [{ date, period, resource_id, action: 'add' | 'remove' }]
 */
export async function applyChanges(session, changes) {
    const editor = await editorOf(session);
    if (!editor.canEdit) {
        throw forbidden(
            'Seuls les experts déclarés pour les astreintes HO et les administrateurs peuvent modifier le planning'
        );
    }
    if (!Array.isArray(changes) || !changes.length) throw badRequest('Aucune modification à enregistrer');
    if (changes.length > 500) throw badRequest('Trop de modifications en une fois');

    const experts = new Map((await listHoExperts()).map(e => [e.resource_id, e]));
    /** @type {Array<{ date: string, period: string, resource_id: number, action: 'add' | 'remove' }>} */
    const wanted = [];
    for (const raw of changes) {
        const c = /** @type {any} */ (raw) || {};
        const resource_id = Number(c.resource_id);
        if (!isValidDate(c.date) || !isWeekday(c.date)) throw badRequest('Date invalide (jours ouvrés uniquement)');
        if (!PERIODS.includes(c.period)) throw badRequest('Demi-journée invalide (AM ou PM)');
        if (c.action !== 'add' && c.action !== 'remove') throw badRequest('Action invalide (add ou remove)');
        if (!experts.has(resource_id)) throw badRequest("Cet expert n'est pas déclaré pour les astreintes HO");
        if (!editor.isAdmin) {
            // Un expert ne modifie que ses propres inscriptions, et pas les semaines passées
            if (resource_id !== editor.resourceId)
                throw forbidden('Vous ne pouvez modifier que vos propres inscriptions');
            if (weekStart(c.date) < editor.currentWeek)
                throw forbidden('Les semaines passées ne sont plus modifiables');
        }
        wanted.push({ date: c.date, period: c.period, resource_id, action: c.action });
    }

    const applied = [];
    let skipped = 0;
    const stamp = sqlTimestamp();
    for (const c of wanted) {
        const where = { date: c.date, period: c.period, resource_id: c.resource_id };
        const exists = await prisma.astreinteHoSlot.findFirst({ where, select: { id: true } });
        if ((c.action === 'add') === !!exists) {
            skipped++;
            continue;
        }
        if (c.action === 'add') await prisma.astreinteHoSlot.create({ data: { ...where, created_by: session.userId } });
        else await prisma.astreinteHoSlot.deleteMany({ where });
        const expert = /** @type {HoExpert} */ (experts.get(c.resource_id));
        const name = `${expert.prenom} ${expert.nom}`;
        await prisma.astreinteHoLog.create({
            data: {
                slot_date: c.date,
                period: c.period,
                resource_id: c.resource_id,
                resource_name: name,
                action: c.action,
                week_start: weekStart(c.date),
                user_id: session.userId,
                user_name: session.name,
                created_at: stamp
            }
        });
        applied.push({ ...c, name });
    }
    return {
        applied,
        skipped,
        touchesCurrentWeek: applied.some(c => weekStart(c.date) === editor.currentWeek),
        currentWeek: editor.currentWeek
    };
}
