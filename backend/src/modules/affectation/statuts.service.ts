// Statuts de déploiement (libellé, couleur, ordre) et statut de chaque déploiement
import { prisma } from '../../db/prisma.ts';
import { idParam } from '../../db/values.ts';
import { HttpError, badRequest, notFound } from '../../lib/http-error.ts';

/**
 * Couleurs proposées pour les statuts, de la moins avancée à la plus avancée (carte de France : teintes bien
 * distinctes). La dernière est celle de « En service ».
 */
export const PALETTE_STATUTS = [
    '#9e9e9e',
    '#90a4ae',
    '#64b5f6',
    '#1e88e5',
    '#1565c0',
    '#7e57c2',
    '#ab47bc',
    '#ec407a',
    '#ef5350',
    '#fb8c00',
    '#fdd835',
    '#cddc39',
    '#9ccc65',
    '#43a047',
    '#2e7d32'
];
/** Motifs de remplissage possibles (en plus de la couleur), pour distinguer les statuts sans dépendre de la couleur seule */
export const MOTIFS_STATUTS = ['plein', 'diag', 'diag-inv', 'points', 'quadrille', 'lignes'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @param s */
/** @param s @param [nbSamu] */
const json = (
    s: { id: number; label: string; color: string; pattern: string; position: number; is_service: number },
    nbSamu: number = 0
) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    pattern: s.pattern,
    position: s.position,
    is_service: s.is_service,
    nb_samu: nbSamu
});

/** Nombre de SAMU par statut */
async function usages() {
    const groupes = await prisma.deploymentSamu.groupBy({ by: ['status_id'], _count: { _all: true } });
    return new Map(groupes.map(g => [g.status_id, g._count._all]));
}

export async function listStatuses() {
    const [rows, nb] = await Promise.all([
        prisma.deploymentStatus.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
        usages()
    ]);
    return rows.map(r => json(r, nb.get(r.id) ?? 0));
}

/** @param v @param [parDefaut] */
function checkPattern(v: unknown, parDefaut: string = 'plein') {
    if (v === undefined || v === null || v === '') return parDefaut;
    const m = String(v);
    if (!MOTIFS_STATUTS.includes(m)) throw badRequest('Motif inconnu');
    return m;
}

/** @param v */
function checkColor(v: unknown) {
    const c = String(v ?? '')
        .trim()
        .toLowerCase();
    if (!PALETTE_STATUTS.includes(c)) throw badRequest('Couleur hors de la palette proposée');
    return c;
}

/** @param v @param [exceptId] */
async function checkLabel(v: unknown, exceptId: number | null = null) {
    const label = String(v ?? '').trim();
    if (!label) throw badRequest('Libellé obligatoire');
    const existing = await prisma.deploymentStatus.findFirst({ where: { label } });
    if (existing && existing.id !== exceptId) throw badRequest('Ce statut existe déjà');
    return label;
}

export async function createStatus(body: { label?: unknown; color?: unknown; pattern?: unknown }) {
    const label = await checkLabel(body.label);
    const color = checkColor(body.color);
    const pattern = checkPattern(body.pattern);
    const max = await prisma.deploymentStatus.aggregate({ _max: { position: true } });
    const row = await prisma.deploymentStatus.create({
        data: { label, color, pattern, position: (max._max.position ?? -1) + 1, is_service: 0 }
    });
    return json(row);
}

async function getStatus(rawId: unknown) {
    const row = await prisma.deploymentStatus.findUnique({ where: { id: idParam(rawId) } });
    if (!row) throw notFound('Statut introuvable');
    return row;
}

export async function updateStatus(id: unknown, body: { label?: unknown; color?: unknown; pattern?: unknown }) {
    const old = await getStatus(id);
    const color = checkColor(body.color);
    const pattern = checkPattern(body.pattern, old.pattern);
    const label = old.is_service ? old.label : await checkLabel(body.label, old.id);
    const row = await prisma.deploymentStatus.update({ where: { id: old.id }, data: { label, color, pattern } });
    return json(row, (await usages()).get(row.id) ?? 0);
}

export async function deleteStatus(id: unknown) {
    const old = await getStatus(id);
    if (old.is_service) throw new HttpError(409, 'Le statut « En service » ne peut pas être supprimé');
    const used = await prisma.deploymentSamu.findMany({ where: { status_id: old.id }, select: { location_id: true } });
    if (used.length) {
        const lieux = await prisma.location.findMany({
            where: { id: { in: used.map(u => u.location_id) } },
            select: { libelle_court: true }
        });
        throw new HttpError(409, `Statut utilisé par : ${lieux.map(l => l.libelle_court).join(', ')}`);
    }
    await prisma.deploymentStatus.delete({ where: { id: old.id } });
}

export async function reorderStatuses(ids: unknown) {
    const all = await prisma.deploymentStatus.findMany({ select: { id: true } });
    const wanted = Array.isArray(ids) ? ids.map(Number) : [];
    const same =
        wanted.length === all.length && new Set(wanted).size === wanted.length && all.every(a => wanted.includes(a.id));
    if (!same) throw badRequest('La liste doit contenir tous les statuts, une seule fois');
    await prisma.$transaction(
        wanted.map((id, position) => prisma.deploymentStatus.update({ where: { id }, data: { position } }))
    );
    return listStatuses();
}

