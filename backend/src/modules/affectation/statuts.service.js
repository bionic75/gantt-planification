// @ts-check
// Statuts de déploiement (libellé, couleur, ordre) et statut de chaque déploiement
import { prisma } from '../../db/prisma.js';
import { idParam } from '../../db/values.js';
import { HttpError, badRequest, notFound } from '../../lib/http-error.js';

const COULEUR = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {{ id: number; label: string; color: string; position: number; is_service: number }} s */
const json = s => ({ id: s.id, label: s.label, color: s.color, position: s.position, is_service: s.is_service });

export async function listStatuses() {
    const rows = await prisma.deploymentStatus.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    return rows.map(json);
}

/** @param {unknown} v */
function checkColor(v) {
    const c = String(v ?? '').trim();
    if (!COULEUR.test(c)) throw badRequest('Couleur invalide (format #rrggbb)');
    return c.toLowerCase();
}

/** @param {unknown} v @param {number | null} [exceptId] */
async function checkLabel(v, exceptId = null) {
    const label = String(v ?? '').trim();
    if (!label) throw badRequest('Libellé obligatoire');
    const existing = await prisma.deploymentStatus.findFirst({ where: { label } });
    if (existing && existing.id !== exceptId) throw badRequest('Ce statut existe déjà');
    return label;
}

export async function createStatus(/** @type {{ label?: unknown; color?: unknown }} */ body) {
    const label = await checkLabel(body.label);
    const color = checkColor(body.color);
    const max = await prisma.deploymentStatus.aggregate({ _max: { position: true } });
    const row = await prisma.deploymentStatus.create({
        data: { label, color, position: (max._max.position ?? -1) + 1, is_service: 0 }
    });
    return json(row);
}

async function getStatus(/** @type {unknown} */ rawId) {
    const row = await prisma.deploymentStatus.findUnique({ where: { id: idParam(rawId) } });
    if (!row) throw notFound('Statut introuvable');
    return row;
}

export async function updateStatus(
    /** @type {unknown} */ id,
    /** @type {{ label?: unknown; color?: unknown }} */ body
) {
    const old = await getStatus(id);
    const color = checkColor(body.color);
    const label = old.is_service ? old.label : await checkLabel(body.label, old.id);
    return json(await prisma.deploymentStatus.update({ where: { id: old.id }, data: { label, color } }));
}

export async function deleteStatus(/** @type {unknown} */ id) {
    const old = await getStatus(id);
    if (old.is_service) throw new HttpError(409, 'Le statut « En service » ne peut pas être supprimé');
    const used = await prisma.affectationProject.findMany({
        where: { status_id: old.id },
        select: { samu_name: true }
    });
    if (used.length) throw new HttpError(409, `Statut utilisé par : ${used.map(u => u.samu_name).join(', ')}`);
    await prisma.deploymentStatus.delete({ where: { id: old.id } });
}

export async function reorderStatuses(/** @type {unknown} */ ids) {
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

/** Statut d'un déploiement ; la date de mise en service n'est prise en compte que pour un statut « En service » */
export async function setProjectStatus(
    /** @type {unknown} */ projectId,
    /** @type {{ status_id?: unknown; date_mise_en_service?: unknown }} */ body
) {
    const id = idParam(projectId);
    const project = await prisma.affectationProject.findUnique({ where: { id } });
    if (!project) throw notFound('Projet introuvable');
    /** @type {{ status_id: number | null; date_mise_en_service?: string | null }} */
    const data = { status_id: null };
    if (body.status_id != null && body.status_id !== '') {
        const status = await prisma.deploymentStatus.findUnique({ where: { id: Number(body.status_id) } });
        if (!status) throw badRequest('Statut inconnu');
        data.status_id = status.id;
        if (status.is_service && body.date_mise_en_service !== undefined) {
            const d = body.date_mise_en_service;
            if (d !== null && d !== '' && !DATE.test(String(d))) throw badRequest('Date invalide (AAAA-MM-JJ)');
            data.date_mise_en_service = d ? String(d) : null;
        }
    }
    await prisma.affectationProject.update({ where: { id }, data });
}

/** Statuts et déploiements avec les coordonnées de leur localisation (carte) */
export async function deploymentMap() {
    const [statuses, projects, locations] = await Promise.all([
        listStatuses(),
        prisma.affectationProject.findMany({ orderBy: { id: 'asc' } }),
        prisma.location.findMany({ select: { id: true, latitude: true, longitude: true } })
    ]);
    const loc = new Map(locations.map(l => [l.id, l]));
    return {
        statuses,
        deployments: projects.map(p => {
            const l = p.location_id == null ? null : loc.get(p.location_id);
            return {
                id: p.id,
                samu_name: p.samu_name,
                location_id: p.location_id,
                latitude: l?.latitude ?? null,
                longitude: l?.longitude ?? null,
                status_id: p.status_id,
                date_mise_en_service: p.date_mise_en_service
            };
        })
    };
}
