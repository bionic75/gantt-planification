// @ts-check
import { badRequest, notFound } from '../../lib/http-error.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { logUserAction } from '../../services/action-log.js';
import { evtResolveType } from '../events/events.service.js';
import * as svc from './affectation.service.js';
import { ASANA_RULES } from './asana.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const userId = (/** @type {Request} */ req) => /** @type {number} */ (req.session.userId);

// ---------- Configuration ----------

export async function config(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({
        stages: svc.AFF_STAGES.map(s => ({
            key: s.key,
            label: s.label,
            kind: s.kind,
            resources: !!s.resources,
            defaultColor: s.color,
            defaultPattern: s.key === 'gel' ? 'diag' : 'none'
        })),
        colors: await svc.affColors(),
        patterns: await svc.affPatterns(),
        patternIds: svc.AFF_PATTERNS
    });
}

/** Couleurs et motifs des étapes */
export async function saveColors(/** @type {Request} */ req, /** @type {Response} */ res) {
    await svc.saveColors(req.body && typeof req.body === 'object' ? req.body : {});
    logUserAction(req, 'Couleurs et motifs des étapes de déploiement SAMU', {});
    res.json({ colors: await svc.affColors(), patterns: await svc.affPatterns() });
}

export async function users(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ users: await svc.listActiveUsers() });
}

export async function resources(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ resources: await svc.listActiveResources() });
}

// ---------- Déploiements ----------

export async function listProjects(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ projects: await svc.listProjects() });
}

export async function history(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ history: await svc.projectHistory(req.params.id) });
}

/** Création (id absent) ou modification d'un déploiement, avec historique des changements */
async function saveProject(/** @type {Request} */ req, /** @type {Response} */ res, /** @type {number | null} */ id) {
    const r = svc.sanitizeAffProject(req.body);
    if (r.error) throw badRequest(r.error);
    const v = /** @type {svc.ProjectValues} */ (r.value);
    let before = null;
    if (id) {
        const old = await svc.getProject(id);
        if (old) before = svc.affValuesOfRow(old);
    }
    const savedId = await svc.writeProject(id, v, userId(req));
    if (savedId === null) throw notFound('Projet introuvable');
    await svc.affReconcileAssignments(savedId, v.periods);
    const json = await svc.projectJson(savedId);
    logUserAction(req, id ? 'Modification déploiement SAMU' : 'Création déploiement SAMU', {
        id: savedId,
        samu: v.samu_name
    });
    const changes = await svc.affDiff(before, v);
    if (!id || changes.length)
        await svc.affHist(req, savedId, v.samu_name, id ? 'modification' : 'creation', { changes });
    res.json(json);
}

export const createProject = (/** @type {Request} */ req, /** @type {Response} */ res) => saveProject(req, res, null);
export const updateProject = (/** @type {Request} */ req, /** @type {Response} */ res) =>
    saveProject(req, res, Number(req.params.id));

/** Suppression : si des événements sont liés, une validation explicite est exigée (?events=delete | keep) */
export async function deleteProject(/** @type {Request} */ req, /** @type {Response} */ res) {
    const pid = Number(req.params.id);
    const old = await svc.getProject(pid);
    if (!old) throw notFound('Projet introuvable');
    const evs = await svc.affLinkedEvents(old);
    const mode = String(req.query.events || '');
    if (evs.length && !['delete', 'keep'].includes(mode)) {
        const names = await svc.eventParticipantNames(evs.map(e => e.id));
        return res.status(409).json({
            code: 'EVENTS_LINKED',
            error: `${evs.length} événement(s) lié(s) à ce déploiement`,
            events: evs.map(e => ({
                id: e.id,
                label: e.label,
                start: e.start_date,
                end: e.end_date,
                participants: names.filter(n => n.event_id === e.id).map(n => n.name)
            }))
        });
    }
    let removed = 0;
    let reset = 0;
    if (evs.length && mode === 'delete') {
        for (const e of evs) {
            reset += await svc.affResetPlanningForEvent(e, req);
            await svc.deleteEvent(e.id);
            removed++;
        }
    }
    await svc.deleteProject(pid);
    logUserAction(req, 'Suppression déploiement SAMU', {
        id: pid,
        evenementsSupprimes: removed,
        evenementsConserves: mode === 'keep' ? evs.length : 0,
        demiJourneesRemisesEnSituation: reset
    });
    await svc.affHist(req, pid, old.samu_name, 'suppression', {
        changes: [
            {
                label: 'Déploiement',
                from: `${old.samu_name} (début ${svc.affFd(old.date_debut)})`,
                to: removed ? `supprimé avec ${removed} événement(s)` : 'supprimé'
            }
        ]
    });
    res.json({ success: true, eventsRemoved: removed, planningReset: reset });
}

