// @ts-check
// E-mails des astreintes HO : gabarits modifiables (sujet et corps avec champs {…}) et tableau de la semaine
import { addDays, DAY_NAMES, frDate, frShort, isoWeek, PERIOD_LABELS, weekDays } from './ho.dates.js';

export const DEFAULT_TEMPLATES = {
    5: {
        subject: 'Astreintes HO — planning de la semaine {semaine} à compléter',
        body: 'Bonjour,\n\nMerci de renseigner vos astreintes HO (heures ouvrées) pour la semaine {semaine}, du {debut} au {fin}.\n\n{planning}\n\nPlanning en ligne : {lien}\n\nCordialement'
    },
    6: {
        subject: "Planning d'astreinte HO — semaine {semaine} ({debut} au {fin})",
        body: "Bonjour,\n\nVoici le planning d'astreinte HO de la semaine {semaine}, du {debut} au {fin}.\n\n{planning}\n\n{modifications}\nPlanning en ligne : {lien}\n\nCordialement"
    }
};

/** Champs disponibles dans les gabarits, pour l'écran d'administration */
export const TEMPLATE_FIELDS = [
    ['{semaine}', 'numéro de la semaine'],
    ['{debut}', 'premier jour (lundi)'],
    ['{fin}', 'dernier jour (vendredi)'],
    ['{planning}', 'tableau du planning de la semaine'],
    ['{modifications}', 'liste des modifications (envois de mise à jour)'],
    ['{lien}', "adresse de l'application"]
];

const esc = (/** @type {unknown} */ v) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c
    );

/** Texte du gabarit (échappé, retours à la ligne conservés) où les champs {…} sont remplacés */
export function renderTemplate(
    /** @type {string} */ template,
    /** @type {Record<string, { text?: string, html?: string }>} */ vars
) {
    let out = esc(template).replace(/\r?\n/g, '<br>');
    for (const [key, v] of Object.entries(vars)) {
        out = out.split(`{${key}}`).join(v.html !== undefined ? v.html : esc(v.text));
    }
    return out;
}

/** Sujet : même gabarit, sans HTML */
export function renderSubject(/** @type {string} */ template, /** @type {Record<string, string>} */ vars) {
    let out = String(template || '');
    for (const [key, v] of Object.entries(vars)) out = out.split(`{${key}}`).join(v);
    return out.replace(/\s+/g, ' ').trim();
}

/**
 * Tableau de la semaine : une colonne par jour ouvré, matin et après-midi ; une demi-journée vide est signalée
 * @param {string} monday
 * @param {Array<{ date: string, period: string, resource_id: number }>} slots
 * @param {Map<number, { prenom: string, nom: string }>} names
 */
export function weekTableHtml(monday, slots, names) {
    const days = weekDays(monday);
    const cell = (/** @type {string} */ date, /** @type {string} */ period) => {
        const who = slots
            .filter(s => s.date === date && s.period === period)
            .map(s => names.get(s.resource_id))
            .filter(Boolean)
            .map(n => `${esc(n?.prenom)} ${esc((n?.nom || '').toUpperCase())}`);
        return who.length
            ? `<td style="padding:6px 8px;border:1px solid #c8e6c9;background:#e8f5e9;color:#1b5e20;vertical-align:top;">${who.join('<br>')}</td>`
            : `<td style="padding:6px 8px;border:1px solid #ffcdd2;background:#ffebee;color:#b71c1c;font-style:italic;vertical-align:top;">à pourvoir</td>`;
    };
    const head = days
        .map(
            (d, i) =>
                `<th style="padding:6px 8px;border:1px solid #cfd8dc;background:#eceff1;text-align:center;">${DAY_NAMES[i]}<br><span style="font-weight:normal;font-size:12px;">${frShort(d)}</span></th>`
        )
        .join('');
    const row = (/** @type {string} */ period) =>
        `<tr><th style="padding:6px 8px;border:1px solid #cfd8dc;background:#eceff1;text-align:left;white-space:nowrap;">${PERIOD_LABELS[period]}</th>${days.map(d => cell(d, period)).join('')}</tr>`;
    return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;margin:8px 0;"><thead><tr><th style="border:1px solid #cfd8dc;background:#eceff1;"></th>${head}</tr></thead><tbody>${row('AM')}${row('PM')}</tbody></table>`;
}

/** Liste des modifications d'un enregistrement ou d'un envoi de mise à jour */
export function modificationsHtml(
    /** @type {Array<{ date: string, period: string, name: string, action: string }>} */ changes,
    /** @type {string} */ author = ''
) {
    if (!changes.length) return '';
    const day = (/** @type {string} */ date) => {
        const idx = weekDays(addDays(date, 1 - (new Date(`${date}T00:00:00Z`).getUTCDay() || 7))).indexOf(date);
        return `${DAY_NAMES[idx] || ''} ${frDate(date)}`.trim();
    };
    const items = changes
        .map(
            c =>
                `<li>${esc(day(c.date))}, ${PERIOD_LABELS[c.period]} : ${c.action === 'add' ? '<b style="color:#1b5e20;">ajout</b>' : '<b style="color:#b71c1c;">retrait</b>'} de ${esc(c.name)}</li>`
        )
        .join('');
    return `<p><b>Modifications apportées</b>${author ? ` par ${esc(author)}` : ''} :</p><ul>${items}</ul>`;
}

/** Variables de gabarit d'une semaine */
export function weekVars(/** @type {string} */ monday, /** @type {string} */ link) {
    const friday = addDays(monday, 4);
    return { semaine: String(isoWeek(monday)), debut: frDate(monday), fin: frDate(friday), lien: link };
}

/** Enveloppe HTML commune */
export function wrapHtml(/** @type {string} */ bodyHtml) {
    return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:760px;">${bodyHtml}<p style="font-size:11px;color:#999;margin-top:24px;">Message automatique — Planification des ressources (Domaine des Urgences).</p></div>`;
}
