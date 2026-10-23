// Événements : types (couleurs, type « Autre ») et participants externes
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';

// Chaque type : libellé long, libellé court (affiché sur le planning et la carte), icône et gabarit de couleurs (fond / texte / bordure).
// « Autre(s) » (is_other = 1) est le type de repli : ni modifiable ni supprimable.
export const EVT_TYPE_SEED = [
    {
        code: 'formation',
        long: 'Formations utilisateurs',
        icon: 'graduation',
        bg: '#ffea00',
        text: '#0008ff',
        border: '#000000'
    },
    { code: 'mes', long: 'Mise en service', icon: 'power', bg: '#ffea00', text: '#d20906', border: '#000000' },
    { code: 'mep', long: 'Mise en production', icon: 'flag', bg: '#00695c', text: '#ffffff', border: '#004d40' },
    {
        code: 'apd',
        long: 'Accompagnement post démarrage',
        icon: 'lifebuoy',
        bg: '#ffea00',
        text: '#c2059a',
        border: '#000000'
    },
    { code: 'visite', long: 'Visite terrain', icon: 'pin', bg: '#0011ff', text: '#ffffff', border: '#000000' },
    {
        code: 'visiteMetier',
        long: 'Visite métier',
        icon: 'briefcase',
        bg: '#7b1fa2',
        text: '#ffffff',
        border: '#4a0072'
    },
    { code: 'congres', long: 'Congrès', icon: 'presentation', bg: '#dff0d8', text: '#427645', border: '#000000' },
    {
        code: 'vftSite',
        long: 'VFT sur site',
        icon: 'clipboardCheck',
        bg: '#2e7d32',
        text: '#ffffff',
        border: '#1b5e20'
    },
    {
        code: 'verifPrereq',
        long: 'Vérification des prérequis',
        icon: 'listChecks',
        bg: '#546e7a',
        text: '#ffffff',
        border: '#263238'
    },
    { code: 'visiteOb', long: 'Visite OB', icon: 'building', bg: '#e65100', text: '#ffffff', border: '#bf360c' },
    { code: 'visitePostMes', long: 'Visite post MES', icon: 'eye', bg: '#0277bd', text: '#ffffff', border: '#01579b' },
    {
        code: 'reunionLancement',
        long: 'Réunion de lancement stratégique',
        icon: 'rocket',
        bg: '#1565c0',
        text: '#ffffff',
        border: '#0d47a1'
    },
    { code: 'autre', long: 'Autre(s)', icon: 'tag', bg: '#ffeb3b', text: '#000000', border: '#000000', other: 1 }
];

// Alimente la liste des types : liste complète si la table est vide, « Autre(s) » toujours présent, « Mise en production » ajouté une fois aux anciennes bases.
// Rappelée après une restauration de dump (un dump ancien, sans types, vide la table).
export async function evtSeedTypes() {
    try {
        const row = await dbGet('SELECT COUNT(*) AS n FROM event_types');
        const seed = row && row.n === 0 ? EVT_TYPE_SEED : EVT_TYPE_SEED.filter(t => t.other);
        for (const [i, t] of seed.entries()) {
            // séquentiel : identifiants dans l'ordre de la liste
            await dbRun(
                `INSERT OR IGNORE INTO event_types (code, label_long, label_short, icon, bg_color, text_color, border_color, is_other, sort_order) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)`,
                [t.code, t.long, t.icon, t.bg, t.text, t.border, t.other ? 1 : 0, (i + 1) * 10]
            );
        }
        if (!(await dbGet("SELECT value FROM settings WHERE key = 'evt_type_mep_seeded'"))) {
            if (!(await dbGet("SELECT id FROM event_types WHERE code = 'mep'"))) {
                const mes = await dbGet("SELECT sort_order FROM event_types WHERE code = 'mes'");
                const t = EVT_TYPE_SEED.find(x => x.code === 'mep');
                await dbRun(
                    `INSERT OR IGNORE INTO event_types (code, label_long, label_short, icon, bg_color, text_color, border_color, is_other, sort_order) VALUES (?, ?, '', ?, ?, ?, ?, 0, ?)`,
                    [t.code, t.long, t.icon, t.bg, t.text, t.border, ((mes && mes.sort_order) || 20) + 5]
                );
            }
            await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('evt_type_mep_seeded', '1')");
        }
    } catch (x) {
        console.error('Erreur initialisation event_types:', x.message);
    }
}

