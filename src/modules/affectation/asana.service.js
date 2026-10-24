// Aide à l'affectation : import des déploiements depuis Asana (CSV et API)
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env as appEnv } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { logUserAction } from '../../services/action-log.js';
import { getSetting, setSetting } from '../../services/settings.js';
import {
    AFF_PERIOD_KEYS,
    AFF_STAGES,
    affDiff,
    affHist,
    affReconcileAssignments,
    affValuesOfRow,
    sanitizeAffProject,
    writeProject
} from './affectation.service.js';

export function parseCsv(text) {
    const rows = [];
    let row = [],
        cell = '',
        q = false;
    const src = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (q) {
            if (c === '"') {
                if (src[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else q = false;
            } else cell += c;
        } else if (c === '"') q = true;
        else if (c === ',') {
            row.push(cell);
            cell = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++;
            row.push(cell);
            cell = '';
            if (row.some(x => x !== '')) rows.push(row);
            row = [];
        } else cell += c;
    }
    row.push(cell);
    if (row.some(x => x !== '')) rows.push(row);
    return rows;
}

export const asanaNorm = t =>
    String(t || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[’‘]/g, "'")
        .toLowerCase();

export const asanaAddDays = (iso, n) =>
    new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// Tâches Asana d'un export CSV, au format commun (le même que celui produit par l'API)
export function asanaTasksFromCsv(csvText) {
    const rows = parseCsv(csvText);
    if (rows.length < 2) throw new HttpError(400, 'Fichier vide ou illisible');
    const head = rows[0].map(h => h.trim());
    const col = n => head.indexOf(n);
    const iName = col('Name'),
        iSec = col('Section/Column'),
        iStart = col('Start Date'),
        iDue = col('Due Date'),
        iParent = col('Parent task'),
        iProj = col('Projects'),
        iPhase = col('Phase');
    if (iName < 0 || iDue < 0)
        throw new HttpError(
            400,
            'Ce fichier ne ressemble pas à un export de tâches Asana (colonnes « Name » et « Due Date » introuvables)'
        );
    const isoOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    const tasks = rows
        .slice(1)
        .map(r => ({
            name: (r[iName] || '').trim(),
            section: (r[iSec] || '').trim(),
            start: isoOk(r[iStart]) ? r[iStart] : '',
            due: isoOk(r[iDue]) ? r[iDue] : '',
            parent: iParent >= 0 ? (r[iParent] || '').trim() : '',
            projects: iProj >= 0 ? r[iProj] || '' : '',
            phase: iPhase >= 0 ? (r[iPhase] || '').trim().toUpperCase() : ''
        }))
        .filter(t => t.name);
    let projectName = '';
    for (const t of tasks) {
        const m = /\[SAMU\s*([0-9A-Za-z]+)\]/i.exec(t.projects);
        if (m) {
            projectName = t.projects.split(',').find(x => /\[SAMU/i.test(x)) || '';
            break;
        }
    }
    return { tasks, projectName: projectName.trim() };
}

export const asanaSamuNoOf = text => {
    const m = /\[SAMU\s*([0-9A-Za-z]+)\]/i.exec(String(text || ''));
    return m ? m[1].toUpperCase() : null;
};

// Calcule les dates de chaque étape à partir des tâches Asana, selon la correspondance convenue
// Dates effectives d'une tâche : les siennes, sinon celles de ses sous-tâches (plus petite à plus grande date)
export function asanaEff(tasks, t) {
    if (t.start || t.due) return { start: t.start || t.due, end: t.due || t.start };
    const kids = tasks.filter(k => k.parent && k.parent === t.name && (k.start || k.due));
    if (!kids.length) return null;
    const all = kids.flatMap(k => [k.start, k.due].filter(Boolean)).sort();
    return { start: all[0], end: all[all.length - 1] };
}

// Règles de correspondance Asana → planning (métier) :
//  Début du projet / début du cadrage  = jalon « Démarrage projet auprès de l'ES »     Fin du cadrage = tâche 2.9
//  Déploiement opérationnel            = de la fin du cadrage + 1 jour au jalon « Mise en service du bandeau »
//  Mise en service / mise en production = jalons « Mise en service du bandeau » / « Mise en production du bandeau »
//  Visite métier = 5.1 · VFT sur site = 5.9 · Formation utilisateurs = 6.3.4 · Accompagnement post démarrage = 6.6
//  Vérification des prérequis = tâche à créer dans Asana (« Vérification / Test des prérequis »)
export function asanaComputeTasks(tasks, projectName, formationTarget) {
    tasks.forEach(t => {
        const m = /^\s*(\d+(?:\.\d+)*)\.?\s/.exec(t.name);
        t.code = m ? m[1] : '';
        t.n = asanaNorm(t.name);
    });
    let samuNo = asanaSamuNoOf(projectName);
    if (!samuNo)
        for (const t of tasks) {
            const m = /SAMU\s+(\d+[A-Za-z]?)\b/i.exec(t.name);
            if (m) {
                samuNo = m[1].toUpperCase();
                break;
            }
        }

    const eff = t => asanaEff(tasks, t);
    const span = list => {
        const ds = list
            .map(eff)
            .filter(Boolean)
            .flatMap(e => [e.start, e.end])
            .sort();
        return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null;
    };
    const byCode = c => tasks.filter(t => t.code === c);
    const found = {},
        reasons = {},
        sources = {};
    const setP = (key, list, why) => {
        const v = span(list);
        if (v) {
            found[key] = v;
            sources[key] = list.map(t => t.name);
        } else reasons[key] = why;
    };

    // Début du projet = début du cadrage : jalon « Démarrage projet auprès de l'ES »
    const demar =
        tasks.find(t => t.n.includes("demarrage projet aupres de l'es")) ||
        tasks.find(t => t.n.includes('demarrage projet'));
    const demarDate = demar && eff(demar) ? eff(demar).end : null;
    if (demarDate) sources.date_debut = [demar.name];

    // Cadrage : du jalon de démarrage à la fin de la tâche 2.9
    const t29 = byCode('2.9'),
        cadEnd = span(t29);
    if (demarDate && cadEnd) {
        found.cadrage = { start: demarDate, end: cadEnd.end >= demarDate ? cadEnd.end : demarDate };
        sources.cadrage = [demar.name, ...t29.map(t => t.name)];
    } else
        reasons.cadrage = demarDate
            ? 'fin de cadrage (tâche 2.9) non datée dans Asana'
            : "jalon « Démarrage projet auprès de l'ES » non daté ou absent";

    const mes = tasks.find(t => t.n.includes('mise en service du bandeau')) || tasks.find(t => t.phase === 'MES');
    const mep = tasks.find(t => t.n.includes('mise en production du bandeau')) || tasks.find(t => t.phase === 'MEP');
    const mesD = mes && eff(mes) ? eff(mes).end : null,
        mepD = mep && eff(mep) ? eff(mep).end : null;
    if (mesD) {
        found.mise_en_service = { date: mesD };
        sources.mise_en_service = [mes.name];
    } else reasons.mise_en_service = 'jalon « Mise en service du bandeau » non daté ou absent';
    if (mepD) {
        found.mise_en_production = { date: mepD };
        sources.mise_en_production = [mep.name];
    } else reasons.mise_en_production = 'jalon « Mise en production du bandeau » non daté ou absent';

    // Déploiement opérationnel : fin du cadrage (2.9) + 1 jour → jalon « Mise en service du bandeau »
    if (found.cadrage && mesD && asanaAddDays(found.cadrage.end, 1) <= mesD) {
        found.deploiement = { start: asanaAddDays(found.cadrage.end, 1), end: mesD };
        sources.deploiement = [...(sources.cadrage || []).slice(1), mes.name];
    } else
        reasons.deploiement = !found.cadrage
            ? 'dépend de la fin du cadrage, non datée'
            : !mesD
              ? 'dépend de la mise en service, non datée'
              : 'la mise en service précède la fin du cadrage';

    setP('visite_metier', byCode('5.1'), 'tâche 5.1 non datée ou absente dans Asana');
    const tp = tasks.filter(t => /(tests?|verifications?) des prerequis/.test(t.n));
    setP(
        'test_prerequis',
        tp,
        tp.length
            ? 'tâche « Vérification des prérequis » non datée'
            : 'aucune tâche « Vérification des prérequis » dans ce projet Asana (à créer)'
    );
    setP('vft', byCode('5.9'), 'tâche 5.9 (VFT sur site) non datée ou absente dans Asana');
    setP(
        'formation_utilisateurs',
        byCode('6.3.4'),
        'tâche 6.3.4 (formation utilisateurs) non datée ou absente dans Asana'
    );
    setP('accompagnement', byCode('6.6'), 'tâche 6.6 (accompagnement post démarrage) non datée ou absente dans Asana');
    return { samuNo, projectName, taskCount: tasks.length, demarDate, found, reasons, sources, tasks };
}

// Remplacements manuels : une rubrique peut prendre ses dates d'une autre tâche du projet Asana (mémorisés par déploiement)
//  date : { task: gid }   période : { start: gid, end: gid }
export function asanaApplyOverrides(c, ov) {
    if (!ov || !c || !c.tasks) return c;
    const byGid = new Map(c.tasks.filter(t => t.gid).map(t => [t.gid, t]));
    const E = gid => {
        const t = gid && byGid.get(String(gid));
        return t ? asanaEff(c.tasks, t) : null;
    };
    const has = k => ov[k] && (ov[k].task || ov[k].start || ov[k].end);
    for (const [key, spec] of Object.entries(ov)) {
        if (!ASANA_KEYS.includes(key) || !spec) continue;
        if (key === 'date_debut') {
            const e = E(spec.task);
            if (e) c.demarDate = e.end;
        } else if (key === 'mise_en_service' || key === 'mise_en_production') {
            const e = E(spec.task);
            if (e) {
                c.found[key] = { date: e.end };
                delete c.reasons[key];
            }
        } else {
            const es = E(spec.start),
                ee = E(spec.end);
            if (es || ee) {
                const cur = c.found[key] || {};
                let start = es ? es.start : cur.start,
                    end = ee ? ee.end : cur.end;
                if (!start) start = end;
                if (!end) end = start;
                if (end < start) [start, end] = [end, start];
                c.found[key] = { start, end };
                delete c.reasons[key];
            }
        }
    }
    // Rubriques liées recalculées si elles ne sont pas remplacées elles-mêmes
    if (has('date_debut') && c.demarDate && !(ov.cadrage && ov.cadrage.start) && c.found.cadrage)
        c.found.cadrage.start = c.demarDate;
    if (
        !has('deploiement') &&
        c.found.cadrage &&
        c.found.mise_en_service &&
        asanaAddDays(c.found.cadrage.end, 1) <= c.found.mise_en_service.date
    ) {
        c.found.deploiement = { start: asanaAddDays(c.found.cadrage.end, 1), end: c.found.mise_en_service.date };
        delete c.reasons.deploiement;
    }
    c.overridden = Object.keys(ov).filter(k => has(k));
    return c;
}

export async function asanaOverridesFor(depId) {
    try {
        const all = JSON.parse((await asanaSetting('asana_task_overrides')) || '{}');
        return all[String(depId)] || null;
    } catch (e) {
        return null;
    }
}

export function asanaCompute(csvText, formationTarget) {
    const { tasks, projectName } = asanaTasksFromCsv(csvText);
    return asanaComputeTasks(tasks, projectName, formationTarget);
}

export async function asanaMatch(samuNo, forcedId) {
    const locs = await prisma.location.findMany({ select: { id: true, libelle_court: true }, orderBy: { id: 'asc' } });
    const loc =
        locs.find(l => affSamuNumber(l.libelle_court) === samuNo && /SAS/i.test(l.libelle_court)) ||
        locs.find(l => affSamuNumber(l.libelle_court) === samuNo) ||
        null;
    /** @type {any[]} */
    const all = await prisma.affectationProject.findMany({ orderBy: { id: 'asc' } });
    const existing =
        (forcedId && all.find(p => p.id === forcedId)) ||
        all.find(p => (loc && p.location_id === loc.id) || affSamuNumber(p.samu_name) === samuNo) ||
        null;
    if (existing) {
        try {
            existing.periodsObj = JSON.parse(existing.periods || '{}');
        } catch (e) {
            existing.periodsObj = {};
        }
    }
    return { loc, existing };
}

export const ASANA_KEYS = [
    'date_debut',
    'cadrage',
    'deploiement',
    'mise_en_service',
    'mise_en_production',
    'visite_metier',
    'test_prerequis',
    'vft',
    'formation_utilisateurs',
    'accompagnement'
];

export const asanaFr = d => (d ? d.split('-').reverse().join('/') : '');

export const asanaFmt = v => (!v ? '' : v.date ? asanaFr(v.date) : `${asanaFr(v.start)} → ${asanaFr(v.end)}`);

export async function asanaPreviewPayload(c, forcedId) {
    const { loc, existing } = await asanaMatch(c.samuNo, forcedId);
    if (existing) asanaApplyOverrides(c, await asanaOverridesFor(existing.id));
    const rows = ASANA_KEYS.map(key => {
        const label = key === 'date_debut' ? 'Début du projet' : AFF_STAGES.find(s => s.key === key).label;
        let cur = null,
            neu = null;
        if (key === 'date_debut') {
            cur = existing ? { date: existing.date_debut } : null;
            neu = c.demarDate ? { date: c.demarDate } : null;
        } else if (key === 'mise_en_service' || key === 'mise_en_production') {
            cur = existing && existing['date_' + key] ? { date: existing['date_' + key] } : null;
            neu = c.found[key] || null;
        } else {
            const p = existing && existing.periodsObj[key] && existing.periodsObj[key][0];
            cur = p ? { start: p.start, end: p.end } : null;
            neu = c.found[key] || null;
        }
        const same = cur && neu && asanaFmt(cur) === asanaFmt(neu);
        const reason =
            key === 'date_debut'
                ? neu
                    ? ''
                    : "tâche « Démarrage projet auprès de l'ES » non datée"
                : c.reasons[key] || '';
        return {
            key,
            label,
            old: asanaFmt(cur),
            new: asanaFmt(neu),
            status: !neu ? 'absent' : same ? 'identique' : cur ? 'modifié' : 'nouveau',
            reason
        };
    });
    return {
        samuNo: c.samuNo,
        projectName: c.projectName,
        taskCount: c.taskCount,
        samuName: loc ? loc.libelle_court : `SAMU ${c.samuNo}`,
        locationFound: !!loc,
        existing: existing ? { id: existing.id, samu_name: existing.samu_name } : null,
        rows
    };
}

export async function asanaApplyCore(req, c, wantList, forcedId, source) {
    const want = new Set((Array.isArray(wantList) ? wantList : []).filter(k => ASANA_KEYS.includes(k)));
    if (!want.size) throw new HttpError(400, 'Aucune ligne sélectionnée');
    const { loc, existing } = await asanaMatch(c.samuNo, forcedId);
    if (existing) asanaApplyOverrides(c, await asanaOverridesFor(existing.id));
    const base = existing
        ? {
              samu_name: existing.samu_name,
              location_id: existing.location_id || (loc ? loc.id : null),
              chef_projet_id: existing.chef_projet_id,
              date_debut: existing.date_debut,
              date_mise_en_service: existing.date_mise_en_service,
              date_mise_en_production: existing.date_mise_en_production,
              periods: JSON.parse(JSON.stringify(existing.periodsObj))
          }
        : {
              samu_name: loc ? loc.libelle_court : `SAMU ${c.samuNo}`,
              location_id: loc ? loc.id : null,
              chef_projet_id: null,
              date_debut: null,
              date_mise_en_service: null,
              date_mise_en_production: null,
              periods: {}
          };
    if (want.has('date_debut') && c.demarDate) base.date_debut = c.demarDate;
    ['mise_en_service', 'mise_en_production'].forEach(k => {
        if (want.has(k) && c.found[k]) base['date_' + k] = c.found[k].date;
    });
    AFF_PERIOD_KEYS.forEach(k => {
        if (!want.has(k) || !c.found[k]) return;
        const def = AFF_STAGES.find(s => s.key === k);
        const old = base.periods[k] && base.periods[k][0];
        const item = { start: c.found[k].start, end: c.found[k].end };
        if (def.resources) item.needed = (old && old.needed) || 1; // nombre de ressources : conservé, à défaut 1 (à ajuster)
        base.periods[k] = [item];
    });
    // Le début du projet ne peut pas être postérieur à une autre date : on le ramène à la plus ancienne
    const dates = [
        base.date_debut,
        base.date_mise_en_service,
        base.date_mise_en_production,
        ...Object.values(base.periods)
            .flat()
            .map(p => p.start)
    ]
        .filter(Boolean)
        .sort();
    if (!dates.length) throw new HttpError(400, 'Aucune date exploitable');
    const debutAvant = base.date_debut;
    base.date_debut = dates[0];
    const r = sanitizeAffProject(base);
    if (r.error) throw new HttpError(400, r.error);
    const v = r.value;
    const id = existing
        ? (await writeProject(existing.id, v, null), existing.id)
        : /** @type {number} */ (await writeProject(null, v, req.session.userId));
    await affReconcileAssignments(id, v.periods);
    const changes = await affDiff(existing ? affValuesOfRow(existing) : null, v);
    if (changes.length)
        await affHist(req, id, v.samu_name, source === 'api' ? 'import_asana_api' : 'import_asana_csv', {
            changes,
            note: c.projectName ? `Projet Asana « ${c.projectName.trim()} »` : ''
        });
    logUserAction(req, 'Import Asana dans un déploiement SAMU', { id, samu: v.samu_name, appliquees: [...want] });
    return {
        success: true,
        id,
        created: !existing,
        samu_name: v.samu_name,
        date_debut: v.date_debut,
        debutAjuste: !!debutAvant && debutAvant !== v.date_debut,
        changes
    };
}

// Le jeton est chiffré (AES-256-GCM) avec une clé propre au serveur : il ne figure donc pas en clair dans la base ni dans un dump.
export function asanaKey() {
    const keyFile = path.join(appEnv.DB_PATH, '.asana_key');
    try {
        return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
    } catch (e) {
        /* première utilisation */
    }
    const k = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, k.toString('hex'), { mode: 0o600 });
    return k;
}

export function asanaEncrypt(plain) {
    const iv = crypto.randomBytes(12),
        c = crypto.createCipheriv('aes-256-gcm', asanaKey(), iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}

export function asanaDecrypt(blob) {
    try {
        const [iv, tag, enc] = String(blob)
            .split(':')
            .map(x => Buffer.from(x, 'hex'));
        const d = crypto.createDecipheriv('aes-256-gcm', asanaKey(), iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
    } catch (e) {
        return null;
    }
}

export const asanaSetting = getSetting;

export const asanaPut = setSetting;

export async function asanaToken() {
    const blob = await asanaSetting('asana_token_enc');
    const t = blob ? asanaDecrypt(blob) : null;
    if (!t)
        throw new HttpError(
            400,
            'Jeton Asana non configuré (ou illisible sur ce serveur) : saisissez-le dans la configuration Asana'
        );
    return t;
}

export async function asanaApi(token, pathQuery) {
    let r;
    try {
        r = await fetch(appEnv.ASANA_API_BASE + pathQuery, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(25000)
        });
    } catch (e) {
        throw new HttpError(
            502,
            'Asana injoignable depuis le serveur (réseau ou pare-feu) : ' + ((e.cause && e.cause.code) || e.message)
        );
    }
    if (!r.ok) {
        let msg = '';
        try {
            const b = await r.json();
            msg = b.errors && b.errors[0] && b.errors[0].message;
        } catch (e) {
            /* corps non JSON */
        }
        const text =
            r.status === 401
                ? 'Jeton Asana refusé ou expiré'
                : r.status === 403
                  ? 'Accès refusé par Asana à cette ressource'
                  : r.status === 429
                    ? 'Trop de requêtes vers Asana : réessayez dans une minute'
                    : `Erreur Asana ${r.status}`;
        throw new HttpError(r.status === 401 ? 400 : 502, text + (msg ? ` — ${msg}` : ''));
    }
    return r.json();
}

export async function asanaPaged(token, pathQuery) {
    const out = [];
    let offset = '';
    for (let i = 0; i < 60; i++) {
        // garde-fou : 60 pages de 100
        const sep = pathQuery.includes('?') ? '&' : '?';
        const b = await asanaApi(
            token,
            `${pathQuery}${sep}limit=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`
        );
        out.push(...(b.data || []));
        if (b.next_page && b.next_page.offset) offset = b.next_page.offset;
        else break;
    }
    return out;
}

export const asanaNormTask = (t, projectName, parentName) => {
    const cf = (t.custom_fields || []).find(f => asanaNorm(f.name) === 'phase');
    const section = (t.memberships || []).map(m => m.section && m.section.name).find(Boolean) || '';
    return {
        gid: String(t.gid || ''),
        name: String(t.name || '').trim(),
        section,
        start: t.start_on || '',
        due: t.due_on || '',
        parent: parentName || (t.parent && t.parent.name) || '',
        projects: projectName,
        phase: cf
            ? String(cf.display_value || (cf.enum_value && cf.enum_value.name) || '')
                  .trim()
                  .toUpperCase()
            : ''
    };
};

export const ASANA_TASK_FIELDS =
    'name,start_on,due_on,num_subtasks,parent.name,memberships.section.name,custom_fields.name,custom_fields.display_value';

export async function asanaFetchProject(token, gid) {
    const proj = (await asanaApi(token, `/projects/${encodeURIComponent(gid)}?opt_fields=name`)).data;
    const raw = await asanaPaged(token, `/projects/${encodeURIComponent(gid)}/tasks?opt_fields=${ASANA_TASK_FIELDS}`);
    const tasks = raw.map(t => asanaNormTask(t, proj.name));
    // Sous-tâches : uniquement pour les tâches parentes sans date propre (leurs dates servent de repli)
    for (const t of raw.filter(x => x.num_subtasks > 0 && !x.start_on && !x.due_on)) {
        const subs = await asanaPaged(
            token,
            `/tasks/${encodeURIComponent(t.gid)}/subtasks?opt_fields=name,start_on,due_on,custom_fields.name,custom_fields.display_value`
        );
        subs.forEach(st => tasks.push(asanaNormTask(st, proj.name, String(t.name || '').trim())));
    }
    return { projectName: proj.name, tasks };
}

// Projets Asana du périmètre : ceux de l'équipe choisie dans la configuration, à défaut tous ceux de l'espace de travail
export async function asanaProjectList(token) {
    const team = await asanaSetting('asana_team_gid');
    if (team)
        return await asanaPaged(
            token,
            `/teams/${encodeURIComponent(team)}/projects?archived=false&opt_fields=name,permalink_url`
        );
    const ws = await asanaSetting('asana_workspace_gid');
    if (!ws) throw new HttpError(400, "Choisissez d'abord l'espace de travail Asana");
    return await asanaPaged(
        token,
        `/projects?workspace=${encodeURIComponent(ws)}&archived=false&opt_fields=name,permalink_url`
    );
}

export async function asanaForcedId(gid) {
    try {
        const l = JSON.parse((await asanaSetting('asana_links')) || '{}');
        return l[gid] > 0 ? l[gid] : null;
    } catch (e) {
        return null;
    }
}

// Rafraîchit un déploiement depuis le projet Asana qui lui correspond (appairage manuel, sinon numéro de SAMU) : seules les rubriques nouvelles ou modifiées sont reprises
export async function asanaListSamuProjects(token) {
    const re = new RegExp((await asanaSetting('asana_name_filter')) || '\\[SAMU\\s*[^\\]]+\\]', 'i');
    const list = (await asanaProjectList(token)).filter(p => re.test(p.name));
    let links = {};
    try {
        links = JSON.parse((await asanaSetting('asana_links')) || '{}');
    } catch (e) {
        links = {};
    }
    return { list: list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })), links };
}

