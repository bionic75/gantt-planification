// @ts-check
// Données du rétroplanning des ateliers métier : vacances scolaires intégrées (zones A, B, C) et zone par département.
// Vacances : calendriers métropolitains 2026-2027 et 2027-2028, repris du classeur « Rétroplanning SAMU automatique »
// (source officielle : https://www.service-public.gouv.fr/particuliers/vosdroits/F31952). Début et fin sont inclus ;
// ce sont des samedis ou dimanches, sauf les ponts. Les vacances saisies ou importées dans l'application
// (Administration › Congés scolaires) complètent ces données hors de la période couverte.

/** [début, fin, zone, période] */
export const BUILTIN_HOLIDAYS = [
    ['2026-10-17', '2026-11-01', 'A', 'Toussaint'], // 2026-2027
    ['2026-10-17', '2026-11-01', 'B', 'Toussaint'], // 2026-2027
    ['2026-10-17', '2026-11-01', 'C', 'Toussaint'], // 2026-2027
    ['2026-12-19', '2027-01-03', 'A', 'Noël'], // 2026-2027
    ['2026-12-19', '2027-01-03', 'B', 'Noël'], // 2026-2027
    ['2026-12-19', '2027-01-03', 'C', 'Noël'], // 2026-2027
    ['2027-02-13', '2027-02-28', 'A', 'Hiver'], // 2026-2027
    ['2027-02-20', '2027-03-07', 'B', 'Hiver'], // 2026-2027
    ['2027-02-06', '2027-02-21', 'C', 'Hiver'], // 2026-2027
    ['2027-04-10', '2027-04-25', 'A', 'Printemps'], // 2026-2027
    ['2027-04-17', '2027-05-02', 'B', 'Printemps'], // 2026-2027
    ['2027-04-03', '2027-04-18', 'C', 'Printemps'], // 2026-2027
    ['2027-05-07', '2027-05-07', 'A', 'Pont scolaire'], // 2026-2027
    ['2027-05-07', '2027-05-07', 'B', 'Pont scolaire'], // 2026-2027
    ['2027-05-07', '2027-05-07', 'C', 'Pont scolaire'], // 2026-2027
    ['2027-07-03', '2027-09-01', 'A', 'Été'], // 2026-2027
    ['2027-07-03', '2027-09-01', 'B', 'Été'], // 2026-2027
    ['2027-07-03', '2027-09-01', 'C', 'Été'], // 2026-2027
    ['2027-10-23', '2027-11-07', 'A', 'Toussaint'], // 2027-2028
    ['2027-10-23', '2027-11-07', 'B', 'Toussaint'], // 2027-2028
    ['2027-10-23', '2027-11-07', 'C', 'Toussaint'], // 2027-2028
    ['2027-12-18', '2028-01-02', 'A', 'Noël'], // 2027-2028
    ['2027-12-18', '2028-01-02', 'B', 'Noël'], // 2027-2028
    ['2027-12-18', '2028-01-02', 'C', 'Noël'], // 2027-2028
    ['2028-02-19', '2028-03-05', 'A', 'Hiver'], // 2027-2028
    ['2028-02-05', '2028-02-20', 'B', 'Hiver'], // 2027-2028
    ['2028-02-12', '2028-02-27', 'C', 'Hiver'], // 2027-2028
    ['2028-04-22', '2028-05-08', 'A', 'Printemps'], // 2027-2028
    ['2028-04-08', '2028-04-23', 'B', 'Printemps'], // 2027-2028
    ['2028-04-15', '2028-05-01', 'C', 'Printemps'], // 2027-2028
    ['2028-05-26', '2028-05-27', 'A', 'Pont scolaire'], // 2027-2028
    ['2028-05-26', '2028-05-27', 'B', 'Pont scolaire'], // 2027-2028
    ['2028-05-26', '2028-05-27', 'C', 'Pont scolaire'], // 2027-2028
    ['2028-07-04', '2028-09-01', 'A', 'Été'], // 2027-2028
    ['2028-07-04', '2028-09-01', 'B', 'Été'], // 2027-2028
    ['2028-07-04', '2028-09-01', 'C', 'Été'] // 2027-2028
];

/** Départements de chaque zone (Corse : 2A et 2B en zone B) */
export const ZONE_BY_DEPARTMENT = {
    A: '01 03 07 15 16 17 19 21 23 24 25 26 33 38 39 40 42 43 47 58 63 64 69 70 71 73 74 79 86 87 89 90'.split(' '),
    B: '02 04 05 06 08 10 13 14 18 22 27 28 29 35 36 37 41 44 45 49 50 51 52 53 54 55 56 57 59 60 61 62 67 68 72 76 80 83 84 85 88 2A 2B'.split(
        ' '
    ),
    C: '09 11 12 30 31 32 34 46 48 65 66 75 77 78 81 82 91 92 93 94 95'.split(' ')
};

/** Zone de vacances scolaires (A, B ou C) d'un numéro de département métropolitain (académie du département) */
export function zoneOfDepartment(/** @type {unknown} */ code) {
    const c = String(code || '')
        .trim()
        .toUpperCase()
        .padStart(2, '0');
    for (const [zone, list] of Object.entries(ZONE_BY_DEPARTMENT)) if (list.includes(c)) return zone;
    return null;
}
