// Administration : accès aux onglets par profil et thèmes saisonniers
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.

export const TAB_KEYS = [
    'resources',
    'evenements',
    'planning',
    'cra',
    'reporting',
    'admin',
    'astreintesGestion',
    'tripadvisor'
];

export const TAB_PROFILES = ['admin', 'user', 'rh', 'expert'];

// Valeurs par défaut = comportement historique codé en dur
export const TAB_ACCESS_DEFAULTS = {
    admin: {
        resources: true,
        evenements: true,
        planning: true,
        cra: true,
        reporting: true,
        admin: true,
        astreintesGestion: true,
        tripadvisor: true
    },
    user: {
        resources: false,
        evenements: true,
        planning: true,
        cra: false,
        reporting: false,
        admin: false,
        astreintesGestion: false,
        tripadvisor: true
    },
    rh: {
        resources: true,
        evenements: false,
        planning: false,
        cra: true,
        reporting: false,
        admin: false,
        astreintesGestion: false,
        tripadvisor: true
    },
    expert: {
        resources: false,
        evenements: true,
        planning: true,
        cra: true,
        reporting: false,
        admin: false,
        astreintesGestion: true,
        tripadvisor: true
    }
};

export function tabAccessMerge(stored) {
    const out = {};
    TAB_PROFILES.forEach(p => {
        out[p] = {};
        TAB_KEYS.forEach(k => {
            const v =
                stored && stored[p] && typeof stored[p][k] === 'boolean' ? stored[p][k] : TAB_ACCESS_DEFAULTS[p][k];
            out[p][k] = v;
        });
    });
    out.admin.admin = true; // l'administrateur ne peut pas perdre l'accès à l'Administration (verrouillage impossible)
    return out;
}

export const THEME_IDS = ['halloween', 'noel', 'saintvalentin', 'saintpatrick', 'paques', 'vacances'];

export const THEME_DEFAULTS = {
    mode: 'off',
    forced: 'noel',
    intensity: 'sobre',
    themes: {
        halloween: { auto: true, start: '10-20', end: '11-02' },
        noel: { auto: true, start: '12-01', end: '12-31' },
        saintvalentin: { auto: true, start: '02-07', end: '02-14' },
        saintpatrick: { auto: true, start: '03-10', end: '03-17' },
        paques: { auto: true, before: 7, after: 1 },
        vacances: { auto: true, start: '07-01', end: '08-31' }
    }
};

export function sanitizeThemeConfig(input) {
    const cfg = JSON.parse(JSON.stringify(THEME_DEFAULTS));
    if (!input || typeof input !== 'object') return cfg;
    if (['off', 'auto', 'forced'].includes(input.mode)) cfg.mode = input.mode;
    if (THEME_IDS.includes(input.forced)) cfg.forced = input.forced;
    if (['sobre', 'decore', 'anime'].includes(input.intensity)) cfg.intensity = input.intensity;
    const mmdd = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    for (const id of THEME_IDS) {
        const t = input.themes && input.themes[id];
        if (!t || typeof t !== 'object') continue;
        cfg.themes[id].auto = t.auto !== false;
        if (id === 'paques') {
            const b = Number(t.before),
                a = Number(t.after);
            if (Number.isInteger(b) && b >= 0 && b <= 30) cfg.themes[id].before = b;
            if (Number.isInteger(a) && a >= 0 && a <= 30) cfg.themes[id].after = a;
        } else {
            if (mmdd.test(t.start)) cfg.themes[id].start = t.start;
            if (mmdd.test(t.end)) cfg.themes[id].end = t.end;
        }
    }
    return cfg;
}
