// @ts-check
// Planification des ateliers métier : rétroplanning automatisé par SAMU (paramétrage, simulation, enregistrement, diffusion)
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { isEmail } from '../../lib/email.js';
import { badRequest, notFound } from '../../lib/http-error.js';
import { emailConfig, sendEmail } from '../../lib/mailer.js';
import { samuNumber } from '../../lib/samu.js';
import { getJsonSetting } from '../../services/settings.js';
import { zoneOfDepartment } from './ateliers.data.js';
import { removeOfRetroplanning } from './sondages.service.js';
import {
    addDays,
    computeRetroplanning,
    CONTENUS,
    DEFAULT_DELAI_MEP,
    DEFAULT_DELAI_VISITE,
    ECART_ATELIER_1_2,
    ECART_ATELIERS,
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
        defaults: {
            nb: 4,
            delaiVisite: DEFAULT_DELAI_VISITE,
            delaiMep: DEFAULT_DELAI_MEP,
            ecart12: ECART_ATELIER_1_2,
            ecartAteliers: ECART_ATELIERS
        },
        limites: { min: MIN_ATELIERS, max: MAX_ATELIERS }
    };
}

/** Lien de réunion Teams : adresse https seulement ('' si absent ou invalide) */
export function cleanTeamsLink(/** @type {unknown} */ v) {
    const t = String(v || '').trim();
    if (!t || t.length > 2000) return '';
    try {
        return new URL(t).protocol === 'https:' ? t : '';
    } catch {
        return '';
    }
}

