// Aide à l'affectation : déploiements, étapes, disponibilités, liens avec les événements et la planification
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';
import { samuNumber as affSamuNumber } from '../../lib/samu.js';
import { logUserAction } from '../../services/action-log.js';

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

export function affIsoDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}

// Motifs applicables en plus de la couleur (« gel » reste hachuré par défaut, comme avant)
export const AFF_PATTERNS = ['none', 'diag', 'diag2', 'chevron', 'grid', 'dots', 'cross', 'hlines', 'vlines', 'zigzag'];

export function affPatterns(cb) {
    database.get(`SELECT value FROM settings WHERE key = 'affectation_patterns'`, (err, row) => {
        let saved = {};
        try {
            saved = row ? JSON.parse(row.value) : {};
        } catch (e) {
            saved = {};
        }
        const out = {};
        AFF_STAGES.forEach(st => {
            out[st.key] = AFF_PATTERNS.includes(saved[st.key]) ? saved[st.key] : st.key === 'gel' ? 'diag' : 'none';
        });
        cb(out);
    });
}

export function affColors(cb) {
    database.get(`SELECT value FROM settings WHERE key = 'affectation_colors'`, (err, row) => {
        let saved = {};
        try {
            saved = row ? JSON.parse(row.value) : {};
        } catch (e) {
            saved = {};
        }
        const colors = {};
        AFF_STAGES.forEach(st => {
            colors[st.key] = /^#[0-9a-fA-F]{6}$/.test(saved[st.key] || '') ? saved[st.key] : st.color;
        });
        cb(colors);
    });
}

// Validation : toutes les dates doivent être postérieures ou égales à la date de début du projet
export function sanitizeAffProject(b) {
    if (!b || typeof b !== 'object') return { error: 'Données invalides' };
    const samu = String(b.samu_name || '').trim();
    if (!samu) return { error: 'Le nom du SAMU est obligatoire' };
    if (samu.length > 120) return { error: 'Nom du SAMU trop long' };
    if (!affIsoDate(b.date_debut)) return { error: 'La date de début du projet est obligatoire' };
    const debut = b.date_debut;
    const after = (d, label) =>
        d >= debut ? null : `${label} : la date ne peut pas précéder le début du projet (${debut})`;

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
        const label = AFF_STAGES.find(s => s.key === key).label;
        if (!affIsoDate(v)) return { error: `${label} : date invalide` };
        const e = after(v, label);
        if (e) return { error: e };
        out['date_' + key] = v;
    }
    const src = b.periods && typeof b.periods === 'object' ? b.periods : {};
    for (const key of AFF_PERIOD_KEYS) {
        const def = AFF_STAGES.find(s => s.key === key);
        const list = (Array.isArray(src[key]) ? src[key] : []).filter(p => p && (p.start || p.end));
        if (def.kind === 'period' && list.length > 1) return { error: `${def.label} : une seule période est possible` };
        if (list.length > 10) return { error: `${def.label} : trop de périodes` };
        const clean = [];
        for (const p of list) {
            if (!affIsoDate(p.start) || !affIsoDate(p.end))
                return { error: `${def.label} : renseignez la date de début et la date de fin` };
            if (p.end < p.start) return { error: `${def.label} : la date de fin précède la date de début` };
            const e = after(p.start, def.label);
            if (e) return { error: e };
            const item = { start: p.start, end: p.end };
            if (def.resources) {
                const n = Number(p.needed);
                if (!Number.isInteger(n) || n < 1 || n > 10)
                    return { error: `${def.label} : indiquez le nombre de ressources nécessaires (1 à 10)` };
                item.needed = n;
            }
            clean.push(item);
        }
        if (clean.length) out.periods[key] = clean;
    }
    return { value: out };
}

export function affLoadAssignments(cb) {
    database.all(
        'SELECT project_id, stage_key, resource_id FROM affectation_assignments ORDER BY id',
        [],
        (err, rows) => {
            const map = {};
            (rows || []).forEach(a => {
                ((map[a.project_id] = map[a.project_id] || {})[a.stage_key] =
                    (map[a.project_id] || {})[a.stage_key] || []).push(a.resource_id);
            });
            cb(map);
        }
    );
}