// ---------- Ressources affectées ----------

/** Ressources d'une étape (dans la limite du nombre prévu), avec historique */
export async function setAssignments(/** @type {Request} */ req, /** @type {Response} */ res) {
    const projectId = Number(req.params.id);
    const stage = svc.AFF_STAGES.find(s => s.key === req.params.stage && s.resources);
    if (!stage) throw badRequest('Étape sans ressources à affecter');
    const { samuName, before, ids } = await svc.setAssignments(projectId, stage, req.body && req.body.resource_ids);
    logUserAction(req, 'Affectation de ressources (déploiement SAMU)', { projectId, stage: stage.key, resources: ids });
    const names = await svc.resourceNames([...new Set([...before, ...ids])]);
    const list = (/** @type {number[]} */ a) => a.map(i => names[i] || `#${i}`).join(', ') || '—';
    if (list(before) !== list(ids)) {
        await svc.affHist(req, projectId, samuName, 'affectation', {
            changes: [{ label: `${stage.label} — ressources`, from: list(before), to: list(ids) }]
        });
    }
    res.json({ resource_ids: ids });
}

export async function availability(/** @type {Request} */ req, /** @type {Response} */ res) {
    const row = await svc.getProject(req.params.id);
    if (!row) throw notFound('Projet introuvable');
    const r = await svc.affComputeAvailability(row, req.params.stage);
    res.json({ total: r.total, availability: r.availability });
}

/**
 * Désaffectation : les ressources retirées sont remises dans la planification en « 2 - Disponible / 2 - En attente
 * d'affectation » sur la période de l'activité, et retirées des participants des événements de l'activité
 */
export async function release(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const key = req.params.stage;
    const proj = await svc.getProject(id);
    if (!proj) throw notFound('Déploiement introuvable');
    const per = svc.parsePeriods(proj.periods)[key]?.[0];
    if (!per) throw badRequest('Étape sans période');
    const rids = [
        ...new Set(
            ((req.body || {}).resource_ids || [])
                .map(Number)
                .filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0)
        )
    ];
    if (!rids.length) return res.json({ success: true, planningReset: 0, removedFromEvents: 0 });
    const planningReset = await svc.affResetPlanning({
        resourceIds: /** @type {number[]} */ (rids),
        start: per.start,
        end: per.end,
        period: 'FULL',
        samuNo: affSamuNumber(proj.samu_name)
    });
    const evs = await svc.affStageEvents(
        proj,
        key,
        per,
        await svc.affEventLinks(id),
        await svc.affStageTypeMap(),
        await svc.allEventTypes(),
        await svc.affProjectLocationId(proj)
    );
    const removedFromEvents = evs.length ? await svc.removeResourcesFromEvents(evs, /** @type {number[]} */ (rids)) : 0;
    logUserAction(req, 'Désaffectation : planification remise en situation', {
        projectId: id,
        stage: key,
        ressources: rids,
        demiJournees: planningReset,
        retiresDesEvenements: removedFromEvents
    });
    res.json({ success: true, planningReset, removedFromEvents });
}

// ---------- Activités et événements ----------

export async function stageEventTypes(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({
        stages: svc.AFF_STAGES.filter(x => svc.AFF_EVENT_KEYS.includes(x.key)).map(x => ({
            key: x.key,
            label: x.label,
            rule: /** @type {Record<string, string>} */ (ASANA_RULES)[x.key] || ''
        })),
        mapping: await svc.affStageTypeMap(),
        types: await svc.sortedEventTypes()
    });
}

