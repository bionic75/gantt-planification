// @ts-check
// Aide à l'affectation : déploiements des SAMU, étapes, disponibilités des ressources,
// liens avec les événements et la planification
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { HttpError } from '../../lib/http-error.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { logUserAction } from '../../services/action-log.js';
import { getJsonSetting, setSetting } from '../../services/settings.js';

/** @typedef {import('express').Request} Request */
/** @typedef {Awaited<ReturnType<typeof prisma.affectationProject.findMany>>[number]} ProjectRow */

export const AFF_STAGES = [
    { key: 'cadrage', label: 'Cadrage', kind: 'period', color: '#7e57c2' },
    { key: 'deploiement', label: 'Déploiement opérationnel', kind: 'period', color: '#1976d2' },
    { key: 'gel', label: 'Période(s) de gel', kind: 'periods', color: '#90a4ae' },
    { key: 'mise_en_service', label: 'Mise en service', kind: 'date', color: '#e53935' },
    { key: 'mise_en_production', label: 'Mise en production', kind: 'date', color: '#2e7d32' },
    { key: 'visite_metier', label: 'Visite métier', kind: 'period', resources: true, color: '#ab47bc' },
    { key: 'test_prerequis', label: 'Test des prérequis', kind: 'period', resources: true, color: '#26a69a' },
    { key: 'vft', label: 'VFT', kind: 'period', resources: true, color: '#43a047' },
    {
        key: 'formation_utilisateurs',
        label: 'Formation « Utilisateurs »',
        kind: 'period',
        resources: true,
        color: '#ef6c00'
    },
    { key: 'accompagnement', label: 'Accompagnement', kind: 'period', resources: true, color: '#00acc1' }
];

export const AFF_PERIOD_KEYS = AFF_STAGES.filter(s => s.kind !== 'date').map(s => s.key);

/** Libellé d'une étape */
export const stageLabel = (/** @type {string} */ key) => /** @type {any} */ (AFF_STAGES.find(s => s.key === key)).label;