/** Mises en service saisies dans les événements : première date par localisation */
async function misesEnService() {
    const type = await prisma.eventType.findUnique({ where: { code: 'mes' } });
    const parLieu: Map<number, string> = new Map();
    if (!type) return parLieu;
    const evenements = await prisma.customEvent.findMany({
        where: { type_id: type.id, location_id: { not: null } },
        select: { location_id: true, start_date: true },
        orderBy: { start_date: 'asc' }
    });
    for (const e of evenements)
        if (e.location_id != null && !parLieu.has(e.location_id)) parLieu.set(e.location_id, e.start_date.slice(0, 10));
    return parLieu;
}

/**
 * SAMU suivis (ligne par localisation) : ceux qui ont un statut ou ont été ajoutés, ceux des déploiements de l'aide à
 * l'affectation et ceux qui ont un événement « Mise en service », avec les coordonnées de leur localisation
 */
export async function deploymentMap() {
    const [statuses, saisis, projets, mes, locations] = await Promise.all([
        listStatuses(),
        prisma.deploymentSamu.findMany(),
        prisma.affectationProject.findMany({
            where: { location_id: { not: null } },
            select: { location_id: true, date_mise_en_service: true }
        }),
        misesEnService(),
        prisma.location.findMany({
            select: { id: true, libelle_court: true, latitude: true, longitude: true },
            orderBy: { libelle_court: 'asc' }
        })
    ]);
    const saisiParLieu = new Map(saisis.map(d => [d.location_id, d]));
    const projetParLieu = new Map(projets.map(p => [p.location_id as number, p]));
    const deployments = locations
        .filter(l => saisiParLieu.has(l.id) || projetParLieu.has(l.id) || mes.has(l.id))
        .map(l => {
            const saisi = saisiParLieu.get(l.id);
            return {
                id: l.id,
                samu_name: l.libelle_court,
                location_id: l.id,
                latitude: l.latitude ?? null,
                longitude: l.longitude ?? null,
                status_id: saisi?.status_id ?? null,
                date_mise_en_service: saisi?.date_mise_en_service ?? null,
                date_suggeree: mes.get(l.id) ?? projetParLieu.get(l.id)?.date_mise_en_service ?? null,
                derive: projetParLieu.has(l.id) || mes.has(l.id)
            };
        });
    return { statuses, palette: PALETTE_STATUTS, patterns: MOTIFS_STATUTS, deployments };
}

async function getLocation(rawId: unknown) {
    const id = idParam(rawId);
    const l = await prisma.location.findUnique({ where: { id } });
    if (!l) throw notFound('Localisation introuvable');
    return l;
}

/** Statut d'un SAMU (ligne créée si besoin) ; la date n'est prise en compte que pour un statut « En service » */
export async function setSamuStatus(
    locationId: unknown,
    body: { status_id?: unknown; date_mise_en_service?: unknown }
) {
    const loc = await getLocation(locationId);
    const actuel = await prisma.deploymentSamu.findUnique({ where: { location_id: loc.id } });
    const data: { status_id: number | null; date_mise_en_service?: string | null } = { status_id: null };
    if (body.status_id != null && body.status_id !== '') {
        const status = await prisma.deploymentStatus.findUnique({ where: { id: Number(body.status_id) } });
        if (!status) throw badRequest('Statut inconnu');
        data.status_id = status.id;
        if (status.is_service && body.date_mise_en_service !== undefined) {
            const d = body.date_mise_en_service;
            if (d !== null && d !== '' && !DATE.test(String(d))) throw badRequest('Date invalide (AAAA-MM-JJ)');
            data.date_mise_en_service = d ? String(d) : null;
        }
        // « En service » sans date : celle de l'événement « Mise en service » ou du déploiement, si elle existe
        if (status.is_service && data.date_mise_en_service === undefined && !actuel?.date_mise_en_service) {
            const m = (await deploymentMap()).deployments.find(x => x.location_id === loc.id);
            if (m?.date_suggeree) data.date_mise_en_service = m.date_suggeree;
        }
    }
    await prisma.deploymentSamu.upsert({
        where: { location_id: loc.id },
        create: { location_id: loc.id, ...data },
        update: data
    });
}

/** Retire un SAMU ajouté à la liste (ceux des déploiements et des événements y reviennent, sans statut) */
export async function removeSamu(locationId: unknown) {
    const loc = await getLocation(locationId);
    await prisma.deploymentSamu.deleteMany({ where: { location_id: loc.id } });
}

/** « En service » pour chaque SAMU sans statut ayant un événement « Mise en service » déjà passé ; renvoie leur nombre */
export async function importMisesEnService() {
    const service = await prisma.deploymentStatus.findFirst({ where: { is_service: 1 } });
    if (!service) throw notFound('Statut « En service » introuvable');
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const saisis = new Map((await prisma.deploymentSamu.findMany()).map(d => [d.location_id, d]));
    let importes = 0;
    for (const [lieu, date] of await misesEnService()) {
        if (date > aujourdhui || saisis.get(lieu)?.status_id != null) continue;
        await prisma.deploymentSamu.upsert({
            where: { location_id: lieu },
            create: { location_id: lieu, status_id: service.id, date_mise_en_service: date },
            update: { status_id: service.id, date_mise_en_service: date }
        });
        importes++;
    }
    return importes;
}
