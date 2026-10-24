// @ts-check
// CRA des MAD volantes : lignes reprises de la planification (activités, planning d'astreinte)
// et report vers la planification des corrections faites dans le CRA.
import { prisma } from '../../db/prisma.js';
import { idParam } from '../../db/values.js';
import { forbidden, notFound } from '../../lib/http-error.js';
import { samuNumber } from '../../lib/samu.js';
import { monthBounds } from './cra.service.js';

/** Objet des lignes CRA selon le code d'activité de la planification */
export const CRA_ACTIVITY_OBJETS = /** @type {Record<string, string>} */ ({
    3: 'SAMU (Déploiement)',
    4: 'SAMU (Dev. usages)',
    5: 'ANS (Déploiement)',
    6: 'ANS (Dev. usages)',
    7: 'Qualification',
    8: 'Divers'
});

/** Horaires d'une demi-journée (ou journée complète) collectée */
const halfHours = (/** @type {string} */ p) =>
    p === 'FULL' ? ['09:00', '18:00'] : p === 'AM' ? ['09:00', '12:00'] : ['14:00', '18:00'];

/** Préfixe des clés de la planification pour le mois (« AAAA-MM-») */
const monthPrefix = (/** @type {{ annee: number, mois: number }} */ cra) => monthBounds(cra).start.slice(0, 8);

/**
 * Demi-journées d'activité réelle (code ≥ 3) avec disponibilité ANS, indexées par clé « AAAA-MM-JJ_AM »
 * @param {number} resourceId
 * @param {string} prefix
 */
async function plannedHalfDays(resourceId, prefix) {
    const rows = await prisma.scheduleData.findMany({
        where: {
            resource_id: resourceId,
            date_key: { startsWith: prefix },
            type: { in: ['activity', 'available', 'localisation'] }
        },
        select: { date_key: true, type: true, value: true },
        orderBy: [{ date_key: 'asc' }, { id: 'asc' }]
    });
    /** @type {Record<string, Record<string, string>>} */
    const byKey = {};
    for (const r of rows) (byKey[r.date_key] ??= {})[r.type] = r.value;
    return Object.keys(byKey)
        .sort()
        .map(key => ({ key, ...byKey[key] }))
        .filter(c => c.activity && parseInt(c.activity) >= 3 && c.available === '2');
}

/**
 * CRA et ressource de l'expert pour la collecte : propriétaire ou administrateur uniquement
 * @param {unknown} id
 * @param {{ userId: number, isAdmin: boolean }} viewer
 */
export async function loadForCollect(id, { userId, isAdmin }) {
    const cra = await prisma.cra.findUnique({ where: { id: idParam(id) } });
    if (!cra) throw notFound('CRA introuvable');
    if (!isAdmin && cra.user_id !== userId) throw forbidden('Accès interdit');
    const user = await prisma.user.findUnique({ where: { id: cra.user_id }, select: { resource_id: true } });
    const resourceId = user ? (user.resource_id ?? cra.resource_id) : null;
    const resource =
        resourceId != null
            ? await prisma.resource.findUnique({
                  where: { id: resourceId },
                  select: { id: true, is_mad_volante: true }
              })
            : null;
    return { cra, resourceId: resource ? resource.id : null, isMad: !!resource?.is_mad_volante };
}

/**
 * Lignes proposées pour le CRA : activités de la planification (journée complète si matin et après-midi
 * identiques) puis créneaux du planning d'astreinte (soir 18h-08h, journée)
 * @param {{ annee: number, mois: number }} cra
 * @param {number} resourceId
 */