/** Nettoie les choix de lignes : jalons et contenus parmi les listes, dates valides */
function cleanLignes(/** @type {any} */ raw) {
    const jalons = /** @type {Record<string, string>} */ ({});
    const contenus = /** @type {Record<string, string>} */ ({});
    const planifiees = /** @type {Record<string, string>} */ ({});
    const heures = /** @type {Record<string, string>} */ ({});
    const invites = /** @type {Record<string, string>} */ ({});
    const src = raw && typeof raw === 'object' ? raw : {};
    for (let k = 1; k <= MAX_ATELIERS; k++) {
        const key = `a${k}`;
        if (JALONS_ATELIER.includes(src.jalons?.[key])) jalons[key] = src.jalons[key];
        if (CONTENUS.includes(src.contenus?.[key])) contenus[key] = src.contenus[key];
    }
    for (const key of ['visite', ...Array.from({ length: MAX_ATELIERS }, (_, i) => `a${i + 1}`), 'livrables', 'mep']) {
        if (isValidDate(src.planifiees?.[key])) planifiees[key] = src.planifiees[key];
        if (planifiees[key] && /^([01]\d|2[0-3]):[0-5]\d$/.test(src.heures?.[key])) heures[key] = src.heures[key];
    }
    for (const [k, v] of Object.entries(src.invites || {})) {
        if (/^[a-z0-9]{1,10}$/.test(k) && typeof v === 'string') invites[k] = v.slice(0, 30);
    }
    const teams = cleanTeamsLink(src.teams);
    // Destinataires des invitations (conservés pour les invitations suivantes de ce SAMU)
    const dest = src.destinataires && typeof src.destinataires === 'object' ? src.destinataires : {};
    const destinataires = {
        userIds: [
            ...new Set(
                (Array.isArray(dest.userIds) ? dest.userIds : [])
                    .map(Number)
                    .filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0)
            )
        ],
        emails: [
            ...new Set(
                (Array.isArray(dest.emails) ? dest.emails : [])
                    .map((/** @type {unknown} */ e) => String(e || '').trim())
                    .filter((/** @type {string} */ e) => isEmail(e))
            )
        ]
    };
    return { jalons, contenus, planifiees, heures, invites, destinataires, ...(teams ? { teams } : {}) };
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
        delaiMep: b.delaiMep ?? b.delai_mep ?? DEFAULT_DELAI_MEP,
        ecart12: b.ecart12 ?? b.lignes?.ecarts?.ecart12 ?? ECART_ATELIER_1_2,
        ecartAteliers: b.ecartAteliers ?? b.lignes?.ecarts?.ecartAteliers ?? ECART_ATELIERS
    };
    const error = validateInput(input);
    if (error) throw badRequest(error);
    const lignes = cleanLignes(b.lignes ?? b);
    return {
        ...input,
        delaiVisite: Number(input.delaiVisite),
        delaiMep: Number(input.delaiMep),
        ecart12: Number(input.ecart12),
        ecartAteliers: Number(input.ecartAteliers),
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
        lignes: JSON.stringify({
            jalons: input.jalons,
            contenus: input.contenus,
            planifiees: input.planifiees,
            heures: input.heures,
            invites: input.invites,
            destinataires: input.destinataires,
            teams: input.teams,
            ecarts: { ecart12: input.ecart12, ecartAteliers: input.ecartAteliers }
        }),
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
    await removeOfRetroplanning(row.id);
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

// ---------- Invitation à un atelier (ICS avec lien Teams) ----------

const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');
const validTime = (/** @type {unknown} */ v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const plusHour = (/** @type {string} */ t) => {
    const [h, m] = t.split(':').map(Number);
    return h >= 23 ? '23:59' : `${pad2(h + 1)}:${pad2(m)}`;
};
const icsText = (/** @type {string} */ s) =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Lignes de 75 caractères au plus, la suite commençant par une espace (RFC 5545) */
const fold = (/** @type {string} */ line) => {
    const out = [];
    let rest = line;
    while (rest.length > 74) {
        out.push(rest.slice(0, 74));
        rest = ' ' + rest.slice(74);
    }
    out.push(rest);
    return out.join('\r\n');
};
const VTIMEZONE_PARIS = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'END:DAYLIGHT',
    'END:VTIMEZONE'
];

/**
 * Invitation (.ics, METHOD:REQUEST) à un atelier : date et heure planifiées du jalon, lien Teams, participants
 * @param {{ uid: string, summary: string, description: string, day: string, start: string | null, end: string | null,
 *   teams: string, organizer: { name: string, email: string }, attendees: string[] }} e
 */
export function inviteIcs(e) {
    const compact = (/** @type {string} */ d) => d.replace(/-/g, '');
    const hm = (/** @type {string} */ t) => t.replace(':', '') + '00';
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const when =
        e.start && e.end
            ? [
                  `DTSTART;TZID=Europe/Paris:${compact(e.day)}T${hm(e.start)}`,
                  `DTEND;TZID=Europe/Paris:${compact(e.day)}T${hm(e.end)}`
              ]
            : [`DTSTART;VALUE=DATE:${compact(e.day)}`, `DTEND;VALUE=DATE:${compact(addDays(e.day, 1))}`];
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Planification des ressources//Ateliers métier//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        ...(e.start ? VTIMEZONE_PARIS : []),
        'BEGIN:VEVENT',
        `UID:${e.uid}`,
        `DTSTAMP:${stamp}`,
        ...when,
        `SUMMARY:${icsText(e.summary)}`,
        `DESCRIPTION:${icsText(e.description)}`,
        ...(e.teams
            ? [
                  `LOCATION:${icsText('Réunion Microsoft Teams')}`,
                  `URL:${e.teams}`,
                  `X-MICROSOFT-SKYPETEAMSMEETINGURL:${e.teams}`,
                  'X-MICROSOFT-ONLINEMEETINGTYPE:teamsForBusiness'
              ]
            : []),
        `ORGANIZER;CN="${e.organizer.name.replace(/["\\:;,]/g, '')}":mailto:${e.organizer.email}`,
        ...e.attendees.map(
            a => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${a}":mailto:${a}`
        ),
        'SEQUENCE:0',
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
        'END:VEVENT',
        'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n');
}

/**
 * Envoie l'invitation à un atelier planifié (e-mail + .ics avec le lien Teams). Le lien Teams est retenu pour le SAMU
 * (proposé pour ses autres ateliers) et l'envoi est inscrit sur le jalon.
 * @param {unknown} id
 * @param {string} ligne clé du jalon
 * @param {any} body
 * @param {{ name: string, email: string | null }} sender
 */