// Après modification d'un projet : retire les affectations devenues sans objet (étape supprimée ou nombre de ressources réduit)
export function affReconcileAssignments(projectId, periods, cb) {
    database.all(
        'SELECT id, stage_key FROM affectation_assignments WHERE project_id = ? ORDER BY id',
        [projectId],
        (err, rows) => {
            if (err || !rows || !rows.length) return cb();
            const counts = {};
            const toDelete = [];
            rows.forEach(a => {
                const needed = periods[a.stage_key] && periods[a.stage_key][0] ? periods[a.stage_key][0].needed : 0;
                counts[a.stage_key] = (counts[a.stage_key] || 0) + 1;
                if (!needed || counts[a.stage_key] > needed) toDelete.push(a.id);
            });
            if (!toDelete.length) return cb();
            database.run(
                `DELETE FROM affectation_assignments WHERE id IN (${toDelete.map(() => '?').join(',')})`,
                toDelete,
                () => cb()
            );
        }
    );
}

export function affRowToJson(r, assignments) {
    let periods = {};
    try {
        periods = JSON.parse(r.periods || '{}');
    } catch (e) {
        periods = {};
    }
    return {
        id: r.id,
        samu_name: r.samu_name,
        location_id: r.location_id,
        chef_projet_id: r.chef_projet_id,
        chef_projet_nom: r.chef_nom ? `${r.chef_nom} ${r.chef_prenom || ''}`.trim() : null,
        date_debut: r.date_debut,
        date_mise_en_service: r.date_mise_en_service,
        date_mise_en_production: r.date_mise_en_production,
        periods,
        assignments: (assignments && assignments[r.id]) || {},
        updated_at: r.updated_at,
        from_asana: !!r.from_asana
    };
}

export const AFF_SELECT = `SELECT p.*, u.nom AS chef_nom, u.prenom AS chef_prenom, EXISTS(SELECT 1 FROM affectation_history h WHERE h.project_id = p.id AND h.action IN ('import_asana_csv','import_asana_api')) AS from_asana FROM affectation_projects p LEFT JOIN users u ON u.id = p.chef_projet_id`;

// Système expert (v1) : disponibilité de chaque ressource sur la période d'une étape, d'après la planification (schedule_data).
// available : 1 indisponible, 2 disponible ANS, 3 congés. activity : 1 indisponible, 2 en attente d'affectation, 3/4 SAMU, 5-8 ANS/qualification/divers.
// Disponibilité des ressources sur la période d'une étape (demi-journées ouvrées) d'après la planification
export async function affComputeAvailability(row, stageKey) {
    let periods = {};
    try {
        periods = JSON.parse(row.periods || '{}');
    } catch (e) {
        periods = {};
    }
    const per = periods[stageKey] && periods[stageKey][0];
    if (!per) throw Object.assign(new Error('Étape sans période'), { status: 400 });
    const samuNo = affSamuNumber(row.samu_name);
    const rows = await dbAll(
        `SELECT resource_id, date_key, type, value FROM schedule_data
                  WHERE type IN ('available','activity','localisation') AND date_key >= ? AND date_key <= ?`,
        [per.start, per.end + '_ZZ']
    );
    const slots = {};
    rows.forEach(r => {
        const day = r.date_key.slice(0, 10);
        const dow = new Date(day + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6) return;
        ((slots[r.resource_id] = slots[r.resource_id] || {})[r.date_key] = slots[r.resource_id][r.date_key] || {})[
            r.type
        ] = r.value;
    });
    let total = 0;
    for (let t = Date.parse(per.start + 'T00:00:00Z'); t <= Date.parse(per.end + 'T00:00:00Z'); t += 86400000) {
        const dow = new Date(t).getUTCDay();
        if (dow !== 0 && dow !== 6) total += 2;
    }
    const out = {};
    Object.entries(slots).forEach(([rid, days]) => {
        const st = { free: 0, here: 0, other: 0, ans: 0, off: 0, leave: 0, others: [] };
        const otherSet = new Set();
        Object.values(days).forEach(d => {
            const act = d.activity,
                av = d.available;
            if (av === '3') st.leave++;
            else if (av === '1' || act === '1') st.off++;
            else if (act === '3' || act === '4')
                affSamuNumber(d.localisation) === samuNo && samuNo
                    ? st.here++
                    : (st.other++,
                      otherSet.add(
                          String(d.localisation || 'SAMU')
                              .replace(/^[^A-Za-z0-9]+/, '')
                              .trim()
                      ));
            else if (['5', '6', '7', '8'].includes(act)) st.ans++;
            else if (av === '2') st.free++; // disponible ANS, activité 2 ou non renseignée
        });
        st.others = [...otherSet].sort();
        out[rid] = st;
    });
    return { total, availability: out, per };
}

