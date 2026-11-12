// @ts-check
// Import des déploiements depuis Asana : fichier CSV exporté, ou API (jeton chiffré, espace de travail, équipe)
import { badRequest, HttpError, notFound } from '../../lib/http-error.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { logUserAction } from '../../services/action-log.js';
import { deleteSettings } from '../../services/settings.js';
import * as svc from './affectation.service.js';
import {
    ASANA_KEYS,
    ASANA_MILESTONES,
    asanaLoadTemplate,
    asanaReloadStageRules,
    asanaRuleText,
    asanaTemplateChoices,
    ASANA_TEMPLATE_KEY,
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
    asanaConflictsOf,
    asanaRefreshDeployment,
    asanaResolveConflicts,
    asanaRememberLink,
    asanaSamuNoOf,
    asanaSetting,
    asanaToken
} from './asana.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const DEFAULT_NAME_FILTER = '\\[SAMU\\s*[^\\]]+\\]';

/** Paramètre JSON propre à Asana (objet vide si absent ou invalide) */
async function jsonSetting(/** @type {string} */ key) {
    try {
        return JSON.parse((await asanaSetting(key)) || '{}');
    } catch {
        return {};
    }
}

/** Rubriques nouvelles ou modifiées d'un aperçu */
const changedKeys = (/** @type {{ rows: Array<{ key: string, status: string }> }} */ pv) =>
    pv.rows.filter(r => r.status === 'nouveau' || r.status === 'modifié').map(r => r.key);

// ---------- Import d'un fichier CSV ----------

export async function csvPreview(/** @type {Request} */ req, /** @type {Response} */ res) {
    await asanaReloadStageRules();
    const c = asanaCompute(req.body && req.body.csv, req.body && req.body.formationTarget);
    if (!c.samuNo) throw badRequest("Impossible d'identifier le SAMU : le nom du projet doit contenir « [SAMU 25] »");
    res.json(await asanaPreviewPayload(c));
}

export async function csvApply(/** @type {Request} */ req, /** @type {Response} */ res) {
    await asanaReloadStageRules();
    const c = asanaCompute(req.body && req.body.csv, req.body && req.body.formationTarget);
    if (!c.samuNo) throw badRequest("Impossible d'identifier le SAMU");
    res.json(await asanaApplyCore(req, c, req.body.apply, null, 'csv'));
}

// ---------- Configuration de la connexion ----------