export async function sendInvitation(id, ligne, body, sender) {
    const row = await prisma.atelierRetroplanning.findUnique({ where: { id: idParam(id) } });
    if (!row) throw notFound('Rétroplanning introuvable');
    const lignes = parseJson(row.lignes);
    const { rows: jalons } = computeRetroplanning(await toInput({ ...row, lignes }));
    const j = jalons.find(r => r.key === ligne);
    if (!j) throw notFound('Jalon introuvable');
    if (!j.planifiee) throw badRequest("Renseignez d'abord la date réellement planifiée de ce jalon");
    const userIds = (Array.isArray(body.userIds) ? body.userIds : [])
        .map(Number)
        .filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0);
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds }, actif: 1 }, select: { email: true } })
        : [];
    /** @type {string[]} */
    const invalid = [];
    const extra = (Array.isArray(body.emails) ? body.emails : [])
        .map((/** @type {unknown} */ e) => String(e || '').trim())
        .filter(Boolean)
        .filter((/** @type {string} */ e) => (isEmail(e) ? true : (invalid.push(e), false)));
    if (invalid.length) throw badRequest(`Adresse(s) e-mail invalide(s) : ${invalid.join(', ')}`);
    const to = [
        ...new Map(
            [...users.map(u => u.email), ...extra].filter(e => isEmail(e)).map(e => [e.toLowerCase(), e])
        ).values()
    ];
    if (!to.length) throw badRequest('Choisissez au moins un destinataire');
    const teams = cleanTeamsLink(body.teams);
    if (String(body.teams || '').trim() && !teams) throw badRequest('Le lien Teams doit être une adresse https valide');

    const start = validTime(lignes.heures?.[ligne]) ? lignes.heures[ligne] : null;
    const end = start ? (validTime(body.heure_fin) && body.heure_fin > start ? body.heure_fin : plusHour(start)) : null;
    // Organisateur : l'identité choisie dans la fenêtre, à défaut la personne connectée
    const orgId = Number(body.organisateur_id) > 0 ? Number(body.organisateur_id) : null;
    const orgUser = orgId
        ? await prisma.user.findUnique({ where: { id: orgId }, select: { nom: true, prenom: true, email: true } })
        : null;
    const organizer = orgUser
        ? { name: `${orgUser.prenom || ''} ${(orgUser.nom || '').toUpperCase()}`.trim(), email: orgUser.email }
        : sender;
    const organizerEmail = organizer.email && isEmail(organizer.email) ? organizer.email : emailConfig.user || '';
    const subject = String(body.subject || '').trim() || atelierMailSubject(row.samu_name, ligne, j.jalon);
    const message = String(body.message || '').trim();
    const horaire = start ? ` de ${start} à ${end}` : '';
    const description = [
        `${row.samu_name} — ${j.jalon}`,
        j.contenu,
        message,
        teams ? `Rejoindre la réunion Microsoft Teams : ${teams}` : ''
    ]
        .filter(Boolean)
        .join('\n\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px;">
        ${mailOnBehalfHtml(organizer.name)}
        <h2 style="color:#1d70b7;margin:0 0 8px;">${esc(atelierFullName(ligne, j.jalon))} — ${esc(row.samu_name)}</h2>
        <p style="margin:0 0 6px;"><strong>${esc(frDate(j.planifiee))}${esc(horaire)}</strong></p>
        <p style="margin:0 0 12px;">${esc(j.contenu)}</p>
        ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
        ${teams ? `<p style="margin:16px 0;"><a href="${esc(teams)}" style="background:#464eb8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Rejoindre la réunion Teams</a></p><p style="font-size:12px;color:#666;">Lien : ${esc(teams)}</p>` : ''}
        <p style="font-size:12px;color:#666;margin-top:14px;">L'invitation (.ics) jointe ajoute cet atelier à votre agenda.</p>
        ${mailSignatureHtml(organizer.name)}
    </div>`;
    const ics = inviteIcs({
        uid: `atelier-${row.id}-${ligne}@planning-ans`,
        summary: subject,
        description,
        day: j.planifiee,
        start,
        end,
        teams,
        organizer: { name: organizer.name, email: organizerEmail },
        attendees: to
    });
    // Invitation de calendrier : partie text/calendar (méthode REQUEST) que Outlook et Gmail reconnaissent
    // (Accepter, Refuser, Provisoire), avec le fichier .ics en pièce jointe
    await sendEmail(to.join(', '), subject, html, [], {
        replyTo: organizer.email && isEmail(organizer.email) ? organizer.email : undefined,
        fromName: organizer.name,
        icalEvent: {
            method: 'REQUEST',
            content: ics,
            filename: `Invitation_${row.samu_name.replace(/\W+/g, '_')}_${ligne}.ics`
        }
    });
    const next = { ...lignes };
    if (teams) next.teams = teams;
    next.invites = { ...(lignes.invites || {}), [ligne]: sqlTimestamp() };
    next.destinataires = { userIds, emails: extra };
    await prisma.atelierRetroplanning.update({
        where: { id: row.id },
        data: { lignes: JSON.stringify(next), updated_at: sqlTimestamp() }
    });
    return { sent: to.length, samu_name: row.samu_name, jalon: j.jalon };
}

// ---------- Objet, signature et objectif des e-mails d'un atelier ----------

/** Objet des e-mails d'un atelier : [SI-SAMU] SAMU 44 - Atelier Métier #1 | Configuration téléphonique du CRRA */
export function atelierMailSubject(
    /** @type {string} */ samuName,
    /** @type {string} */ key,
    /** @type {string} */ jalon
) {
    const m = /(\d+[A-Za-z]?)\s*$/.exec(String(samuName || '').trim());
    const samu = m ? `SAMU ${m[1]}` : samuName;
    const title = /^a\d+$/.test(key) ? `Atelier Métier #${key.slice(1)}` : jalon;
    return `[SI-SAMU] ${samu} - ${title} | Configuration téléphonique du CRRA`;
}