export function affIsoDate(/** @type {unknown} */ v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Périodes JSON d'un déploiement (objet vide si invalide) */
export function parsePeriods(/** @type {string | null | undefined} */ json) {
    try {
        return JSON.parse(json || '{}') || {};
    } catch {
        return {};
    }
}

/** Nom affiché d'une ressource ou d'un compte : « Prénom NOM » */
const displayName = (/** @type {{ prenom: string | null, nom: string | null }} */ r) =>
    `${r.prenom || ''} ${(r.nom || '').toUpperCase()}`.trim();

/** Minuscules ASCII : comparaisons insensibles à la casse comme LIKE de SQLite */
const asciiLower = (/** @type {string} */ s) => s.replace(/[A-Z]/g, c => c.toLowerCase());

// ---------- Couleurs et motifs des étapes ----------

// Motifs applicables en plus de la couleur (« gel » reste hachuré par défaut)
export const AFF_PATTERNS = ['none', 'diag', 'diag2', 'chevron', 'grid', 'dots', 'cross', 'hlines', 'vlines', 'zigzag'];

export async function affPatterns() {
    const saved = (await getJsonSetting('affectation_patterns')) || {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const st of AFF_STAGES) {
        out[st.key] = AFF_PATTERNS.includes(saved[st.key]) ? saved[st.key] : st.key === 'gel' ? 'diag' : 'none';
    }
    return out;
}

export async function affColors() {
    const saved = (await getJsonSetting('affectation_colors')) || {};
    /** @type {Record<string, string>} */
    const colors = {};
    for (const st of AFF_STAGES)
        colors[st.key] = /^#[0-9a-fA-F]{6}$/.test(saved[st.key] || '') ? saved[st.key] : st.color;
    return colors;
}

/** Couleurs et motifs choisis par l'administrateur (format { colors, patterns } ou couleurs seules) */
export async function saveColors(/** @type {any} */ body) {
    const input = body.colors && typeof body.colors === 'object' ? body.colors : body;
    /** @type {Record<string, string>} */
    const colors = {};
    for (const st of AFF_STAGES) {
        const c = input[st.key];
        if (c === undefined) continue;
        if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new HttpError(400, `Couleur invalide pour « ${st.label} »`);
        colors[st.key] = c.toLowerCase();
    }
    /** @type {Record<string, string>} */
    const patterns = {};
    const pin = body.patterns && typeof body.patterns === 'object' ? body.patterns : {};
    for (const st of AFF_STAGES) {
        if (pin[st.key] === undefined) continue;
        if (!AFF_PATTERNS.includes(pin[st.key])) throw new HttpError(400, `Motif invalide pour « ${st.label} »`);
        patterns[st.key] = pin[st.key];
    }
    await setSetting('affectation_colors', JSON.stringify(colors));
    await setSetting('affectation_patterns', JSON.stringify(patterns));
}

// ---------- Déploiements ----------

/** Validation : toutes les dates doivent être postérieures ou égales à la date de début du projet */
export function sanitizeAffProject(/** @type {any} */ b) {
    if (!b || typeof b !== 'object') return { error: 'Données invalides' };
    const samu = String(b.samu_name || '').trim();
    if (!samu) return { error: 'Le nom du SAMU est obligatoire' };
    if (samu.length > 120) return { error: 'Nom du SAMU trop long' };
    if (!affIsoDate(b.date_debut)) return { error: 'La date de début du projet est obligatoire' };
    const debut = b.date_debut;
    const after = (/** @type {string} */ d, /** @type {string} */ label) =>
        d >= debut ? null : `${label} : la date ne peut pas précéder le début du projet (${debut})`;

    /** @type {{ samu_name: string, location_id: number | null, chef_projet_id: number | null, date_debut: string, date_mise_en_service: string | null, date_mise_en_production: string | null, periods: Record<string, any[]> }} */
    const out = {
        samu_name: samu,
        location_id:
            Number.isInteger(Number(b.location_id)) && Number(b.location_id) > 0 ? Number(b.location_id) : null,
        chef_projet_id:
            Number.isInteger(Number(b.chef_projet_id)) && Number(b.chef_projet_id) > 0
                ? Number(b.chef_projet_id)
                : null,
        date_debut: debut,
        date_mise_en_service: null,
        date_mise_en_production: null,
        periods: {}
    };
    for (const key of ['mise_en_service', 'mise_en_production']) {
        const v = b['date_' + key];
        if (v === null || v === undefined || v === '') continue;
        const label = stageLabel(key);
        if (!affIsoDate(v)) return { error: `${label} : date invalide` };
        const e = after(v, label);
        if (e) return { error: e };
        /** @type {any} */ (out)['date_' + key] = v;
    }
    const src = b.periods && typeof b.periods === 'object' ? b.periods : {};
    for (const key of AFF_PERIOD_KEYS) {
        const def = /** @type {any} */ (AFF_STAGES.find(s => s.key === key));
        const list = (Array.isArray(src[key]) ? src[key] : []).filter(
            (/** @type {any} */ p) => p && (p.start || p.end)
        );
        if (def.kind === 'period' && list.length > 1) return { error: `${def.label} : une seule période est possible` };
        if (list.length > 10) return { error: `${def.label} : trop de périodes` };
        const clean = [];
        for (const p of list) {
            if (!affIsoDate(p.start) || !affIsoDate(p.end)) {
                return { error: `${def.label} : renseignez la date de début et la date de fin` };
            }
            if (p.end < p.start) return { error: `${def.label} : la date de fin précède la date de début` };
            const e = after(p.start, def.label);
            if (e) return { error: e };
            /** @type {{ start: string, end: string, needed?: number }} */
            const item = { start: p.start, end: p.end };
            if (def.resources) {
                const n = Number(p.needed);
                if (!Number.isInteger(n) || n < 1 || n > 10) {
                    return { error: `${def.label} : indiquez le nombre de ressources nécessaires (1 à 10)` };
                }
                item.needed = n;
            }
            clean.push(item);
        }
        if (clean.length) out.periods[key] = clean;
    }
    return { value: out };
}

/** @typedef {NonNullable<ReturnType<typeof sanitizeAffProject>['value']>} ProjectValues */

/**
 * Création (id null) ou modification d'un déploiement
 * @returns {Promise<number | null>} identifiant ; null si le déploiement à modifier n'existe pas
 */
export async function writeProject(
    /** @type {number | null} */ id,
    /** @type {ProjectValues} */ v,
    /** @type {number | null} */ createdBy
) {
    const data = {
        samu_name: v.samu_name,
        location_id: v.location_id,
        chef_projet_id: v.chef_projet_id,
        date_debut: v.date_debut,
        date_mise_en_service: v.date_mise_en_service,
        date_mise_en_production: v.date_mise_en_production,
        periods: JSON.stringify(v.periods)
    };
    if (id) {
        const { count } = await prisma.affectationProject.updateMany({
            where: { id },
            data: { ...data, updated_at: sqlTimestamp() }
        });
        return count ? id : null;
    }
    return (await prisma.affectationProject.create({ data: { ...data, created_by: createdBy } })).id;
}

export function getProject(/** @type {unknown} */ id) {
    return prisma.affectationProject.findUnique({ where: { id: idParam(id) } });
}

/** Ressources affectées : { projectId: { stageKey: [resourceId] } } */
export async function affLoadAssignments() {
    const rows = await prisma.affectationAssignment.findMany({ orderBy: { id: 'asc' } });
    /** @type {Record<number, Record<string, number[]>>} */
    const map = {};
    for (const a of rows) ((map[a.project_id] ??= {})[a.stage_key] ??= []).push(a.resource_id);
    return map;
}

/** Après modification : retrait des affectations sans objet (étape supprimée, nombre de ressources réduit) */
export async function affReconcileAssignments(
    /** @type {number} */ projectId,
    /** @type {Record<string, any[]>} */ periods
) {
    const rows = await prisma.affectationAssignment.findMany({
        where: { project_id: projectId },
        orderBy: { id: 'asc' }
    });
    /** @type {Record<string, number>} */
    const counts = {};
    const toDelete = [];
    for (const a of rows) {
        const needed = periods[a.stage_key] && periods[a.stage_key][0] ? periods[a.stage_key][0].needed : 0;
        counts[a.stage_key] = (counts[a.stage_key] || 0) + 1;
        if (!needed || counts[a.stage_key] > needed) toDelete.push(a.id);
    }
    if (toDelete.length) await prisma.affectationAssignment.deleteMany({ where: { id: { in: toDelete } } });
}

/**
 * Déploiements avec le nom du chef de projet et leur origine (import Asana)
 * @param {{ id?: number }} [where]
 */
export async function loadProjectRows(where = {}) {
    const projects = await prisma.affectationProject.findMany({
        where,
        orderBy: [{ date_debut: 'desc' }, { samu_name: 'asc' }, { id: 'asc' }]
    });
    const ids = projects.map(p => p.id);
    const [chefs, imported] = await Promise.all([
        prisma.user.findMany({
            where: { id: { in: projects.map(p => p.chef_projet_id).filter(id => id != null) } },
            select: { id: true, nom: true, prenom: true }
        }),
        prisma.affectationHistory.findMany({
            where: { project_id: { in: ids }, action: { in: ['import_asana_csv', 'import_asana_api'] } },
            select: { project_id: true },
            distinct: ['project_id']
        })
    ]);
    const chefById = new Map(chefs.map(u => [u.id, u]));
    const fromAsana = new Set(imported.map(h => h.project_id));
    return projects.map(p => {
        const chef = p.chef_projet_id != null ? chefById.get(p.chef_projet_id) : undefined;
        return {
            ...p,
            chef_nom: chef?.nom ?? null,
            chef_prenom: chef?.prenom ?? null,
            from_asana: fromAsana.has(p.id)
        };
    });
}

/** @typedef {Awaited<ReturnType<typeof loadProjectRows>>[number]} ProjectWithRefs */

export function affRowToJson(
    /** @type {ProjectWithRefs} */ r,
    /** @type {Record<number, Record<string, number[]>>} */ assignments
) {
    return {
        id: r.id,
        samu_name: r.samu_name,
        location_id: r.location_id,
        chef_projet_id: r.chef_projet_id,
        chef_projet_nom: r.chef_nom ? `${r.chef_nom} ${r.chef_prenom || ''}`.trim() : null,
        date_debut: r.date_debut,
        date_mise_en_service: r.date_mise_en_service,
        date_mise_en_production: r.date_mise_en_production,
        periods: parsePeriods(r.periods),
        assignments: (assignments && assignments[r.id]) || {},
        updated_at: r.updated_at,
        from_asana: !!r.from_asana
    };
}

/** Déploiements (format de l'interface) */
export async function listProjects() {
    const [rows, map] = await Promise.all([loadProjectRows(), affLoadAssignments()]);
    return rows.map(r => affRowToJson(r, map));
}

/** Un déploiement (format de l'interface) */
export async function projectJson(/** @type {number} */ id) {
    const [row] = await loadProjectRows({ id });
    if (!row) throw new HttpError(500, 'Projet introuvable');
    return affRowToJson(row, await affLoadAssignments());
}

/** Historique d'un déploiement (500 dernières entrées) */
export async function projectHistory(/** @type {unknown} */ id) {
    const rows = await prisma.affectationHistory.findMany({
        where: { project_id: idParam(id) },
        orderBy: { id: 'desc' },
        take: 500
    });
    return rows.map(r => {
        const d = parsePeriods(r.details);
        return {
            id: r.id,
            user: r.user_name,
            action: r.action,
            at: r.created_at,
            changes: d.changes || [],
            note: d.note || ''
        };
    });
}

/** Entrée de l'historique d'un déploiement (auteur : utilisateur connecté) */
export async function affHist(
    /** @type {Request | null} */ req,
    /** @type {number} */ projectId,
    /** @type {string} */ samuName,
    /** @type {string} */ action,
    /** @type {unknown} */ details
) {
    try {
        const sess = /** @type {any} */ ((req && req.session) || {});
        const who = `${sess.prenom || ''} ${sess.nom || ''}`.trim() || sess.username || 'Utilisateur';
        await prisma.affectationHistory.create({
            data: {
                project_id: projectId,
                samu_name: samuName || '',
                user_id: sess.userId || null,
                user_name: who,
                action,
                details: JSON.stringify(details || {})
            }
        });
    } catch (/** @type {any} */ e) {
        console.error('Historique du déploiement :', e.message);
    }
}

export const affFd = (/** @type {string | null | undefined} */ d) =>
    d ? String(d).split('-').reverse().join('/') : '—';

export const affFp = (/** @type {any} */ p) =>
    p
        ? `${affFd(p.start)} → ${affFd(p.end)}${p.needed ? ` (${p.needed} ressource${p.needed > 1 ? 's' : ''})` : ''}`
        : '—';

/** Valeurs comparées dans l'historique */
export function affValuesOfRow(/** @type {any} */ r) {
    return {
        samu_name: r.samu_name,
        chef_projet_id: r.chef_projet_id,
        date_debut: r.date_debut,
        date_mise_en_service: r.date_mise_en_service,
        date_mise_en_production: r.date_mise_en_production,
        periods: r.periodsObj || parsePeriods(r.periods)
    };
}

/** Différences entre deux états d'un déploiement (avant : null à la création) */
export async function affDiff(/** @type {any} */ before, /** @type {any} */ after) {
    const ch = [];
    const push = (/** @type {string} */ label, /** @type {unknown} */ from, /** @type {unknown} */ to) => {
        if (String(from) !== String(to)) ch.push({ label, from: String(from), to: String(to) });
    };
    const nameOf = async (/** @type {number | null | undefined} */ id) => {
        if (!id) return '—';
        const u = await prisma.user.findUnique({ where: { id }, select: { nom: true, prenom: true } });
        return u ? `${u.prenom} ${u.nom}` : `#${id}`;
    };
    push('Nom du SAMU', before ? before.samu_name : '—', after.samu_name);
    push('Chef de projet', await nameOf(before && before.chef_projet_id), await nameOf(after.chef_projet_id));
    push('Début du projet', affFd(before && before.date_debut), affFd(after.date_debut));
    push('Mise en service', affFd(before && before.date_mise_en_service), affFd(after.date_mise_en_service));
    push('Mise en production', affFd(before && before.date_mise_en_production), affFd(after.date_mise_en_production));
    for (const k of AFF_PERIOD_KEYS) {
        const f = (/** @type {any[] | undefined} */ list) => (list || []).map(affFp).join(' ; ') || '—';
        push(stageLabel(k), f(before && before.periods && before.periods[k]), f(after.periods && after.periods[k]));
    }
    return ch;
}

// ---------- Ressources et disponibilités ----------

export function listActiveUsers() {
    return prisma.user.findMany({
        where: { actif: 1 },
        select: { id: true, nom: true, prenom: true, trigramme: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
}

export function listActiveResources() {
    return prisma.resource.findMany({
        where: { actif: 1 },
        select: { id: true, nom: true, prenom: true, trigramme: true, fonction: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }]
    });
}

/** Noms des ressources (« Prénom NOM ») par identifiant */
export async function resourceNames(/** @type {number[]} */ ids) {
    if (!ids.length) return {};
    const rows = await prisma.resource.findMany({
        where: { id: { in: ids } },
        select: { id: true, nom: true, prenom: true }
    });
    return Object.fromEntries(rows.map(r => [r.id, displayName(r)]));
}

/** Cellules de planification d'une période (clés « AAAA-MM-JJ_AM|PM »), éventuellement de certaines ressources */
function scheduleCells(
    /** @type {{ start: string, end: string }} */ per,
    /** @type {number[] | null} */ resourceIds = null
) {
    return prisma.scheduleData.findMany({
        where: {
            type: { in: ['available', 'activity', 'localisation'] },
            date_key: { gte: per.start, lte: per.end + '_ZZ' },
            ...(resourceIds ? { resource_id: { in: resourceIds } } : {})
        },
        select: { resource_id: true, date_key: true, type: true, value: true },
        orderBy: { id: 'asc' }
    });
}

/** Jours ouvrés (UTC) d'une période */
function* workingDays(/** @type {string} */ start, /** @type {string} */ end) {
    for (let t = Date.parse(start + 'T00:00:00Z'); t <= Date.parse(end + 'T00:00:00Z'); t += 86400000) {
        const dow = new Date(t).getUTCDay();
        if (dow !== 0 && dow !== 6) yield new Date(t).toISOString().slice(0, 10);
    }
}

/**
 * Disponibilité des ressources sur la période d'une étape (demi-journées ouvrées), d'après la planification.
 * available : 1 indisponible, 2 disponible ANS, 3 congés ; activity : 1 indisponible, 2 en attente, 3/4 SAMU, 5-8 ANS
 * @param {{ samu_name: string, periods: string }} row
 * @param {string} stageKey
 */
export async function affComputeAvailability(row, stageKey) {
    const per = parsePeriods(row.periods)[stageKey]?.[0];
    if (!per) throw new HttpError(400, 'Étape sans période');
    const samuNo = affSamuNumber(row.samu_name);
    /** @type {Record<number, Record<string, Record<string, string>>>} */
    const slots = {};
    for (const r of await scheduleCells(per)) {
        const dow = new Date(r.date_key.slice(0, 10) + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6) continue;
        ((slots[r.resource_id] ??= {})[r.date_key] ??= {})[r.type] = r.value;
    }
    const total = [...workingDays(per.start, per.end)].length * 2;
    /** @type {Record<string, any>} */
    const out = {};
    for (const [rid, days] of Object.entries(slots)) {
        const st = { free: 0, here: 0, other: 0, ans: 0, off: 0, leave: 0, others: /** @type {string[]} */ ([]) };
        const otherSet = new Set();
        for (const d of Object.values(days)) {
            const act = d.activity;
            const av = d.available;
            if (av === '3') st.leave++;
            else if (av === '1' || act === '1') st.off++;
            else if (act === '3' || act === '4') {
                if (affSamuNumber(d.localisation) === samuNo && samuNo) st.here++;
                else {
                    st.other++;
                    otherSet.add(
                        String(d.localisation || 'SAMU')
                            .replace(/^[^A-Za-z0-9]+/, '')
                            .trim()
                    );
                }
            } else if (['5', '6', '7', '8'].includes(act)) st.ans++;
            else if (av === '2') st.free++; // disponible ANS, activité 2 ou non renseignée
        }
        st.others = /** @type {string[]} */ ([...otherSet].sort());
        out[rid] = st;
    }
    return { total, availability: out, per };
}

/**
 * Affectation des ressources d'une étape (dans la limite du nombre prévu) ; une ressource déjà affectée à un
 * autre SAMU sur la période n'est pas affectable
 * @returns {Promise<{ samuName: string, before: number[], ids: number[] }>}
 */
export async function setAssignments(
    /** @type {number} */ projectId,
    /** @type {any} */ stage,
    /** @type {unknown} */ resourceIds
) {
    const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : []).map(Number))];
    if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw new HttpError(400, 'Ressources invalides');
    const row = await prisma.affectationProject.findUnique({
        where: { id: projectId },
        select: { samu_name: true, periods: true }
    });
    if (!row) throw new HttpError(404, 'Projet introuvable');
    const needed = parsePeriods(row.periods)[stage.key]?.[0]?.needed || 0;
    if (!needed) throw new HttpError(400, "Cette étape n'a pas de nombre de ressources défini");
    if (ids.length > needed) throw new HttpError(400, `${stage.label} : ${needed} ressource(s) maximum`);
    if (ids.length) {
        const found = await prisma.resource.count({ where: { actif: 1, id: { in: ids } } });
        if (found !== ids.length) throw new HttpError(400, 'Ressource inconnue ou inactive');
    }
    const before = (
        await prisma.affectationAssignment.findMany({
            where: { project_id: projectId, stage_key: stage.key },
            select: { resource_id: true },
            orderBy: { id: 'asc' }
        })
    ).map(x => x.resource_id);
    try {
        const av = (await affComputeAvailability(row, stage.key)).availability;
        const blocked = ids.filter(id => !before.includes(id) && av[id] && av[id].other > 0);
        if (blocked.length) {
            const resources = await prisma.resource.findMany({
                where: { id: { in: blocked } },
                select: { id: true, nom: true, prenom: true },
                orderBy: { id: 'asc' }
            });
            const names = resources.map(r =>
                `${displayName(r)} (${(av[r.id].others || []).join(', ') || 'autre SAMU'})`.trim()
            );
            throw new HttpError(
                409,
                `Déjà affecté(e) à un autre SAMU sur cette période : ${names.join(' ; ')}. Désaffectez-le d'abord de l'autre SAMU.`
            );
        }
    } catch (e) {
        if (e instanceof HttpError && e.status === 409) throw e;
        /* contrôle indisponible : l'affectation reste possible */
    }
    await prisma.$transaction([
        prisma.affectationAssignment.deleteMany({ where: { project_id: projectId, stage_key: stage.key } }),
        prisma.affectationAssignment.createMany({
            data: ids.map(resource_id => ({ project_id: projectId, stage_key: stage.key, resource_id }))
        })
    ]);
    return { samuName: row.samu_name, before, ids };
}

