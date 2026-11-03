// @ts-check
// Astreintes HO ANS : un utilisateur (case « Astreinte HO ANS » cochée) désigné par jour ouvré.
// Droits : les administrateurs désignent n'importe quel utilisateur, sur toutes les semaines ; un utilisateur ayant la case
// cochée ne s'inscrit ou ne se retire que lui-même, de la semaine en cours aux semaines à venir.
import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden } from '../../lib/http-error.js';
import { isValidDate, isWeekday, parisToday, weekStart } from './ho.dates.js';

/** @typedef {{ user_id: number, nom: string, prenom: string, trigramme: string | null, email: string | null }} AnsUser */

/**
 * Trigramme affiché : celui du compte, à défaut celui de la ressource rattachée, à défaut les initiales (1re lettre du
 * prénom et 2 premières du nom)
 * @param {{ trigramme: string | null, nom: string | null, prenom: string | null, resource_id: number | null }} u
 * @param {Map<number, string>} resources trigrammes des ressources
 */
function trigrammeOf(u, resources) {
    const own = u.trigramme?.trim();
    if (own) return own;
    const fromResource = u.resource_id !== null ? resources.get(u.resource_id) : undefined;
    if (fromResource) return fromResource;
    return `${(u.prenom || '').charAt(0)}${(u.nom || '').substring(0, 2)}`.toUpperCase();
}

/** Trigrammes des ressources rattachées aux comptes */
async function resourceTrigrammes(/** @type {Array<{ resource_id: number | null }>} */ users) {
    const ids = [...new Set(users.map(u => u.resource_id).filter(id => id !== null))];
    const rows = ids.length
        ? await prisma.resource.findMany({
              where: { id: { in: /** @type {number[]} */ (ids) } },
              select: { id: true, trigramme: true }
          })
        : [];
    return new Map(rows.map(r => [r.id, r.trigramme]));
}

/** Comptes actifs ayant la case « Astreinte HO ANS » cochée */
export async function listAnsUsers() {
    const users = await prisma.user.findMany({
        where: { actif: 1, astreinte_ho_ans: 1 },
        select: { id: true, nom: true, prenom: true, trigramme: true, email: true, resource_id: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }]
    });
    const resources = await resourceTrigrammes(users);
    return /** @type {AnsUser[]} */ (
        users.map(u => ({
            user_id: u.id,
            nom: u.nom,
            prenom: u.prenom,
            trigramme: trigrammeOf(u, resources),
            email: u.email || null
        }))
    );
}

/** Désignations de la plage de dates [from, to] */
export function ansSlotsBetween(/** @type {string} */ from, /** @type {string} */ to) {
    return prisma.astreinteHoAnsSlot.findMany({
        where: { date: { gte: from, lte: to } },
        select: { date: true, user_id: true },
        orderBy: { date: 'asc' }
    });
}

/** Noms des utilisateurs désignés, même si la case a été décochée depuis */
export async function ansNames(/** @type {number[]} */ ids) {
    if (!ids.length) return [];
    const users = await prisma.user.findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: { id: true, nom: true, prenom: true, trigramme: true, resource_id: true }
    });
    const resources = await resourceTrigrammes(users);
    return users.map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom, trigramme: trigrammeOf(u, resources) }));
}

/**
 * Droits de l'utilisateur de la session sur le planning ANS
 * @param {{ userId: number, activeProfile?: string | null }} session
 */
export async function ansEditorOf(session) {
    const today = parisToday();
    const base = { today, currentWeek: weekStart(today), userId: session.userId };
    if (session.activeProfile === 'admin') return { ...base, isAdmin: true, canEdit: true };
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { astreinte_ho_ans: true, actif: true }
    });
    return { ...base, isAdmin: false, canEdit: user?.actif === 1 && user.astreinte_ho_ans === 1 };
}

/**
 * Applique des désignations : { date, user_id } désigne l'utilisateur ce jour-là (remplace le précédent), user_id null libère le jour
 * @param {{ userId: number, activeProfile?: string | null, name: string }} session
 * @param {unknown} changes
 */
export async function applyAnsChanges(session, changes) {
    const editor = await ansEditorOf(session);
    if (!editor.canEdit) {
        throw forbidden(
            'Seuls les utilisateurs « Astreinte HO ANS » et les administrateurs peuvent modifier le planning HO ANS'
        );
    }
    if (!Array.isArray(changes) || !changes.length) throw badRequest('Aucune modification à enregistrer');
    if (changes.length > 200) throw badRequest('Trop de modifications en une fois');

    const candidates = new Map((await listAnsUsers()).map(u => [u.user_id, u]));
    /** @type {Array<{ date: string, user_id: number | null }>} */
    const wanted = [];
    const seen = new Set();
    for (const raw of changes) {
        const c = /** @type {any} */ (raw) || {};
        const userId = c.user_id === null || c.user_id === undefined || c.user_id === '' ? null : Number(c.user_id);
        if (!isValidDate(c.date) || !isWeekday(c.date)) throw badRequest('Date invalide (jours ouvrés uniquement)');
        if (seen.has(c.date)) throw badRequest('Un seul utilisateur par jour');
        seen.add(c.date);
        if (userId !== null && !candidates.has(userId))
            throw badRequest("Cet utilisateur n'a pas la case « Astreinte HO ANS » cochée");
        wanted.push({ date: c.date, user_id: userId });
    }
    const current = new Map(
        (await prisma.astreinteHoAnsSlot.findMany({ where: { date: { in: wanted.map(w => w.date) } } })).map(s => [
            s.date,
            s
        ])
    );
    for (const w of wanted) {
        if (editor.isAdmin) continue;
        if (weekStart(w.date) < editor.currentWeek) throw forbidden('Les semaines passées ne sont plus modifiables');
        const before = current.get(w.date)?.user_id ?? null;
        const touchesOther =
            (w.user_id !== null && w.user_id !== editor.userId) || (before !== null && before !== editor.userId);
        if (touchesOther) throw forbidden('Vous ne pouvez modifier que votre propre astreinte');
    }

    /** @type {Array<{ date: string, user_id: number | null, name: string, action: 'set' | 'clear', previous: string | null }>} */
    const applied = [];
    let skipped = 0;
    const nameOf = async (/** @type {number | null} */ id) => {
        if (id === null) return null;
        const c = candidates.get(id);
        if (c) return `${c.prenom} ${c.nom}`;
        const u = (await ansNames([id]))[0];
        return u ? `${u.prenom} ${u.nom}` : `#${id}`;
    };
    for (const w of wanted) {
        const before = current.get(w.date) ?? null;
        if ((before?.user_id ?? null) === w.user_id) {
            skipped++;
            continue;
        }
        const previous = await nameOf(before?.user_id ?? null);
        if (w.user_id === null) await prisma.astreinteHoAnsSlot.deleteMany({ where: { date: w.date } });
        else if (before)
            await prisma.astreinteHoAnsSlot.update({
                where: { id: before.id },
                data: { user_id: w.user_id, created_by: session.userId }
            });
        else
            await prisma.astreinteHoAnsSlot.create({
                data: { date: w.date, user_id: w.user_id, created_by: session.userId }
            });
        applied.push({
            date: w.date,
            user_id: w.user_id,
            name: (await nameOf(w.user_id)) ?? previous ?? '',
            action: w.user_id === null ? 'clear' : 'set',
            previous
        });
    }
    return {
        applied,
        skipped,
        touchesCurrentWeek: applied.some(c => weekStart(c.date) === editor.currentWeek),
        currentWeek: editor.currentWeek
    };
}