/** Nom complet d'un atelier : « Atelier Métier #7 | Configuration téléphonique du CRRA » (libellé du jalon pour la visite) */
export function atelierFullName(/** @type {string} */ key, /** @type {string} */ jalon) {
    return `${/^a\d+$/.test(key) ? `Atelier Métier #${key.slice(1)}` : jalon} | Configuration téléphonique du CRRA`;
}

/** Bandeau « envoyé de la part de » : l'expéditeur réel est le chef de projet, les réponses lui sont adressées */
export const mailOnBehalfHtml = (/** @type {string} */ name) =>
    name
        ? `<p style="margin:0 0 14px;padding:8px 10px;background:#f3f6fa;border-left:3px solid #1d70b7;font-size:12px;color:#455a64;">Message envoyé de la part de <strong>${esc(name)}</strong> : en répondant à ce message, votre réponse lui sera adressée.</p>`
        : '';

/** Signature de l'expéditeur (chef de projet) en fin d'e-mail */
export const mailSignatureHtml = (/** @type {string} */ name) =>
    name ? `<p style="margin:20px 0 0;font-size:14px;">Cordialement,<br><strong>${esc(name)}</strong></p>` : '';

/** Jalon d'un rétroplanning (SAMU, libellé, objectif) pour les e-mails et la page du sondage */
export async function jalonInfo(/** @type {unknown} */ retroId, /** @type {string} */ key) {
    const row = await prisma.atelierRetroplanning.findUnique({ where: { id: idParam(retroId) } });
    if (!row) return null;
    try {
        const { rows } = computeRetroplanning(await toInput({ ...row, lignes: parseJson(row.lignes) }));
        const j = rows.find(r => r.key === key);
        return j
            ? { samu_name: row.samu_name, jalon: j.jalon, contenu: j.contenu, atelier: atelierFullName(key, j.jalon) }
            : null;
    } catch {
        return null;
    }
}