// ---------- Activités et événements ----------

export const AFF_STAGE_EVENT = /** @type {Record<string, { label: string, config: Record<string, string> }>} */ ({
    visite_metier: {
        label: 'VISITE METIER',
        config: { bgColor: '#7b1fa2', textColor: '#ffffff', borderColor: '#4a0072' }
    },
    test_prerequis: {
        label: 'VERIF PREREQUIS',
        config: { bgColor: '#546e7a', textColor: '#ffffff', borderColor: '#263238' }
    },
    vft: { label: 'VFT SUR SITE', config: { bgColor: '#2e7d32', textColor: '#ffffff', borderColor: '#1b5e20' } },
    formation_utilisateurs: {
        label: 'FORMATION',
        config: { bgColor: '#ffea00', textColor: '#0008ff', borderColor: '#000000' }
    },
    accompagnement: {
        label: 'ACCOMP. POST DÉM.',
        config: { bgColor: '#ffea00', textColor: '#c2059a', borderColor: '#000000' }
    }
});

// Correspondance entre les activités (étapes reliées aux événements) et les types d'événements :
// type, icône, libellé court et couleurs des événements créés par la synchronisation vers la planification
export const AFF_STAGE_TYPE_KEY = 'aff_stage_event_types';

/** Codes des types d'événements par défaut */
export const AFF_STAGE_TYPE_DEFAULT = /** @type {Record<string, string>} */ ({
    mise_en_service: 'mes',
    mise_en_production: 'mep',
    visite_metier: 'visiteMetier',
    test_prerequis: 'verifPrereq',
    vft: 'vftSite',
    formation_utilisateurs: 'formation',
    accompagnement: 'apd'
});

