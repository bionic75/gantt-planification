// Invitations calendrier (ICS) et regroupement des demi-journées d'affectation
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import crypto from 'crypto';

// Formater une date en format ICS (YYYYMMDDTHHmmssZ)
export function formatDateICS(dateStr: string, hours: number, minutes: number) {
    const [year, month, day] = dateStr.split('-').map(Number);
    // Créer la date en heure locale Paris, convertir en UTC (Paris = UTC+1 en hiver, UTC+2 en été)
    const date = new Date(year, month - 1, day, hours, minutes, 0);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}00Z`;
}

// Formater un timestamp now en ICS
export function nowICS() {
    const now = new Date();
    return now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
}

// Générer un UID unique pour un événement ICS
export function generateICSUid() {
    return crypto.randomUUID() + '@planning-ans';
}

export interface IcsInvitation {
    uid: string;
    summary: string;
    description?: string | null;
    location?: string | null;
    dtstart: string;
    dtend: string;
    organizer: string;
    organizerName: string;
    attendee: string;
    attendeeName: string;
    sequence?: number;
    method?: string;
}

// Construire un fichier ICS pour une invitation (METHOD: REQUEST)
export function buildICS({
    uid,
    summary,
    description,
    location,
    dtstart,
    dtend,
    organizer,
    organizerName,
    attendee,
    attendeeName,
    sequence,
    method
}: IcsInvitation) {
    const methodStr = method || 'REQUEST';
    const seq = sequence || 0;
    const status = methodStr === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
    const now = nowICS();

    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Planning ANS//SI-SAMU//FR',
        `METHOD:${methodStr}`,
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`
    ];

    if (location) {
        ics.push(`LOCATION:${location}`);
    }

    ics.push(`ORGANIZER;CN=${organizerName}:mailto:${organizer}`);
    ics.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${attendeeName}:mailto:${attendee}`);
    ics.push(`SEQUENCE:${seq}`);
    ics.push(`STATUS:${status}`);
    ics.push('END:VEVENT');
    ics.push('END:VCALENDAR');

    return ics.join('\r\n');
}

// Horaires des demi-journées
export const HALF_DAY_HOURS: Record<string, { start: number; end: number }> = {
    AM: { start: 8, end: 12 },
    PM: { start: 14, end: 18 }
};

/** Demi-journée d'affectation (champs utilisés pour le regroupement ; les autres sont conservés) */
export interface CreneauAffectation {
    date: string;
    period: string;
    activity?: string | null;
    activityCode?: string | number | null;
    location?: string | null;
    oldActivity?: string | null;
    oldActivityCode?: string | number | null;
    [champ: string]: unknown;
}

export interface GroupeCreneaux<T extends CreneauAffectation> {
    activity: T['activity'];
    activityCode: T['activityCode'];
    location: T['location'];
    slots: T[];
}

// Grouper les affectations contiguës de même type/localisation
export function groupContiguousAssignments<T extends CreneauAffectation>(
    assignments: T[] | null | undefined
): GroupeCreneaux<T>[] {
    if (!assignments || assignments.length === 0) return [];

    // Trier par date puis par période (AM avant PM)
    const sorted = [...assignments].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.period === 'AM' ? -1 : 1;
    });

    const groups: GroupeCreneaux<T>[] = [];
    let currentGroup: GroupeCreneaux<T> | null = null;

    for (const item of sorted) {
        if (!currentGroup) {
            currentGroup = {
                activity: item.activity,
                activityCode: item.activityCode,
                location: item.location,
                slots: [item]
            };
            continue;
        }

        // Vérifier si même activité ET même localisation
        const sameActivity = currentGroup.activityCode === item.activityCode;
        const sameLocation = (currentGroup.location || '') === (item.location || '');

        if (!sameActivity || !sameLocation) {
            groups.push(currentGroup);
            currentGroup = {
                activity: item.activity,
                activityCode: item.activityCode,
                location: item.location,
                slots: [item]
            };
            continue;
        }

        // Vérifier la contiguïté
        const lastSlot = currentGroup.slots[currentGroup.slots.length - 1];
        const isContiguous = checkContiguous(lastSlot.date, lastSlot.period, item.date, item.period);

        if (isContiguous) {
            currentGroup.slots.push(item);
        } else {
            groups.push(currentGroup);
            currentGroup = {
                activity: item.activity,
                activityCode: item.activityCode,
                location: item.location,
                slots: [item]
            };
        }
    }

    if (currentGroup) groups.push(currentGroup);
    return groups;
}

// Vérifier si deux créneaux sont contigus
export function checkContiguous(date1: string, period1: string, date2: string, period2: string) {
    // AM puis PM du même jour
    if (date1 === date2 && period1 === 'AM' && period2 === 'PM') return true;

    // PM d'un jour puis AM du jour ouvré suivant
    if (period1 === 'PM' && period2 === 'AM') {
        const nextWorkDay = getNextWorkDay(date1);
        if (nextWorkDay === date2) return true;
    }

    return false;
}

// Obtenir le prochain jour ouvré après une date
export function getNextWorkDay(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    do {
        date.setDate(date.getDate() + 1);
    } while (date.getDay() === 0 || date.getDay() === 6); // Skip weekend
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
}

// Labels d'activités propres (sans emoji) pour les ICS
export const ACTIVITY_LABELS: Record<string, string> = {
    3: 'SAMU (Déploiement)',
    4: 'SAMU (Dev. usages)',
    5: 'ANS (Déploiement)',
    6: 'ANS (Dev. usages)',
    7: 'Qualification',
    8: 'Autre mission'
};

export function getCleanActivityLabel(assignment: Pick<CreneauAffectation, 'activityCode' | 'activity'>) {
    // Priorité : activityCode → oldActivityCode → fallback sur activity sans emoji
    if (assignment.activityCode && ACTIVITY_LABELS[assignment.activityCode]) {
        return ACTIVITY_LABELS[assignment.activityCode];
    }
    // Nettoyer les emojis du label si pas de code
    if (assignment.activity) {
        return assignment.activity.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    }
    return 'Affectation';
}

export function getCleanOldActivityLabel(assignment: Pick<CreneauAffectation, 'oldActivityCode' | 'oldActivity'>) {
    if (assignment.oldActivityCode && ACTIVITY_LABELS[assignment.oldActivityCode]) {
        return ACTIVITY_LABELS[assignment.oldActivityCode];
    }
    if (assignment.oldActivity) {
        return assignment.oldActivity.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    }
    return 'Affectation';
}
