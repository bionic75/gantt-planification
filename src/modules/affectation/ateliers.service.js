// @ts-check
// Planification des ateliers métier : rétroplanning automatisé par SAMU (paramétrage, simulation, enregistrement, diffusion)
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { isEmail } from '../../lib/email.js';
import { badRequest, notFound } from '../../lib/http-error.js';
import { sendEmail } from '../../lib/mailer.js';
import { samuNumber } from '../../lib/samu.js';
import { getJsonSetting } from '../../services/settings.js';
import { zoneOfDepartment } from './ateliers.data.js';
import {
    addDays,
    computeRetroplanning,
    CONTENUS,
    DEFAULT_DELAI_MEP,
    DEFAULT_DELAI_VISITE,
    holidaysOfZone,
    isoDay,
    isValidDate,
    MAX_ATELIERS,
    MIN_ATELIERS,
    ZONES,
    validateInput
} from './ateliers.calc.js';

export const JALONS_ATELIER = Array.from({ length: MAX_ATELIERS }, (_, i) => `Atelier ${i + 1}`);

/** Vacances scolaires de la zone saisies ou importées dans l'application */
async function appHolidays(/** @type {string} */ zone) {
    const all = (await getJsonSetting('school_holidays')) || {};
    return Array.isArray(all[`zone${zone}`]) ? all[`zone${zone}`] : [];
}

const parseJson = (/** @type {string | null | undefined} */ text) => {
    try {
        return JSON.parse(text || '{}') || {};
    } catch {
        return {};
    }
};

/** Déploiements, référentiels et paramètres par défaut pour l'écran */
export async function meta() {
    const [projects, saved] = await Promise.all([
        prisma.affectationProject.findMany({
            select: {
                id: true,
                samu_name: true,
                date_mise_en_production: true,
                date_mise_en_service: true,
                periods: true
            },
            orderBy: { samu_name: 'asc' }
        }),
        prisma.atelierRetroplanning.findMany({ select: { samu_name: true } })
    ]);
    const savedNames = new Set(saved.map(s => s.samu_name.toLowerCase()));
    return {
        samus: projects
            .map(p => {
                return {
                    project_id: p.id,
                    samu_name: p.samu_name,
                    zone: zoneOfDepartment(samuNumber(p.samu_name)),
                    mep: p.date_mise_en_production || null,
                    saved: savedNames.has(p.samu_name.toLowerCase())
                };
            })
            .sort((a, b) => a.samu_name.localeCompare(b.samu_name, 'fr', { numeric: true })),
        contenus: CONTENUS,
        jalons: JALONS_ATELIER,
        zones: ZONES,
        defaults: { nb: 4, delaiVisite: DEFAULT_DELAI_VISITE, delaiMep: DEFAULT_DELAI_MEP },
        limites: { min: MIN_ATELIERS, max: MAX_ATELIERS }
    };
}

/** Nettoie les choix de lignes : jalons et contenus parmi les listes, dates valides */
function cleanLignes(/** @type {any} */ raw) {
    const jalons = /** @type {Record<string, string>} */ ({});
    const contenus = /** @type {Record<string, string>} */ ({});
    const planifiees = /** @type {Record<string, string>} */ ({});
    const src = raw && typeof raw === 'object' ? raw : {};
    for (let k = 1; k <= MAX_ATELIERS; k++) {
        const key = `a${k}`;
        if (JALONS_ATELIER.includes(src.jalons?.[key])) jalons[key] = src.jalons[key];
        if (CONTENUS.includes(src.contenus?.[key])) contenus[key] = src.contenus[key];
    }
    for (const key of ['visite', ...Array.from({ length: MAX_ATELIERS }, (_, i) => `a${i + 1}`), 'livrables', 'mep']) {
        if (isValidDate(src.planifiees?.[key])) planifiees[key] = src.planifiees[key];
    }
    return { jalons, contenus, planifiees };
}

/**
 * Paramètres d'un rétroplanning (corps de requête ou ligne enregistrée) → entrée du calcul
 * @param {any} b
 */