/** Activités reliées à des événements */
export const AFF_EVENT_KEYS = [
    'mise_en_service',
    'mise_en_production',
    'visite_metier',
    'test_prerequis',
    'vft',
    'formation_utilisateurs',
    'accompagnement'
];

/** Activité → type d'événement (choix enregistré, sinon type par défaut, sinon « Autre(s) ») */
export async function affStageTypeMap() {
    const saved = (await getJsonSetting(AFF_STAGE_TYPE_KEY)) || {};
    const types = await prisma.eventType.findMany({ select: { id: true, code: true }, orderBy: { id: 'asc' } });
    /** @type {Record<string, number | null>} */
    const out = {};
    for (const st of AFF_STAGES.filter(x => AFF_EVENT_KEYS.includes(x.key))) {
        const sv = Number(saved[st.key]);
        const byId = types.find(t => t.id === sv);
        const def = types.find(t => t.code === AFF_STAGE_TYPE_DEFAULT[st.key]) || types.find(t => t.code === 'autre');
        out[st.key] = (byId || def)?.id || null;
    }
    return out;
}

/** Enregistre la correspondance activités / types (types existants uniquement) */
export async function saveStageTypeMap(/** @type {any} */ raw) {
    const types = await prisma.eventType.findMany({ select: { id: true } });
    /** @type {Record<string, number>} */
    const clean = {};
    for (const st of AFF_STAGES.filter(x => AFF_EVENT_KEYS.includes(x.key))) {
        const id = Number(raw[st.key]);
        if (types.some(t => t.id === id)) clean[st.key] = id;
    }
    await setSetting(AFF_STAGE_TYPE_KEY, JSON.stringify(clean));
    return clean;
}

export const allEventTypes = () => prisma.eventType.findMany({ orderBy: { id: 'asc' } });

export const sortedEventTypes = () =>
    prisma.eventType.findMany({
        orderBy: [{ is_other: 'asc' }, { sort_order: 'asc' }, { label_long: 'asc' }, { id: 'asc' }]
    });

/** Liens explicites déploiement / activité / événement (paramètre JSON) */
export const AFF_EVLINK_KEY = 'aff_event_links';

export async function affEventLinks(/** @type {number} */ depId) {
    const all = (await getJsonSetting(AFF_EVLINK_KEY)) || {};
    return all[String(depId)] || {};
}

export async function affSetEventLink(
    /** @type {number} */ depId,
    /** @type {string} */ key,
    /** @type {number | null} */ eventId
) {
    const all = (await getJsonSetting(AFF_EVLINK_KEY)) || {};
    const cur = (all[String(depId)] = all[String(depId)] || {});
    if (eventId) cur[key] = eventId;
    else delete cur[key];
    if (!Object.keys(cur).length) delete all[String(depId)];
    await setSetting(AFF_EVLINK_KEY, JSON.stringify(all));
}

