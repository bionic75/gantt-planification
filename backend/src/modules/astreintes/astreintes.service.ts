// Astreintes et HNO : saisie (avec verrou des CRA soumis), disponibilités, indisponibilités et planning d'astreinte
import { prisma } from '../../db/prisma.ts';
import { idParam, sqlTimestamp, toInt } from '../../db/values.ts';
import { badRequest, forbidden, notFound } from '../../lib/http-error.ts';
import { checkCraLock, LINE_TYPES } from '../cra/cra.service.ts';
import { generatePlanning } from './astreintes.planning.ts';

const pad = (n: unknown) => String(n).padStart(2, '0');

/** Mois et année d'une date « AAAA-MM-JJ » */
function monthOf(date: string | null) {
    const [annee, mois] = (date || '').split('-');
    return { mois: parseInt(mois), annee: parseInt(annee) };
}

/** Refus si un CRA soumis (ou au-delà) verrouille le mois */
async function assertNotLocked(userId: unknown, date: string | null, message: string) {
    const { mois, annee } = monthOf(date);
    const lock = await checkCraLock(userId, mois, annee);
    if (lock.locked) throw forbidden(message.replace('{statut}', String(lock.statut)));
}

function assertLineType(type: unknown) {
    if (!LINE_TYPES.includes(type as string)) throw badRequest(`Type invalide (${LINE_TYPES.join(', ')})`);
}

/** Tri par nom puis prénom (null en premier, ordre binaire comme SQLite) */
const cmp = (a: any, b: any) => (a === b ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : 1);

// ---------- Astreintes / HNO ----------

/** Astreintes / HNO d'un utilisateur, les plus récentes d'abord */
export function listForUser(userId: number) {
    return prisma.astreinteHno.findMany({
        where: { user_id: userId },
        orderBy: [{ date_debut: 'desc' }, { id: 'asc' }]
    });
}

/** Lignes d'un compte avec son nom ; withResourceOnly : comptes rattachés à une ressource (planning) */
async function withUsers(rows: Awaited<ReturnType<typeof listForUser>>, withResourceOnly: boolean) {
    const users = await prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map(r => r.user_id))] } },
        select: { id: true, nom: true, prenom: true, resource_id: true }
    });
    const byId = new Map(users.map(u => [u.id, u]));
    return rows
        .map(a => ({ a, u: byId.get(a.user_id) }))
        .filter(({ u }) => !withResourceOnly || (u && u.resource_id != null));
}

/** Toutes les astreintes / HNO des comptes rattachés à une ressource (affichage sur le planning) */
export async function listForPlanning() {
    const rows = await prisma.astreinteHno.findMany({ orderBy: [{ date_debut: 'asc' }, { id: 'asc' }] });
    return (await withUsers(rows, true)).map(({ a, u }) => ({
        ...a,
        user_nom: u?.nom ?? null,
        user_prenom: u?.prenom ?? null,
        resource_id: u?.resource_id ?? null
    }));
}

/** Toutes les astreintes / HNO (administration), par expert puis de la plus récente à la plus ancienne */
export async function listAll() {
    const rows = await prisma.astreinteHno.findMany({ orderBy: [{ date_debut: 'desc' }, { id: 'asc' }] });
    return (await withUsers(rows, false))
        .map(({ a, u }) => ({ ...a, user_nom: u?.nom ?? null, user_prenom: u?.prenom ?? null }))
        .sort(
            (x, y) =>
                cmp(x.user_nom, y.user_nom) ||
                cmp(x.user_prenom, y.user_prenom) ||
                cmp(y.date_debut, x.date_debut) ||
                x.id - y.id
        );
}