export const AFF_STAGE_EVENT = {
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
};

// Correspondance entre les activités issues d'Asana (étapes avec ressources) et les types d'événements :
// détermine le type, l'icône, le libellé court et les couleurs des événements créés par la synchronisation vers la planification.
export const AFF_STAGE_TYPE_KEY = 'aff_stage_event_types';

export const AFF_STAGE_TYPE_DEFAULT = {
    mise_en_service: 'mes',
    mise_en_production: 'mep',
    visite_metier: 'visiteMetier',
    test_prerequis: 'verifPrereq',
    vft: 'vftSite',
    formation_utilisateurs: 'formation',
    accompagnement: 'apd'
}; // codes de types

export const AFF_EVENT_KEYS = [
    'mise_en_service',
    'mise_en_production',
    'visite_metier',
    'test_prerequis',
    'vft',
    'formation_utilisateurs',
    'accompagnement'
]; // activités reliées à des événements

export async function affStageTypeMap() {
    let saved = {};
    try {
        saved =
            JSON.parse(
                ((await dbGet('SELECT value FROM settings WHERE key = ?', [AFF_STAGE_TYPE_KEY])) || {}).value || '{}'
            ) || {};
    } catch (e) {
        saved = {};
    }
    const types = await dbAll('SELECT id, code FROM event_types');
    const out = {};
    for (const st of AFF_STAGES.filter(x => AFF_EVENT_KEYS.includes(x.key))) {
        const sv = Number(saved[st.key]);
        const byId = types.find(t => t.id === sv);
        const def = types.find(t => t.code === AFF_STAGE_TYPE_DEFAULT[st.key]) || types.find(t => t.code === 'autre');
        out[st.key] = (byId || def || {}).id || null;
    }
    return out;
}

export const AFF_EVLINK_KEY = 'aff_event_links';

export async function affEventLinks(depId) {
    try {
        const all = JSON.parse(
            ((await dbGet('SELECT value FROM settings WHERE key = ?', [AFF_EVLINK_KEY])) || {}).value || '{}'
        );
        return all[String(depId)] || {};
    } catch (e) {
        return {};
    }
}

export async function affSetEventLink(depId, key, eventId) {
    let all = {};
    try {
        all = JSON.parse(
            ((await dbGet('SELECT value FROM settings WHERE key = ?', [AFF_EVLINK_KEY])) || {}).value || '{}'
        );
    } catch (e) {
        all = {};
    }
    const cur = (all[String(depId)] = all[String(depId)] || {});
    if (eventId) cur[key] = eventId;
    else delete cur[key];
    if (!Object.keys(cur).length) delete all[String(depId)];
    await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [AFF_EVLINK_KEY, JSON.stringify(all)]);
}

// Lieu d'un déploiement : sa localisation, à défaut l'entité du même nom, puis celle du même numéro de SAMU (« SAMU-SAS 56 »)
export async function affProjectLocationId(proj) {
    if (proj.location_id) return proj.location_id;
    const exact = await dbGet('SELECT id FROM locations WHERE libelle_court = ?', [proj.samu_name]);
    if (exact) return exact.id;
    const no = affSamuNumber(proj.samu_name);
    if (!no) return null;
    const locs = await dbAll('SELECT id, libelle_court FROM locations');
    const loc =
        locs.find(l => affSamuNumber(l.libelle_court) === no && /SAS/i.test(l.libelle_court)) ||
        locs.find(l => affSamuNumber(l.libelle_court) === no);
    return loc ? loc.id : null;
}