/** Retire les données propres à un déploiement d'un paramètre JSON indexé par déploiement */
export async function forgetProjectSetting(/** @type {string} */ key, /** @type {number} */ depId) {
    const all = await getJsonSetting(key);
    if (all && all[String(depId)]) {
        delete all[String(depId)];
        await setSetting(key, JSON.stringify(all));
    }
}

/** Lieu d'un déploiement : sa localisation, à défaut celle du même nom, puis celle du même numéro de SAMU (« SAMU-SAS 56 ») */
export async function affProjectLocationId(/** @type {{ location_id: number | null, samu_name: string }} */ proj) {
    if (proj.location_id) return proj.location_id;
    const exact = await prisma.location.findFirst({
        where: { libelle_court: proj.samu_name },
        select: { id: true },
        orderBy: { id: 'asc' }
    });
    if (exact) return exact.id;
    const no = affSamuNumber(proj.samu_name);
    if (!no) return null;
    const locs = await prisma.location.findMany({ select: { id: true, libelle_court: true }, orderBy: { id: 'asc' } });
    const loc =
        locs.find(l => affSamuNumber(l.libelle_court) === no && /SAS/i.test(l.libelle_court)) ||
        locs.find(l => affSamuNumber(l.libelle_court) === no);
    return loc ? loc.id : null;
}