export function listExperts() {
    return prisma.user.findMany({
        where: { is_expert: 1, actif: 1 },
        select: { id: true, nom: true, prenom: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
}

/** Champs saisis : heures obligatoires, SAMU obligatoire sauf « tous les SAMU » */
function lineData(b: any) {
    if (!b.heure_debut || !b.heure_fin) throw badRequest('Heures de début et fin requises');
    return {
        type: String(b.type),
        date_debut: String(b.date_debut),
        date_fin: String(b.date_fin),
        heure_debut: String(b.heure_debut),
        heure_fin: String(b.heure_fin),
        samu: b.tous_samu || b.samu == null ? null : String(b.samu),
        tous_samu: b.tous_samu ? 1 : 0,
        objet: String(b.objet)
    };
}

/**
 * Création d'une astreinte / HNO
 */
export async function createLine(body: any, targetUserId: number) {
    const { type, date_debut, date_fin, objet, samu, tous_samu } = body;
    if (!type || !date_debut || !date_fin || !objet) throw badRequest('Type, dates et objet sont requis');
    await assertNotLocked(
        targetUserId,
        String(date_debut),
        "Modification impossible : un CRA {statut} existe pour ce mois. Supprimez-le d'abord pour libérer la saisie."
    );
    const data = lineData(body);
    if (!tous_samu && !samu) throw badRequest('SAMU requis ou cocher "Tous les SAMU"');
    assertLineType(type);
    const line = await prisma.astreinteHno.create({ data: { user_id: targetUserId, ...data } });
    return line.id;
}

async function getLine(id: unknown, notFoundMessage: string) {
    const row = await prisma.astreinteHno.findUnique({ where: { id: idParam(id) } });
    if (!row) throw notFound(notFoundMessage);
    return row;
}

/** Modification (propriétaire ou administrateur), refusée si le mois d'origine est verrouillé */
export async function updateLine(id: unknown, body: any, viewer: { userId: number; isAdmin: boolean }) {
    const row = await getLine(id, 'Astreinte non trouvée');
    if (row.user_id !== viewer.userId && !viewer.isAdmin) throw forbidden('Non autorisé');
    await assertNotLocked(
        row.user_id,
        row.date_debut,
        'Modification impossible : un CRA {statut} existe pour ce mois.'
    );
    const data = lineData(body);
    if (!body.type || !body.date_debut || !body.date_fin || !body.objet)
        throw badRequest('Type, dates et objet sont requis');
    assertLineType(body.type);
    await prisma.astreinteHno.update({ where: { id: row.id }, data: { ...data, updated_at: sqlTimestamp() } });
}

/**
 * Suppression (propriétaire ou administrateur), refusée si le mois est verrouillé
 */
export async function deleteLine(
    id: unknown,
    viewer: { userId: number; isAdmin: boolean },
    messages: { notFound: string; forbidden: string }
) {
    const row = await getLine(id, messages.notFound);
    if (row.user_id !== viewer.userId && !viewer.isAdmin) throw forbidden(messages.forbidden);
    await assertNotLocked(row.user_id, row.date_debut, 'Suppression impossible : un CRA {statut} existe pour ce mois.');
    await prisma.astreinteHno.delete({ where: { id: row.id } });
}

/** Bornes d'un mois (comparaisons de chaînes « AAAA-MM-JJ ») */
const monthRange = (annee: unknown, mois: unknown) => ({
    gte: `${annee}-${pad(mois)}-01`,
    lte: `${annee}-${pad(mois)}-31`
});

/** Lignes commençant dans le mois (saisie directe, sans CRA) */
export function listMonth(userId: unknown, mois: unknown, annee: unknown) {
    return prisma.astreinteHno.findMany({
        where: { user_id: idParam(userId), date_debut: monthRange(annee, mois) },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
}

/** Remplacement des lignes commençant dans le mois (saisie directe, sans CRA), si le mois n'est pas verrouillé */
export async function replaceMonth(userId: unknown, mois: unknown, annee: unknown, lignes: unknown) {
    const lock = await checkCraLock(userId, mois, annee);
    if (lock.locked) {
        throw forbidden(
            `Modification impossible : un CRA ${lock.statut} existe pour ce mois. Supprimez-le d'abord pour libérer la saisie.`
        );
    }
    const list = Array.isArray(lignes) ? lignes : [];
    list.forEach(l => assertLineType(l?.type));
    const user_id = idParam(userId);
    await prisma.$transaction([
        prisma.astreinteHno.deleteMany({ where: { user_id, date_debut: monthRange(annee, mois) } }),
        prisma.astreinteHno.createMany({
            data: list.map(l => ({
                user_id,
                type: l.type,
                date_debut: (l.date_debut ?? null) as string,
                date_fin: (l.date_fin ?? null) as string,
                heure_debut: l.heure_debut || null,
                heure_fin: l.heure_fin || null,
                // « Tous les SAMU » : la ligne vaut pour tous les SAMU, aucun SAMU particulier n'est enregistré
                samu: l.tous_samu ? null : l.samu || null,
                tous_samu: l.tous_samu ? 1 : 0,
                objet: (l.objet ?? null) as string
            }))
        })
    ]);
    return list.length;
}

// ---------- Volontaires, disponibilités, indisponibilités ----------

export function listVolontaires() {
    return prisma.resource.findMany({
        where: { actif: 1 },
        select: {
            id: true,
            nom: true,
            prenom: true,
            trigramme: true,
            astreinte_volontaire: true,
            astreinte_date_activation: true
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
}

export async function setVolontaire(id: unknown, volontaire: boolean) {
    await prisma.resource.updateMany({
        where: { id: idParam(id) },
        data: {
            astreinte_volontaire: volontaire ? 1 : 0,
            astreinte_date_activation: volontaire ? new Date().toISOString() : null
        }
    });
}

/** Mois « AAAA-MM » de l'URL : bornes des dates */
function monthParam(mois: string) {
    const [year, month] = mois.split('-');
    return { gte: `${year}-${month}-01`, lte: `${year}-${month}-31` };
}

export function listDisponibilites(expertId: unknown, mois: string) {
    return prisma.astreinteDisponibilite.findMany({
        where: { resource_id: idParam(expertId), date: monthParam(mois) },
        orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });
}

/** Jours disponibles (verts) d'un expert pour un mois : soir en semaine, journée le week-end */
export async function saveDisponibilites(expertId: unknown, mois: string, disponibilites: unknown) {
    if (!Array.isArray(disponibilites)) throw badRequest('Liste des disponibilités attendue');
    const resource_id = idParam(expertId);
    const dates = [...new Set(disponibilites.map(String))];
    await prisma.$transaction([
        prisma.astreinteDisponibilite.deleteMany({ where: { resource_id, date: monthParam(mois) } }),
        prisma.astreinteDisponibilite.createMany({
            data: dates.map(date => {
                const dayOfWeek = new Date(date).getDay();
                return { resource_id, date, type_creneau: dayOfWeek === 0 || dayOfWeek === 6 ? 'journee' : 'soir' };
            })
        })
    ]);
    return disponibilites.length;
}

export function listIndisponibilites() {
    return prisma.astreinteIndisponibilite.findMany({ orderBy: [{ date: 'asc' }, { id: 'asc' }] });
}

/** Indisponibilité (remplace celle du même expert, jour et créneau) */
export async function saveIndisponibilite(body: any) {
    const { resource_id, date, type_creneau, motif } = body;
    const resourceId = toInt(resource_id);
    if (resourceId == null || !date || !type_creneau) throw badRequest('Expert, date et créneau requis');
    const key = { resource_id: resourceId, date: String(date), type_creneau: String(type_creneau) };
    const row = await prisma.astreinteIndisponibilite.upsert({
        where: { resource_id_date_type_creneau: key },
        create: { ...key, motif: motif || null },
        update: { motif: motif || null }
    });
    return row.id;
}

export async function deleteIndisponibilite(id: unknown) {
    await prisma.astreinteIndisponibilite.deleteMany({ where: { id: idParam(id) } });
}

// ---------- Planning d'astreinte ----------

/** Génération et enregistrement du planning d'un mois (remplace le planning existant) */
export async function generate(year: any, month: any) {
    const volontaires = await prisma.resource.findMany({
        where: { actif: 1, astreinte_volontaire: 1 },
        orderBy: { id: 'asc' }
    });
    if (volontaires.length === 0) throw badRequest('Aucun volontaire disponible');
    const range = { gte: `${year}-${pad(month)}-01`, lte: `${year}-${pad(month)}-31` };
    const [disponibilites, affectations] = await Promise.all([
        prisma.astreinteDisponibilite.findMany({ where: { date: range }, orderBy: { id: 'asc' } }),
        prisma.scheduleData.findMany({
            where: { date_key: { startsWith: `${year}-${pad(month)}` }, type: 'activity', value: { in: ['3', '4'] } }
        })
    ]);
    const { planning, warnings, compteur } = generatePlanning({
        year,
        month,
        volontaires,
        disponibilites,
        affectations
    });

    const y = idParam(year);
    const m = idParam(month);
    const saved = await prisma.$transaction(async tx => {
        await tx.astreintePlanning.deleteMany({ where: { year: y, month: m } });
        const rows = [];
        for (const slot of planning) {
            const row = await tx.astreintePlanning.create({
                data: {
                    date: slot.date,
                    type_creneau: slot.type_creneau,
                    resource_id: slot.resource_id,
                    year: y,
                    month: m
                }
            });
            rows.push({ ...slot, id: row.id });
        }
        return rows;
    });

    const stats: Record<string, number> = {};
    for (const v of volontaires) {
        if (compteur[v.id] > 0) stats[`${v.nom.toUpperCase()} ${v.prenom}`] = compteur[v.id];
    }
    return { planning: saved, warnings, stats, disponibilites };
}

/** Réaffectation d'un créneau */
export async function setSlotResource(id: unknown, resourceId: unknown) {
    await prisma.astreintePlanning.updateMany({ where: { id: idParam(id) }, data: { resource_id: toInt(resourceId) } });
}

export function getMonthPlanning(mois: string) {
    const [year, month] = mois.split('-').map(Number);
    return prisma.astreintePlanning.findMany({
        where: { year: idParam(year), month: idParam(month) },
        orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });
}