export const affNormTxt = t =>
    String(t || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

// Événements concernés : celui relié explicitement, sinon ceux du même lieu et du même type qui recoupent la période de l'activité.
// On ajoute seulement (jamais de retrait) et dans la limite du nombre de ressources nécessaires.
export async function affStageEvents(proj, key, per, links, map, types, locId) {
    const evs = [];
    const linked = links[key] ? await dbGet('SELECT id FROM custom_events WHERE id = ?', [links[key]]) : null;
    if (linked) evs.push(linked.id);
    if (locId && per) {
        const t = types.find(x => x.id === map[key]);
        const tpl = (AFF_STAGE_EVENT[key] || {}).label;
        const legacy = [t && t.label_long, tpl].filter(Boolean).map(affNormTxt);
        const rows = await dbAll(
            'SELECT id, label, type_id FROM custom_events WHERE location_id = ? AND start_date <= ? AND end_date >= ?',
            [locId, per.end, per.start]
        );
        rows.forEach(e => {
            if (
                (e.type_id ? e.type_id === (t && t.id) : legacy.some(l => affNormTxt(e.label).startsWith(l))) &&
                !evs.includes(e.id)
            )
                evs.push(e.id);
        });
    }
    return evs;
}

export async function affSyncStageFromEvents(req, proj, key, ctx) {
    let periods = {};
    try {
        periods = JSON.parse(proj.periods || '{}');
    } catch (e) {
        periods = {};
    }
    const per = periods[key] && periods[key][0];
    if (!per || !per.needed) return { added: [] };
    const links = await affEventLinks(proj.id);
    const evs = await affStageEvents(proj, key, per, links, ctx.map, ctx.types, ctx.locId);
    if (!evs.length) return { added: [] };
    const parts = await dbAll(
        `SELECT DISTINCT u.resource_id AS rid FROM custom_event_participants cep JOIN users u ON u.id = cep.user_id JOIN resources r ON r.id = u.resource_id
        WHERE cep.event_id IN (${evs.map(() => '?').join(',')}) AND u.resource_id IS NOT NULL AND r.actif = 1`,
        evs
    );
    const cur = (
        await dbAll(
            'SELECT resource_id FROM affectation_assignments WHERE project_id = ? AND stage_key = ? ORDER BY id',
            [proj.id, key]
        )
    ).map(x => x.resource_id);
    const toAdd = parts
        .map(x => x.rid)
        .filter(r => !cur.includes(r))
        .slice(0, Math.max(0, per.needed - cur.length));
    if (!toAdd.length) return { added: [] };
    for (const rid of toAdd)
        await dbRun('INSERT INTO affectation_assignments (project_id, stage_key, resource_id) VALUES (?,?,?)', [
            proj.id,
            key,
            rid
        ]);
    const names = Object.fromEntries(
        (
            await dbAll(
                `SELECT id, nom, prenom FROM resources WHERE id IN (${[...cur, ...toAdd].map(() => '?').join(',')})`,
                [...cur, ...toAdd]
            )
        ).map(r => [r.id, `${r.prenom || ''} ${(r.nom || '').toUpperCase()}`.trim()])
    );
    const list = a => a.map(i => names[i] || `#${i}`).join(', ') || '—';
    await affHist(req, proj.id, proj.samu_name, 'affectation', {
        changes: [
            {
                label: `${AFF_STAGES.find(x => x.key === key).label} — ressources (depuis les participants de l'événement)`,
                from: list(cur),
                to: list([...cur, ...toAdd])
            }
        ]
    });
    return { added: toAdd };
}

export async function affSyncAllFromEvents(req, onlyProjectId) {
    const ctx = { map: await affStageTypeMap(), types: await dbAll('SELECT * FROM event_types') };
    const projs = await dbAll(
        onlyProjectId ? 'SELECT * FROM affectation_projects WHERE id = ?' : 'SELECT * FROM affectation_projects',
        onlyProjectId ? [onlyProjectId] : []
    );
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

export async function affEventSnapshot(eventId) {
    const ev = await dbGet(
        `SELECT ce.id, ce.label, ce.start_date, ce.end_date, ce.period, ce.location_id, l.libelle_court AS loc FROM custom_events ce LEFT JOIN locations l ON l.id = ce.location_id WHERE ce.id = ?`,
        [eventId]
    );
    if (!ev) return null;
    const rows = await dbAll(
        `SELECT u.resource_id AS rid FROM custom_event_participants cep JOIN users u ON u.id = cep.user_id WHERE cep.event_id = ? AND u.resource_id IS NOT NULL`,
        [eventId]
    );
    return { ...ev, resourceIds: [...new Set(rows.map(r => r.rid))] };
}

// Seules les demi-journées posées par l'affectation sur ce SAMU (activité 3 ou 4 + localisation de ce SAMU) sont remises en situation : le reste de la planification n'est pas touché
export async function affResetPlanningForEvent(snap, req) {
    if (!snap) return 0;
    const n = await affResetPlanning({
        resourceIds: snap.resourceIds,
        start: snap.start_date,
        end: snap.end_date,
        period: snap.period,
        samuNo: affSamuNumber(snap.loc)
    });
    if (n)
        logUserAction(req, "Planification remise en situation après suppression d'un événement", {
            evenement: snap.id,
            label: snap.label,
            demiJournees: n
        });
    return n;
}

export async function affResetPlanning(snap) {
    if (!snap || !snap.resourceIds.length) return 0;
    const samuNo = snap.samuNo;
    if (!samuNo) return 0;
    const halves = snap.period === 'AM' ? ['AM'] : snap.period === 'PM' ? ['PM'] : ['AM', 'PM'];
    let n = 0;
    for (const rid of snap.resourceIds) {
        for (let t = Date.parse(snap.start + 'T00:00:00Z'); t <= Date.parse(snap.end + 'T00:00:00Z'); t += 86400000) {
            const dow = new Date(t).getUTCDay();
            if (dow === 0 || dow === 6) continue;
            const day = new Date(t).toISOString().slice(0, 10);
            for (const h of halves) {
                const key = `${day}_${h}`;
                const cells = await dbAll(
                    `SELECT type, value FROM schedule_data WHERE resource_id = ? AND date_key = ? AND type IN ('activity','localisation')`,
                    [rid, key]
                );
                const act = (cells.find(c => c.type === 'activity') || {}).value,
                    loc = (cells.find(c => c.type === 'localisation') || {}).value;
                if (!(act === '3' || act === '4') || affSamuNumber(loc) !== samuNo) continue;
                const up = (type, value) =>
                    dbRun(
                        `INSERT INTO schedule_data (resource_id, date_key, type, value, notification) VALUES (?,?,?,?, '1') ON CONFLICT(resource_id, date_key, type) DO UPDATE SET value = excluded.value, notification = '1'`,
                        [rid, key, type, value]
                    );
                await up('available', '2');
                await up('activity', '2');
                await dbRun(
                    `DELETE FROM schedule_data WHERE resource_id = ? AND date_key = ? AND type IN ('localisation', 'author')`,
                    [rid, key]
                );
                n++;
            }
        }
    }
    return n;
}

export async function affSyncCompute(projectId, stageKey) {
    const def = AFF_STAGES.find(x => x.key === stageKey && x.resources);
    if (!def) throw Object.assign(new Error('Étape sans ressources'), { status: 400 });
    const proj = await dbGet('SELECT * FROM affectation_projects WHERE id = ?', [projectId]);
    if (!proj) throw Object.assign(new Error('Projet introuvable'), { status: 404 });
    let periods = {};
    try {
        periods = JSON.parse(proj.periods || '{}');
    } catch (e) {
        periods = {};
    }
    const per = periods[stageKey] && periods[stageKey][0];
    if (!per) throw Object.assign(new Error('Étape sans période'), { status: 400 });
    const samuNo = affSamuNumber(proj.samu_name);
    const samuLoc = '🚨 SAMU ' + (samuNo || String(proj.samu_name || '').trim());
    let locationId = proj.location_id;
    if (!locationId) {
        const loc = await dbGet('SELECT id FROM locations WHERE libelle_court = ?', [proj.samu_name]);
        locationId = loc ? loc.id : null;
    }
    const assigned = await dbAll(
        `SELECT a.resource_id AS id, r.nom, r.prenom, u.id AS user_id
        FROM affectation_assignments a JOIN resources r ON r.id = a.resource_id LEFT JOIN users u ON u.resource_id = r.id AND u.actif = 1
        WHERE a.project_id = ? AND a.stage_key = ? ORDER BY r.nom`,
        [projectId, stageKey]
    );
    const rows = assigned.length
        ? await dbAll(
              `SELECT resource_id, date_key, type, value FROM schedule_data
        WHERE type IN ('available','activity','localisation') AND date_key >= ? AND date_key <= ? AND resource_id IN (${assigned.map(() => '?').join(',')})`,
              [per.start, per.end + '_ZZ', ...assigned.map(a => a.id)]
          )
        : [];
    const cells = {};
    rows.forEach(r => {
        ((cells[r.resource_id] = cells[r.resource_id] || {})[r.date_key] = cells[r.resource_id][r.date_key] || {})[
            r.type
        ] = r.value;
    });
    const act = AFF_STAGE_ACTIVITY[stageKey] || '3';
    const resources = assigned.map(a => {
        const toWrite = [],
            conflicts = [];
        let done = 0;
        for (let t = Date.parse(per.start + 'T00:00:00Z'); t <= Date.parse(per.end + 'T00:00:00Z'); t += 86400000) {
            const dow = new Date(t).getUTCDay();
            if (dow === 0 || dow === 6) continue;
            const day = new Date(t).toISOString().slice(0, 10);
            ['AM', 'PM'].forEach(h => {
                const key = `${day}_${h}`,
                    c = (cells[a.id] || {})[key] || {};
                if ((c.activity === '3' || c.activity === '4') && affSamuNumber(c.localisation) === samuNo) {
                    done++;
                    return;
                }
                if (c.available === '3') conflicts.push({ key, reason: 'Congés' });
                else if (c.available === '1' || c.activity === '1') conflicts.push({ key, reason: 'Indisponible' });
                else if (c.activity === '3' || c.activity === '4')
                    conflicts.push({
                        key,
                        reason:
                            'Affecté(e) à ' + String(c.localisation || 'un autre SAMU').replace(/^[^A-Za-z0-9]+/, '')
                    });
                else if (['5', '6', '7', '8'].includes(c.activity))
                    conflicts.push({ key, reason: 'Activité ANS (' + c.activity + ')' });
                else toWrite.push(key);
            });
        }
        return { id: a.id, nom: a.nom, prenom: a.prenom, user_id: a.user_id, toWrite, done, conflicts };
    });
    const tpl = AFF_STAGE_EVENT[stageKey];
    const typeId = (await affStageTypeMap())[stageKey];
    const evType = typeId ? await dbGet('SELECT * FROM event_types WHERE id = ?', [typeId]) : null;
    const evLabel = evType ? evType.label_long : tpl.label;
    const evConfig = evType
        ? { bgColor: evType.bg_color, textColor: evType.text_color, borderColor: evType.border_color }
        : tpl.config;
    // Événement déjà présent : même lieu, même période, même type (ou ancien libellé du gabarit pour les événements sans type)
    const existing = await dbAll(
        `SELECT id, label, start_date, end_date FROM custom_events
        WHERE location_id IS ? AND (type_id = ? OR label LIKE ? OR label LIKE ?) AND start_date <= ? AND end_date >= ?`,
        [locationId, typeId || -1, tpl.label + '%', evLabel + '%', per.end, per.start]
    );
    let existingEvent = null;
    if (existing.length) {
        const parts = await dbAll('SELECT user_id FROM custom_event_participants WHERE event_id = ?', [existing[0].id]);
        existingEvent = { ...existing[0], participants: parts.map(x => x.user_id) };
    }
    return {
        proj,
        per,
        samuLoc,
        samuNo,
        locationId,
        activity: act,
        resources,
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

export const AFF_STAGE_ACTIVITY = {
    visite_metier: '3',
    test_prerequis: '3',
    vft: '3',
    formation_utilisateurs: '3',
    accompagnement: '3'
};

export const affFd = d => (d ? String(d).split('-').reverse().join('/') : '—');

export const affFp = p =>
    p
        ? `${affFd(p.start)} → ${affFd(p.end)}${p.needed ? ` (${p.needed} ressource${p.needed > 1 ? 's' : ''})` : ''}`
        : '—';

export function affValuesOfRow(r) {
    let periods = {};
    try {
        periods = r.periodsObj || JSON.parse(r.periods || '{}');
    } catch (e) {
        periods = {};
    }
    return {
        samu_name: r.samu_name,
        chef_projet_id: r.chef_projet_id,
        date_debut: r.date_debut,
        date_mise_en_service: r.date_mise_en_service,
        date_mise_en_production: r.date_mise_en_production,
        periods
    };
}

// Différences entre deux états d'un déploiement (avant peut être null à la création)
export async function affDiff(before, after) {
    const ch = [];
    const push = (label, from, to) => {
        if (String(from) !== String(to)) ch.push({ label, from: String(from), to: String(to) });
    };
    const nameOf = async id => {
        if (!id) return '—';
        const u = await dbGet('SELECT nom, prenom FROM users WHERE id = ?', [id]);
        return u ? `${u.prenom} ${u.nom}` : `#${id}`;
    };
    push('Nom du SAMU', before ? before.samu_name : '—', after.samu_name);
    push('Chef de projet', await nameOf(before && before.chef_projet_id), await nameOf(after.chef_projet_id));
    push('Début du projet', affFd(before && before.date_debut), affFd(after.date_debut));
    push('Mise en service', affFd(before && before.date_mise_en_service), affFd(after.date_mise_en_service));
    push('Mise en production', affFd(before && before.date_mise_en_production), affFd(after.date_mise_en_production));
    for (const k of AFF_PERIOD_KEYS) {
        const f = list => (list || []).map(affFp).join(' ; ') || '—';
        push(
            AFF_STAGES.find(x => x.key === k).label,
            f(before && before.periods && before.periods[k]),
            f(after.periods && after.periods[k])
        );
    }
    return ch;
}

export async function affHist(req, projectId, samuName, action, details) {
    try {
        const sess = (req && req.session) || {};
        const who = `${sess.prenom || ''} ${sess.nom || ''}`.trim() || sess.username || 'Utilisateur';
        await dbRun(
            'INSERT INTO affectation_history (project_id, samu_name, user_id, user_name, action, details) VALUES (?,?,?,?,?,?)',
            [projectId, samuName || '', sess.userId || null, who, action, JSON.stringify(details || {})]
        );
    } catch (e) {
        console.error('Historique du déploiement :', e.message);
    }
}

export function affSaveProject(req, res, id) {
    const r = sanitizeAffProject(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    const v = r.value;
    let beforeVals = null;
    const done = (err, newId) => {
        if (err) return res.status(500).json({ error: err.message });
        affReconcileAssignments(newId, v.periods, () => {
            database.get(`${AFF_SELECT} WHERE p.id = ?`, [newId], async (e, row) => {
                if (e || !row) return res.status(500).json({ error: e ? e.message : 'Projet introuvable' });
                logUserAction(req, id ? 'Modification déploiement SAMU' : 'Création déploiement SAMU', {
                    id: newId,
                    samu: v.samu_name
                });
                const changes = await affDiff(beforeVals, v);
                if (!id || changes.length)
                    await affHist(req, newId, v.samu_name, id ? 'modification' : 'creation', { changes });
                affLoadAssignments(map => res.json(affRowToJson(row, map)));
            });
        });
    };
    const fields = [
        v.samu_name,
        v.location_id,
        v.chef_projet_id,
        v.date_debut,
        v.date_mise_en_service,
        v.date_mise_en_production,
        JSON.stringify(v.periods)
    ];
    const run = () => {
        if (id) {
            database.run(
                `UPDATE affectation_projects SET samu_name=?, location_id=?, chef_projet_id=?, date_debut=?, date_mise_en_service=?, date_mise_en_production=?, periods=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                [...fields, id],
                function (err) {
                    if (!err && this.changes === 0) return res.status(404).json({ error: 'Projet introuvable' });
                    done(err, id);
                }
            );
        } else {
            database.run(
                `INSERT INTO affectation_projects (samu_name, location_id, chef_projet_id, date_debut, date_mise_en_service, date_mise_en_production, periods, created_by) VALUES (?,?,?,?,?,?,?,?)`,
                [...fields, req.session.userId],
                function (err) {
                    done(err, this && this.lastID);
                }
            );
        }
    };
    if (!id) return run();
    database.get('SELECT * FROM affectation_projects WHERE id = ?', [id], (e, old) => {
        if (old) beforeVals = affValuesOfRow(old);
        run();
    });
}

// Événements liés à un déploiement : reliés explicitement, ou du même lieu / type sur la période d'une activité
export async function affLinkedEvents(proj) {
    const locId = await affProjectLocationId(proj);
    const map = await affStageTypeMap(),
        types = await dbAll('SELECT * FROM event_types'),
        links = await affEventLinks(proj.id);
    let periods = {};
    try {
        periods = JSON.parse(proj.periods || '{}');
    } catch (e) {
        periods = {};
    }
    const ids = new Set();
    for (const key of AFF_EVENT_KEYS) {
        const per =
            key === 'mise_en_service' || key === 'mise_en_production'
                ? proj['date_' + key]
                    ? { start: proj['date_' + key], end: proj['date_' + key] }
                    : null
                : periods[key] && periods[key][0];
        (await affStageEvents(proj, key, per, links, map, types, locId)).forEach(id => ids.add(id));
    }
    const out = [];
    for (const id of ids) {
        const snap = await affEventSnapshot(id);
        if (snap) out.push(snap);
    }
    return out.sort((a, b) => a.start_date.localeCompare(b.start_date));
}