export const affNormTxt = (/** @type {unknown} */ t) =>
    String(t || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/**
 * Événements d'une activité : celui relié explicitement, sinon ceux du même lieu et du même type
 * (ou de l'ancien libellé du gabarit) qui recoupent la période de l'activité
 * @returns {Promise<number[]>}
 */
export async function affStageEvents(
    /** @type {any} */ proj,
    /** @type {string} */ key,
    /** @type {{ start: string, end: string } | null} */ per,
    /** @type {Record<string, number>} */ links,
    /** @type {Record<string, number | null>} */ map,
    /** @type {Array<{ id: number, label_long: string }>} */ types,
    /** @type {number | null} */ locId
) {
    /** @type {number[]} */
    const evs = [];
    const linked = links[key]
        ? await prisma.customEvent.findUnique({ where: { id: idParam(links[key]) }, select: { id: true } })
        : null;
    if (linked) evs.push(linked.id);
    if (locId && per) {
        const t = types.find(x => x.id === map[key]);
        const tpl = AFF_STAGE_EVENT[key]?.label;
        const legacy = [t && t.label_long, tpl].filter(Boolean).map(affNormTxt);
        const rows = await prisma.customEvent.findMany({
            where: { location_id: locId, start_date: { lte: per.end }, end_date: { gte: per.start } },
            select: { id: true, label: true, type_id: true },
            orderBy: { id: 'asc' }
        });
        for (const e of rows) {
            const match = e.type_id ? e.type_id === (t && t.id) : legacy.some(l => affNormTxt(e.label).startsWith(l));
            if (match && !evs.includes(e.id)) evs.push(e.id);
        }
    }
    return evs;
}

/** Comptes participant à des événements (resource_id renseigné), par ordre d'inscription */
async function participantUsers(/** @type {number[]} */ eventIds) {
    const parts = await prisma.customEventParticipant.findMany({
        where: { event_id: { in: eventIds } },
        select: { event_id: true, user_id: true },
        orderBy: { id: 'asc' }
    });
    const users = await prisma.user.findMany({
        where: { id: { in: parts.map(p => p.user_id) } },
        select: { id: true, nom: true, prenom: true, resource_id: true }
    });
    const byId = new Map(users.map(u => [u.id, u]));
    return parts
        .filter(p => byId.has(p.user_id))
        .map(p => ({
            event_id: p.event_id,
            user: /** @type {NonNullable<ReturnType<typeof byId.get>>} */ (byId.get(p.user_id))
        }));
}

/**
 * Affectations complétées d'après les participants des événements de l'activité (ajouts seulement,
 * dans la limite du nombre de ressources nécessaires)
 * @returns {Promise<{ added: number[] }>}
 */
export async function affSyncStageFromEvents(
    /** @type {Request | null} */ req,
    /** @type {ProjectRow} */ proj,
    /** @type {string} */ key,
    /** @type {any} */ ctx
) {
    const per = parsePeriods(proj.periods)[key]?.[0];
    if (!per || !per.needed) return { added: [] };
    const evs = await affStageEvents(proj, key, per, await affEventLinks(proj.id), ctx.map, ctx.types, ctx.locId);
    if (!evs.length) return { added: [] };
    const candidates = [
        ...new Set((await participantUsers(evs)).map(p => p.user.resource_id).filter(id => id != null))
    ];
    const active = new Set(
        (
            await prisma.resource.findMany({
                where: { id: { in: /** @type {number[]} */ (candidates) }, actif: 1 },
                select: { id: true }
            })
        ).map(r => r.id)
    );
    const cur = (
        await prisma.affectationAssignment.findMany({
            where: { project_id: proj.id, stage_key: key },
            select: { resource_id: true },
            orderBy: { id: 'asc' }
        })
    ).map(x => x.resource_id);
    const toAdd = /** @type {number[]} */ (candidates)
        .filter(r => active.has(r) && !cur.includes(r))
        .slice(0, Math.max(0, per.needed - cur.length));
    if (!toAdd.length) return { added: [] };
    await prisma.affectationAssignment.createMany({
        data: toAdd.map(resource_id => ({ project_id: proj.id, stage_key: key, resource_id }))
    });
    const names = await resourceNames([...cur, ...toAdd]);
    const list = (/** @type {number[]} */ a) => a.map(i => names[i] || `#${i}`).join(', ') || '—';
    await affHist(req, proj.id, proj.samu_name, 'affectation', {
        changes: [
            {
                label: `${stageLabel(key)} — ressources (depuis les participants de l'événement)`,
                from: list(cur),
                to: list([...cur, ...toAdd])
            }
        ]
    });
    return { added: toAdd };
}

/** Synchronisation des affectations depuis les événements, pour tous les déploiements ou un seul */
export async function affSyncAllFromEvents(
    /** @type {Request | null} */ req,
    /** @type {number | null} */ onlyProjectId = null
) {
    const ctx = { map: await affStageTypeMap(), types: await allEventTypes() };
    const projs = await prisma.affectationProject.findMany({
        where: onlyProjectId ? { id: onlyProjectId } : {},
        orderBy: { id: 'asc' }
    });
    const out = [];
    for (const proj of projs) {
        const locId = await affProjectLocationId(proj);
        for (const key of AFF_EVENT_KEYS.filter(k => AFF_STAGES.find(x => x.key === k && x.resources))) {
            const r = await affSyncStageFromEvents(req, proj, key, { ...ctx, locId });
            if (r.added.length) out.push({ project: proj.id, samu: proj.samu_name, stage: key, added: r.added });
        }
    }
    return out;
}

/** Photographie d'un événement (dates, lieu, ressources participantes) */
export async function affEventSnapshot(/** @type {number} */ eventId) {
    const ev = await prisma.customEvent.findUnique({
        where: { id: eventId },
        select: { id: true, label: true, start_date: true, end_date: true, period: true, location_id: true }
    });
    if (!ev) return null;
    const loc =
        ev.location_id != null
            ? await prisma.location.findUnique({ where: { id: ev.location_id }, select: { libelle_court: true } })
            : null;
    const resourceIds = [
        ...new Set((await participantUsers([eventId])).map(p => p.user.resource_id).filter(id => id != null))
    ];
    return { ...ev, loc: loc ? loc.libelle_court : null, resourceIds: /** @type {number[]} */ (resourceIds) };
}

/** @typedef {NonNullable<Awaited<ReturnType<typeof affEventSnapshot>>>} EventSnapshot */

/**
 * Remise en situation de la planification après suppression d'un événement : seules les demi-journées posées
 * par l'affectation sur ce SAMU (activité 3 ou 4 et localisation de ce SAMU) sont concernées
 */
export async function affResetPlanningForEvent(/** @type {EventSnapshot | null} */ snap, /** @type {Request} */ req) {
    if (!snap) return 0;
    const n = await affResetPlanning({
        resourceIds: snap.resourceIds,
        start: snap.start_date,
        end: snap.end_date,
        period: snap.period,
        samuNo: affSamuNumber(snap.loc)
    });
    if (n) {
        logUserAction(req, "Planification remise en situation après suppression d'un événement", {
            evenement: snap.id,
            label: snap.label,
            demiJournees: n
        });
    }
    return n;
}

/** Cellule de planification créée ou remplacée, marquée « à notifier » */
function setScheduleCell(
    /** @type {number} */ resource_id,
    /** @type {string} */ date_key,
    /** @type {string} */ type,
    /** @type {string} */ value
) {
    return prisma.scheduleData.upsert({
        where: { resource_id_date_key_type: { resource_id, date_key, type } },
        create: { resource_id, date_key, type, value, notification: '1' },
        update: { value, notification: '1' }
    });
}

/**
 * Demi-journées remises en « 2 - Disponible / 2 - En attente d'affectation » (localisation et auteur effacés)
 * @param {{ resourceIds: number[], start: string, end: string, period: string | null, samuNo: string | null }} snap
 * @returns {Promise<number>} nombre de demi-journées remises en situation
 */
export async function affResetPlanning(snap) {
    if (!snap || !snap.resourceIds.length || !snap.samuNo) return 0;
    const halves = snap.period === 'AM' ? ['AM'] : snap.period === 'PM' ? ['PM'] : ['AM', 'PM'];
    let n = 0;
    for (const rid of snap.resourceIds) {
        for (const day of workingDays(snap.start, snap.end)) {
            for (const h of halves) {
                const key = `${day}_${h}`;
                const cells = await prisma.scheduleData.findMany({
                    where: { resource_id: rid, date_key: key, type: { in: ['activity', 'localisation'] } },
                    select: { type: true, value: true }
                });
                const act = cells.find(c => c.type === 'activity')?.value;
                const loc = cells.find(c => c.type === 'localisation')?.value;
                if (!(act === '3' || act === '4') || affSamuNumber(loc) !== snap.samuNo) continue;
                await setScheduleCell(rid, key, 'available', '2');
                await setScheduleCell(rid, key, 'activity', '2');
                await prisma.scheduleData.deleteMany({
                    where: { resource_id: rid, date_key: key, type: { in: ['localisation', 'author'] } }
                });
                n++;
            }
        }
    }
    return n;
}

export const AFF_STAGE_ACTIVITY = /** @type {Record<string, string>} */ ({
    visite_metier: '3',
    test_prerequis: '3',
    vft: '3',
    formation_utilisateurs: '3',
    accompagnement: '3'
});

/**
 * Synchronisation d'une étape vers la planification : demi-journées à renseigner et conflits par ressource
 * affectée, événement correspondant (existant ou à créer)
 */
export async function affSyncCompute(/** @type {number} */ projectId, /** @type {string} */ stageKey) {
    const def = AFF_STAGES.find(x => x.key === stageKey && x.resources);
    if (!def) throw new HttpError(400, 'Étape sans ressources');
    const proj = await prisma.affectationProject.findUnique({ where: { id: projectId } });
    if (!proj) throw new HttpError(404, 'Projet introuvable');
    const per = parsePeriods(proj.periods)[stageKey]?.[0];
    if (!per) throw new HttpError(400, 'Étape sans période');
    const samuNo = affSamuNumber(proj.samu_name);
    const samuLoc = '🚨 SAMU ' + (samuNo || String(proj.samu_name || '').trim());
    let locationId = proj.location_id;
    if (!locationId) {
        const loc = await prisma.location.findFirst({
            where: { libelle_court: proj.samu_name },
            select: { id: true },
            orderBy: { id: 'asc' }
        });
        locationId = loc ? loc.id : null;
    }

    // Ressources affectées (une ligne par compte actif rattaché, ou une ligne sans compte), par nom
    const assignments = await prisma.affectationAssignment.findMany({
        where: { project_id: projectId, stage_key: stageKey },
        orderBy: { id: 'asc' }
    });
    const resources = await prisma.resource.findMany({
        where: { id: { in: assignments.map(a => a.resource_id) } },
        select: { id: true, nom: true, prenom: true }
    });
    const users = await prisma.user.findMany({
        where: { resource_id: { in: resources.map(r => r.id) }, actif: 1 },
        select: { id: true, resource_id: true },
        orderBy: { id: 'asc' }
    });
    const resById = new Map(resources.map(r => [r.id, r]));
    const assigned = assignments
        .filter(a => resById.has(a.resource_id))
        .flatMap(a => {
            const r = /** @type {NonNullable<ReturnType<typeof resById.get>>} */ (resById.get(a.resource_id));
            const linked = users.filter(u => u.resource_id === r.id);
            return (linked.length ? linked : [null]).map(u => ({
                id: r.id,
                nom: r.nom,
                prenom: r.prenom,
                user_id: u ? u.id : null
            }));
        })
        .sort((a, b) => (a.nom === b.nom ? 0 : a.nom < b.nom ? -1 : 1));

    /** @type {Record<number, Record<string, Record<string, string>>>} */
    const cells = {};
    if (assigned.length) {
        for (const r of await scheduleCells(
            per,
            assigned.map(a => a.id)
        )) {
            ((cells[r.resource_id] ??= {})[r.date_key] ??= {})[r.type] = r.value;
        }
    }
    const activity = AFF_STAGE_ACTIVITY[stageKey] || '3';
    const plan = assigned.map(a => {
        /** @type {string[]} */
        const toWrite = [];
        /** @type {Array<{ key: string, reason: string }>} */
        const conflicts = [];
        let done = 0;
        for (const day of workingDays(per.start, per.end)) {
            for (const h of ['AM', 'PM']) {
                const key = `${day}_${h}`;
                const c = (cells[a.id] || {})[key] || {};
                if ((c.activity === '3' || c.activity === '4') && affSamuNumber(c.localisation) === samuNo) {
                    done++;
                    continue;
                }
                if (c.available === '3') conflicts.push({ key, reason: 'Congés' });
                else if (c.available === '1' || c.activity === '1') conflicts.push({ key, reason: 'Indisponible' });
                else if (c.activity === '3' || c.activity === '4') {
                    conflicts.push({
                        key,
                        reason:
                            'Affecté(e) à ' + String(c.localisation || 'un autre SAMU').replace(/^[^A-Za-z0-9]+/, '')
                    });
                } else if (['5', '6', '7', '8'].includes(c.activity)) {
                    conflicts.push({ key, reason: 'Activité ANS (' + c.activity + ')' });
                } else toWrite.push(key);
            }
        }
        return { id: a.id, nom: a.nom, prenom: a.prenom, user_id: a.user_id, toWrite, done, conflicts };
    });

    const tpl = AFF_STAGE_EVENT[stageKey];
    const typeId = (await affStageTypeMap())[stageKey];
    const evType = typeId ? await prisma.eventType.findUnique({ where: { id: typeId } }) : null;
    const evLabel = evType ? evType.label_long : tpl.label;
    const evConfig = evType
        ? { bgColor: evType.bg_color, textColor: evType.text_color, borderColor: evType.border_color }
        : tpl.config;
    // Événement déjà présent : même lieu, même période, même type (ou libellé du gabarit / du type)
    const candidates = await prisma.customEvent.findMany({
        where: { location_id: locationId, start_date: { lte: per.end }, end_date: { gte: per.start } },
        select: { id: true, label: true, start_date: true, end_date: true, type_id: true },
        orderBy: { id: 'asc' }
    });
    const prefixes = [tpl.label, evLabel].map(asciiLower);
    const existing = candidates.find(
        e => e.type_id === (typeId || -1) || prefixes.some(p => asciiLower(e.label).startsWith(p))
    );
    let existingEvent = null;
    if (existing) {
        const parts = await prisma.customEventParticipant.findMany({
            where: { event_id: existing.id },
            select: { user_id: true },
            orderBy: { id: 'asc' }
        });
        existingEvent = {
            id: existing.id,
            label: existing.label,
            start_date: existing.start_date,
            end_date: existing.end_date,
            participants: parts.map(x => x.user_id)
        };
    }
    return {
        proj,
        per,
        samuLoc,
        samuNo,
        locationId,
        activity,
        resources: plan,
        event: {
            label: evLabel,
            config: evConfig,
            typeId: typeId || null,
            typeLong: evType ? evType.label_long : null,
            typeShort: evType ? evType.label_short : '',
            existing: existingEvent
        }
    };
}

/** Planification de l'étape renseignée pour les ressources choisies ; renvoie le nombre de demi-journées */
export async function writeStagePlanning(
    /** @type {Awaited<ReturnType<typeof affSyncCompute>>} */ c,
    /** @type {number[]} */ resourceIds,
    /** @type {number} */ authorUserId
) {
    const author = await prisma.user.findUnique({ where: { id: authorUserId }, select: { prenom: true, nom: true } });
    const authorName = author ? `${author.prenom}.${author.nom}` : '';
    let n = 0;
    for (const r of c.resources.filter(x => resourceIds.includes(x.id))) {
        for (const key of r.toWrite) {
            await setScheduleCell(r.id, key, 'available', '2');
            await setScheduleCell(r.id, key, 'activity', c.activity);
            await setScheduleCell(r.id, key, 'localisation', c.samuLoc);
            if (authorName) await setScheduleCell(r.id, key, 'author', authorName);
            n++;
        }
    }
    return n;
}

/** Ajout de participants à un événement (doublons ignorés) */
export async function addEventParticipants(/** @type {number} */ eventId, /** @type {number[]} */ userIds) {
    for (const user_id of userIds) {
        await prisma.customEventParticipant.upsert({
            where: { event_id_user_id: { event_id: eventId, user_id } },
            create: { event_id: eventId, user_id },
            update: {}
        });
    }
}

/**
 * Création d'un événement d'activité
 * @param {{ label: string, start: string, end: string, config: unknown, createdBy: number, locationId: number | null, typeId: number | null, grist?: number }} e
 */
export async function createActivityEvent(e) {
    const ev = await prisma.customEvent.create({
        data: {
            label: e.label,
            start_date: e.start,
            end_date: e.end,
            config: JSON.stringify(e.config),
            created_by: e.createdBy,
            period: 'FULL',
            location_id: e.locationId,
            type_id: e.typeId,
            ...(e.grist !== undefined ? { grist: e.grist } : {})
        }
    });
    return ev.id;
}

/** Comptes actifs des ressources affectées à une étape */
export async function stageAssignedUsers(/** @type {number} */ projectId, /** @type {string} */ key) {
    const assignments = await prisma.affectationAssignment.findMany({
        where: { project_id: projectId, stage_key: key },
        select: { resource_id: true }
    });
    const resources = await prisma.resource.findMany({
        where: { id: { in: assignments.map(a => a.resource_id) } },
        select: { id: true }
    });
    const users = await prisma.user.findMany({
        where: { resource_id: { in: resources.map(r => r.id) }, actif: 1 },
        select: { id: true },
        orderBy: { id: 'asc' }
    });
    return users.map(u => u.id);
}

/** Ressources retirées des participants d'événements ; renvoie le nombre de participations supprimées */
export async function removeResourcesFromEvents(/** @type {number[]} */ eventIds, /** @type {number[]} */ resourceIds) {
    const users = await prisma.user.findMany({ where: { resource_id: { in: resourceIds } }, select: { id: true } });
    const { count } = await prisma.customEventParticipant.deleteMany({
        where: { event_id: { in: eventIds }, user_id: { in: users.map(u => u.id) } }
    });
    return count;
}

/** Suppression d'un événement et de ses participants */
export async function deleteEvent(/** @type {number} */ eventId) {
    await prisma.$transaction([
        prisma.customEventParticipant.deleteMany({ where: { event_id: eventId } }),
        prisma.customEventExternalParticipant.deleteMany({ where: { event_id: eventId } }),
        prisma.customEvent.deleteMany({ where: { id: eventId } })
    ]);
}

/** Événements liés à un déploiement : reliés explicitement, ou du même lieu / type sur la période d'une activité */
export async function affLinkedEvents(/** @type {ProjectRow} */ proj) {
    const locId = await affProjectLocationId(proj);
    const map = await affStageTypeMap();
    const types = await allEventTypes();
    const links = await affEventLinks(proj.id);
    const periods = parsePeriods(proj.periods);
    const ids = new Set();
    for (const key of AFF_EVENT_KEYS) {
        const date =
            key === 'mise_en_service' || key === 'mise_en_production' ? /** @type {any} */ (proj)['date_' + key] : null;
        const per = date
            ? { start: date, end: date }
            : key === 'mise_en_service' || key === 'mise_en_production'
              ? null
              : periods[key]?.[0];
        for (const id of await affStageEvents(proj, key, per || null, links, map, types, locId)) ids.add(id);
    }
    const out = [];
    for (const id of ids) {
        const snap = await affEventSnapshot(/** @type {number} */ (id));
        if (snap) out.push(snap);
    }
    return out.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export async function eventExists(/** @type {number} */ eventId) {
    return !!(await prisma.customEvent.findUnique({ where: { id: eventId }, select: { id: true } }));
}

/**
 * Événements des activités de tous les déploiements : événements du lieu de chaque déploiement dont le type
 * correspond à une activité (hors « Autre(s) »), avec la période prévue de l'activité
 */
export async function listStageEvents() {
    const map = await affStageTypeMap();
    const types = await allEventTypes();
    const typeById = Object.fromEntries(types.map(t => [t.id, t]));
    /** @type {Record<number, string>} */
    const stageByType = {};
    for (const key of AFF_EVENT_KEYS) {
        const t = map[key] != null ? typeById[/** @type {number} */ (map[key])] : undefined;
        if (t && !t.is_other && !stageByType[t.id]) stageByType[t.id] = key;
    }
    const typeIds = Object.keys(stageByType).map(Number);
    const projects = (await prisma.affectationProject.findMany({ orderBy: { id: 'asc' } })).sort((a, b) => {
        const x = asciiLower(a.samu_name);
        const y = asciiLower(b.samu_name);
        return x === y ? a.id - b.id : x < y ? -1 : 1;
    });
    const out = [];
    if (typeIds.length) {
        for (const proj of projects) {
            const locId = await affProjectLocationId(proj);
            if (!locId) continue;
            const periods = parsePeriods(proj.periods);
            const evs = await prisma.customEvent.findMany({
                where: { location_id: locId, type_id: { in: typeIds } },
                select: { id: true, label: true, start_date: true, end_date: true, period: true, type_id: true },
                orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
            });
            if (!evs.length) continue;
            const parts = (await participantUsers(evs.map(e => e.id))).sort(
                (a, b) =>
                    (a.user.nom === b.user.nom ? 0 : a.user.nom < b.user.nom ? -1 : 1) ||
                    (a.user.prenom === b.user.prenom ? 0 : a.user.prenom < b.user.prenom ? -1 : 1)
            );
            for (const e of evs) {
                const key = stageByType[/** @type {number} */ (e.type_id)];
                const t = typeById[/** @type {number} */ (e.type_id)];
                const dd =
                    key === 'mise_en_service' || key === 'mise_en_production'
                        ? /** @type {any} */ (proj)['date_' + key]
                        : null;
                const per = dd ? { start: dd, end: dd } : periods[key]?.[0];
                out.push({
                    id: e.id,
                    project_id: proj.id,
                    samu: proj.samu_name,
                    label: e.label,
                    start: e.start_date,
                    end: e.end_date || e.start_date,
                    period: e.period,
                    stage: key,
                    stage_label: AFF_STAGES.find(x => x.key === key)?.label || key,
                    type: {
                        id: t.id,
                        label: t.label_long,
                        short: t.label_short,
                        icon: t.icon,
                        bg: t.bg_color,
                        color: t.text_color,
                        border: t.border_color
                    },
                    participants: parts
                        .filter(x => x.event_id === e.id)
                        .map(x => `${x.user.prenom || ''} ${x.user.nom || ''}`.trim())
                        .filter(Boolean),
                    planned: per ? { start: per.start, end: per.end } : null
                });
            }
        }
    }
    out.sort(
        (a, b) =>
            String(a.start).localeCompare(String(b.start)) || a.samu.localeCompare(b.samu, 'fr', { numeric: true })
    );
    return {
        events: out,
        stages: AFF_EVENT_KEYS.filter(k => {
            const t = map[k] != null ? typeById[/** @type {number} */ (map[k])] : undefined;
            return t && !t.is_other;
        }).map(k => ({ key: k, label: typeById[/** @type {number} */ (map[k])].label_long })),
        samus: projects.map(p => p.samu_name)
    };
}

/** Événements du lieu d'un déploiement, répartis par activité : correspondants (type ou libellé) et autres */
export async function eventCandidates(/** @type {ProjectRow} */ proj) {
    const locId = await affProjectLocationId(proj);
    const map = await affStageTypeMap();
    const types = await allEventTypes();
    const events = locId
        ? await prisma.customEvent.findMany({
              where: { location_id: locId },
              select: { id: true, label: true, start_date: true, end_date: true, period: true, type_id: true },
              orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
          })
        : [];
    const counts = events.length
        ? await prisma.customEventParticipant.groupBy({
              by: ['event_id'],
              where: { event_id: { in: events.map(e => e.id) } },
              _count: { _all: true }
          })
        : [];
    const pc = Object.fromEntries(counts.map(p => [p.event_id, p._count._all]));
    const links = await affEventLinks(proj.id);
    /** @type {Record<string, any>} */
    const out = {};
    for (const key of AFF_EVENT_KEYS) {
        const t = types.find(x => x.id === map[key]);
        const tplLabel = AFF_STAGE_EVENT[key]?.label || (key === 'mise_en_service' ? 'MISE EN SERVICE' : '');
        const legacy = [t && t.label_long, tplLabel].filter(Boolean).map(affNormTxt);
        const isMatch = (/** @type {{ type_id: number | null, label: string }} */ e) =>
            e.type_id ? e.type_id === (t && t.id) : legacy.some(l => affNormTxt(e.label).startsWith(l));
        const fmt = (/** @type {(typeof events)[number]} */ e) => ({
            id: e.id,
            label: e.label,
            start: e.start_date,
            end: e.end_date,
            participants: pc[e.id] || 0,
            type: types.find(x => x.id === e.type_id)?.label_long || null
        });
        const linked = events.find(e => e.id === links[key]);
        out[key] = {
            typeId: t ? t.id : null,
            typeLong: t ? t.label_long : null,
            matching: events.filter(isMatch).map(fmt),
            others: events.filter(e => !isMatch(e)).map(fmt),
            linked: linked ? linked.id : null
        };
    }
    return { samu: proj.samu_name, locationId: locId, candidates: out };
}

/** Participants (« Prénom NOM ») d'événements */
export async function eventParticipantNames(/** @type {number[]} */ eventIds) {
    return (await participantUsers(eventIds)).map(p => ({ event_id: p.event_id, name: displayName(p.user) }));
}

/** Suppression d'un déploiement, de ses affectations et de ses données propres (liens, remplacements Asana) */
export async function deleteProject(/** @type {number} */ id) {
    await prisma.$transaction([
        prisma.affectationProject.deleteMany({ where: { id } }),
        prisma.affectationAssignment.deleteMany({ where: { project_id: id } })
    ]);
    for (const key of [AFF_EVLINK_KEY, 'asana_task_overrides']) {
        try {
            await forgetProjectSetting(key, id);
        } catch {
            /* ignoré */
        }
    }
}
