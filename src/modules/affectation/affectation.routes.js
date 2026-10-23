// Aide à l'affectation opérationnelle (déploiements des SAMU) : /api/affectation
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAffectationAccess } from '../../middlewares/auth.js';
import {
    AFF_EVENT_KEYS,
    AFF_EVLINK_KEY,
    AFF_PATTERNS,
    AFF_SELECT,
    AFF_STAGES,
    AFF_STAGE_EVENT,
    AFF_STAGE_TYPE_KEY,
    affColors,
    affComputeAvailability,
    affEventLinks,
    affEventSnapshot,
    affFd,
    affHist,
    affLinkedEvents,
    affLoadAssignments,
    affNormTxt,
    affPatterns,
    affProjectLocationId,
    affResetPlanning,
    affResetPlanningForEvent,
    affRowToJson,
    affSaveProject,
    affSetEventLink,
    affStageEvents,
    affStageTypeMap,
    affSyncAllFromEvents,
    affSyncCompute
} from './affectation.service.js';
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';
import { logUserAction } from '../../services/action-log.js';
import {
    ASANA_KEYS,
    ASANA_RULES,
    asanaApi,
    asanaApplyCore,
    asanaApplyOverrides,
    asanaCompute,
    asanaComputeTasks,
    asanaEff,
    asanaEncrypt,
    asanaFetchProject,
    asanaFindProjectFor,
    asanaForcedId,
    asanaListSamuProjects,
    asanaOverridesFor,
    asanaPaged,
    asanaPreviewPayload,
    asanaProjectList,
    asanaPut,
    asanaRefreshDeployment,
    asanaRememberLink,
    asanaSamuNoOf,
    asanaSetting,
    asanaToken
} from './asana.service.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { evtResolveType } from '../events/events.service.js';
import {
    AFF_NAME_DEFAULT,
    AFF_NAME_KEY,
    AFF_TPL_KEY,
    AFF_TPL_MAX,
    affExportParams,
    affExportWithTemplate,
    affPptxToPdf,
    affRenderPages,
    affTplAnalyze,
    affTplLoad,
    affTplMeta,
    affTplPreview
} from './export.service.js';

const router = Router();

router.get('/affectation/config', requireAffectationAccess, (req, res) => {
    affColors(colors =>
        affPatterns(patterns =>
            res.json({
                stages: AFF_STAGES.map(s => ({
                    key: s.key,
                    label: s.label,
                    kind: s.kind,
                    resources: !!s.resources,
                    defaultColor: s.color,
                    defaultPattern: s.key === 'gel' ? 'diag' : 'none'
                })),
                colors,
                patterns,
                patternIds: AFF_PATTERNS
            })
        )
    );
});

router.put('/affectation/colors', requireAdmin, (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Format actuel { colors, patterns } ; l'ancien format (couleurs seules) reste accepté
    const input = body.colors && typeof body.colors === 'object' ? body.colors : body;
    const colors = {};
    for (const st of AFF_STAGES) {
        const c = input[st.key];
        if (c === undefined) continue;
        if (!/^#[0-9a-fA-F]{6}$/.test(c))
            return res.status(400).json({ error: `Couleur invalide pour « ${st.label} »` });
        colors[st.key] = c.toLowerCase();
    }
    const patterns = {};
    const pin = body.patterns && typeof body.patterns === 'object' ? body.patterns : {};
    for (const st of AFF_STAGES) {
        if (pin[st.key] === undefined) continue;
        if (!AFF_PATTERNS.includes(pin[st.key]))
            return res.status(400).json({ error: `Motif invalide pour « ${st.label} »` });
        patterns[st.key] = pin[st.key];
    }
    database.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('affectation_colors', ?)`,
        [JSON.stringify(colors)],
        err => {
            if (err) return res.status(500).json({ error: err.message });
            database.run(
                `INSERT OR REPLACE INTO settings (key, value) VALUES ('affectation_patterns', ?)`,
                [JSON.stringify(patterns)],
                err2 => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    logUserAction(req, 'Couleurs et motifs des étapes de déploiement SAMU', {});
                    affColors(c => affPatterns(pt => res.json({ colors: c, patterns: pt })));
                }
            );
        }
    );
});

router.get('/affectation/users', requireAdmin, (req, res) => {
    database.all(
        `SELECT id, nom, prenom, trigramme FROM users WHERE actif = 1 ORDER BY nom, prenom`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ users: rows });
        }
    );
});

router.get('/affectation/resources', requireAffectationAccess, (req, res) => {
    database.all(
        `SELECT id, nom, prenom, trigramme, fonction FROM resources WHERE actif = 1 ORDER BY nom, prenom`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ resources: rows });
        }
    );
});

// Affecte des ressources à une étape d'un projet (dans la limite du nombre de ressources prévu)
router.put('/affectation/projects/:id/assignments/:stage', requireAffectationAccess, (req, res) => {
    const projectId = Number(req.params.id);
    const stage = AFF_STAGES.find(s => s.key === req.params.stage && s.resources);
    if (!stage) return res.status(400).json({ error: 'Étape sans ressources à affecter' });
    const ids = [
        ...new Set((Array.isArray(req.body && req.body.resource_ids) ? req.body.resource_ids : []).map(Number))
    ];
    if (ids.some(n => !Number.isInteger(n) || n <= 0)) return res.status(400).json({ error: 'Ressources invalides' });
    database.get('SELECT samu_name, periods FROM affectation_projects WHERE id = ?', [projectId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Projet introuvable' });
        let periods = {};
        try {
            periods = JSON.parse(row.periods || '{}');
        } catch (e) {
            periods = {};
        }
        const needed = periods[stage.key] && periods[stage.key][0] ? periods[stage.key][0].needed : 0;
        if (!needed) return res.status(400).json({ error: "Cette étape n'a pas de nombre de ressources défini" });
        if (ids.length > needed)
            return res.status(400).json({ error: `${stage.label} : ${needed} ressource(s) maximum` });
        const save = async () => {
            const beforeIds = (
                await dbAll(
                    'SELECT resource_id FROM affectation_assignments WHERE project_id = ? AND stage_key = ? ORDER BY id',
                    [projectId, stage.key]
                )
            ).map(x => x.resource_id);
            // Une ressource déjà affectée à un autre SAMU sur cette période n'est pas affectable : il faut d'abord la désaffecter de l'autre SAMU
            try {
                const av = (await affComputeAvailability(row, stage.key)).availability;
                const blocked = ids.filter(id => !beforeIds.includes(id) && av[id] && av[id].other > 0);
                if (blocked.length) {
                    const names = (
                        await dbAll(
                            `SELECT id, nom, prenom FROM resources WHERE id IN (${blocked.map(() => '?').join(',')})`,
                            blocked
                        )
                    ).map(r =>
                        `${r.prenom || ''} ${(r.nom || '').toUpperCase()} (${(av[r.id].others || []).join(', ') || 'autre SAMU'})`.trim()
                    );
                    return res.status(409).json({
                        error: `Déjà affecté(e) à un autre SAMU sur cette période : ${names.join(' ; ')}. Désaffectez-le d'abord de l'autre SAMU.`
                    });
                }
            } catch (e) {
                /* contrôle indisponible : l'affectation reste possible */
            }
            database.serialize(() => {
                database.run('DELETE FROM affectation_assignments WHERE project_id = ? AND stage_key = ?', [
                    projectId,
                    stage.key
                ]);
                const stmt = database.prepare(
                    'INSERT INTO affectation_assignments (project_id, stage_key, resource_id) VALUES (?,?,?)'
                );
                ids.forEach(rid => stmt.run(projectId, stage.key, rid));
                stmt.finalize(async e => {
                    if (e) return res.status(500).json({ error: e.message });
                    logUserAction(req, 'Affectation de ressources (déploiement SAMU)', {
                        projectId,
                        stage: stage.key,
                        resources: ids
                    });
                    const all = [...new Set([...beforeIds, ...ids])];
                    const names = {};
                    if (all.length)
                        (
                            await dbAll(
                                `SELECT id, nom, prenom FROM resources WHERE id IN (${all.map(() => '?').join(',')})`,
                                all
                            )
                        ).forEach(r => {
                            names[r.id] = `${r.prenom || ''} ${(r.nom || '').toUpperCase()}`.trim();
                        });
                    const list = a => a.map(i => names[i] || `#${i}`).join(', ') || '—';
                    if (list(beforeIds) !== list(ids))
                        await affHist(req, projectId, row.samu_name, 'affectation', {
                            changes: [{ label: `${stage.label} — ressources`, from: list(beforeIds), to: list(ids) }]
                        });
                    res.json({ resource_ids: ids });
                });
            });
        };
        if (!ids.length) return save();
        database.all(
            `SELECT id FROM resources WHERE actif = 1 AND id IN (${ids.map(() => '?').join(',')})`,
            ids,
            (e2, found) => {
                if (e2) return res.status(500).json({ error: e2.message });
                if ((found || []).length !== ids.length)
                    return res.status(400).json({ error: 'Ressource inconnue ou inactive' });
                save();
            }
        );
    });
});