export async function saveStageEventTypes(/** @type {Request} */ req, /** @type {Response} */ res) {
    const clean = await svc.saveStageTypeMap((req.body && req.body.mapping) || {});
    logUserAction(req, "Correspondance activités Asana / types d'événements", { mapping: clean });
    res.json({ success: true, mapping: await svc.affStageTypeMap() });
}

/** Événements des activités de tous les déploiements (types correspondant aux activités) */
export async function events(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await svc.listStageEvents());
}

/** Événements du lieu d'un déploiement, répartis par activité (correspondants ou non) */
export async function eventCandidates(/** @type {Request} */ req, /** @type {Response} */ res) {
    const proj = await svc.getProject(req.params.id);
    if (!proj) throw notFound('Déploiement introuvable');
    res.json(await svc.eventCandidates(proj));
}

export async function setEventLink(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const key = String((req.body || {}).key || '');
    const eventId = Number((req.body || {}).eventId) || null;
    if (!svc.AFF_EVENT_KEYS.includes(key)) throw badRequest('Activité inconnue');
    if (eventId && !(await svc.eventExists(eventId))) throw notFound('Événement introuvable');
    await svc.affSetEventLink(id, key, eventId);
    logUserAction(req, 'Lien déploiement / événement', { id, activite: key, evenement: eventId });
    res.json({ success: true });
}

export async function syncFromEvents(/** @type {Request} */ req, /** @type {Response} */ res) {
    const pid = Number((req.body || {}).projectId) || null;
    const out = await svc.affSyncAllFromEvents(req, pid);
    if (out.length)
        logUserAction(req, 'Affectations synchronisées depuis les participants des événements', { modifs: out.length });
    res.json({ success: true, changes: out });
}