// Projet Asana d'un déploiement : d'abord celui qui lui est relié explicitement (appairage manuel ou dernier import), sinon un projet portant le même numéro de SAMU
export function asanaPickProject(ctx, dep) {
    const no = affSamuNumber(dep.samu_name);
    const explicit = ctx.list.find(p => ctx.links[p.gid] === dep.id);
    const auto = ctx.list.filter(
        p => !(ctx.links[p.gid] > 0) && ctx.links[p.gid] !== -1 && no && asanaSamuNoOf(p.name) === no
    );
    return { match: explicit || auto[0] || null, candidates: [...(explicit ? [explicit] : []), ...auto] };
}

export async function asanaRememberLink(gid, depId) {
    if (!gid || !depId) return;
    let links = {};
    try {
        links = JSON.parse((await asanaSetting('asana_links')) || '{}');
    } catch (e) {
        links = {};
    }
    if (links[gid] === -1 || links[gid] === depId) return;
    links[gid] = depId;
    await asanaPut('asana_links', JSON.stringify(links));
}

export async function asanaRefreshDeployment(req, token, ctx, dep) {
    const no = affSamuNumber(dep.samu_name);
    const match = asanaPickProject(ctx, dep).match;
    if (!match)
        throw Object.assign(
            new HttpError(
                404,
                `Aucun projet Asana associé à « ${dep.samu_name} » (vérifiez le nom du projet ou l'appairage dans Administration › Connexion Asana)`
            ),
            { noMatch: true }
        );
    const { projectName, tasks } = await asanaFetchProject(token, match.gid);
    const c = asanaComputeTasks(tasks, projectName);
    if (!c.samuNo) throw new HttpError(400, "Impossible d'identifier le SAMU dans le nom du projet Asana");
    const pv = await asanaPreviewPayload(c, dep.id);
    const keys = pv.rows.filter(r => r.status === 'nouveau' || r.status === 'modifié').map(r => r.key);
    if (!keys.length) return { success: true, unchanged: true, samu_name: dep.samu_name, asana: projectName };
    const r = await asanaApplyCore(req, c, keys, dep.id, 'api');
    return { ...r, updated: keys.length, asana: projectName };
}

// Tâches du projet Asana lié à un déploiement, rubriques reprises (règle / valeur actuelle) et remplacements manuels
export const ASANA_RULES = {
    date_debut: "Jalon « Démarrage projet auprès de l'ES »",
    cadrage: "Début : jalon « Démarrage projet auprès de l'ES » · Fin : tâche 2.9",
    deploiement: 'Début : fin du cadrage (2.9) + 1 jour · Fin : jalon « Mise en service du bandeau »',
    mise_en_service: 'Jalon contenant « Mise en service du bandeau »',
    mise_en_production: 'Jalon contenant « Mise en production du bandeau »',
    visite_metier: 'Tâche 5.1',
    test_prerequis: 'Tâche « Vérification des prérequis » (à créer dans Asana)',
    vft: 'Tâche 5.9',
    formation_utilisateurs: 'Tâche 6.3.4',
    accompagnement: 'Tâche 6.6'
};

export async function asanaFindProjectFor(token, dep) {
    const ctx = await asanaListSamuProjects(token);
    const { match, candidates } = asanaPickProject(ctx, dep);
    if (!match) throw new HttpError(404, `Aucun projet Asana associé à « ${dep.samu_name} »`);
    return { match, candidates };
}
