// @ts-check
// Dates du planning d'astreinte HO : jours ouvrés (lundi au vendredi), semaines du lundi au dimanche (heure de Paris)

/** Date du jour à Paris, « AAAA-MM-JJ » */
export const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/** Heure courante à Paris { hour, day (0 = dimanche) } */
export function parisClock(/** @type {Date} */ now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        hour: 'numeric',
        hourCycle: 'h23',
        weekday: 'short'
    }).formatToParts(now);
    const hour = Number(parts.find(p => p.type === 'hour')?.value);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    return { hour, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday) };
}

const toUtc = (/** @type {string} */ date) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (/** @type {Date} */ d) => d.toISOString().slice(0, 10);

export const isValidDate = (/** @type {unknown} */ date) =>
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && fmt(toUtc(date)) === date;

export function addDays(/** @type {string} */ date, /** @type {number} */ n) {
    const d = toUtc(date);
    d.setUTCDate(d.getUTCDate() + n);
    return fmt(d);
}

/** 1 = lundi … 7 = dimanche */
export const isoDay = (/** @type {string} */ date) => toUtc(date).getUTCDay() || 7;

export const isWeekday = (/** @type {string} */ date) => isoDay(date) <= 5;

/** Lundi de la semaine de la date */
export const weekStart = (/** @type {string} */ date) => addDays(date, 1 - isoDay(date));

/** Les cinq jours ouvrés d'une semaine (à partir du lundi) */
export const weekDays = (/** @type {string} */ monday) => [0, 1, 2, 3, 4].map(i => addDays(monday, i));

/** Numéro de semaine ISO */
export function isoWeek(/** @type {string} */ date) {
    const d = toUtc(date);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** « 26/10/2026 » */
export const frDate = (/** @type {string} */ date) => date.split('-').reverse().join('/');

/** « 26/10 » */
export const frShort = (/** @type {string} */ date) => frDate(date).slice(0, 5);

/** Lundis des semaines qui contiennent des jours ouvrés du mois « AAAA-MM » */
export function monthWeeks(/** @type {string} */ month) {
    const first = `${month}-01`;
    const last = addDays(`${addMonth(month)}-01`, -1);
    const weeks = [];
    for (let w = weekStart(first); w <= last; w = addDays(w, 7)) {
        // semaine retenue si l'un de ses jours ouvrés est dans le mois
        if (weekDays(w).some(d => d >= first && d <= last)) weeks.push(w);
    }
    return weeks;
}

function addMonth(/** @type {string} */ month) {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export const isValidMonth = (/** @type {unknown} */ month) =>
    typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
export const PERIOD_LABELS = /** @type {Record<string, string>} */ ({ AM: 'matin', PM: 'après-midi' });