/** Événement d'une activité : SAMU, type de la correspondance, dates, ressources affectées en participants */
export async function createEvent(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const b = req.body || {};
    const key = String(b.key || '');
    if (!svc.AFF_EVENT_KEYS.includes(key)) throw badRequest('Activité inconnue');
    const proj = await svc.getProject(id);
    if (!proj) throw notFound('Déploiement introuvable');
    const iso = (/** @type {unknown} */ v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const start = iso(b.start);
    const end = iso(b.end) || start;
    if (!start) throw badRequest("Renseignez d'abord la date (ou la période) de cette activité");
    if (/** @type {string} */ (end) < start) throw badRequest('La date de fin précède la date de début');
    const locId = await svc.affProjectLocationId(proj);
    if (!locId) {
        throw badRequest(
            `Aucune localisation « ${proj.samu_name} » : créez-la dans l'Administration (Localisation) pour rattacher l'événement`
        );
    }
    const ty = await evtResolveType((await svc.affStageTypeMap())[key], {});
    const label = String(b.label || '').trim() || (ty.type ? ty.type.label_long : svc.stageLabel(key));
    const grist =
        ty.type && ty.type.code && ['mes', 'visite', 'congres', 'visiteMetier'].includes(ty.type.code) ? 1 : 0;
    const eventId = await svc.createActivityEvent({
        label,
        start,
        end: /** @type {string} */ (end),
        config: ty.config,
        createdBy: userId(req),
        locationId: locId,
        typeId: ty.typeId,
        grist
    });
    const participants = await svc.stageAssignedUsers(id, key);
    await svc.addEventParticipants(eventId, participants);
    await svc.affSetEventLink(id, key, eventId);
    logUserAction(req, "Création d'un événement depuis un déploiement SAMU", {
        id,
        activite: key,
        evenement: eventId,
        type: ty.type && ty.type.label_long
    });
    res.json({ success: true, eventId, participants: participants.length });
}

// ---------- Synchronisation d'une étape vers la planification ----------

export async function syncPreview(/** @type {Request} */ req, /** @type {Response} */ res) {
    const c = await svc.affSyncCompute(Number(req.params.id), req.params.stage);
    res.json({
        samu: c.proj.samu_name,
        samuLoc: c.samuLoc,
        locationId: c.locationId,
        start: c.per.start,
        end: c.per.end,
        activity: c.activity,
        resources: c.resources.map(r => ({
            id: r.id,
            nom: r.nom,
            prenom: r.prenom,
            user_id: r.user_id,
            toWrite: r.toWrite.length,
            done: r.done,
            conflicts: r.conflicts.slice(0, 12),
            conflictCount: r.conflicts.length
        })),
        event: c.event
    });
}

/** Application, après validation, de la planification et / ou de l'événement d'une étape */
export async function syncApply(/** @type {Request} */ req, /** @type {Response} */ res) {
    const stage = req.params.stage;
    const c = await svc.affSyncCompute(Number(req.params.id), stage);
    const body = req.body || {};
    /** @type {{ planning: number, event: { id: number, created: boolean, participants: number } | null }} */
    const result = { planning: 0, event: null };
    if (body.planning && Array.isArray(body.planning.resource_ids)) {
        result.planning = await svc.writeStagePlanning(c, body.planning.resource_ids.map(Number), userId(req));
    }
    const ev = body.event;
    if (ev && ev.apply) {
        const users = [
            ...new Set(
                (Array.isArray(ev.participants) ? ev.participants : [])
                    .map(Number)
                    .filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0)
            )
        ];
        let eventId;
        if (c.event.existing) {
            eventId = c.event.existing.id;
        } else {
            const label = String(ev.label || c.event.label).trim();
            if (!label) throw badRequest('Libellé requis');
            const start = /^\d{4}-\d{2}-\d{2}$/.test(ev.startDate) ? ev.startDate : c.per.start;
            const end = /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate) ? ev.endDate : c.per.end;
            if (end < start) throw badRequest('La date de fin précède la date de début');
            const ty = await evtResolveType(c.event.typeId, c.event.config);
            eventId = await svc.createActivityEvent({
                label,
                start,
                end,
                config: ty.config,
                createdBy: userId(req),
                locationId: c.locationId || null,
                typeId: ty.typeId
            });
        }
        await svc.addEventParticipants(eventId, /** @type {number[]} */ (users));
        await svc.affSetEventLink(c.proj.id, stage, eventId); // l'événement est relié à l'activité
        result.event = { id: eventId, created: !c.event.existing, participants: users.length };
    }
    logUserAction(req, 'Synchronisation affectation déploiement SAMU', { projectId: c.proj.id, stage, ...result });
    const stLabel = svc.stageLabel(stage);
    const ch = [];
    if (result.planning) {
        ch.push({
            label: `${stLabel} — planification des experts`,
            from: '—',
            to: `${result.planning} demi-journée(s) renseignée(s)`
        });
    }
    if (result.event) {
        ch.push({
            label: `${stLabel} — événement`,
            from: '—',
            to: `${result.event.created ? 'créé' : 'complété'} (n° ${result.event.id}, ${result.event.participants} participant(s))`
        });
    }
    if (ch.length) await svc.affHist(req, c.proj.id, c.proj.samu_name, 'synchro', { changes: ch });
    res.json(result);
}

// ---------- Synchronisation automatique depuis les événements ----------

/**
 * À chaque création ou modification d'événement, les affectations des déploiements concernés sont complétées ;
 * à la suppression, la planification posée par l'affectation est remise en situation
 * @type {import('express').RequestHandler}
 */
export async function eventsHook(req, res, next) {
    if (req.method === 'DELETE') {
        // Photographie de l'événement avant sa suppression ; remise en situation seulement si la suppression aboutit
        const m = /\/(\d+)\/?$/.exec(req.originalUrl.split('?')[0]);
        let snap = null;
        if (m) {
            try {
                snap = await svc.affEventSnapshot(Number(m[1]));
            } catch {
                snap = null;
            }
        }
        if (snap) {
            res.on('finish', () => {
                if (res.statusCode < 300) {
                    svc.affResetPlanningForEvent(snap, req).catch(e =>
                        console.error('Remise en situation du planning :', e.message)
                    );
                }
            });
        }
        return next();
    }
    if (req.method === 'POST' || req.method === 'PUT') {
        res.on('finish', () => {
            if (res.statusCode < 300) {
                svc.affSyncAllFromEvents(req).catch(e =>
                    console.error('Synchro événements → affectations :', e.message)
                );
            }
        });
    }
    next();
}