router.get('/affectation/projects/:id/availability/:stage', requireAffectationAccess, async (req, res) => {
    try {
        const row = await dbGet('SELECT samu_name, periods FROM affectation_projects WHERE id = ?', [
            Number(req.params.id)
        ]);
        if (!row) return res.status(404).json({ error: 'Projet introuvable' });
        const r = await affComputeAvailability(row, req.params.stage);
        res.json({ total: r.total, availability: r.availability });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/affectation/stage-event-types', requireAffectationAccess, async (req, res) => {
    try {
        res.json({
            stages: AFF_STAGES.filter(x => AFF_EVENT_KEYS.includes(x.key)).map(x => ({
                key: x.key,
                label: x.label,
                rule: ASANA_RULES[x.key] || ''
            })),
            mapping: await affStageTypeMap(),
            types: await dbAll('SELECT * FROM event_types ORDER BY is_other, sort_order, label_long')
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/affectation/events', requireAffectationAccess, async (req, res) => {
    try {
        const map = await affStageTypeMap();
        const types = await dbAll('SELECT * FROM event_types');
        const typeById = Object.fromEntries(types.map(t => [t.id, t]));
        const stageByType = {};
        for (const key of AFF_EVENT_KEYS) {
            const t = typeById[map[key]];
            if (t && !t.is_other && !stageByType[t.id]) stageByType[t.id] = key;
        }
        const typeIds = Object.keys(stageByType).map(Number);
        const projects = await dbAll('SELECT * FROM affectation_projects ORDER BY samu_name COLLATE NOCASE');
        const out = [];
        if (typeIds.length)
            for (const proj of projects) {
                const locId = await affProjectLocationId(proj);
                if (!locId) continue;
                let periods = {};
                try {
                    periods = JSON.parse(proj.periods || '{}');
                } catch (e) {
                    periods = {};
                }
                const evs = await dbAll(
                    `SELECT ce.id, ce.label, ce.start_date, ce.end_date, ce.period, ce.type_id FROM custom_events ce WHERE ce.location_id = ? AND ce.type_id IN (${typeIds.map(() => '?').join(',')}) ORDER BY ce.start_date, ce.id`,
                    [locId, ...typeIds]
                );
                if (!evs.length) continue;
                const parts = await dbAll(
                    `SELECT cp.event_id, u.nom, u.prenom FROM custom_event_participants cp LEFT JOIN users u ON u.id = cp.user_id WHERE cp.event_id IN (${evs.map(() => '?').join(',')}) ORDER BY u.nom, u.prenom`,
                    evs.map(e => e.id)
                );
                for (const e of evs) {
                    const key = stageByType[e.type_id],
                        t = typeById[e.type_id],
                        dd = key === 'mise_en_service' || key === 'mise_en_production' ? proj['date_' + key] : null,
                        per = dd ? { start: dd, end: dd } : periods[key] && periods[key][0];
                    out.push({
                        id: e.id,
                        project_id: proj.id,
                        samu: proj.samu_name,
                        label: e.label,
                        start: e.start_date,
                        end: e.end_date || e.start_date,
                        period: e.period,
                        stage: key,
                        stage_label: (AFF_STAGES.find(x => x.key === key) || {}).label || key,
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
                            .map(x => `${x.prenom || ''} ${x.nom || ''}`.trim())
                            .filter(Boolean),
                        planned: per ? { start: per.start, end: per.end } : null
                    });
                }
            }
        out.sort(
            (a, b) =>
                String(a.start).localeCompare(String(b.start)) || a.samu.localeCompare(b.samu, 'fr', { numeric: true })
        );
        res.json({
            events: out,
            stages: AFF_EVENT_KEYS.filter(k => typeById[map[k]] && !typeById[map[k]].is_other).map(k => ({
                key: k,
                label: typeById[map[k]].label_long
            })),
            samus: projects.map(p => p.samu_name)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/affectation/projects/:id/events-candidates', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const proj = await dbGet('SELECT * FROM affectation_projects WHERE id = ?', [id]);
        if (!proj) return res.status(404).json({ error: 'Déploiement introuvable' });
        const locId = await affProjectLocationId(proj);
        const map = await affStageTypeMap();
        const types = await dbAll('SELECT * FROM event_types');
        const events = locId
            ? await dbAll(
                  `SELECT ce.id, ce.label, ce.start_date, ce.end_date, ce.period, ce.type_id FROM custom_events ce WHERE ce.location_id = ? ORDER BY ce.start_date, ce.id`,
                  [locId]
              )
            : [];
        const parts = events.length
            ? await dbAll(
                  `SELECT event_id, COUNT(*) AS n FROM custom_event_participants WHERE event_id IN (${events.map(() => '?').join(',')}) GROUP BY event_id`,
                  events.map(e => e.id)
              )
            : [];
        const pc = Object.fromEntries(parts.map(p => [p.event_id, p.n]));
        const links = await affEventLinks(id);
        const out = {};
        for (const key of AFF_EVENT_KEYS) {
            const t = types.find(x => x.id === map[key]);
            const tplLabel = (AFF_STAGE_EVENT[key] || {}).label || (key === 'mise_en_service' ? 'MISE EN SERVICE' : '');
            const legacy = [t && t.label_long, tplLabel].filter(Boolean).map(affNormTxt);
            const isMatch = e =>
                e.type_id ? e.type_id === (t && t.id) : legacy.some(l => affNormTxt(e.label).startsWith(l));
            const fmt = e => ({
                id: e.id,
                label: e.label,
                start: e.start_date,
                end: e.end_date,
                participants: pc[e.id] || 0,
                type: (types.find(x => x.id === e.type_id) || {}).label_long || null
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
        res.json({ samu: proj.samu_name, locationId: locId, candidates: out });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/affectation/projects/:id/event-link', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id),
            key = String((req.body || {}).key || ''),
            eventId = Number((req.body || {}).eventId) || null;
        if (!AFF_EVENT_KEYS.includes(key)) return res.status(400).json({ error: 'Activité inconnue' });
        if (eventId && !(await dbGet('SELECT id FROM custom_events WHERE id = ?', [eventId])))
            return res.status(404).json({ error: 'Événement introuvable' });
        await affSetEventLink(id, key, eventId);
        logUserAction(req, 'Lien déploiement / événement', { id, activite: key, evenement: eventId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/affectation/sync-from-events', requireAffectationAccess, async (req, res) => {
    try {
        const pid = Number((req.body || {}).projectId) || null;
        const out = await affSyncAllFromEvents(req, pid);
        if (out.length)
            logUserAction(req, 'Affectations synchronisées depuis les participants des événements', {
                modifs: out.length
            });
        res.json({ success: true, changes: out });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// À chaque création / modification d'événement, les affectations des déploiements concernés sont mises à jour
router.use(['/my-custom-events', '/custom-events'], async (req, res, next) => {
    if (req.method === 'DELETE') {
        // Photographie de l'événement avant sa suppression ; la planification est remise en situation seulement si la suppression aboutit
        const m = /\/(\d+)\/?$/.exec(req.originalUrl.split('?')[0]);
        let snap = null;
        if (m) {
            try {
                snap = await affEventSnapshot(Number(m[1]));
            } catch (e) {
                snap = null;
            }
        }
        if (snap)
            res.on('finish', () => {
                if (res.statusCode < 300)
                    affResetPlanningForEvent(snap, req).catch(e =>
                        console.error('Remise en situation du planning :', e.message)
                    );
            });
        return next();
    }
    if (req.method === 'POST' || req.method === 'PUT') {
        res.on('finish', () => {
            if (res.statusCode < 300)
                affSyncAllFromEvents(req).catch(e => console.error('Synchro événements → affectations :', e.message));
        });
    }
    next();
});

// Désaffectation : les ressources retirées d'une activité sont remises dans la planification en « 2 - Disponible » / « 2 - En attente d'affectation » (localisation effacée)
// sur la période de l'activité, et retirées des participants des événements de cette activité
router.post('/affectation/projects/:id/assignments/:stage/release', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id),
            key = req.params.stage;
        const proj = await dbGet('SELECT * FROM affectation_projects WHERE id = ?', [id]);
        if (!proj) return res.status(404).json({ error: 'Déploiement introuvable' });
        let periods = {};
        try {
            periods = JSON.parse(proj.periods || '{}');
        } catch (e) {
            periods = {};
        }
        const per = periods[key] && periods[key][0];
        if (!per) return res.status(400).json({ error: 'Étape sans période' });
        const rids = [
            ...new Set(((req.body || {}).resource_ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))
        ];
        if (!rids.length) return res.json({ success: true, planningReset: 0, removedFromEvents: 0 });
        const planningReset = await affResetPlanning({
            resourceIds: rids,
            start: per.start,
            end: per.end,
            period: 'FULL',
            samuNo: affSamuNumber(proj.samu_name)
        });
        const locId = await affProjectLocationId(proj);
        const evs = await affStageEvents(
            proj,
            key,
            per,
            await affEventLinks(id),
            await affStageTypeMap(),
            await dbAll('SELECT * FROM event_types'),
            locId
        );
        let removedFromEvents = 0;
        if (evs.length) {
            const r = await dbRun(
                `DELETE FROM custom_event_participants WHERE event_id IN (${evs.map(() => '?').join(',')}) AND user_id IN (SELECT id FROM users WHERE resource_id IN (${rids.map(() => '?').join(',')}))`,
                [...evs, ...rids]
            );
            removedFromEvents = r.changes || 0;
        }
        logUserAction(req, 'Désaffectation : planification remise en situation', {
            projectId: id,
            stage: key,
            ressources: rids,
            demiJournees: planningReset,
            retiresDesEvenements: removedFromEvents
        });
        res.json({ success: true, planningReset, removedFromEvents });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Création de l'événement correspondant à une activité (SAMU, type de la correspondance, dates, ressources affectées en participants)
router.post('/affectation/projects/:id/event-create', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id),
            b = req.body || {},
            key = String(b.key || '');
        if (!AFF_EVENT_KEYS.includes(key)) return res.status(400).json({ error: 'Activité inconnue' });
        const proj = await dbGet('SELECT * FROM affectation_projects WHERE id = ?', [id]);
        if (!proj) return res.status(404).json({ error: 'Déploiement introuvable' });
        const iso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
        const start = iso(b.start),
            end = iso(b.end) || start;
        if (!start)
            return res.status(400).json({ error: "Renseignez d'abord la date (ou la période) de cette activité" });
        if (end < start) return res.status(400).json({ error: 'La date de fin précède la date de début' });
        const locId = await affProjectLocationId(proj);
        if (!locId)
            return res.status(400).json({
                error: `Aucune localisation « ${proj.samu_name} » : créez-la dans l'Administration (Localisation) pour rattacher l'événement`
            });
        const typeId = (await affStageTypeMap())[key];
        const ty = await evtResolveType(typeId, {});
        const label =
            String(b.label || '').trim() || (ty.type ? ty.type.label_long : AFF_STAGES.find(x => x.key === key).label);
        const grist = ty.type && ['mes', 'visite', 'congres', 'visiteMetier'].includes(ty.type.code) ? 1 : 0;
        const ins = await dbRun(
            `INSERT INTO custom_events (label, start_date, end_date, config, created_by, period, location_id, grist, type_id) VALUES (?,?,?,?,?,?,?,?,?)`,
            [label, start, end, JSON.stringify(ty.config), req.session.userId, 'FULL', locId, grist, ty.typeId]
        );
        const users = await dbAll(
            `SELECT DISTINCT u.id FROM affectation_assignments a JOIN resources r ON r.id = a.resource_id JOIN users u ON u.resource_id = r.id AND u.actif = 1 WHERE a.project_id = ? AND a.stage_key = ?`,
            [id, key]
        );
        for (const u of users)
            await dbRun('INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)', [
                ins.lastID,
                u.id
            ]);
        await affSetEventLink(id, key, ins.lastID);
        logUserAction(req, "Création d'un événement depuis un déploiement SAMU", {
            id,
            activite: key,
            evenement: ins.lastID,
            type: ty.type && ty.type.label_long
        });
        res.json({ success: true, eventId: ins.lastID, participants: users.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/affectation/stage-event-types', requireAdmin, async (req, res) => {
    try {
        const raw = (req.body && req.body.mapping) || {};
        const types = await dbAll('SELECT id FROM event_types');
        const clean = {};
        for (const st of AFF_STAGES.filter(x => AFF_EVENT_KEYS.includes(x.key))) {
            const id = Number(raw[st.key]);
            if (types.some(t => t.id === id)) clean[st.key] = id;
        }
        await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
            AFF_STAGE_TYPE_KEY,
            JSON.stringify(clean)
        ]);
        logUserAction(req, "Correspondance activités Asana / types d'événements", { mapping: clean });
        res.json({ success: true, mapping: await affStageTypeMap() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/affectation/projects/:id/sync/:stage', requireAffectationAccess, async (req, res) => {
    try {
        const c = await affSyncCompute(Number(req.params.id), req.params.stage);
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
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// Applique, après validation de l'utilisateur, la planification et/ou l'événement correspondant à une étape
router.post('/affectation/projects/:id/sync/:stage', requireAdmin, async (req, res) => {
    try {
        const c = await affSyncCompute(Number(req.params.id), req.params.stage);
        const body = req.body || {};
        const result = { planning: 0, event: null };
        if (body.planning && Array.isArray(body.planning.resource_ids)) {
            const author = await dbGet('SELECT prenom, nom FROM users WHERE id = ?', [req.session.userId]);
            const authorName = author ? `${author.prenom}.${author.nom}` : '';
            const up = (rid, key, type, value) =>
                dbRun(
                    `INSERT INTO schedule_data (resource_id, date_key, type, value, notification) VALUES (?,?,?,?, '1')
                ON CONFLICT(resource_id, date_key, type) DO UPDATE SET value = excluded.value, notification = '1'`,
                    [rid, key, type, value]
                );
            for (const r of c.resources.filter(x => body.planning.resource_ids.map(Number).includes(x.id))) {
                for (const key of r.toWrite) {
                    await up(r.id, key, 'available', '2');
                    await up(r.id, key, 'activity', c.activity);
                    await up(r.id, key, 'localisation', c.samuLoc);
                    if (authorName) await up(r.id, key, 'author', authorName);
                    result.planning++;
                }
            }
        }
        const ev = body.event;
        if (ev && ev.apply) {
            const users = [
                ...new Set(
                    (Array.isArray(ev.participants) ? ev.participants : [])
                        .map(Number)
                        .filter(n => Number.isInteger(n) && n > 0)
                )
            ];
            let eventId;
            if (c.event.existing) {
                eventId = c.event.existing.id;
            } else {
                const label = String(ev.label || c.event.label).trim();
                if (!label) return res.status(400).json({ error: 'Libellé requis' });
                const start = /^\d{4}-\d{2}-\d{2}$/.test(ev.startDate) ? ev.startDate : c.per.start;
                const end = /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate) ? ev.endDate : c.per.end;
                if (end < start) return res.status(400).json({ error: 'La date de fin précède la date de début' });
                const ty = await evtResolveType(c.event.typeId, c.event.config);
                const r = await dbRun(
                    `INSERT INTO custom_events (label, start_date, end_date, config, created_by, period, location_id, type_id) VALUES (?,?,?,?,?,?,?,?)`,
                    [
                        label,
                        start,
                        end,
                        JSON.stringify(ty.config),
                        req.session.userId,
                        'FULL',
                        c.locationId || null,
                        ty.typeId
                    ]
                );
                eventId = r.lastID;
            }
            for (const uid of users)
                await dbRun('INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)', [
                    eventId,
                    uid
                ]);
            await affSetEventLink(c.proj.id, req.params.stage, eventId); // l'événement est relié à l'activité
            result.event = { id: eventId, created: !c.event.existing, participants: users.length };
        }
        logUserAction(req, 'Synchronisation affectation déploiement SAMU', {
            projectId: c.proj.id,
            stage: req.params.stage,
            ...result
        });
        const stLabel = AFF_STAGES.find(x => x.key === req.params.stage).label;
        const ch = [];
        if (result.planning)
            ch.push({
                label: `${stLabel} — planification des experts`,
                from: '—',
                to: `${result.planning} demi-journée(s) renseignée(s)`
            });
        if (result.event)
            ch.push({
                label: `${stLabel} — événement`,
                from: '—',
                to: `${result.event.created ? 'créé' : 'complété'} (n° ${result.event.id}, ${result.event.participants} participant(s))`
            });
        if (ch.length) await affHist(req, c.proj.id, c.proj.samu_name, 'synchro', { changes: ch });
        res.json(result);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/affectation/projects', requireAffectationAccess, (req, res) => {
    database.all(`${AFF_SELECT} ORDER BY p.date_debut DESC, p.samu_name`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        affLoadAssignments(map => res.json({ projects: rows.map(r => affRowToJson(r, map)) }));
    });
});

router.get('/affectation/projects/:id/history', requireAffectationAccess, async (req, res) => {
    try {
        const rows = await dbAll(
            'SELECT id, samu_name, user_name, action, details, created_at FROM affectation_history WHERE project_id = ? ORDER BY id DESC LIMIT 500',
            [Number(req.params.id)]
        );
        res.json({
            history: rows.map(r => {
                let d = {};
                try {
                    d = JSON.parse(r.details || '{}');
                } catch (e) {
                    d = {};
                }
                return {
                    id: r.id,
                    user: r.user_name,
                    action: r.action,
                    at: r.created_at,
                    changes: d.changes || [],
                    note: d.note || ''
                };
            })
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/affectation/projects', requireAdmin, (req, res) => affSaveProject(req, res, null));

router.put('/affectation/projects/:id', requireAdmin, (req, res) => affSaveProject(req, res, Number(req.params.id)));

router.post('/affectation/import/asana-csv', requireAdmin, async (req, res) => {
    try {
        const c = asanaCompute(req.body && req.body.csv, req.body && req.body.formationTarget);
        if (!c.samuNo)
            return res
                .status(400)
                .json({ error: "Impossible d'identifier le SAMU : le nom du projet doit contenir « [SAMU 25] »" });
        res.json(await asanaPreviewPayload(c));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/affectation/import/asana-csv/apply', requireAdmin, async (req, res) => {
    try {
        const c = asanaCompute(req.body && req.body.csv, req.body && req.body.formationTarget);
        if (!c.samuNo) return res.status(400).json({ error: "Impossible d'identifier le SAMU" });
        res.json(await asanaApplyCore(req, c, req.body.apply, null, 'csv'));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/affectation/asana/teams', requireAdmin, async (req, res) => {
    try {
        const ws = await asanaSetting('asana_workspace_gid');
        if (!ws) return res.status(400).json({ error: "Choisissez d'abord l'espace de travail Asana" });
        let teams = [];
        try {
            teams = await asanaPaged(
                await asanaToken(),
                `/organizations/${encodeURIComponent(ws)}/teams?opt_fields=name`
            );
        } catch (e) {
            return res
                .status(e.status || 502)
                .json({ error: 'Équipes indisponibles pour cet espace de travail (' + e.message + ')' });
        }
        res.json({
            teams: teams.map(t => ({ gid: t.gid, name: t.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/affectation/asana/config', requireAdmin, async (req, res) => {
    try {
        res.json({
            tokenSet: !!(await asanaSetting('asana_token_enc')),
            workspaceGid: (await asanaSetting('asana_workspace_gid')) || '',
            workspaceName: (await asanaSetting('asana_workspace_name')) || '',
            teamGid: (await asanaSetting('asana_team_gid')) || '',
            teamName: (await asanaSetting('asana_team_name')) || '',
            nameFilter: (await asanaSetting('asana_name_filter')) || '\\[SAMU\\s*[^\\]]+\\]'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/affectation/asana/config', requireAdmin, async (req, res) => {
    try {
        const b = req.body || {};
        if (typeof b.token === 'string' && b.token.trim())
            await asanaPut('asana_token_enc', asanaEncrypt(b.token.trim()));
        if (typeof b.teamGid === 'string') {
            if (b.teamGid.trim()) {
                await asanaPut('asana_team_gid', b.teamGid.trim());
                await asanaPut('asana_team_name', String(b.teamName || '').trim());
            } else {
                await dbRun("DELETE FROM settings WHERE key IN ('asana_team_gid', 'asana_team_name')");
            }
        }
        if (typeof b.workspaceGid === 'string') {
            await asanaPut('asana_workspace_gid', b.workspaceGid.trim());
            await asanaPut('asana_workspace_name', String(b.workspaceName || '').trim());
        }
        if (typeof b.nameFilter === 'string' && b.nameFilter.trim()) {
            try {
                new RegExp(b.nameFilter, 'i');
            } catch (e) {
                return res.status(400).json({ error: 'Filtre de nom invalide (expression régulière)' });
            }
            await asanaPut('asana_name_filter', b.nameFilter.trim());
        }
        logUserAction(req, 'Configuration de la connexion Asana', { jetonModifie: !!(b.token && b.token.trim()) });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/affectation/asana/token', requireAdmin, async (req, res) => {
    await dbRun("DELETE FROM settings WHERE key = 'asana_token_enc'");
    logUserAction(req, 'Suppression du jeton Asana', {});
    res.json({ success: true });
});

// Teste le jeton enregistré et liste les espaces de travail accessibles
router.post('/affectation/asana/test', requireAdmin, async (req, res) => {
    try {
        const me = (await asanaApi(await asanaToken(), '/users/me?opt_fields=name,email,workspaces.name')).data;
        res.json({ name: me.name, email: me.email, workspaces: me.workspaces || [] });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// Projets Asana du périmètre, avec leur appairage aux déploiements de l'application
router.get('/affectation/asana/projects', requireAdmin, async (req, res) => {
    try {
        const token = await asanaToken();
        const re = new RegExp((await asanaSetting('asana_name_filter')) || '\\[SAMU\\s*[^\\]]+\\]', 'i');
        const list = (await asanaProjectList(token)).filter(p => re.test(p.name));
        let links = {};
        try {
            links = JSON.parse((await asanaSetting('asana_links')) || '{}');
        } catch (e) {
            links = {};
        }
        const deployments = await dbAll('SELECT id, samu_name FROM affectation_projects ORDER BY samu_name');
        const out = [];
        for (const p of list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))) {
            const samuNo = asanaSamuNoOf(p.name);
            const forced = links[p.gid] && links[p.gid] > 0 ? links[p.gid] : null;
            const dep = forced
                ? deployments.find(d => d.id === forced)
                : deployments.find(d => affSamuNumber(d.samu_name) === samuNo);
            out.push({
                gid: p.gid,
                name: p.name,
                url: p.permalink_url,
                samuNo,
                deployment: dep || null,
                manual: !!forced,
                ignored: links[p.gid] === -1
            });
        }
        res.json({ projects: out, deployments });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// Appairage manuel : deploymentId > 0 = déploiement choisi, -1 = ignorer ce projet, 0 / absent = retour à l'appairage automatique
router.put('/affectation/asana/links', requireAdmin, async (req, res) => {
    try {
        const { gid, deploymentId } = req.body || {};
        if (!gid) return res.status(400).json({ error: 'Projet Asana manquant' });
        let links = {};
        try {
            links = JSON.parse((await asanaSetting('asana_links')) || '{}');
        } catch (e) {
            links = {};
        }
        const n = Number(deploymentId) || 0;
        if (n === 0) delete links[gid];
        else links[gid] = n;
        await asanaPut('asana_links', JSON.stringify(links));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/affectation/asana/preview', requireAdmin, async (req, res) => {
    try {
        const gid = String((req.body && req.body.gid) || '');
        if (!gid) return res.status(400).json({ error: 'Projet Asana manquant' });
        const { projectName, tasks } = await asanaFetchProject(await asanaToken(), gid);
        const c = asanaComputeTasks(tasks, projectName, req.body.formationTarget);
        if (!c.samuNo) return res.status(400).json({ error: "Impossible d'identifier le SAMU dans le nom du projet" });
        res.json(await asanaPreviewPayload(c, await asanaForcedId(gid)));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/affectation/asana/apply', requireAdmin, async (req, res) => {
    try {
        const gid = String((req.body && req.body.gid) || '');
        const { projectName, tasks } = await asanaFetchProject(await asanaToken(), gid);
        const c = asanaComputeTasks(tasks, projectName, req.body.formationTarget);
        if (!c.samuNo) return res.status(400).json({ error: "Impossible d'identifier le SAMU" });
        const forced = await asanaForcedId(gid);
        let keys = req.body.apply;
        if (keys === 'auto') {
            // import en masse : toutes les rubriques nouvelles ou modifiées
            const pv = await asanaPreviewPayload(c, forced);
            keys = pv.rows.filter(r => r.status === 'nouveau' || r.status === 'modifié').map(r => r.key);
            if (!keys.length) {
                if (pv.existing) await asanaRememberLink(gid, pv.existing.id);
                return res.json({ success: true, unchanged: true, samu_name: pv.samuName });
            }
        }
        const applied = await asanaApplyCore(req, c, keys, forced, 'api');
        await asanaRememberLink(gid, applied.id); // les rafraîchissements suivants reprendront ce projet, pas un autre du même numéro
        res.json(applied);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/affectation/projects/:id/asana-refresh', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const dep = await dbGet('SELECT id, samu_name FROM affectation_projects WHERE id = ?', [id]);
        if (!dep) return res.status(404).json({ error: 'Déploiement introuvable' });
        const token = await asanaToken();
        res.json(await asanaRefreshDeployment(req, token, await asanaListSamuProjects(token), dep));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/affectation/projects/:id/asana-tasks', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const dep = await dbGet('SELECT * FROM affectation_projects WHERE id = ?', [id]);
        if (!dep) return res.status(404).json({ error: 'Déploiement introuvable' });
        const token = await asanaToken();
        const { match, candidates } = await asanaFindProjectFor(token, dep);
        const { projectName, tasks } = await asanaFetchProject(token, match.gid);
        const c0 = asanaComputeTasks(tasks, projectName);
        const ov = (await asanaOverridesFor(id)) || {};
        const auto = JSON.parse(JSON.stringify({ found: c0.found, demarDate: c0.demarDate }));
        const c1 = asanaApplyOverrides(JSON.parse(JSON.stringify({ ...c0 })), ov);
        let periods = {};
        try {
            periods = JSON.parse(dep.periods || '{}');
        } catch (e) {
            periods = {};
        }
        const cur = key =>
            key === 'date_debut'
                ? dep.date_debut
                    ? { date: dep.date_debut }
                    : null
                : key === 'mise_en_service' || key === 'mise_en_production'
                  ? dep['date_' + key]
                      ? { date: dep['date_' + key] }
                      : null
                  : periods[key] && periods[key][0]
                    ? { start: periods[key][0].start, end: periods[key][0].end }
                    : null;
        const rubriques = ASANA_KEYS.map(key => {
            const kind =
                key === 'date_debut' || key === 'mise_en_service' || key === 'mise_en_production' ? 'date' : 'period';
            const autoV =
                key === 'date_debut' ? (auto.demarDate ? { date: auto.demarDate } : null) : auto.found[key] || null;
            return {
                key,
                label: key === 'date_debut' ? 'Début du projet' : AFF_STAGES.find(s => s.key === key).label,
                kind,
                rule: ASANA_RULES[key],
                current: cur(key),
                auto: autoV,
                sources: c0.sources[key] || [],
                override: ov[key] || null
            };
        });
        const list = c0.tasks
            .map(t => ({
                gid: t.gid,
                name: t.name,
                code: t.code,
                parent: t.parent,
                start: t.start,
                due: t.due,
                eff: asanaEff(c0.tasks, t)
            }))
            .sort(
                (a, b) =>
                    String(a.code || '~').localeCompare(String(b.code || '~'), 'fr', { numeric: true }) ||
                    a.name.localeCompare(b.name, 'fr', { numeric: true })
            );
        res.json({
            samu: dep.samu_name,
            asana: projectName,
            gid: match.gid,
            url: match.permalink_url,
            candidates: candidates.map(x => ({ gid: x.gid, name: x.name })),
            tasks: list,
            rubriques,
            overridden: c1.overridden || []
        });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.put('/affectation/projects/:id/asana-overrides', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const dep = await dbGet('SELECT id, samu_name FROM affectation_projects WHERE id = ?', [id]);
        if (!dep) return res.status(404).json({ error: 'Déploiement introuvable' });
        const raw = (req.body && req.body.overrides) || {};
        const clean = {},
            g = v => (/^\d{3,30}$/.test(String(v || '')) ? String(v) : null);
        for (const key of ASANA_KEYS) {
            const sp = raw[key];
            if (!sp) continue;
            const o =
                key === 'date_debut' || key === 'mise_en_service' || key === 'mise_en_production'
                    ? g(sp.task)
                        ? { task: g(sp.task) }
                        : null
                    : g(sp.start) || g(sp.end)
                      ? { ...(g(sp.start) ? { start: g(sp.start) } : {}), ...(g(sp.end) ? { end: g(sp.end) } : {}) }
                      : null;
            if (o) clean[key] = o;
        }
        let all = {};
        try {
            all = JSON.parse((await asanaSetting('asana_task_overrides')) || '{}');
        } catch (e) {
            all = {};
        }
        if (Object.keys(clean).length) all[String(id)] = clean;
        else delete all[String(id)];
        await asanaPut('asana_task_overrides', JSON.stringify(all));
        logUserAction(req, 'Remplacement de dates Asana pour un déploiement', {
            id,
            samu: dep.samu_name,
            rubriques: Object.keys(clean)
        });
        const token = await asanaToken();
        const { match } = await asanaFindProjectFor(token, dep);
        const { projectName, tasks } = await asanaFetchProject(token, match.gid);
        const c = asanaComputeTasks(tasks, projectName);
        const pv = await asanaPreviewPayload(c, id);
        const keys = pv.rows.filter(r => r.status === 'nouveau' || r.status === 'modifié').map(r => r.key);
        if (!keys.length)
            return res.json({ success: true, unchanged: true, samu_name: dep.samu_name, asana: projectName });
        const r = await asanaApplyCore(req, c, keys, id, 'api');
        res.json({ ...r, updated: keys.length, asana: projectName });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// Rafraîchit tous les déploiements qui ont un projet Asana correspondant
router.post('/affectation/asana/refresh-all', requireAdmin, async (req, res) => {
    try {
        const token = await asanaToken();
        const ctx = await asanaListSamuProjects(token);
        const deps = await dbAll('SELECT id, samu_name FROM affectation_projects ORDER BY samu_name');
        const out = { total: deps.length, updated: [], unchanged: [], noMatch: [], errors: [] };
        for (const dep of deps) {
            try {
                const r = await asanaRefreshDeployment(req, token, ctx, dep);
                if (r.unchanged) out.unchanged.push(dep.samu_name);
                else
                    out.updated.push({
                        samu: dep.samu_name,
                        rows: r.updated,
                        asana: r.asana,
                        changes: r.changes || []
                    });
            } catch (e) {
                if (e.noMatch) out.noMatch.push(dep.samu_name);
                else out.errors.push({ samu: dep.samu_name, error: e.message });
            }
        }
        logUserAction(req, 'Rafraîchissement de tous les déploiements depuis Asana', {
            maj: out.updated.length,
            inchanges: out.unchanged.length,
            sansProjet: out.noMatch.length,
            erreurs: out.errors.length
        });
        res.json({ success: true, ...out });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/affectation/template', requireAffectationAccess, async (req, res) => {
    try {
        res.json(affTplMeta(await affTplLoad()));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/affectation/export-config', requireAffectationAccess, async (req, res) => {
    try {
        const r = await dbGet('SELECT value FROM settings WHERE key = ?', [AFF_NAME_KEY]);
        res.json({ pattern: (r && r.value) || AFF_NAME_DEFAULT, defaultPattern: AFF_NAME_DEFAULT });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/affectation/export-config', requireAdmin, async (req, res) => {
    try {
        const pattern = String((req.body || {}).pattern || '')
            .trim()
            .slice(0, 150);
        if (!pattern) await dbRun('DELETE FROM settings WHERE key = ?', [AFF_NAME_KEY]);
        else await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [AFF_NAME_KEY, pattern]);
        logUserAction(req, 'Modèle de nom des fichiers exportés du planning', { pattern: pattern || '(défaut)' });
        res.json({ pattern: pattern || AFF_NAME_DEFAULT, defaultPattern: AFF_NAME_DEFAULT });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/affectation/template/preview', requireAffectationAccess, async (req, res) => {
    try {
        const t = await affTplLoad();
        if (!t) return res.json({ exists: false });
        if (!t.preview) {
            t.preview = await affTplPreview(t);
        }
        res.json({ exists: true, ...t.preview });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.put('/affectation/template', requireAdmin, async (req, res) => {
    try {
        const name = String((req.body || {}).name || 'modele.pptx')
            .replace(/[^\w.\- ()\[\]éèêàùçôîï]+/gi, '_')
            .slice(0, 120);
        const b64 = String((req.body || {}).data || '').replace(/^data:[^,]*,/, '');
        if (!/\.pptx$/i.test(name))
            return res.status(400).json({ error: 'Le modèle doit être un fichier PowerPoint (.pptx)' });
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 1000 || buf.length > AFF_TPL_MAX)
            return res.status(400).json({ error: 'Fichier vide ou trop volumineux (25 Mo maximum)' });
        const { default: JSZip } = await import('jszip');
        let zip;
        try {
            zip = await JSZip.loadAsync(buf);
        } catch (e) {
            return res.status(400).json({ error: 'Fichier PowerPoint illisible' });
        }
        const A = await affTplAnalyze(zip);
        const info = {
            slideWidthMm: Math.round(A.W / 360) / 100,
            slideHeightMm: Math.round(A.H / 360) / 100,
            slides: A.slidePaths.length,
            baseSlide: A.slidePaths.indexOf(A.base.path) + 1,
            layout: A.layoutName,
            cover: !!A.coverPath,
            end: !!A.endPath,
            zone: {
                wMm: Math.round(A.zone.w / 360) / 100,
                hMm: Math.round(A.zone.h / 360) / 100,
                xMm: Math.round(A.zone.x / 360) / 100,
                yMm: Math.round(A.zone.y / 360) / 100
            }
        };
        const rec = {
            name,
            size: buf.length,
            uploadedAt: new Date().toISOString(),
            uploadedBy: (req.session && req.session.username) || null,
            info,
            b64: buf.toString('base64')
        };
        await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [AFF_TPL_KEY, JSON.stringify(rec)]);
        logUserAction(req, "Import du modèle PowerPoint d'export du planning", { name, size: buf.length });
        res.json(affTplMeta(rec));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.delete('/affectation/template', requireAdmin, async (req, res) => {
    try {
        await dbRun('DELETE FROM settings WHERE key = ?', [AFF_TPL_KEY]);
        logUserAction(req, "Suppression du modèle PowerPoint d'export du planning", {});
        res.json({ exists: false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/affectation/export/pdf', requireAffectationAccess, async (req, res) => {
    try {
        const x = affExportParams(req);
        let pdf;
        if (req.body && req.body.tpl && req.body.tpl.use)
            pdf = await affPptxToPdf((await affExportWithTemplate(req, x)).buf);
        else pdf = await affRenderPages(x.html, x.wPx, x.hPx, 'pdf', x.wMm, x.hMm);
        logUserAction(req, 'Export PDF du planning des déploiements', {
            modele: !!(req.body && req.body.tpl && req.body.tpl.use)
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${x.name}.pdf"`);
        res.send(Buffer.from(pdf));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/affectation/export/pptx', requireAffectationAccess, async (req, res) => {
    try {
        const x = affExportParams(req);
        let buf, pages;
        if (req.body && req.body.tpl && req.body.tpl.use) ({ buf, pages } = await affExportWithTemplate(req, x));
        else {
            const shots = await affRenderPages(x.html, x.wPx, x.hPx, 'pptx', x.wMm, x.hMm);
            const { default: PptxGenJS } = await import('pptxgenjs');
            const pptx = new PptxGenJS();
            pptx.defineLayout({ name: 'PAGE', width: x.wMm / 25.4, height: x.hMm / 25.4 });
            pptx.layout = 'PAGE';
            pptx.title = 'Planning des déploiements';
            shots.forEach(b64 => {
                const slide = pptx.addSlide();
                slide.addImage({ data: 'image/png;base64,' + b64, x: 0, y: 0, w: x.wMm / 25.4, h: x.hMm / 25.4 });
            });
            buf = await pptx.write({ outputType: 'nodebuffer' });
            pages = shots.length;
        }
        logUserAction(req, 'Export PowerPoint du planning des déploiements', {
            pages,
            modele: !!(req.body && req.body.tpl && req.body.tpl.use)
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${x.name}.pptx"`);
        res.send(Buffer.from(buf));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// Suppression : si des événements sont liés, une validation explicite est exigée (?events=delete | keep)
router.delete('/affectation/projects/:id', requireAdmin, async (req, res) => {
    try {
        const pid = Number(req.params.id);
        const old = await dbGet('SELECT * FROM affectation_projects WHERE id = ?', [pid]);
        if (!old) return res.status(404).json({ error: 'Projet introuvable' });
        const evs = await affLinkedEvents(old);
        const mode = String(req.query.events || '');
        if (evs.length && !['delete', 'keep'].includes(mode)) {
            const names = await dbAll(
                `SELECT cep.event_id, u.nom, u.prenom FROM custom_event_participants cep JOIN users u ON u.id = cep.user_id WHERE cep.event_id IN (${evs.map(() => '?').join(',')})`,
                evs.map(e => e.id)
            );
            return res.status(409).json({
                code: 'EVENTS_LINKED',
                error: `${evs.length} événement(s) lié(s) à ce déploiement`,
                events: evs.map(e => ({
                    id: e.id,
                    label: e.label,
                    start: e.start_date,
                    end: e.end_date,
                    participants: names
                        .filter(n => n.event_id === e.id)
                        .map(n => `${n.prenom || ''} ${(n.nom || '').toUpperCase()}`.trim())
                }))
            });
        }
        let removed = 0,
            reset = 0;
        if (evs.length && mode === 'delete') {
            for (const e of evs) {
                reset += await affResetPlanningForEvent(e, req);
                await dbRun('DELETE FROM custom_event_participants WHERE event_id = ?', [e.id]);
                await dbRun('DELETE FROM custom_event_external_participants WHERE event_id = ?', [e.id]);
                await dbRun('DELETE FROM custom_events WHERE id = ?', [e.id]);
                removed++;
            }
        }
        await dbRun('DELETE FROM affectation_projects WHERE id = ?', [pid]);
        await dbRun('DELETE FROM affectation_assignments WHERE project_id = ?', [pid]);
        for (const key of [AFF_EVLINK_KEY, 'asana_task_overrides']) {
            // liens et remplacements propres à ce déploiement
            try {
                const all = JSON.parse(
                    ((await dbGet('SELECT value FROM settings WHERE key = ?', [key])) || {}).value || '{}'
                );
                if (all[String(pid)]) {
                    delete all[String(pid)];
                    await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
                        key,
                        JSON.stringify(all)
                    ]);
                }
            } catch (e) {
                /* ignoré */
            }
        }
        logUserAction(req, 'Suppression déploiement SAMU', {
            id: pid,
            evenementsSupprimes: removed,
            evenementsConserves: mode === 'keep' ? evs.length : 0,
            demiJourneesRemisesEnSituation: reset
        });
        await affHist(req, pid, old.samu_name, 'suppression', {
            changes: [
                {
                    label: 'Déploiement',
                    from: `${old.samu_name} (début ${affFd(old.date_debut)})`,
                    to: removed ? `supprimé avec ${removed} événement(s)` : 'supprimé'
                }
            ]
        });
        res.json({ success: true, eventsRemoved: removed, planningReset: reset });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