async function toInput(b) {
    const input = {
        mep: b.mep ?? b.mep_date,
        nb: Number(b.nb ?? b.nb_ateliers),
        zone: String(b.zone || '').toUpperCase(),
        delaiVisite: b.delaiVisite ?? b.delai_visite_atelier ?? DEFAULT_DELAI_VISITE,
        delaiMep: b.delaiMep ?? b.delai_mep ?? DEFAULT_DELAI_MEP
    };
    const error = validateInput(input);
    if (error) throw badRequest(error);
    const lignes = cleanLignes(b.lignes ?? b);
    return {
        ...input,
        delaiVisite: Number(input.delaiVisite),
        delaiMep: Number(input.delaiMep),
        holidays: holidaysOfZone(input.zone, await appHolidays(input.zone)),
        ...lignes
    };
}

/** Simulation : jalons, dates cibles et dates proposées pour les paramètres donnés */
export async function simulate(/** @type {any} */ body) {
    const input = await toInput(body || {});
    return computeRetroplanning(input);
}

/** Rétroplannings enregistrés, avec leurs jalons calculés */
export async function list() {
    const rows = await prisma.atelierRetroplanning.findMany({ orderBy: { samu_name: 'asc' } });
    return Promise.all(
        rows.map(async r => {
            const lignes = parseJson(r.lignes);
            const input = await toInput({ ...r, lignes });
            const { rows: jalons, warnings } = computeRetroplanning(input);
            return { ...r, lignes, jalons, warnings };
        })
    );
}

/** Création ou mise à jour (un rétroplanning par SAMU, choisi parmi les déploiements) */
export async function save(/** @type {any} */ body, /** @type {{ userId: number, name: string }} */ author) {
    const samu = String(body?.samu_name || '').trim();
    if (!samu) throw badRequest('Choisissez un SAMU');
    const project = (await prisma.affectationProject.findMany({ select: { id: true, samu_name: true } })).find(
        p => p.samu_name.toLowerCase() === samu.toLowerCase()
    );
    if (!project) throw badRequest('Ce SAMU ne figure pas dans la liste des déploiements');
    const input = await toInput(body);
    const data = {
        samu_name: project.samu_name,
        project_id: project.id,
        zone: input.zone,
        mep_date: input.mep,
        nb_ateliers: input.nb,
        delai_visite_atelier: input.delaiVisite,
        delai_mep: input.delaiMep,
        lignes: JSON.stringify({ jalons: input.jalons, contenus: input.contenus, planifiees: input.planifiees }),
        updated_at: sqlTimestamp()
    };
    const existing = await prisma.atelierRetroplanning.findUnique({ where: { samu_name: project.samu_name } });
    const row = existing
        ? await prisma.atelierRetroplanning.update({ where: { id: existing.id }, data })
        : await prisma.atelierRetroplanning.create({
              data: { ...data, created_by: author.userId, created_by_name: author.name }
          });
    return { id: row.id, created: !existing, samu_name: row.samu_name };
}

export async function remove(/** @type {unknown} */ id) {
    const row = await prisma.atelierRetroplanning.findUnique({ where: { id: idParam(id) } });
    if (!row) throw notFound('Rétroplanning introuvable');
    await prisma.atelierRetroplanning.delete({ where: { id: row.id } });
    return row.samu_name;
}

// ---------- Diffusion par e-mail ----------

const esc = (/** @type {unknown} */ v) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c
    );
const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const frDate = (/** @type {string | null} */ d) =>
    d ? `${DAYS[isoDay(d) - 1]} ${d.split('-').reverse().join('/')}` : '—';

/** Date retenue d'un jalon : date réellement planifiée, à défaut la date proposée */
const retenue = (/** @type {{ planifiee: string | null, proposee: string | null }} */ r) => r.planifiee || r.proposee;