export async function collectLines(cra, resourceId) {
    const prefix = monthPrefix(cra);
    /** @type {Record<string, string>} */
    const samuByNo = {};
    for (const l of await prisma.location.findMany({ select: { libelle_court: true }, orderBy: { id: 'asc' } })) {
        const n = samuNumber(l.libelle_court);
        if (n && !samuByNo[n]) samuByNo[n] = l.libelle_court;
    }
    /** @type {Record<string, Record<string, { act: string, samu: string }>>} */
    const days = {};
    for (const c of await plannedHalfDays(resourceId, prefix)) {
        const [date, half] = c.key.split('_');
        const samu =
            c.activity === '3' || c.activity === '4'
                ? samuByNo[/** @type {any} */ (samuNumber(c.localisation))] || ''
                : '';
        (days[date] ??= {})[half] = { act: c.activity, samu };
    }

    const lines = [];
    for (const date of Object.keys(days).sort()) {
        const d = days[date];
        const full = d.AM && d.PM && d.AM.act === d.PM.act && d.AM.samu === d.PM.samu;
        /** @type {Array<[string, { act: string, samu: string }]>} */
        const parts = full
            ? [['FULL', d.AM]]
            : /** @type {any} */ (
                  [
                      ['AM', d.AM],
                      ['PM', d.PM]
                  ].filter(x => x[1])
              );
        for (const [period, v] of parts) {
            const [hd, hf] = halfHours(period);
            lines.push({
                type: 'activite_courante',
                date_debut: date,
                date_fin: date,
                heure_debut: hd,
                heure_fin: hf,
                samu: v.samu,
                objet: CRA_ACTIVITY_OBJETS[v.act] || 'Activité',
                origin: { kind: 'activity', date, period, activity: v.act, samu: v.samu }
            });
        }
    }

    const roster = await prisma.astreintePlanning.findMany({
        where: { resource_id: resourceId, date: { startsWith: prefix } },
        select: { date: true, type_creneau: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });
    for (const a of roster) {
        const next = new Date(Date.parse(a.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
        const sameMonth = next.startsWith(prefix);
        const soir = a.type_creneau === 'soir';
        lines.push({
            type: 'astreinte',
            date_debut: a.date,
            date_fin: soir && sameMonth ? next : a.date,
            heure_debut: soir ? '18:00' : '08:00',
            heure_fin: soir ? (sameMonth ? '08:00' : '23:59') : '18:00',
            samu: '',
            objet: soir ? 'Astreinte (soir 18h-08h)' : 'Astreinte (journée)',
            origin: { kind: 'astreinte', date: a.date, creneau: a.type_creneau }
        });
    }
    return lines;
}

/**
 * Lignes d'activité courante pré-remplies au lancement du CRA d'une MAD volante :
 * une ligne par demi-journée, fusionnée en journée complète si le matin et l'après-midi ont le même objet
 * @param {{ user_id: number, resource_id: number }} expert
 * @param {{ annee: number, mois: number }} month
 */
export async function prefillMadLines(expert, month) {
    const blocs = (await plannedHalfDays(expert.resource_id, monthPrefix(month))).map(c => {
        const [date, period] = c.key.split('_');
        return { date, period, objet: CRA_ACTIVITY_OBJETS[c.activity] || 'Activité' };
    });
    const merged = [];
    for (let i = 0; i < blocs.length; i++) {
        const b = blocs[i];
        const next = blocs[i + 1];
        if (b.period === 'AM' && next && next.date === b.date && next.period === 'PM' && next.objet === b.objet) {
            merged.push({ date: b.date, heure_debut: '08:00', heure_fin: '18:00', objet: b.objet });
            i++;
        } else {
            const am = b.period === 'AM';
            merged.push({
                date: b.date,
                heure_debut: am ? '08:00' : '13:00',
                heure_fin: am ? '12:00' : '18:00',
                objet: b.objet
            });
        }
    }
    await prisma.astreinteHno.createMany({
        data: merged.map(m => ({
            user_id: expert.user_id,
            type: 'activite_courante',
            date_debut: m.date,
            date_fin: m.date,
            heure_debut: m.heure_debut,
            heure_fin: m.heure_fin,
            objet: m.objet
        }))
    });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Demi-journées couvertes par des horaires */
function halvesOf(/** @type {string | undefined} */ hd, /** @type {string | undefined} */ hf) {
    const h = (/** @type {string | undefined} */ s) => Number((s || '00:00').slice(0, 2));
    return h(hf) <= 12 ? ['AM'] : h(hd) >= 13 ? ['PM'] : ['AM', 'PM'];
}

/**
 * Report vers la planification des corrections du CRA (lignes collectées modifiées ou supprimées)
 * @param {{ id: number, annee: number, mois: number }} cra
 * @param {number} resourceId
 * @param {unknown} corrections [{ origin, line | null }]
 */
export async function propagate(cra, resourceId, corrections) {
    const prefix = monthPrefix(cra);
    const out = { activity: 0, astreinte: 0, skipped: /** @type {string[]} */ ([]) };
    const setCell = (/** @type {string} */ date_key, /** @type {string} */ type, /** @type {string} */ value) =>
        prisma.scheduleData.upsert({
            where: { resource_id_date_key_type: { resource_id: resourceId, date_key, type } },
            create: { resource_id: resourceId, date_key, type, value, notification: '1' },
            update: { value, notification: '1' }
        });

    for (const c of Array.isArray(corrections) ? corrections : []) {
        const o = c.origin || {};
        if (!DATE.test(o.date || '') || !o.date.startsWith(prefix)) continue;
        const nl = c.line; // null = ligne supprimée
        if (o.kind === 'activity') {
            if (nl && !(DATE.test(nl.date_debut) && nl.date_debut === nl.date_fin)) {
                out.skipped.push(`${o.date} : activité étalée sur plusieurs jours, non reportée`);
                continue;
            }
            // Retour « en attente d'affectation »
            for (const h of o.period === 'FULL' ? ['AM', 'PM'] : [o.period])
                await setCell(`${o.date}_${h}`, 'activity', '2');
            if (nl) {
                for (const h of halvesOf(nl.heure_debut, nl.heure_fin)) {
                    await setCell(`${nl.date_debut}_${h}`, 'available', '2');
                    await setCell(`${nl.date_debut}_${h}`, 'activity', String(o.activity));
                    if (o.samu) {
                        await setCell(
                            `${nl.date_debut}_${h}`,
                            'localisation',
                            '🚨 ' + String(o.samu).replace(/^SAMU-SAS/, 'SAMU')
                        );
                    }
                }
            }
            out.activity++;
        } else if (o.kind === 'astreinte') {
            if (nl && nl.date_debut === o.date) continue; // seules les heures changent : le créneau du planning reste identique
            if (nl) {
                const taken = await prisma.astreintePlanning.findUnique({
                    where: { date_type_creneau: { date: String(nl.date_debut), type_creneau: String(o.creneau) } },
                    select: { resource_id: true }
                });
                if (taken?.resource_id && taken.resource_id !== resourceId) {
                    out.skipped.push(`${nl.date_debut} : créneau d'astreinte déjà tenu par un(e) autre expert`);
                    continue;
                }
            }
            await prisma.astreintePlanning.updateMany({
                where: { date: o.date, type_creneau: String(o.creneau), resource_id: resourceId },
                data: { resource_id: null }
            });
            if (nl) {
                const d = new Date(nl.date_debut + 'T00:00:00Z');
                await prisma.astreintePlanning.upsert({
                    where: { date_type_creneau: { date: String(nl.date_debut), type_creneau: String(o.creneau) } },
                    create: {
                        date: String(nl.date_debut),
                        type_creneau: String(o.creneau),
                        resource_id: resourceId,
                        year: d.getUTCFullYear(),
                        month: d.getUTCMonth() + 1
                    },
                    update: { resource_id: resourceId }
                });
            }
            out.astreinte++;
        }
    }
    return out;
}
