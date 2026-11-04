// @ts-check
// Sondages de date des jalons d'un rétroplanning d'ateliers métier : conception, envoi par e-mail, réponses publiques
import { randomBytes } from 'crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { idParam, sqlTimestamp } from '../../db/values.js';
import { isEmail } from '../../lib/email.js';
import { badRequest, HttpError, notFound } from '../../lib/http-error.js';
import { sendEmail } from '../../lib/mailer.js';
import { isValidDate } from './ateliers.calc.js';

const MAX_OPTIONS = 60;
const MAX_REPONSES = 500;

const esc = (/** @type {unknown} */ v) =>
    String(v == null ? '' : v).replace(
        /[&<>"']/g,
        c =>
            /** @type {Record<string, string>} */ ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[c]
    );

const parseList = (/** @type {string | null | undefined} */ text) => {
    try {
        const v = JSON.parse(text || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
};

const parseJson = (/** @type {string | null | undefined} */ text) => {
    try {
        return JSON.parse(text || '{}') || {};
    } catch {
        return {};
    }
};

const timeOrNull = (/** @type {unknown} */ v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null);

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const optionLabel = (/** @type {{ date: string, heure: string | null, heure_fin: string | null }} */ o) => {
    const [y, m, d] = o.date.split('-').map(Number);
    const day = `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    return o.heure ? `${day} · ${o.heure}${o.heure_fin ? ' – ' + o.heure_fin : ''}` : day;
};

/** Statut de chaque sondage (bouton « Sondage » de chaque jalon) */
export async function list() {
    const rows = await prisma.atelierSondage.findMany({
        select: { id: true, retroplanning_id: true, ligne: true, nom: true, statut: true }
    });
    const counts = rows.length
        ? await prisma.atelierSondageReponse.groupBy({
              by: ['sondage_id'],
              where: { sondage_id: { in: rows.map(r => r.id) } },
              _count: { _all: true }
          })
        : [];
    const n = new Map(counts.map(c => [c.sondage_id, c._count._all]));
    return rows.map(r => ({ ...r, reponses: n.get(r.id) || 0 }));
}

/** Sondage d'un jalon avec ses dates et ses réponses ; null s'il n'existe pas encore */
export async function get(/** @type {unknown} */ retroId, /** @type {string} */ ligne) {
    const row = await prisma.atelierSondage.findUnique({
        where: { retroplanning_id_ligne: { retroplanning_id: idParam(retroId), ligne } }
    });
    if (!row) return null;
    const options = await prisma.atelierSondageOption.findMany({
        where: { sondage_id: row.id },
        orderBy: [{ ordre: 'asc' }, { id: 'asc' }]
    });
    const reponses = await prisma.atelierSondageReponse.findMany({
        where: { sondage_id: row.id },
        orderBy: { id: 'asc' }
    });
    return {
        id: row.id,
        nom: row.nom,
        token: row.token,
        statut: row.statut,
        cloture_at: row.cloture_at,
        option_retenue_id: row.option_retenue_id,
        organisateur_id: row.organisateur_id,
        destinataires: parseList(row.destinataires),
        cc_user_ids: parseList(row.cc_user_ids),
        message: row.message || '',
        sent_at: row.sent_at,
        options: options.map(o => ({ id: o.id, date: o.date, heure: o.heure, heure_fin: o.heure_fin })),
        reponses: reponses.map(r => ({ id: r.id, nom: r.nom, options: parseList(r.options) }))
    };
}

/** Destinataires, copie et organisateur du dernier sondage du rétroplanning : proposés pour les nouveaux sondages du SAMU */
export async function modele(/** @type {unknown} */ retroId) {
    const row = await prisma.atelierSondage.findFirst({
        where: { retroplanning_id: idParam(retroId) },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }]
    });
    return row
        ? {
              destinataires: parseList(row.destinataires),
              cc_user_ids: parseList(row.cc_user_ids),
              organisateur_id: row.organisateur_id
          }
        : null;
}

/** Adresse publique du sondage */
export const sondageUrl = (/** @type {string} */ token, /** @type {string} */ origin) =>
    `${env.APP_URL ? env.APP_URL.replace(/\/+$/, '') : origin}/sondage/${token}`;

/**
 * Crée ou met à jour le sondage d'un jalon (brouillon) : nom, dates proposées, destinataires, copie
 * @param {unknown} retroId
 * @param {string} ligne
 * @param {any} body
 * @param {number | null} userId
 */
export async function save(retroId, ligne, body, userId) {
    const rid = idParam(retroId);
    const retro = await prisma.atelierRetroplanning.findUnique({ where: { id: rid }, select: { id: true } });
    if (!retro) throw notFound('Rétroplanning introuvable : enregistrez-le avant de créer un sondage');
    if (!/^[a-z0-9_]{1,20}$/.test(ligne)) throw badRequest('Jalon inconnu');
    const nom = String(body.nom || '')
        .trim()
        .slice(0, 200);
    if (!nom) throw badRequest('Donnez un nom au sondage');
    const closed = await prisma.atelierSondage.findUnique({
        where: { retroplanning_id_ligne: { retroplanning_id: rid, ligne } },
        select: { statut: true }
    });
    if (closed && closed.statut === 'termine') throw badRequest('Sondage clôturé : rouvrez-le pour le modifier');
    const opts = (Array.isArray(body.options) ? body.options : []).slice(0, MAX_OPTIONS);
    for (const o of opts) if (!isValidDate(String(o.date || ''))) throw badRequest('Date proposée invalide');
    const invalid = [];
    const dest = [
        ...new Set(
            (Array.isArray(body.destinataires) ? body.destinataires : [])
                .map((/** @type {unknown} */ e) => String(e || '').trim())
                .filter(Boolean)
                .filter((/** @type {string} */ e) => (isEmail(e) ? true : (invalid.push(e), false)))
        )
    ];
    if (invalid.length) throw badRequest(`Adresse(s) e-mail invalide(s) : ${invalid.join(', ')}`);
    const cc = [
        ...new Set(
            (Array.isArray(body.cc_user_ids) ? body.cc_user_ids : [])
                .map(Number)
                .filter((/** @type {number} */ n) => Number.isInteger(n) && n > 0)
        )
    ];
    const organisateur = Number(body.organisateur_id) > 0 ? Number(body.organisateur_id) : null;
    const data = {
        nom,
        organisateur_id: organisateur,
        destinataires: JSON.stringify(dest),
        cc_user_ids: JSON.stringify(cc),
        message:
            String(body.message || '')
                .trim()
                .slice(0, 4000) || null,
        updated_at: sqlTimestamp()
    };
    const key = { retroplanning_id_ligne: { retroplanning_id: rid, ligne } };
    const existing = await prisma.atelierSondage.findUnique({ where: key, select: { id: true } });
    const row = existing
        ? await prisma.atelierSondage.update({ where: key, data })
        : await prisma.atelierSondage.create({
              data: {
                  ...data,
                  retroplanning_id: rid,
                  ligne,
                  token: randomBytes(16).toString('hex'),
                  created_by: userId
              }
          });
    // Dates : celles reconnues par identifiant sont conservées (leurs réponses aussi), les autres sont créées ou supprimées
    const old = await prisma.atelierSondageOption.findMany({ where: { sondage_id: row.id } });
    const keep = new Set(
        opts.map((/** @type {any} */ o) => Number(o.id)).filter((/** @type {number} */ n) => old.some(x => x.id === n))
    );
    const removed = old.filter(o => !keep.has(o.id)).map(o => o.id);
    if (removed.length) await prisma.atelierSondageOption.deleteMany({ where: { id: { in: removed } } });
    let ordre = 0;
    for (const o of opts) {
        const fields = {
            date: String(o.date),
            heure: timeOrNull(o.heure),
            heure_fin: timeOrNull(o.heure) ? timeOrNull(o.heure_fin) : null,
            ordre: ordre++
        };
        if (keep.has(Number(o.id)))
            await prisma.atelierSondageOption.update({ where: { id: Number(o.id) }, data: fields });
        else await prisma.atelierSondageOption.create({ data: { ...fields, sondage_id: row.id } });
    }
    if (removed.length) {
        for (const r of await prisma.atelierSondageReponse.findMany({ where: { sondage_id: row.id } })) {
            const kept = parseList(r.options).filter(id => !removed.includes(id));
            if (kept.length !== parseList(r.options).length)
                await prisma.atelierSondageReponse.update({
                    where: { id: r.id },
                    data: { options: JSON.stringify(kept) }
                });
        }
    }
    return { id: row.id, created: !existing };
}

/** Suppression d'un sondage, de ses dates et de ses réponses */
export async function remove(/** @type {unknown} */ retroId, /** @type {string} */ ligne) {
    const row = await prisma.atelierSondage.findUnique({
        where: { retroplanning_id_ligne: { retroplanning_id: idParam(retroId), ligne } }
    });
    if (!row) throw notFound('Sondage introuvable');
    await prisma.$transaction([
        prisma.atelierSondageReponse.deleteMany({ where: { sondage_id: row.id } }),
        prisma.atelierSondageOption.deleteMany({ where: { sondage_id: row.id } }),
        prisma.atelierSondage.delete({ where: { id: row.id } })
    ]);
    return row.nom;
}

/** Suppression des sondages d'un rétroplanning supprimé */
export async function removeOfRetroplanning(/** @type {number} */ retroId) {
    for (const row of await prisma.atelierSondage.findMany({
        where: { retroplanning_id: retroId },
        select: { ligne: true }
    }))
        await remove(retroId, row.ligne);
}

/**
 * Envoie le sondage par e-mail (adresse d'accès unique, dates proposées) ; copie aux utilisateurs choisis
 * @param {unknown} retroId
 * @param {string} ligne
 * @param {string} origin origine de l'application, si APP_URL n'est pas renseignée
 */
export async function send(retroId, ligne, origin) {
    const s = await get(retroId, ligne);
    if (!s) throw notFound('Enregistrez le sondage avant de l’envoyer');
    if (s.statut === 'termine') throw badRequest('Sondage clôturé : rouvrez-le pour le renvoyer');
    if (!s.options.length) throw badRequest('Proposez au moins une date');
    if (!s.destinataires.length) throw badRequest('Renseignez au moins un destinataire');
    const users = await prisma.user.findMany({
        where: { id: { in: [...s.cc_user_ids, ...(s.organisateur_id ? [s.organisateur_id] : [])] } },
        select: { id: true, nom: true, prenom: true, email: true }
    });
    const org = users.find(u => u.id === s.organisateur_id);
    const cc = [
        ...new Set(
            users
                .filter(u => s.cc_user_ids.includes(u.id) && u.email && isEmail(u.email))
                .map(u => /** @type {string} */ (u.email))
        )
    ];
    const url = sondageUrl(s.token, origin);
    const orgName = org ? `${org.prenom || ''} ${(org.nom || '').toUpperCase()}`.trim() : '';
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px;">
        <h2 style="color:#1d70b7;margin:0 0 10px;">${esc(s.nom)}</h2>
        <p style="margin:0 0 10px;">${orgName ? `<strong>${esc(orgName)}</strong> vous invite` : 'Vous êtes invité(e)'} à indiquer vos disponibilités parmi les dates suivantes :</p>
        ${s.message ? `<p>${esc(s.message).replace(/\n/g, '<br>')}</p>` : ''}
        <ul>${s.options.map(o => `<li>${esc(optionLabel(o))}</li>`).join('')}</ul>
        <p style="margin:18px 0;"><a href="${esc(url)}" style="background:#1d70b7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Répondre au sondage</a></p>
        <p style="font-size:12px;color:#666;">Ou copiez ce lien dans votre navigateur : ${esc(url)}</p>
    </div>`;
    await sendEmail(s.destinataires.join(', '), s.nom, html, [], {
        cc: cc.join(', ') || undefined,
        replyTo: org && org.email ? org.email : undefined
    });
    await prisma.atelierSondage.update({
        where: { id: s.id },
        data: {
            statut: s.statut === 'reponses' ? 'reponses' : 'envoye',
            sent_at: sqlTimestamp(),
            updated_at: sqlTimestamp()
        }
    });
    return { sent: s.destinataires.length, cc: cc.length, url };
}

/** Statut d'un sondage rouvert : selon l'avancement (réponses reçues, mail envoyé) */
const reopenedStatus = (/** @type {{ sent_at: string | null }} */ row, /** @type {number} */ answers) =>
    answers ? 'reponses' : row.sent_at ? 'envoye' : 'brouillon';

/**
 * Clôture d'un sondage, avec le créneau retenu (facultatif). Le créneau devient la date réellement planifiée
 * (date et heure) du jalon dans le rétroplanning.
 * @param {unknown} retroId
 * @param {string} ligne
 * @param {unknown} optionId
 */
export async function close(retroId, ligne, optionId) {
    const rid = idParam(retroId);
    const row = await prisma.atelierSondage.findUnique({
        where: { retroplanning_id_ligne: { retroplanning_id: rid, ligne } }
    });
    if (!row) throw notFound('Sondage introuvable');
    if (row.statut === 'termine') throw badRequest('Ce sondage est déjà clôturé');
    const chosen = Number(optionId) > 0 ? Number(optionId) : null;
    const option = chosen
        ? await prisma.atelierSondageOption.findFirst({ where: { id: chosen, sondage_id: row.id } })
        : null;
    if (chosen && !option) throw badRequest('Créneau retenu inconnu');
    if (option) {
        const retro = await prisma.atelierRetroplanning.findUnique({ where: { id: rid } });
        if (retro) {
            const lignes = parseJson(retro.lignes);
            lignes.planifiees = { ...(lignes.planifiees || {}), [ligne]: option.date };
            lignes.heures = { ...(lignes.heures || {}) };
            if (option.heure) lignes.heures[ligne] = option.heure;
            else delete lignes.heures[ligne];
            await prisma.atelierRetroplanning.update({
                where: { id: rid },
                data: { lignes: JSON.stringify(lignes), updated_at: sqlTimestamp() }
            });
        }
    }
    await prisma.atelierSondage.update({
        where: { id: row.id },
        data: {
            statut: 'termine',
            cloture_at: sqlTimestamp(),
            option_retenue_id: option ? option.id : null,
            updated_at: sqlTimestamp()
        }
    });
    return { nom: row.nom, retenu: option ? optionLabel(option) : null };
}

/** Réouverture : le sondage redevient modifiable et accepte de nouveau des réponses (la date planifiée est conservée) */
export async function reopen(/** @type {unknown} */ retroId, /** @type {string} */ ligne) {
    const row = await prisma.atelierSondage.findUnique({
        where: { retroplanning_id_ligne: { retroplanning_id: idParam(retroId), ligne } }
    });
    if (!row) throw notFound('Sondage introuvable');
    if (row.statut !== 'termine') throw badRequest('Ce sondage n’est pas clôturé');
    const answers = await prisma.atelierSondageReponse.count({ where: { sondage_id: row.id } });
    await prisma.atelierSondage.update({
        where: { id: row.id },
        data: {
            statut: reopenedStatus(row, answers),
            cloture_at: null,
            option_retenue_id: null,
            updated_at: sqlTimestamp()
        }
    });
    return row.nom;
}

// ---------- Accès public (adresse unique, sans connexion) ----------

async function byToken(/** @type {string} */ token) {
    if (!/^[a-f0-9]{32}$/.test(token)) throw notFound('Sondage introuvable');
    const row = await prisma.atelierSondage.findUnique({ where: { token } });
    if (!row) throw notFound('Sondage introuvable');
    return row;
}

/**
 * Sondage vu par un répondant : nom, dates et SA propre réponse (retrouvée par son jeton) ; les réponses des autres
 * participants, leurs noms comme leurs totaux, ne sont jamais transmis
 */
export async function publicGet(/** @type {string} */ token, /** @type {string | undefined} */ jeton) {
    const row = await byToken(token);
    const options = await prisma.atelierSondageOption.findMany({
        where: { sondage_id: row.id },
        orderBy: [{ ordre: 'asc' }, { id: 'asc' }]
    });
    const mine =
        jeton && /^[a-f0-9]{32}$/.test(jeton)
            ? await prisma.atelierSondageReponse.findFirst({ where: { sondage_id: row.id, jeton } })
            : null;
    const org = row.organisateur_id
        ? await prisma.user.findUnique({ where: { id: row.organisateur_id }, select: { nom: true, prenom: true } })
        : null;
    return {
        nom: row.nom,
        termine: row.statut === 'termine',
        retenue: row.option_retenue_id,
        organisateur: org ? `${org.prenom || ''} ${(org.nom || '').toUpperCase()}`.trim() : null,
        options: options.map(o => ({ id: o.id, date: o.date, heure: o.heure, heure_fin: o.heure_fin })),
        mienne: mine ? { nom: mine.nom, options: parseList(mine.options) } : null
    };
}

/**
 * Réponse d'une personne. Son jeton (remis à la première réponse) permet de la modifier ; sans jeton, un nom déjà utilisé
 * est refusé (on ne peut pas écraser la réponse d'un autre participant). La première réponse passe le sondage en « réponses ».
 */
export async function publicRespond(/** @type {string} */ token, /** @type {any} */ body) {
    const row = await byToken(token);
    if (row.statut === 'termine') throw badRequest('Ce sondage est clôturé : les réponses ne sont plus modifiables');
    const nom = String((body || {}).nom || '')
        .trim()
        .slice(0, 100);
    if (!nom) throw badRequest('Indiquez votre nom');
    const options = await prisma.atelierSondageOption.findMany({ where: { sondage_id: row.id }, select: { id: true } });
    const valid = new Set(options.map(o => o.id));
    const picked = [
        ...new Set(
            (Array.isArray((body || {}).options) ? body.options : [])
                .map(Number)
                .filter((/** @type {number} */ n) => valid.has(n))
        )
    ];
    if (!picked.length) throw badRequest('Cochez au moins une date');
    const all = await prisma.atelierSondageReponse.findMany({
        where: { sondage_id: row.id },
        select: { id: true, nom: true, jeton: true }
    });
    const jeton = String((body || {}).jeton || '');
    const own = jeton ? all.find(r => r.jeton === jeton) : null;
    if (!own && all.some(r => r.nom.toLowerCase() === nom.toLowerCase()))
        throw new HttpError(
            409,
            'Ce nom a déjà répondu. Choisissez un autre nom, ou modifiez votre réponse depuis le navigateur utilisé la première fois.'
        );
    if (own && all.some(r => r.id !== own.id && r.nom.toLowerCase() === nom.toLowerCase()))
        throw new HttpError(409, 'Ce nom est déjà utilisé par un autre participant.');
    const newJeton = own ? own.jeton : randomBytes(16).toString('hex');
    if (own) {
        await prisma.atelierSondageReponse.update({
            where: { id: own.id },
            data: { nom, options: JSON.stringify(picked), updated_at: sqlTimestamp() }
        });
    } else {
        if (all.length >= MAX_REPONSES) throw badRequest('Nombre maximal de réponses atteint');
        await prisma.atelierSondageReponse.create({
            data: { sondage_id: row.id, nom, options: JSON.stringify(picked), jeton: newJeton }
        });
    }
    if (row.statut !== 'reponses') {
        await prisma.atelierSondage.update({
            where: { id: row.id },
            data: { statut: 'reponses', updated_at: sqlTimestamp() }
        });
    }
    return { replaced: !!own, jeton: newJeton };
}