export const EVT_HEX = /^#[0-9a-fA-F]{6}$/;

export async function evtOtherType() {
    return await dbGet('SELECT * FROM event_types WHERE is_other = 1 LIMIT 1');
}

// Type retenu pour un événement (création / changement de type) : repli sur « Autre(s) » ; les couleurs de l'événement suivent celles du type
export async function evtResolveType(typeId, config) {
    let t = Number(typeId) > 0 ? await dbGet('SELECT * FROM event_types WHERE id = ?', [Number(typeId)]) : null;
    if (!t) t = await evtOtherType();
    const cfg = Object.assign({}, config || {});
    if (t) {
        cfg.bgColor = t.bg_color;
        cfg.textColor = t.text_color;
        cfg.borderColor = t.border_color;
    }
    return { typeId: t ? t.id : null, config: cfg, type: t };
}

// Modification : sans type fourni (ancien client), l'événement garde son type actuel
export async function evtResolveForUpdate(eventId, typeId, config) {
    if (typeId === undefined || typeId === null || typeId === '') {
        const cur = await dbGet('SELECT type_id FROM custom_events WHERE id = ?', [eventId]);
        return { typeId: (cur && cur.type_id) || null, config };
    }
    return evtResolveType(typeId, config);
}

// Applique les couleurs d'un type à la configuration de tous les événements qui l'utilisent
export async function evtSyncColors(typeId) {
    const t = await dbGet('SELECT * FROM event_types WHERE id = ?', [typeId]);
    if (!t) return 0;
    const rows = await dbAll('SELECT id, config FROM custom_events WHERE type_id = ?', [typeId]);
    for (const r of rows) {
        let cfg = {};
        try {
            cfg = JSON.parse(r.config || '{}') || {};
        } catch (e) {
            cfg = {};
        }
        cfg.bgColor = t.bg_color;
        cfg.textColor = t.text_color;
        cfg.borderColor = t.border_color;
        await dbRun('UPDATE custom_events SET config = ? WHERE id = ?', [JSON.stringify(cfg), r.id]);
    }
    return rows.length;
}

export function evtTypeBody(b, forUpdate) {
    const long = String(b.label_long || '')
            .trim()
            .slice(0, 120),
        short = String(b.label_short || '')
            .trim()
            .slice(0, 40);
    if (!long) return { error: 'Le libellé long est obligatoire' };
    const icon = /^[A-Za-z0-9_]{1,40}$/.test(String(b.icon || '')) ? String(b.icon) : 'tag';
    const c = k => (EVT_HEX.test(String(b[k] || '')) ? String(b[k]).toLowerCase() : null);
    const bg = c('bg_color'),
        tx = c('text_color'),
        bd = c('border_color');
    if (!bg || !tx || !bd) return { error: 'Couleurs invalides (fond, texte et bordure attendus)' };
    return { value: { long, short, icon, bg, tx, bd } };
}

// Helper : sauvegarder participants externes d'un événement
export async function saveExternalParticipants(eventId, externalParticipants) {
    await new Promise((resolve, reject) => {
        database.run(`DELETE FROM custom_event_external_participants WHERE event_id = ?`, [eventId], err =>
            err ? reject(err) : resolve()
        );
    });
    if (Array.isArray(externalParticipants)) {
        for (const ep of externalParticipants) {
            if (!ep.nom && !ep.email) continue;
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO custom_event_external_participants (event_id, nom, prenom, email) VALUES (?, ?, ?, ?)`,
                    [eventId, ep.nom || null, ep.prenom || null, ep.email || null],
                    err => (err ? reject(err) : resolve())
                );
            });
        }
    }
}

// Helper : charger participants externes d'une liste d'événements
export async function loadExternalParticipants(eventIds) {
    if (!eventIds.length) return {};
    const rows = await new Promise((resolve, reject) => {
        database.all(
            `SELECT event_id, id, nom, prenom, email FROM custom_event_external_participants WHERE event_id IN (${eventIds.map(() => '?').join(',')}) ORDER BY nom, prenom`,
            eventIds,
            (err, rows) => (err ? reject(err) : resolve(rows || []))
        );
    });
    const byEvent = {};
    for (const r of rows) {
        if (!byEvent[r.event_id]) byEvent[r.event_id] = [];
        byEvent[r.event_id].push({ external: true, ext_id: r.id, nom: r.nom, prenom: r.prenom, email: r.email });
    }
    return byEvent;
}