function tableHtml(/** @type {Array<any>} */ jalons) {
    const th = 'padding:6px 8px;border:1px solid #cfd8dc;background:#eceff1;text-align:left;font-size:12px;';
    const td = 'padding:6px 8px;border:1px solid #cfd8dc;font-size:13px;vertical-align:top;';
    const body = jalons
        .map(
            r =>
                `<tr><td style="${td}font-weight:700;">${esc(r.jalon)}</td><td style="${td}">${esc(r.contenu)}</td><td style="${td}">${esc(frDate(r.cible))}</td><td style="${td}">${esc(frDate(r.proposee))}</td><td style="${td}font-weight:700;">${esc(frDate(r.planifiee))}</td><td style="${td}">${esc(r.statut)}</td></tr>`
        )
        .join('');
    return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;"><thead><tr><th style="${th}">Jalon</th><th style="${th}">Contenu / objectifs</th><th style="${th}">Date cible théorique</th><th style="${th}">Date proposée</th><th style="${th}">Date planifiée</th><th style="${th}">Statut</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** Calendrier (.ics) : un événement sur la journée entière par jalon, à la date retenue */
function icsOf(/** @type {string} */ samu, /** @type {Array<any>} */ jalons) {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const compact = (/** @type {string} */ d) => d.replace(/-/g, '');
    const text = (/** @type {string} */ s) =>
        s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const events = jalons
        .filter(r => retenue(r))
        .map(r => {
            const day = /** @type {string} */ (retenue(r));
            return [
                'BEGIN:VEVENT',
                `UID:atelier-${compact(day)}-${r.key}-${samu.replace(/\W+/g, '')}@planning-ans`,
                `DTSTAMP:${stamp}`,
                `DTSTART;VALUE=DATE:${compact(day)}`,
                `DTEND;VALUE=DATE:${compact(addDays(day, 1))}`,
                `SUMMARY:${text(`${samu} — ${r.jalon}`)}`,
                `DESCRIPTION:${text(r.contenu)}`,
                'TRANSP:TRANSPARENT',
                'END:VEVENT'
            ].join('\r\n');
        });
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Planification des ressources//Ateliers métier//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...events,
        'END:VCALENDAR'
    ].join('\r\n');
}

/**
 * Envoie le rétroplanning par e-mail (tableau + calendrier .ics en pièce jointe)
 * @param {unknown} id
 * @param {{ userIds?: unknown, emails?: unknown, subject?: unknown, message?: unknown, ics?: unknown }} body
 */
export async function send(id, body) {
    const row = await prisma.atelierRetroplanning.findUnique({ where: { id: idParam(id) } });
    if (!row) throw notFound('Rétroplanning introuvable');
    const userIds = (Array.isArray(body.userIds) ? body.userIds : [])
        .map(Number)
        .filter(n => Number.isInteger(n) && n > 0);
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds }, actif: 1 }, select: { email: true } })
        : [];
    /** @type {string[]} */
    const invalid = [];
    const extra = (Array.isArray(body.emails) ? body.emails : [])
        .map(e => String(e || '').trim())
        .filter(Boolean)
        .filter(e => (isEmail(e) ? true : (invalid.push(e), false)));
    if (invalid.length) throw badRequest(`Adresse(s) e-mail invalide(s) : ${invalid.join(', ')}`);
    const to = [
        ...new Map(
            [...users.map(u => u.email), ...extra].filter(e => isEmail(e)).map(e => [e.toLowerCase(), e])
        ).values()
    ];
    if (!to.length) throw badRequest('Choisissez au moins un destinataire');

    const lignes = parseJson(row.lignes);
    const input = await toInput({ ...row, lignes });
    const { rows: jalons, warnings } = computeRetroplanning(input);
    const subject = String(body.subject || '').trim() || `Rétroplanning des ateliers métier — ${row.samu_name}`;
    const message = String(body.message || '').trim();
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:900px;">
        <h2 style="color:#1d70b7;margin:0 0 8px;">Rétroplanning des ateliers métier — ${esc(row.samu_name)}</h2>
        <p style="margin:0 0 12px;">MEP : <strong>${esc(frDate(row.mep_date))}</strong> · ${row.nb_ateliers} ateliers · zone scolaire ${esc(row.zone)}</p>
        ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
        ${tableHtml(jalons)}
        ${warnings.length ? `<p style="color:#b26a00;font-size:12px;">⚠ ${warnings.map(esc).join('<br>⚠ ')}</p>` : ''}
        <p style="font-size:12px;color:#666;margin-top:14px;">Les dates proposées sont des jalons de planification à confirmer avec le SAMU et le chef de projet.${body.ics === false ? '' : ' Le calendrier (.ics) joint ajoute ces jalons à votre agenda.'}</p>
    </div>`;
    const attachments =
        body.ics === false
            ? []
            : [
                  {
                      filename: `Retroplanning_ateliers_${row.samu_name.replace(/\W+/g, '_')}.ics`,
                      content: icsOf(row.samu_name, jalons),
                      contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
                  }
              ];
    await sendEmail(to.join(', '), subject, html, attachments);
    await prisma.atelierRetroplanning.update({ where: { id: row.id }, data: { last_sent_at: sqlTimestamp() } });
    return { sent: to.length, samu_name: row.samu_name };
}