export async function teams(/** @type {Request} */ req, /** @type {Response} */ res) {
    const ws = await asanaSetting('asana_workspace_gid');
    if (!ws) throw badRequest("Choisissez d'abord l'espace de travail Asana");
    /** @type {any[]} */
    let list;
    try {
        list = await asanaPaged(await asanaToken(), `/organizations/${encodeURIComponent(ws)}/teams?opt_fields=name`);
    } catch (/** @type {any} */ e) {
        throw new HttpError(e.status || 502, 'Équipes indisponibles pour cet espace de travail (' + e.message + ')');
    }
    res.json({
        teams: list
            .map((/** @type {any} */ t) => ({ gid: t.gid, name: t.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    });
}

export async function getConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({
        tokenSet: !!(await asanaSetting('asana_token_enc')),
        workspaceGid: (await asanaSetting('asana_workspace_gid')) || '',
        workspaceName: (await asanaSetting('asana_workspace_name')) || '',
        teamGid: (await asanaSetting('asana_team_gid')) || '',
        teamName: (await asanaSetting('asana_team_name')) || '',
        nameFilter: (await asanaSetting('asana_name_filter')) || DEFAULT_NAME_FILTER
    });
}

/** Jeton (chiffré), espace de travail, équipe et filtre de nom des projets */
export async function saveConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    const b = req.body || {};
    if (typeof b.nameFilter === 'string' && b.nameFilter.trim()) {
        try {
            new RegExp(b.nameFilter, 'i');
        } catch {
            throw badRequest('Filtre de nom invalide (expression régulière)');
        }
    }
    if (typeof b.token === 'string' && b.token.trim()) await asanaPut('asana_token_enc', asanaEncrypt(b.token.trim()));
    if (typeof b.teamGid === 'string') {
        if (b.teamGid.trim()) {
            await asanaPut('asana_team_gid', b.teamGid.trim());
            await asanaPut('asana_team_name', String(b.teamName || '').trim());
        } else {
            await deleteSettings(['asana_team_gid', 'asana_team_name']);
        }
    }
    if (typeof b.workspaceGid === 'string') {
        await asanaPut('asana_workspace_gid', b.workspaceGid.trim());
        await asanaPut('asana_workspace_name', String(b.workspaceName || '').trim());
    }
    if (typeof b.nameFilter === 'string' && b.nameFilter.trim())
        await asanaPut('asana_name_filter', b.nameFilter.trim());
    logUserAction(req, 'Configuration de la connexion Asana', { jetonModifie: !!(b.token && b.token.trim()) });
    res.json({ success: true });
}

export async function deleteToken(/** @type {Request} */ req, /** @type {Response} */ res) {
    await deleteSettings(['asana_token_enc']);
    logUserAction(req, 'Suppression du jeton Asana', {});
    res.json({ success: true });
}

/** Test du jeton : compte et espaces de travail accessibles */
export async function test(/** @type {Request} */ req, /** @type {Response} */ res) {
    const me = (await asanaApi(await asanaToken(), '/users/me?opt_fields=name,email,workspaces.name')).data;
    res.json({ name: me.name, email: me.email, workspaces: me.workspaces || [] });
}

// ---------- Projets Asana et appairage ----------

/** Projets Asana du périmètre et déploiement associé à chacun */
export async function projects(/** @type {Request} */ req, /** @type {Response} */ res) {
    const token = await asanaToken();
    const re = new RegExp((await asanaSetting('asana_name_filter')) || DEFAULT_NAME_FILTER, 'i');
    const list = (await asanaProjectList(token)).filter((/** @type {any} */ p) => re.test(p.name));
    const links = await jsonSetting('asana_links');
    const deployments = (await svc.loadProjectRows())
        .map(d => ({ id: d.id, samu_name: d.samu_name }))
        .sort((a, b) => (a.samu_name === b.samu_name ? a.id - b.id : a.samu_name < b.samu_name ? -1 : 1));
    const out = [];
    for (const p of list.sort((/** @type {any} */ a, /** @type {any} */ b) =>
        a.name.localeCompare(b.name, 'fr', { numeric: true })
    )) {
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
}

/** Appairage manuel : deploymentId > 0 déploiement choisi, -1 projet ignoré, 0 retour à l'appairage automatique */
export async function setLink(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { gid, deploymentId } = req.body || {};
    if (!gid) throw badRequest('Projet Asana manquant');
    const links = await jsonSetting('asana_links');
    const n = Number(deploymentId) || 0;
    if (n === 0) delete links[gid];
    else links[gid] = n;
    await asanaPut('asana_links', JSON.stringify(links));
    res.json({ success: true });
}

export async function preview(/** @type {Request} */ req, /** @type {Response} */ res) {
    const gid = String((req.body && req.body.gid) || '');
    if (!gid) throw badRequest('Projet Asana manquant');
    const { projectName, tasks } = await asanaFetchProject(await asanaToken(), gid);
    const c = asanaComputeTasks(tasks, projectName, req.body.formationTarget);
    if (!c.samuNo) throw badRequest("Impossible d'identifier le SAMU dans le nom du projet");
    res.json(await asanaPreviewPayload(c, await asanaForcedId(gid)));
}

/** Import d'un projet Asana (rubriques choisies, ou « auto » : toutes les rubriques nouvelles ou modifiées) */
export async function apply(/** @type {Request} */ req, /** @type {Response} */ res) {
    const gid = String((req.body && req.body.gid) || '');
    const { projectName, tasks } = await asanaFetchProject(await asanaToken(), gid);
    const c = asanaComputeTasks(tasks, projectName, req.body.formationTarget);
    if (!c.samuNo) throw badRequest("Impossible d'identifier le SAMU");
    const forced = await asanaForcedId(gid);
    let keys = req.body.apply;
    /** @type {any[]} */
    let conflicts = [];
    if (keys === 'auto') {
        const pv = await asanaPreviewPayload(c, forced);
        keys = changedKeys(pv);
        // Rubriques modifiées dans l'application et dans Asana : non reprises, signalées pour arbitrage
        conflicts = asanaConflictsOf(pv);
        if (!keys.length) {
            if (pv.existing) await asanaRememberLink(gid, pv.existing.id);
            return res.json({
                success: true,
                unchanged: !conflicts.length,
                samu_name: pv.samuName,
                id: pv.existing ? pv.existing.id : null,
                conflicts
            });
        }
    }
    const applied = await asanaApplyCore(req, c, keys, forced, 'api');
    // Les rafraîchissements suivants reprendront ce projet, pas un autre du même numéro
    await asanaRememberLink(gid, applied.id);
    res.json({ ...applied, conflicts });
}

// ---------- Rafraîchissement des déploiements ----------

export async function refreshOne(/** @type {Request} */ req, /** @type {Response} */ res) {
    const dep = await svc.getProject(req.params.id);
    if (!dep) throw notFound('Déploiement introuvable');
    const token = await asanaToken();
    res.json(
        await asanaRefreshDeployment(req, token, await asanaListSamuProjects(token), {
            id: dep.id,
            samu_name: dep.samu_name
        })
    );
}

/** Tous les déploiements qui ont un projet Asana correspondant */
export async function refreshAll(/** @type {Request} */ req, /** @type {Response} */ res) {
    const token = await asanaToken();
    const ctx = await asanaListSamuProjects(token);
    const deps = (await svc.loadProjectRows())
        .map(d => ({ id: d.id, samu_name: d.samu_name }))
        .sort((a, b) => (a.samu_name === b.samu_name ? a.id - b.id : a.samu_name < b.samu_name ? -1 : 1));
    /** @type {{ total: number, updated: any[], unchanged: string[], noMatch: string[], errors: any[], conflicts: any[] }} */
    const out = { total: deps.length, updated: [], unchanged: [], noMatch: [], errors: [], conflicts: [] };
    for (const dep of deps) {
        try {
            const r = await asanaRefreshDeployment(req, token, ctx, dep);
            if (r.conflicts && r.conflicts.length)
                out.conflicts.push({ id: dep.id, samu: dep.samu_name, asana: r.asana, rows: r.conflicts });
            if (r.unchanged) out.unchanged.push(dep.samu_name);
            else if (r.updated)
                out.updated.push({ samu: dep.samu_name, rows: r.updated, asana: r.asana, changes: r.changes || [] });
        } catch (/** @type {any} */ e) {
            if (e.noMatch) out.noMatch.push(dep.samu_name);
            else out.errors.push({ samu: dep.samu_name, error: e.message });
        }
    }
    logUserAction(req, 'Rafraîchissement de tous les déploiements depuis Asana', {
        maj: out.updated.length,
        inchanges: out.unchanged.length,
        sansProjet: out.noMatch.length,
        conflits: out.conflicts.length,
        erreurs: out.errors.length
    });
    res.json({ success: true, ...out });
}

/** Arbitrage des conflits d'un déploiement : { choices: { <rubrique>: 'app' | 'asana' } } */
export async function resolveConflicts(/** @type {Request} */ req, /** @type {Response} */ res) {
    const dep = await svc.getProject(req.params.id);
    if (!dep) throw notFound('Déploiement introuvable');
    const raw = (req.body && req.body.choices) || {};
    /** @type {Record<string, 'app' | 'asana'>} */
    const choices = {};
    for (const key of ASANA_KEYS) if (raw[key] === 'app' || raw[key] === 'asana') choices[key] = raw[key];
    if (!Object.keys(choices).length) throw badRequest('Aucun choix à enregistrer');
    const token = await asanaToken();
    const r = await asanaResolveConflicts(
        req,
        token,
        await asanaListSamuProjects(token),
        {
            id: dep.id,
            samu_name: dep.samu_name
        },
        choices
    );
    logUserAction(req, 'Arbitrage de conflits Asana pour un déploiement', {
        id: dep.id,
        samu: dep.samu_name,
        reprises: r.applied,
        conservees: r.kept
    });
    res.json(r);
}

// ---------- Tâches Asana et remplacements manuels ----------

/** Tâches du projet Asana d'un déploiement, rubriques reprises (règle, valeur actuelle, valeur Asana) et remplacements */
export async function tasks(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const dep = await svc.getProject(id);
    if (!dep) throw notFound('Déploiement introuvable');
    // Sans interrogation d'Asana (?asana=0) : ce que contient l'application, sans écart ni liste de tâches
    if (String(req.query.asana) === '0') {
        await asanaReloadStageRules();
        const modeleLocal = await asanaLoadTemplate();
        const ovLocal = (await asanaOverridesFor(id)) || {};
        const periodsLocal = svc.parsePeriods(dep.periods);
        const dateKeys = ['date_debut', 'mise_en_service', 'mise_en_production', ...ASANA_MILESTONES];
        const courante = (/** @type {string} */ key) =>
            key === 'date_debut'
                ? dep.date_debut
                    ? { date: dep.date_debut }
                    : null
                : key === 'mise_en_service' || key === 'mise_en_production'
                  ? /** @type {any} */ (dep)['date_' + key]
                      ? { date: /** @type {any} */ (dep)['date_' + key] }
                      : null
                  : periodsLocal[key]?.[0]
                    ? { start: periodsLocal[key][0].start, end: periodsLocal[key][0].end }
                    : null;
        return res.json({
            samu: dep.samu_name,
            asana: '',
            gid: '',
            url: '',
            interroge: false,
            candidates: [],
            tasks: [],
            rubriques: ASANA_KEYS.map(key => ({
                key,
                label: key === 'date_debut' ? 'Début du projet' : svc.stageLabel(key),
                kind: dateKeys.includes(key) ? 'date' : 'period',
                rule: asanaRuleText(key, modeleLocal),
                current: courante(key),
                auto: null,
                sources: [],
                override: ovLocal[key] || null
            })),
            overridden: Object.keys(ovLocal)
        });
    }
    const token = await asanaToken();
    const { match, candidates } = await asanaFindProjectFor(token, dep);
    const { projectName, tasks: list } = await asanaFetchProject(token, match.gid);
    const c0 = asanaComputeTasks(list, projectName);
    // Liste affichée : toutes les tâches du projet (sous-tâches comprises), dans l'ordre d'Asana
    const complet = (await asanaFetchProject(token, match.gid, { allSubtasks: true })).tasks;
    for (const t of complet) {
        t.code = (/^\s*(\d+(?:\.\d+)*)\.?\s/.exec(t.name) || [])[1] || '';
    }
    await asanaReloadStageRules();
    const modele = await asanaLoadTemplate();
    const ov = (await asanaOverridesFor(id)) || {};
    const auto = JSON.parse(JSON.stringify({ found: c0.found, demarDate: c0.demarDate }));
    const c1 = asanaApplyOverrides(JSON.parse(JSON.stringify({ ...c0 })), ov);
    const periods = svc.parsePeriods(dep.periods);
    const isDate = (/** @type {string} */ key) =>
        key === 'date_debut' ||
        key === 'mise_en_service' ||
        key === 'mise_en_production' ||
        ASANA_MILESTONES.includes(key);
    const cur = (/** @type {string} */ key) =>
        key === 'date_debut'
            ? dep.date_debut
                ? { date: dep.date_debut }
                : null
            : key === 'mise_en_service' || key === 'mise_en_production'
              ? /** @type {any} */ (dep)['date_' + key]
                  ? { date: /** @type {any} */ (dep)['date_' + key] }
                  : null
              : periods[key] && periods[key][0]
                ? { start: periods[key][0].start, end: periods[key][0].end }
                : null;
    const rubriques = ASANA_KEYS.map(key => ({
        key,
        label: key === 'date_debut' ? 'Début du projet' : svc.stageLabel(key),
        kind: isDate(key) ? 'date' : 'period',
        rule: asanaRuleText(key, modele),
        current: cur(key),
        auto: key === 'date_debut' ? (auto.demarDate ? { date: auto.demarDate } : null) : auto.found[key] || null,
        sources: c0.sources[key] || [],
        override: ov[key] || null
    }));
    const taskList = complet.map((/** @type {any} */ t) => ({
        gid: t.gid,
        name: t.name,
        code: t.code,
        parent: t.parent,
        start: t.start,
        due: t.due,
        eff: asanaEff(complet, t)
    }));
    res.json({
        samu: dep.samu_name,
        asana: projectName,
        gid: match.gid,
        url: match.permalink_url,
        candidates: candidates.map((/** @type {any} */ x) => ({ gid: x.gid, name: x.name })),
        interroge: true,
        tasks: taskList,
        rubriques,
        overridden: c1.overridden || []
    });
}

/** Remplacements manuels des tâches Asana d'un déploiement, puis réimport des rubriques modifiées */
export async function saveOverrides(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const dep = await svc.getProject(id);
    if (!dep) throw notFound('Déploiement introuvable');
    const raw = (req.body && req.body.overrides) || {};
    const g = (/** @type {unknown} */ v) => (/^\d{3,30}$/.test(String(v || '')) ? String(v) : null);
    /** @type {Record<string, any>} */
    const clean = {};
    for (const key of ASANA_KEYS) {
        const sp = raw[key];
        if (!sp) continue;
        const o =
            key === 'date_debut' ||
            key === 'mise_en_service' ||
            key === 'mise_en_production' ||
            ASANA_MILESTONES.includes(key)
                ? g(sp.task)
                    ? { task: g(sp.task) }
                    : null
                : g(sp.start) || g(sp.end)
                  ? { ...(g(sp.start) ? { start: g(sp.start) } : {}), ...(g(sp.end) ? { end: g(sp.end) } : {}) }
                  : null;
        if (o) clean[key] = o;
    }
    const all = await jsonSetting('asana_task_overrides');
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
    const { projectName, tasks: list } = await asanaFetchProject(token, match.gid);
    const c = asanaComputeTasks(list, projectName);
    const keys = changedKeys(await asanaPreviewPayload(c, id));
    if (!keys.length) return res.json({ success: true, unchanged: true, samu_name: dep.samu_name, asana: projectName });
    const r = await asanaApplyCore(req, c, keys, id, 'api');
    res.json({ ...r, updated: keys.length, asana: projectName });
}

/** Projets Asana parmi lesquels choisir le projet type (tout le périmètre, sans filtre sur le nom) */
export async function templateProjects(/** @type {Request} */ req, /** @type {Response} */ res) {
    const list = await asanaProjectList(await asanaToken());
    res.json({
        projects: list
            .map((/** @type {any} */ p) => ({ gid: String(p.gid), name: String(p.name) }))
            .sort((/** @type {any} */ a, /** @type {any} */ b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
    });
}

/** Choix du projet Asana type : ses tâches deviennent les choix de la liste des activités Asana */
export async function saveTemplate(/** @type {Request} */ req, /** @type {Response} */ res) {
    const gid = String((req.body && req.body.gid) || '');
    if (!gid) {
        await asanaPut(ASANA_TEMPLATE_KEY, 'null');
        logUserAction(req, 'Projet Asana type retiré', {});
        res.json({ success: true, template: null });
        return;
    }
    const { projectName, tasks } = await asanaFetchProject(await asanaToken(), gid, { allSubtasks: true });
    const tpl = { gid, name: projectName, tasks: asanaTemplateChoices(tasks) };
    await asanaPut(ASANA_TEMPLATE_KEY, JSON.stringify(tpl));
    logUserAction(req, 'Projet Asana type choisi', { gid, name: projectName, taches: tpl.tasks.length });
    res.json({ success: true, template: tpl });
}
